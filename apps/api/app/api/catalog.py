from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse

from app.core.catalog_protection import (
    CatalogGlobalRateLimited,
    CatalogProtection,
    CatalogProtectionUnavailable,
    cache_key,
    get_catalog_protection,
    identify_visitor,
    reserve_igdb_call,
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
CACHE_TTL_SECONDS = 60


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

        async with reserve_igdb_call(protection.store):
            result = await search_games(client, normalized, limit)
            await protection.store.set(
                result_cache_key,
                result.model_dump_json(),
                CACHE_TTL_SECONDS,
            )
            return result
    except ValueError:
        return _error_response(400, "invalid_search", "Invalid game search query")
    except CatalogProtectionUnavailable:
        return _error_response(
            503,
            "catalog_protection_unavailable",
            "Game search protection unavailable",
        )
    except CatalogGlobalRateLimited as exc:
        return _rate_limit_response(
            "catalog_global_rate_limited",
            "Game catalog request budget exceeded",
            exc.retry_after,
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
