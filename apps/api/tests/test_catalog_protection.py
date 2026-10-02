import asyncio

import pytest

from app.core.catalog_protection import InMemoryCatalogProtectionStore


@pytest.mark.anyio
async def test_concurrent_leases_never_exceed_limit() -> None:
    store = InMemoryCatalogProtectionStore()

    leases = await asyncio.gather(*(store.acquire("igdb", 8, 15) for _ in range(20)))

    assert sum(lease is not None for lease in leases) == 8
    assert sum(lease is None for lease in leases) == 12


@pytest.mark.anyio
async def test_releasing_lease_restores_concurrency_capacity() -> None:
    store = InMemoryCatalogProtectionStore()
    first = await store.acquire("igdb", 1, 15)

    assert first is not None
    assert await store.acquire("igdb", 1, 15) is None
    await store.release("igdb", first)
    assert await store.acquire("igdb", 1, 15) is not None


@pytest.mark.anyio
async def test_rate_limits_are_independent_by_key() -> None:
    store = InMemoryCatalogProtectionStore()

    assert (await store.limit("visitor-a", 1, 60)).allowed is True
    assert (await store.limit("visitor-a", 1, 60)).allowed is False
    assert (await store.limit("visitor-b", 1, 60)).allowed is True
