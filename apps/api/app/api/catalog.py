from contextlib import suppress
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse

from app.core.catalog_protection import (
    CatalogProtection,
    CatalogProtectionUnavailable,
    cache_key,
    get_catalog_protection,
    identify_visitor,
)
from app.core.igdb import get_igdb_client
from app.integrations.igdb import (
    IGDBAuthenticationError,
    IGDBClient,
    IGDBInvalidResponseError,
    IGDBRateLimitError,
    IGDBRequestError,
    IGDBUnavailableError,
)
from app.services.game_search import (
    GameSearchResponse,
    normalize_search_term,
    search_games,
)

router = APIRouter(prefix="/catalog", tags=["catalog"])
VISITOR_LIMIT = 10
VISITOR_WINDOW_SECONDS = 60.0
GLOBAL_LIMIT = 4
GLOBAL_WINDOW_SECONDS = 1.0
GLOBAL_CONCURRENCY = 8
GLOBAL_LEASE_SECONDS = 15.0
CACHE_TTL_SECONDS = 60
GLOBAL_RATE_KEY = "playvault:catalog:igdb:rate"
GLOBAL_CONCURRENCY_KEY = "playvault:catalog:igdb:concurrency"


@router.get("/games/search", response_model=GameSearchResponse)
async def game_search(
    request: Request,
    client: Annotated[IGDBClient, Depends(get_igdb_client)],
    protection: Annotated[CatalogProtection, Depends(get_catalog_protection)],
    q: Annotated[str, Query(min_length=2, max_length=80)],
    limit: Annotated[int, Query(ge=1, le=20)] = 10,
) -> GameSearchResponse | JSONResponse:
    try:
        normalized = normalize_search_term(q)
        visitor = identify_visitor(request, protection.visitor_secret)
        visitor_decision = await protection.store.limit(
            f"playvault:catalog:visitor:{visitor}",
            VISITOR_LIMIT,
            VISITOR_WINDOW_SECONDS,
        )
        if not visitor_decision.allowed:
            return _rate_limit_response(
                "catalog_visitor_rate_limited",
                "Visitor game search limit exceeded",
                visitor_decision.retry_after,
            )

        result_cache_key = cache_key(normalized, limit)
        cached = await protection.store.get(result_cache_key)
        if cached is not None:
            try:
                return GameSearchResponse.model_validate_json(cached)
            except ValueError:
                pass

        global_decision = await protection.store.limit(
            GLOBAL_RATE_KEY,
            GLOBAL_LIMIT,
            GLOBAL_WINDOW_SECONDS,
        )
        if not global_decision.allowed:
            return _rate_limit_response(
                "catalog_global_rate_limited",
                "Game catalog request budget exceeded",
                global_decision.retry_after,
            )

        lease_id = await protection.store.acquire(
            GLOBAL_CONCURRENCY_KEY,
            GLOBAL_CONCURRENCY,
            GLOBAL_LEASE_SECONDS,
        )
        if lease_id is None:
            return _rate_limit_response(
                "catalog_global_rate_limited",
                "Game catalog concurrency limit exceeded",
                1.0,
            )
        try:
            result = await search_games(client, normalized, limit)
            await protection.store.set(
                result_cache_key,
                result.model_dump_json(),
                CACHE_TTL_SECONDS,
            )
            return result
        finally:
            with suppress(CatalogProtectionUnavailable):
                await protection.store.release(GLOBAL_CONCURRENCY_KEY, lease_id)
    except ValueError:
        return _error_response(400, "invalid_search", "Invalid game search query")
    except CatalogProtectionUnavailable:
        return _error_response(
            503,
            "catalog_protection_unavailable",
            "Game search protection unavailable",
        )
    except IGDBRateLimitError as exc:
        return _rate_limit_response(
            "catalog_upstream_rate_limited",
            "Game catalog upstream rate limit exceeded",
            exc.retry_after,
        )
    except (IGDBAuthenticationError, IGDBUnavailableError):
        return _error_response(503, "catalog_unavailable", "Game catalog unavailable")
    except IGDBInvalidResponseError:
        return _error_response(502, "invalid_catalog_response", "Invalid game catalog response")
    except IGDBRequestError:
        return _error_response(502, "catalog_upstream_error", "Game catalog request failed")


def _error_response(status_code: int, code: str, detail: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"code": code, "detail": detail})


def _rate_limit_response(code: str, detail: str, retry_after: float | None) -> JSONResponse:
    payload: dict[str, object] = {"code": code, "detail": detail}
    if retry_after is not None:
        payload["retry_after"] = retry_after
    return JSONResponse(status_code=429, content=payload)
