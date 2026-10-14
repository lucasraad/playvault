import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.core.auth import get_current_profile
from app.core.catalog_protection import (
    CatalogGlobalRateLimited,
    CatalogProtection,
    CatalogProtectionUnavailable,
    get_catalog_protection,
    reserve_igdb_call,
)
from app.core.igdb import get_igdb_client
from app.db.models import Profile
from app.db.session import get_db_session
from app.integrations.igdb import (
    IGDBAuthenticationError,
    IGDBClient,
    IGDBInvalidResponseError,
    IGDBRateLimitError,
    IGDBRequestError,
    IGDBUnavailableError,
)
from app.services.library import (
    CatalogGameNotFoundError,
    CatalogPlatformNotFoundError,
    LibraryUnavailableError,
    add_catalog_selection_to_library,
    resolve_catalog_selection,
)

router = APIRouter(prefix="/library", tags=["library"])
LIBRARY_USER_LIMIT = 5
LIBRARY_USER_WINDOW_SECONDS = 60.0


class AddCatalogGameRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    igdb_id: int = Field(gt=0)
    platform_igdb_id: int = Field(gt=0)


class LibraryGame(BaseModel):
    id: uuid.UUID
    igdb_id: int
    title: str


class LibraryPlatform(BaseModel):
    id: uuid.UUID
    igdb_id: int
    slug: str
    name: str


class AddLibraryEntryResponse(BaseModel):
    id: uuid.UUID
    game: LibraryGame
    platform: LibraryPlatform
    status: str
    source: str
    created: bool


@router.post("/entries/from-catalog", response_model=AddLibraryEntryResponse)
async def add_catalog_game(
    payload: AddCatalogGameRequest,
    profile: Annotated[Profile, Depends(get_current_profile)],
    protection: Annotated[CatalogProtection, Depends(get_catalog_protection)],
    client: Annotated[IGDBClient, Depends(get_igdb_client)],
    session: Annotated[Session, Depends(get_db_session)],
) -> JSONResponse:
    try:
        user_decision = await protection.store.limit(
            f"playvault:catalog:library:user:{profile.id}",
            LIBRARY_USER_LIMIT,
            LIBRARY_USER_WINDOW_SECONDS,
        )
        if not user_decision.allowed:
            return _rate_limit_error(
                "catalog_user_rate_limited",
                "User catalog library limit exceeded",
                user_decision.retry_after,
            )

        async with reserve_igdb_call(protection.store):
            selection = await resolve_catalog_selection(
                client,
                payload.igdb_id,
                payload.platform_igdb_id,
            )
        result = add_catalog_selection_to_library(session, profile.id, selection)
    except CatalogGlobalRateLimited as exc:
        return _rate_limit_error(
            "catalog_global_rate_limited",
            "Game catalog request budget exceeded",
            exc.retry_after,
        )
    except CatalogProtectionUnavailable:
        return _error(
            503,
            "catalog_protection_unavailable",
            "Game catalog protection unavailable",
        )
    except CatalogGameNotFoundError:
        return _error(404, "catalog_game_not_found", "Catalog game not found")
    except CatalogPlatformNotFoundError:
        return _error(
            422,
            "catalog_platform_not_found",
            "Selected platform is not available for this game",
        )
    except IGDBRateLimitError as exc:
        payload_data: dict[str, object] = {
            "code": "catalog_upstream_rate_limited",
            "detail": "Game catalog upstream rate limit exceeded",
        }
        if exc.retry_after is not None:
            payload_data["retry_after"] = exc.retry_after
        return JSONResponse(status_code=429, content=payload_data)
    except (IGDBAuthenticationError, IGDBUnavailableError):
        return _error(503, "catalog_unavailable", "Game catalog unavailable")
    except IGDBInvalidResponseError:
        return _error(502, "invalid_catalog_response", "Invalid game catalog response")
    except IGDBRequestError:
        return _error(502, "catalog_upstream_error", "Game catalog request failed")
    except LibraryUnavailableError:
        return _error(503, "library_unavailable", "Library service unavailable")

    response = AddLibraryEntryResponse(
        id=result.entry.id,
        game=LibraryGame(
            id=result.game.id,
            igdb_id=selection.igdb_id,
            title=result.game.title,
        ),
        platform=LibraryPlatform(
            id=result.platform.id,
            igdb_id=selection.platform_igdb_id,
            slug=result.platform.slug,
            name=result.platform.name,
        ),
        status=result.entry.status,
        source=result.entry.source,
        created=result.created,
    )
    return JSONResponse(
        status_code=201 if result.created else 200,
        content=response.model_dump(mode="json"),
    )


def _error(status_code: int, code: str, detail: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"code": code, "detail": detail})


def _rate_limit_error(code: str, detail: str, retry_after: float) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"code": code, "detail": detail, "retry_after": retry_after},
    )
