import asyncio
import time
from collections.abc import Callable
from typing import Any

import httpx

TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token"
IGDB_API_URL = "https://api.igdb.com/v4"


class IGDBError(RuntimeError):
    """Base error for failures while communicating with IGDB."""


class IGDBAuthenticationError(IGDBError):
    """Application credentials or the resulting access token were rejected."""


class IGDBRateLimitError(IGDBError):
    """IGDB rejected a request because its request budget was exceeded."""

    def __init__(self, retry_after: float | None = None) -> None:
        super().__init__("IGDB rate limit exceeded")
        self.retry_after = retry_after


class IGDBUnavailableError(IGDBError):
    """IGDB or Twitch authentication is temporarily unreachable."""


class IGDBInvalidResponseError(IGDBError):
    """The upstream returned a successful response with an invalid shape."""


class IGDBRequestError(IGDBError):
    """IGDB rejected an otherwise valid application request."""

    def __init__(self, status_code: int) -> None:
        super().__init__(f"IGDB request failed with status {status_code}")
        self.status_code = status_code


class IGDBClient:
    """Backend-only IGDB v4 client with cached application authentication."""

    def __init__(
        self,
        http_client: httpx.AsyncClient,
        client_id: str,
        client_secret: str,
        *,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if not client_id or not client_secret:
            raise ValueError("IGDB application credentials are required")
        self._http_client = http_client
        self._client_id = client_id
        self._client_secret = client_secret
        self._clock = clock
        self._access_token: str | None = None
        self._refresh_at = 0.0
        self._token_lock = asyncio.Lock()

    async def query(self, endpoint: str, apicalypse_query: str) -> list[dict[str, Any]]:
        """Run one APICalypse query and return the validated object list."""
        normalized_endpoint = endpoint.strip("/")
        if not normalized_endpoint or "/" in normalized_endpoint:
            raise ValueError("IGDB endpoint must be one path segment")
        if not apicalypse_query.strip():
            raise ValueError("IGDB query must not be empty")

        token = await self._get_access_token()
        response = await self._request(normalized_endpoint, apicalypse_query, token)
        if response.status_code == 401:
            self._invalidate_token(token)
            token = await self._get_access_token()
            response = await self._request(normalized_endpoint, apicalypse_query, token)
            if response.status_code == 401:
                self._invalidate_token(token)
                raise IGDBAuthenticationError("IGDB rejected the application access token")

        self._raise_for_status(response)
        return self._parse_results(response)

    async def _get_access_token(self) -> str:
        if self._access_token is not None and self._clock() < self._refresh_at:
            return self._access_token

        async with self._token_lock:
            if self._access_token is not None and self._clock() < self._refresh_at:
                return self._access_token
            response = await self._request_token()
            if response.status_code in {400, 401, 403}:
                raise IGDBAuthenticationError("IGDB application credentials were rejected")
            if response.status_code == 429:
                raise IGDBRateLimitError(self._retry_after(response))
            if response.status_code >= 500:
                raise IGDBUnavailableError("Twitch authentication service unavailable")
            if not response.is_success:
                raise IGDBAuthenticationError("Unable to obtain IGDB application access token")

            try:
                payload: Any = response.json()
            except ValueError as exc:
                raise IGDBInvalidResponseError("Invalid Twitch token response") from exc
            if not isinstance(payload, dict):
                raise IGDBInvalidResponseError("Invalid Twitch token response")
            access_token = payload.get("access_token")
            expires_in = payload.get("expires_in")
            token_type = payload.get("token_type")
            if (
                not isinstance(access_token, str)
                or not access_token
                or not isinstance(expires_in, int)
                or isinstance(expires_in, bool)
                or expires_in <= 0
                or not isinstance(token_type, str)
                or token_type.lower() != "bearer"
            ):
                raise IGDBInvalidResponseError("Invalid Twitch token response")

            refresh_leeway = min(30.0, expires_in * 0.1)
            self._access_token = access_token
            self._refresh_at = self._clock() + expires_in - refresh_leeway
            return access_token

    async def _request_token(self) -> httpx.Response:
        try:
            return await self._http_client.post(
                TWITCH_TOKEN_URL,
                data={
                    "client_id": self._client_id,
                    "client_secret": self._client_secret,
                    "grant_type": "client_credentials",
                },
            )
        except httpx.RequestError as exc:
            raise IGDBUnavailableError("Twitch authentication service unavailable") from exc

    async def _request(
        self,
        endpoint: str,
        apicalypse_query: str,
        token: str,
    ) -> httpx.Response:
        try:
            return await self._http_client.post(
                f"{IGDB_API_URL}/{endpoint}",
                headers={
                    "Accept": "application/json",
                    "Client-ID": self._client_id,
                    "Authorization": f"Bearer {token}",
                },
                content=apicalypse_query,
            )
        except httpx.RequestError as exc:
            raise IGDBUnavailableError("IGDB service unavailable") from exc

    def _invalidate_token(self, rejected_token: str) -> None:
        if self._access_token == rejected_token:
            self._access_token = None
            self._refresh_at = 0.0

    @classmethod
    def _raise_for_status(cls, response: httpx.Response) -> None:
        if response.status_code == 429:
            raise IGDBRateLimitError(cls._retry_after(response))
        if response.status_code >= 500:
            raise IGDBUnavailableError("IGDB service unavailable")
        if not response.is_success:
            raise IGDBRequestError(response.status_code)

    @staticmethod
    def _parse_results(response: httpx.Response) -> list[dict[str, Any]]:
        try:
            payload: Any = response.json()
        except ValueError as exc:
            raise IGDBInvalidResponseError("Invalid IGDB response") from exc
        if not isinstance(payload, list) or not all(isinstance(item, dict) for item in payload):
            raise IGDBInvalidResponseError("Invalid IGDB response")
        return payload

    @staticmethod
    def _retry_after(response: httpx.Response) -> float | None:
        value = response.headers.get("Retry-After")
        if value is None:
            return None
        try:
            return max(0.0, float(value))
        except ValueError:
            return None
