import uuid

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.auth import SupabaseAuthClient, get_auth_client
from app.db.session import get_db_session
from app.main import app

USER_ID = uuid.UUID("11111111-1111-4111-8111-111111111111")
client = TestClient(app)


class FakeSession:
    def __init__(self) -> None:
        self.profile = None
        self.commits = 0

    def get(self, model, identity):
        del model, identity
        return self.profile

    def add(self, profile):
        self.profile = profile

    def commit(self):
        self.commits += 1

    def rollback(self):
        raise AssertionError("Unexpected rollback")


@pytest.fixture(autouse=True)
def reset_overrides():
    yield
    app.dependency_overrides.clear()


def with_provider(handler):
    async def dependency():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
            yield SupabaseAuthClient(http_client, "https://project.supabase.co", "publishable")

    app.dependency_overrides[get_auth_client] = dependency


def test_signup_passes_credentials_to_provider_without_returning_tokens():
    def handler(request):
        assert request.url.path == "/auth/v1/signup"
        assert request.headers["apikey"] == "publishable"
        assert b'"password":"long-password"' in request.content
        return httpx.Response(200, json={"id": str(USER_ID), "access_token": "secret"})

    with_provider(handler)
    response = client.post(
        "/auth/signup", json={"email": "user@example.com", "password": "long-password"}
    )
    assert response.status_code == 202
    assert "secret" not in response.text


def test_login_returns_session_tokens():
    def handler(request):
        assert request.url.query == b"grant_type=password"
        return httpx.Response(
            200,
            json={"access_token": "access", "refresh_token": "refresh", "expires_in": 3600},
        )

    with_provider(handler)
    response = client.post(
        "/auth/login", json={"email": "user@example.com", "password": "password"}
    )
    assert response.status_code == 200
    assert response.json() == {
        "access_token": "access",
        "refresh_token": "refresh",
        "token_type": "bearer",
        "expires_in": 3600,
    }


def test_refresh_rejects_invalid_token():
    with_provider(lambda request: httpx.Response(401, json={"msg": "internal provider detail"}))
    response = client.post("/auth/refresh", json={"refresh_token": "invalid"})
    assert response.status_code == 401
    assert "internal provider detail" not in response.text


def test_me_requires_bearer_token():
    with_provider(lambda request: pytest.fail("Provider must not be called"))
    response = client.get("/auth/me")
    assert response.status_code == 401


def test_me_validates_token_and_creates_profile_once():
    def handler(request):
        assert request.url.path == "/auth/v1/user"
        assert request.headers["authorization"] == "Bearer access"
        return httpx.Response(200, json={"id": str(USER_ID), "email": "user@example.com"})

    with_provider(handler)
    session = FakeSession()
    app.dependency_overrides[get_db_session] = lambda: session
    first = client.get("/auth/me", headers={"Authorization": "Bearer access"})
    second = client.get("/auth/me", headers={"Authorization": "Bearer access"})

    assert first.status_code == second.status_code == 200
    assert first.json() == {"id": str(USER_ID), "email": "user@example.com"}
    assert session.profile.username == f"player_{USER_ID.hex}"
    assert session.commits == 1


def test_me_rejects_anonymous_identity():
    with_provider(
        lambda request: httpx.Response(200, json={"id": str(USER_ID), "is_anonymous": True})
    )
    response = client.get("/auth/me", headers={"Authorization": "Bearer access"})
    assert response.status_code == 401


def test_me_rejects_malformed_provider_response():
    with_provider(lambda request: httpx.Response(200, json=["unexpected"]))
    response = client.get("/auth/me", headers={"Authorization": "Bearer access"})
    assert response.status_code == 401


def test_me_handles_provider_outage_without_exposing_provider_details():
    with_provider(lambda request: httpx.Response(502, text="provider internal error"))
    response = client.get("/auth/me", headers={"Authorization": "Bearer access"})
    assert response.status_code == 503
    assert "provider internal error" not in response.text
