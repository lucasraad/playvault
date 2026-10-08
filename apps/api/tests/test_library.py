import uuid
from collections.abc import Callable

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.auth import SupabaseAuthClient, get_auth_client, get_current_profile
from app.core.igdb import get_igdb_client
from app.db.models import Game, GamePlatform, LibraryEntry, Platform, Profile
from app.db.session import get_db_session
from app.integrations.igdb import IGDBRateLimitError, IGDBUnavailableError
from app.main import app
from app.services.library import (
    CatalogLibrarySelection,
    add_catalog_selection_to_library,
)

USER_ID = uuid.UUID("11111111-1111-4111-8111-111111111111")
client = TestClient(app)


class FakeIGDBClient:
    def __init__(
        self,
        result: list[dict[str, object]] | None = None,
        error: Exception | None = None,
    ) -> None:
        self.result = result or []
        self.error = error
        self.calls: list[tuple[str, str]] = []

    async def query(self, endpoint: str, apicalypse_query: str) -> list[dict[str, object]]:
        self.calls.append((endpoint, apicalypse_query))
        if self.error is not None:
            raise self.error
        return self.result


class QueueSession:
    def __init__(self, scalar_results: list[object | None]) -> None:
        self.scalar_results = iter(scalar_results)
        self.added: list[object] = []
        self.commits = 0
        self.rollbacks = 0

    def scalar(self, statement):
        del statement
        return next(self.scalar_results)

    def add(self, value: object) -> None:
        self.added.append(value)

    def flush(self) -> None:
        for value in self.added:
            if hasattr(value, "id") and value.id is None:
                value.id = uuid.uuid4()

    def commit(self) -> None:
        self.flush()
        self.commits += 1

    def rollback(self) -> None:
        self.rollbacks += 1


@pytest.fixture(autouse=True)
def reset_overrides():
    yield
    app.dependency_overrides.clear()


def use_provider(handler: Callable[[httpx.Request], httpx.Response]) -> None:
    async def dependency():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
            yield SupabaseAuthClient(http_client, "https://project.supabase.co", "publishable")

    app.dependency_overrides[get_auth_client] = dependency


def authenticated_with(fake: FakeIGDBClient, session: QueueSession) -> None:
    app.dependency_overrides[get_current_profile] = lambda: Profile(
        id=USER_ID,
        username=f"player_{USER_ID.hex}",
    )
    app.dependency_overrides[get_igdb_client] = lambda: fake
    app.dependency_overrides[get_db_session] = lambda: session


def catalog_game() -> list[dict[str, object]]:
    return [
        {
            "id": 1942,
            "name": "The Witcher 3: Wild Hunt",
            "platforms": [
                {"id": 6, "name": "PC", "abbreviation": "PC"},
                {"id": 48, "name": "PlayStation 4", "abbreviation": "PS4"},
            ],
        }
    ]


def test_add_catalog_game_requires_an_authenticated_user() -> None:
    use_provider(lambda request: pytest.fail(f"Provider must not be called: {request.url}"))

    response = client.post(
        "/library/entries/from-catalog",
        json={"igdb_id": 1942, "platform_igdb_id": 6},
    )

    assert response.status_code == 401


def test_add_catalog_game_rejects_an_expired_session() -> None:
    use_provider(lambda request: httpx.Response(401, json={"message": "expired"}))

    response = client.post(
        "/library/entries/from-catalog",
        headers={"Authorization": "Bearer expired"},
        json={"igdb_id": 1942, "platform_igdb_id": 6},
    )

    assert response.status_code == 401
    assert "expired" not in response.text


def test_add_catalog_game_persists_internal_ids_without_accepting_profile_id() -> None:
    fake = FakeIGDBClient(catalog_game())
    session = QueueSession([None, None, None, None, None])
    authenticated_with(fake, session)

    response = client.post(
        "/library/entries/from-catalog",
        json={"igdb_id": 1942, "platform_igdb_id": 6},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["created"] is True
    assert body["game"]["igdb_id"] == 1942
    assert body["platform"]["igdb_id"] == 6
    assert uuid.UUID(body["game"]["id"])
    assert uuid.UUID(body["platform"]["id"])
    assert body["game"]["id"] != str(body["game"]["igdb_id"])
    assert body["source"] == "manual"
    entry = next(value for value in session.added if isinstance(value, LibraryEntry))
    assert entry.profile_id == USER_ID
    assert fake.calls == [
        (
            "games",
            "fields id,name,platforms.id,platforms.name,platforms.abbreviation; "
            "where id = 1942; limit 1;",
        )
    ]

    rejected = client.post(
        "/library/entries/from-catalog",
        json={
            "igdb_id": 1942,
            "platform_igdb_id": 6,
            "profile_id": "22222222-2222-4222-8222-222222222222",
        },
    )
    assert rejected.status_code == 422


def test_add_catalog_game_rejects_unknown_game() -> None:
    fake = FakeIGDBClient([])
    authenticated_with(fake, QueueSession([]))

    response = client.post(
        "/library/entries/from-catalog",
        json={"igdb_id": 999, "platform_igdb_id": 6},
    )

    assert response.status_code == 404
    assert response.json()["code"] == "catalog_game_not_found"


def test_add_catalog_game_rejects_platform_not_offered_for_game() -> None:
    authenticated_with(FakeIGDBClient(catalog_game()), QueueSession([]))

    response = client.post(
        "/library/entries/from-catalog",
        json={"igdb_id": 1942, "platform_igdb_id": 999},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "catalog_platform_not_found"


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (IGDBRateLimitError(3), 429, "catalog_upstream_rate_limited"),
        (IGDBUnavailableError("timeout"), 503, "catalog_unavailable"),
    ],
)
def test_add_catalog_game_maps_transient_catalog_failures(
    error: Exception,
    status: int,
    code: str,
) -> None:
    authenticated_with(FakeIGDBClient(error=error), QueueSession([]))

    response = client.post(
        "/library/entries/from-catalog",
        json={"igdb_id": 1942, "platform_igdb_id": 6},
    )

    assert response.status_code == status
    assert response.json()["code"] == code
    assert "timeout" not in response.text


def test_repeated_combination_returns_the_existing_entry() -> None:
    game = Game(id=uuid.uuid4(), igdb_id=1942, title="The Witcher 3: Wild Hunt")
    platform = Platform(id=uuid.uuid4(), igdb_id=6, slug="pc", name="PC")
    game_platform = GamePlatform(
        id=uuid.uuid4(),
        game_id=game.id,
        platform_id=platform.id,
    )
    entry = LibraryEntry(
        id=uuid.uuid4(),
        profile_id=USER_ID,
        game_id=game.id,
        platform_id=platform.id,
        status="backlog",
        source="manual",
    )
    session = QueueSession([game, platform, game_platform, entry])
    selection = CatalogLibrarySelection(
        igdb_id=1942,
        title=game.title,
        platform_igdb_id=6,
        platform_name="PC",
        platform_slug="pc",
    )

    result = add_catalog_selection_to_library(session, USER_ID, selection)

    assert result.created is False
    assert result.entry.id == entry.id
    assert session.commits == 1
    assert session.added == []
