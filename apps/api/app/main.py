from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.session import DatabaseNotConfiguredError, get_db_session

app = FastAPI(title="Gamer Profile API", version="0.1.0")


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
