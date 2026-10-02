from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.auth import router as auth_router
from app.api.catalog import router as catalog_router
from app.core.auth import AuthUnavailable
from app.core.catalog_protection import (
    CatalogProtection,
    CatalogProtectionUnavailable,
    InMemoryCatalogProtectionStore,
    UpstashCatalogProtectionStore,
)
from app.core.config import get_settings
from app.core.igdb import IGDBNotConfiguredError
from app.db.session import DatabaseNotConfiguredError, get_db_session
from app.integrations.igdb import IGDBClient


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    http_client: httpx.AsyncClient | None = None
    store_client: httpx.AsyncClient | None = None
    if settings.igdb_client_id and settings.igdb_client_secret:
        http_client = httpx.AsyncClient(timeout=settings.igdb_timeout_seconds)
        app.state.igdb_client = IGDBClient(
            http_client,
            settings.igdb_client_id,
            settings.igdb_client_secret.get_secret_value(),
        )
    visitor_secret = (
        settings.catalog_visitor_secret.get_secret_value()
        if settings.catalog_visitor_secret is not None
        else None
    )
    if (
        settings.upstash_redis_rest_url
        and settings.upstash_redis_rest_token
        and visitor_secret
        and len(visitor_secret) >= 32
    ):
        store_client = httpx.AsyncClient(timeout=settings.catalog_store_timeout_seconds)
        store = UpstashCatalogProtectionStore(
            store_client,
            settings.upstash_redis_rest_url,
            settings.upstash_redis_rest_token.get_secret_value(),
        )
        app.state.catalog_protection = CatalogProtection(store, visitor_secret)
    elif settings.app_environment != "production":
        app.state.catalog_protection = CatalogProtection(
            InMemoryCatalogProtectionStore(),
            visitor_secret or "playvault-development-only-catalog-secret",
        )
    try:
        yield
    finally:
        if http_client is not None:
            await http_client.aclose()
            del app.state.igdb_client
        if store_client is not None:
            await store_client.aclose()
        if hasattr(app.state, "catalog_protection"):
            del app.state.catalog_protection


app = FastAPI(title="Gamer Profile API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[get_settings().web_origin],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(auth_router)
app.include_router(catalog_router)


@app.exception_handler(CatalogProtectionUnavailable)
def catalog_protection_unavailable_handler(
    request: Request,
    exc: CatalogProtectionUnavailable,
) -> JSONResponse:
    del request, exc
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "code": "catalog_protection_unavailable",
            "detail": "Game search protection unavailable",
        },
    )


@app.exception_handler(AuthUnavailable)
def auth_unavailable_handler(request: Request, exc: AuthUnavailable) -> JSONResponse:
    del request, exc
    return JSONResponse(status_code=503, content={"detail": "Authentication service unavailable"})


@app.exception_handler(DatabaseNotConfiguredError)
def database_not_configured_handler(
    request: Request,
    exc: DatabaseNotConfiguredError,
) -> JSONResponse:
    del request, exc
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"detail": "Database unavailable"},
    )


@app.exception_handler(IGDBNotConfiguredError)
def igdb_not_configured_handler(
    request: Request,
    exc: IGDBNotConfiguredError,
) -> JSONResponse:
    del request, exc
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"code": "catalog_unavailable", "detail": "Game catalog unavailable"},
    )


@app.get("/health", tags=["system"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/database", tags=["system"])
def database_health_check(
    session: Annotated[Session, Depends(get_db_session)],
) -> dict[str, str]:
    try:
        session.execute(text("SELECT 1"))
    except (DatabaseNotConfiguredError, SQLAlchemyError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable",
        ) from exc

    return {"status": "ok", "database": "connected"}
