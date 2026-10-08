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
async def test_renewed_long_running_leases_continue_to_count_toward_limit() -> None:
    now = 0.0
    store = InMemoryCatalogProtectionStore(clock=lambda: now)
    leases = [await store.acquire("igdb", 8, 15) for _ in range(8)]
    assert all(lease is not None for lease in leases)

    now = 10.0
    for lease in leases:
        assert lease is not None
        assert await store.renew("igdb", lease, 15) is True

    now = 20.0
    assert await store.acquire("igdb", 8, 15) is None

    now = 26.0
    assert await store.acquire("igdb", 8, 15) is not None


@pytest.mark.anyio
async def test_rate_limits_are_independent_by_key() -> None:
    store = InMemoryCatalogProtectionStore()

    assert (await store.limit("visitor-a", 1, 60)).allowed is True
    assert (await store.limit("visitor-a", 1, 60)).allowed is False
    assert (await store.limit("visitor-b", 1, 60)).allowed is True
