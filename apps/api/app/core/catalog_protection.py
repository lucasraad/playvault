import asyncio
import hashlib
import hmac
import json
import time
import uuid
from collections import defaultdict, deque
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol

import httpx
from fastapi import Request

RATE_LIMIT_SCRIPT = """
local now_parts = redis.call('TIME')
local now = (tonumber(now_parts[1]) * 1000) + math.floor(tonumber(now_parts[2]) / 1000)
local cutoff = now - tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, cutoff)
local count = redis.call('ZCARD', KEYS[1])
if count >= tonumber(ARGV[2]) then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return {0, math.max(1, tonumber(oldest[2]) + tonumber(ARGV[1]) - now)}
end
redis.call('ZADD', KEYS[1], now, ARGV[3])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]))
return {1, 0}
""".strip()

ACQUIRE_SCRIPT = """
local now_parts = redis.call('TIME')
local now = (tonumber(now_parts[1]) * 1000) + math.floor(tonumber(now_parts[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now - tonumber(ARGV[1]))
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[2]) then return 0 end
redis.call('ZADD', KEYS[1], now, ARGV[3])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]))
return 1
""".strip()


class CatalogProtectionUnavailable(RuntimeError):
    """The shared protection store is missing or unreachable."""


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    retry_after: float = 0.0


class CatalogProtectionStore(Protocol):
    async def limit(self, key: str, limit: int, window_seconds: float) -> RateLimitDecision: ...

    async def get(self, key: str) -> str | None: ...

    async def set(self, key: str, value: str, ttl_seconds: int) -> None: ...

    async def acquire(self, key: str, limit: int, lease_seconds: float) -> str | None: ...

    async def release(self, key: str, lease_id: str) -> None: ...


class UpstashCatalogProtectionStore:
    def __init__(self, client: httpx.AsyncClient, url: str, token: str) -> None:
        self._client = client
        self._url = url.rstrip("/")
        self._headers = {"Authorization": f"Bearer {token}"}

    async def limit(self, key: str, limit: int, window_seconds: float) -> RateLimitDecision:
        result = await self._command(
            [
                "EVAL",
                RATE_LIMIT_SCRIPT,
                1,
                key,
                int(window_seconds * 1000),
                limit,
                uuid.uuid4().hex,
            ]
        )
        if (
            not isinstance(result, list)
            or len(result) != 2
            or not all(isinstance(item, int) for item in result)
        ):
            raise CatalogProtectionUnavailable("Invalid rate limit store response")
        return RateLimitDecision(bool(result[0]), result[1] / 1000)

    async def get(self, key: str) -> str | None:
        result = await self._command(["GET", key])
        if result is not None and not isinstance(result, str):
            raise CatalogProtectionUnavailable("Invalid cache store response")
        return result

    async def set(self, key: str, value: str, ttl_seconds: int) -> None:
        result = await self._command(["SET", key, value, "EX", ttl_seconds])
        if result != "OK":
            raise CatalogProtectionUnavailable("Invalid cache store response")

    async def acquire(self, key: str, limit: int, lease_seconds: float) -> str | None:
        lease_id = uuid.uuid4().hex
        result = await self._command(
            [
                "EVAL",
                ACQUIRE_SCRIPT,
                1,
                key,
                int(lease_seconds * 1000),
                limit,
                lease_id,
            ]
        )
        if result not in {0, 1}:
            raise CatalogProtectionUnavailable("Invalid concurrency store response")
        return lease_id if result == 1 else None

    async def release(self, key: str, lease_id: str) -> None:
        result = await self._command(["ZREM", key, lease_id])
        if not isinstance(result, int):
            raise CatalogProtectionUnavailable("Invalid concurrency store response")

    async def _command(self, command: list[object]) -> Any:
        try:
            response = await self._client.post(self._url, headers=self._headers, json=command)
        except httpx.RequestError as exc:
            raise CatalogProtectionUnavailable("Catalog protection store unavailable") from exc
        if not response.is_success:
            raise CatalogProtectionUnavailable("Catalog protection store unavailable")
        try:
            payload: Any = response.json()
        except ValueError as exc:
            raise CatalogProtectionUnavailable("Invalid protection store response") from exc
        if not isinstance(payload, dict) or "result" not in payload or "error" in payload:
            raise CatalogProtectionUnavailable("Invalid protection store response")
        return payload["result"]


class InMemoryCatalogProtectionStore:
    """Development/test fallback. Never use as distributed production protection."""

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._lock = asyncio.Lock()
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._cache: dict[str, tuple[float, str]] = {}
        self._leases: dict[str, dict[str, float]] = defaultdict(dict)

    async def limit(self, key: str, limit: int, window_seconds: float) -> RateLimitDecision:
        async with self._lock:
            now = self._clock()
            events = self._events[key]
            while events and events[0] <= now - window_seconds:
                events.popleft()
            if len(events) >= limit:
                return RateLimitDecision(False, max(0.001, events[0] + window_seconds - now))
            events.append(now)
            return RateLimitDecision(True)

    async def get(self, key: str) -> str | None:
        async with self._lock:
            cached = self._cache.get(key)
            if cached is None:
                return None
            expires_at, value = cached
            if expires_at <= self._clock():
                self._cache.pop(key, None)
                return None
            return value

    async def set(self, key: str, value: str, ttl_seconds: int) -> None:
        async with self._lock:
            self._cache[key] = (self._clock() + ttl_seconds, value)

    async def acquire(self, key: str, limit: int, lease_seconds: float) -> str | None:
        async with self._lock:
            now = self._clock()
            leases = self._leases[key]
            expired = [lease_id for lease_id, expires_at in leases.items() if expires_at <= now]
            for lease_id in expired:
                leases.pop(lease_id, None)
            if len(leases) >= limit:
                return None
            lease_id = uuid.uuid4().hex
            leases[lease_id] = now + lease_seconds
            return lease_id

    async def release(self, key: str, lease_id: str) -> None:
        async with self._lock:
            self._leases[key].pop(lease_id, None)


@dataclass(frozen=True)
class CatalogProtection:
    store: CatalogProtectionStore
    visitor_secret: str


def get_catalog_protection(request: Request) -> CatalogProtection:
    protection: CatalogProtection | None = getattr(request.app.state, "catalog_protection", None)
    if protection is None:
        raise CatalogProtectionUnavailable("Catalog protection is not configured")
    return protection


def identify_visitor(request: Request, secret: str) -> str:
    signed_visitor = request.headers.get("x-playvault-catalog-visitor")
    if signed_visitor:
        visitor_id = verify_signed_visitor(signed_visitor, secret)
        if visitor_id is not None:
            return f"visitor:{visitor_id}"
    client_host = request.client.host if request.client is not None else "unknown"
    digest = hmac.new(secret.encode(), f"ip:{client_host}".encode(), hashlib.sha256).hexdigest()
    return f"direct:{digest}"


def verify_signed_visitor(value: str, secret: str) -> str | None:
    try:
        visitor_id, signature = value.split(".", 1)
    except ValueError:
        return None
    if len(visitor_id) != 32 or any(
        character not in "0123456789abcdef" for character in visitor_id
    ):
        return None
    expected = hmac.new(secret.encode(), visitor_id.encode(), hashlib.sha256).hexdigest()
    return visitor_id if hmac.compare_digest(signature, expected) else None


def cache_key(query: str, limit: int) -> str:
    digest = hashlib.sha256(json.dumps([query, limit]).encode()).hexdigest()
    return f"playvault:catalog:cache:v1:{digest}"
