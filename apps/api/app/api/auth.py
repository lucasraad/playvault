from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, ValidationError

from app.core.auth import (
    AuthUser,
    SupabaseAuthClient,
    get_auth_client,
    get_current_profile,
    get_current_user,
)
from app.db.models import Profile

router = APIRouter(prefix="/auth", tags=["auth"])


class Credentials(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class SessionTokens(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(gt=0)


async def request_session(
    auth: SupabaseAuthClient, grant_type: str, payload: dict[str, str]
) -> SessionTokens:
    response = await auth.request("POST", f"/token?grant_type={grant_type}", payload=payload)
    if response.status_code == 429:
        raise HTTPException(status_code=429, detail="Authentication rate limit exceeded")
    if response.status_code >= 500:
        raise HTTPException(status_code=503, detail="Authentication service unavailable")
    if response.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    try:
        return SessionTokens.model_validate(response.json())
    except (ValueError, ValidationError, TypeError) as exc:
        raise HTTPException(status_code=503, detail="Authentication service unavailable") from exc


@router.post("/signup", status_code=status.HTTP_202_ACCEPTED)
async def signup(
    credentials: Credentials,
    auth: Annotated[SupabaseAuthClient, Depends(get_auth_client)],
) -> dict[str, str]:
    response = await auth.request("POST", "/signup", payload=credentials.model_dump())
    if response.status_code == 429:
        raise HTTPException(status_code=429, detail="Authentication rate limit exceeded")
    if response.status_code >= 500:
        raise HTTPException(status_code=503, detail="Authentication service unavailable")
    if response.status_code not in (200, 201):
        raise HTTPException(status_code=400, detail="Registration failed")
    return {"message": "Registration received. Sign in when your account is ready."}


@router.post("/login")
async def login(
    credentials: Credentials,
    auth: Annotated[SupabaseAuthClient, Depends(get_auth_client)],
) -> SessionTokens:
    return await request_session(auth, "password", credentials.model_dump())


@router.post("/refresh")
async def refresh(
    request: RefreshRequest,
    auth: Annotated[SupabaseAuthClient, Depends(get_auth_client)],
) -> SessionTokens:
    return await request_session(auth, "refresh_token", request.model_dump())


@router.get("/me")
def me(
    user: Annotated[AuthUser, Depends(get_current_user)],
    profile: Annotated[Profile, Depends(get_current_profile)],
) -> AuthUser:
    return AuthUser(id=profile.id, email=user.email)
