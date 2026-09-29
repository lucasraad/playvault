import uuid
from collections.abc import AsyncGenerator
from typing import Annotated, Any

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ValidationError
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import Profile
from app.db.session import get_db_session

bearer = HTTPBearer(auto_error=False)


class AuthUnavailable(RuntimeError):
    """The identity provider is not configured or reachable."""


class AuthUser(BaseModel):
    id: uuid.UUID
    email: str | None = None


class SupabaseAuthClient:
    def __init__(self, client: httpx.AsyncClient, url: str, key: str) -> None:
        self.client = client
        self.base_url = url.rstrip("/") + "/auth/v1"
        self.key = key

    async def request(
        self,
        method: str,
        path: str,
        *,
        token: str | None = None,
        payload: dict[str, str] | None = None,
    ) -> httpx.Response:
        headers = {"apikey": self.key}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        try:
            return await self.client.request(
                method, self.base_url + path, headers=headers, json=payload
            )
        except httpx.RequestError as exc:
            raise AuthUnavailable("Authentication service unavailable") from exc


async def get_auth_client() -> AsyncGenerator[SupabaseAuthClient]:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_publishable_key:
        raise AuthUnavailable("Supabase Auth is not configured")
    async with httpx.AsyncClient(timeout=10.0) as client:
        yield SupabaseAuthClient(client, settings.supabase_url, settings.supabase_publishable_key)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    auth: Annotated[SupabaseAuthClient, Depends(get_auth_client)],
) -> AuthUser:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    response = await auth.request("GET", "/user", token=credentials.credentials)
    if response.status_code == 429:
        raise HTTPException(status_code=429, detail="Authentication rate limit exceeded")
    if response.status_code >= 500:
        raise AuthUnavailable("Authentication service unavailable")
    if response.status_code != 200:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        user: Any = response.json()
        if not isinstance(user, dict):
            raise ValueError("Invalid user response")
        if user.get("is_anonymous") is True:
            raise ValueError("Anonymous sign-ins are not supported")
        return AuthUser.model_validate(user)
    except (ValueError, ValidationError, TypeError) as exc:
        raise HTTPException(status_code=401, detail="Unauthorized") from exc


def get_current_profile(
    user: Annotated[AuthUser, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_db_session)],
) -> Profile:
    try:
        profile = session.get(Profile, user.id)
        if profile is None:
            profile = Profile(id=user.id, username=f"player_{user.id.hex}")
            session.add(profile)
            try:
                session.commit()
            except IntegrityError:
                # A concurrent first request may have created this same profile.
                session.rollback()
                profile = session.get(Profile, user.id)
                if profile is None:
                    raise
        return profile
    except SQLAlchemyError as exc:
        session.rollback()
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
