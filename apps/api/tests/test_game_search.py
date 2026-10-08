import hashlib
import hmac
from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from app.core.catalog_protection import (
    CatalogProtection,
    CatalogProtectionUnavailable,
    InMemoryCatalogProtectionStore,
    get_catalog_protection,
)
from app.core.igdb import get_igdb_client
from app.integrations.igdb import (
    IGDBAuthenticationError,
    IGDBInvalidResponseError,
    IGDBRateLimitError,
    IGDBRequestError,
    IGDBUnavailableError,
)
from app.main import app

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


@pytest.fixture(autouse=True)
def reset_overrides():
    store = InMemoryCatalogProtectionStore()
    app.dependency_overrides[get_catalog_protection] = lambda: CatalogProtection(
        store,
        "test-catalog-secret",
    )
    yield
    app.dependency_overrides.clear()


def use_igdb(fake: FakeIGDBClient) -> None:
    app.dependency_overrides[get_igdb_client] = lambda: fake


def signed_visitor(visitor_id: str) -> str:
    signature = hmac.new(
        b"test-catalog-secret",
        visitor_id.encode(),
        hashlib.sha256,
    ).hexdigest()
    return f"{visitor_id}.{signature}"


def test_search_returns_stable_schema_without_internal_game_id() -> None:
    fake = FakeIGDBClient(
        [
            {
                "id": 1942,
                "name": "The Witcher 3: Wild Hunt",
                "slug": "the-witcher-3-wild-hunt",
                "summary": "A role-playing game.",
                "first_release_date": 1431993600,
                "cover": {"id": 999, "image_id": "co1wyy"},
                "platforms": [{"id": 6, "name": "PC", "abbreviation": "PC"}],
                "genres": [{"id": 12, "name": "Role-playing (RPG)"}],
                "provider_only_field": "must not leak",
            }
        ]
    )
    use_igdb(fake)

    response = client.get("/catalog/games/search", params={"q": "  The Witcher 3  ", "limit": 5})

    assert response.status_code == 200
    assert response.json() == {
        "query": "The Witcher 3",
        "limit": 5,
        "results": [
            {
                "igdb_id": 1942,
                "name": "The Witcher 3: Wild Hunt",
                "slug": "the-witcher-3-wild-hunt",
                "summary": "A role-playing game.",
                "first_release_date": "2015-05-19",
                "cover_url": "https://images.igdb.com/igdb/image/upload/t_cover_big/co1wyy.jpg",
                "platforms": [{"igdb_id": 6, "name": "PC", "abbreviation": "PC"}],
                "genres": [{"igdb_id": 12, "name": "Role-playing (RPG)"}],
            }
        ],
    }
    assert fake.calls == [
        (
            "games",
            "search \"The Witcher 3\"; fields "
            "id,name,slug,summary,first_release_date,cover.image_id,"
            "platforms.id,platforms.name,platforms.abbreviation,genres.id,genres.name; "
            "where version_parent = null; limit 5;",
        )
    ]
    assert "games.id" not in response.text
    assert "provider_only_field" not in response.text


@pytest.mark.parametrize("query", ["a", "x" * 81, 'Halo\"; limit 500;'])
def test_search_rejects_invalid_input_without_calling_igdb(query: str) -> None:
    fake = FakeIGDBClient()
    use_igdb(fake)

    response = client.get("/catalog/games/search", params={"q": query})

    assert response.status_code in {400, 422}
    assert fake.calls == []


def test_search_rejects_limit_above_public_cap() -> None:
    fake = FakeIGDBClient()
    use_igdb(fake)

    response = client.get("/catalog/games/search", params={"q": "Halo", "limit": 21})

    assert response.status_code == 422
    assert fake.calls == []


@pytest.mark.parametrize(
    ("error_factory", "status", "code"),
    [
        (lambda: IGDBRateLimitError(2.0), 429, "catalog_upstream_rate_limited"),
        (lambda: IGDBAuthenticationError("rejected"), 503, "catalog_unavailable"),
        (lambda: IGDBUnavailableError("timeout"), 503, "catalog_unavailable"),
        (lambda: IGDBInvalidResponseError("invalid"), 502, "invalid_catalog_response"),
        (lambda: IGDBRequestError(400), 502, "catalog_upstream_error"),
    ],
)
def test_search_maps_provider_failures(
    error_factory: Callable[[], Exception],
    status: int,
    code: str,
) -> None:
    use_igdb(FakeIGDBClient(error=error_factory()))

    response = client.get("/catalog/games/search", params={"q": "Halo"})

    assert response.status_code == status
    assert response.json()["code"] == code
    assert "rejected" not in response.text
    assert "timeout" not in response.text
    if status == 429:
        assert response.json()["retry_after"] == 2.0


def test_search_rejects_malformed_game_payload() -> None:
    use_igdb(FakeIGDBClient([{"id": 1, "name": "Missing slug"}]))

    response = client.get("/catalog/games/search", params={"q": "Halo"})

    assert response.status_code == 502
    assert response.json() == {
        "code": "invalid_catalog_response",
        "detail": "Invalid game catalog response",
    }


def test_repeated_normalized_query_uses_cache_without_second_igdb_call() -> None:
    fake = FakeIGDBClient([{"id": 1, "name": "Halo", "slug": "halo"}])
    use_igdb(fake)

    first = client.get("/catalog/games/search", params={"q": " Halo ", "limit": 3})
    second = client.get("/catalog/games/search", params={"q": "Halo", "limit": 3})

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert len(fake.calls) == 1


def test_visitor_limit_applies_even_when_results_are_cached() -> None:
    fake = FakeIGDBClient([{"id": 1, "name": "Halo", "slug": "halo"}])
    use_igdb(fake)
    headers = {"X-PlayVault-Catalog-Visitor": signed_visitor("a" * 32)}

    responses = [
        client.get("/catalog/games/search", params={"q": "Halo"}, headers=headers)
        for _ in range(11)
    ]

    assert all(response.status_code == 200 for response in responses[:10])
    assert responses[10].status_code == 429
    assert responses[10].json()["code"] == "catalog_visitor_rate_limited"
    assert len(fake.calls) == 1


def test_distinct_signed_visitors_have_independent_budgets() -> None:
    fake = FakeIGDBClient([{"id": 1, "name": "Halo", "slug": "halo"}])
    use_igdb(fake)

    responses = [
        client.get(
            "/catalog/games/search",
            params={"q": "Halo"},
            headers={"X-PlayVault-Catalog-Visitor": signed_visitor(f"{index:032x}")},
        )
        for index in range(12)
    ]

    assert all(response.status_code == 200 for response in responses)
    assert len(fake.calls) == 1


def test_distinct_visitors_share_the_global_igdb_budget() -> None:
    fake = FakeIGDBClient([{"id": 1, "name": "Game", "slug": "game"}])
    use_igdb(fake)

    responses = [
        client.get(
            "/catalog/games/search",
            params={"q": f"Game {index}"},
            headers={"X-PlayVault-Catalog-Visitor": signed_visitor(f"{index:032x}")},
        )
        for index in range(5)
    ]

    assert all(response.status_code == 200 for response in responses[:4])
    assert responses[4].status_code == 429
    assert responses[4].json()["code"] == "catalog_global_rate_limited"
    assert len(fake.calls) == 4


def test_forwarded_for_does_not_create_new_direct_visitors() -> None:
    fake = FakeIGDBClient([{"id": 1, "name": "Halo", "slug": "halo"}])
    use_igdb(fake)

    responses = [
        client.get(
            "/catalog/games/search",
            params={"q": "Halo"},
            headers={"X-Forwarded-For": f"203.0.113.{index}"},
        )
        for index in range(11)
    ]

    assert responses[10].status_code == 429
    assert responses[10].json()["code"] == "catalog_visitor_rate_limited"


class FailingProtectionStore(InMemoryCatalogProtectionStore):
    async def limit(self, key: str, limit: int, window_seconds: float):
        del key, limit, window_seconds
        raise CatalogProtectionUnavailable("store unavailable")


def test_search_fails_closed_when_protection_store_is_unavailable() -> None:
    fake = FakeIGDBClient([{"id": 1, "name": "Halo", "slug": "halo"}])
    use_igdb(fake)
    app.dependency_overrides[get_catalog_protection] = lambda: CatalogProtection(
        FailingProtectionStore(),
        "test-catalog-secret",
    )

    response = client.get("/catalog/games/search", params={"q": "Halo"})

    assert response.status_code == 503
    assert response.json()["code"] == "catalog_protection_unavailable"
    assert fake.calls == []


def test_search_fails_closed_when_protection_dependency_is_unavailable() -> None:
    fake = FakeIGDBClient([{"id": 1, "name": "Halo", "slug": "halo"}])
    use_igdb(fake)

    def unavailable_protection() -> None:
        raise CatalogProtectionUnavailable("not configured")

    app.dependency_overrides[get_catalog_protection] = unavailable_protection

    response = client.get("/catalog/games/search", params={"q": "Halo"})

    assert response.status_code == 503
    assert response.json() == {
        "code": "catalog_protection_unavailable",
        "detail": "Game search protection unavailable",
    }
    assert fake.calls == []


def test_search_is_unavailable_without_igdb_configuration() -> None:
    response = client.get("/catalog/games/search", params={"q": "Halo"})

    assert response.status_code == 503
    assert response.json() == {
        "code": "catalog_unavailable",
        "detail": "Game catalog unavailable",
    }
