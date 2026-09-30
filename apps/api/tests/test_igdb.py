import httpx
import pytest

from app.integrations.igdb import (
    IGDBAuthenticationError,
    IGDBClient,
    IGDBInvalidResponseError,
    IGDBRateLimitError,
    IGDBRequestError,
    IGDBUnavailableError,
)


def token_response(token: str = "app-token", expires_in: int = 3600) -> httpx.Response:
    return httpx.Response(
        200,
        json={"access_token": token, "expires_in": expires_in, "token_type": "bearer"},
    )


@pytest.mark.anyio
async def test_query_authenticates_on_backend_and_reuses_token() -> None:
    token_calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal token_calls
        if request.url.host == "id.twitch.tv":
            token_calls += 1
            assert request.headers["content-type"].startswith(
                "application/x-www-form-urlencoded"
            )
            assert b"client_id=client-id" in request.content
            assert b"client_secret=client-secret" in request.content
            assert b"grant_type=client_credentials" in request.content
            return token_response()
        assert request.url == "https://api.igdb.com/v4/games"
        assert request.headers["client-id"] == "client-id"
        assert request.headers["authorization"] == "Bearer app-token"
        assert request.content == b"fields id,name; limit 10;"
        return httpx.Response(200, json=[{"id": 1942, "name": "The Witcher 3"}])

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        client = IGDBClient(http_client, "client-id", "client-secret")
        first = await client.query("games", "fields id,name; limit 10;")
        second = await client.query("games", "fields id,name; limit 10;")

    assert first == second == [{"id": 1942, "name": "The Witcher 3"}]
    assert token_calls == 1


@pytest.mark.anyio
async def test_expired_token_is_replaced_before_query() -> None:
    now = 100.0
    issued_tokens = iter(("first", "second"))

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "id.twitch.tv":
            return token_response(next(issued_tokens), expires_in=10)
        return httpx.Response(200, json=[])

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        client = IGDBClient(http_client, "client-id", "client-secret", clock=lambda: now)
        await client.query("games", "fields id;")
        now = 110.0
        await client.query("games", "fields id;")


@pytest.mark.anyio
async def test_unauthorized_query_gets_one_new_app_token_and_retries() -> None:
    tokens = iter(("expired", "renewed"))
    api_tokens: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "id.twitch.tv":
            return token_response(next(tokens))
        api_tokens.append(request.headers["authorization"])
        if len(api_tokens) == 1:
            return httpx.Response(401)
        return httpx.Response(200, json=[{"id": 1}])

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        result = await IGDBClient(http_client, "client-id", "client-secret").query(
            "games", "fields id;"
        )

    assert result == [{"id": 1}]
    assert api_tokens == ["Bearer expired", "Bearer renewed"]


@pytest.mark.anyio
async def test_second_unauthorized_response_is_authentication_error() -> None:
    token_number = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal token_number
        if request.url.host == "id.twitch.tv":
            token_number += 1
            return token_response(f"token-{token_number}")
        return httpx.Response(401)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        with pytest.raises(IGDBAuthenticationError):
            await IGDBClient(http_client, "client-id", "client-secret").query(
                "games", "fields id;"
            )
    assert token_number == 2


@pytest.mark.anyio
async def test_rate_limit_exposes_retry_delay_without_upstream_body() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "id.twitch.tv":
            return token_response()
        return httpx.Response(429, headers={"Retry-After": "2.5"}, text="provider detail")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        with pytest.raises(IGDBRateLimitError) as caught:
            await IGDBClient(http_client, "client-id", "client-secret").query(
                "games", "fields id;"
            )
    assert caught.value.retry_after == 2.5
    assert "provider detail" not in str(caught.value)


@pytest.mark.anyio
async def test_timeout_is_reported_as_unavailable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out", request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        with pytest.raises(IGDBUnavailableError):
            await IGDBClient(http_client, "client-id", "client-secret").query(
                "games", "fields id;"
            )


@pytest.mark.anyio
@pytest.mark.parametrize(
    "response",
    (
        httpx.Response(200, text="not-json"),
        httpx.Response(200, json={"id": 1}),
        httpx.Response(200, json=["not-an-object"]),
    ),
)
async def test_invalid_success_response_is_rejected(response: httpx.Response) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "id.twitch.tv":
            return token_response()
        return response

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        with pytest.raises(IGDBInvalidResponseError):
            await IGDBClient(http_client, "client-id", "client-secret").query(
                "games", "fields id;"
            )


@pytest.mark.anyio
async def test_invalid_token_response_is_rejected() -> None:
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json={"token": "x"}))
    ) as http_client:
        with pytest.raises(IGDBInvalidResponseError):
            await IGDBClient(http_client, "client-id", "client-secret").query(
                "games", "fields id;"
            )


@pytest.mark.anyio
async def test_server_and_client_errors_have_distinct_types() -> None:
    status_code = 503

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "id.twitch.tv":
            return token_response()
        return httpx.Response(status_code)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        client = IGDBClient(http_client, "client-id", "client-secret")
        with pytest.raises(IGDBUnavailableError):
            await client.query("games", "fields id;")
        status_code = 400
        with pytest.raises(IGDBRequestError) as caught:
            await client.query("games", "fields id;")
    assert caught.value.status_code == 400


def test_credentials_are_required() -> None:
    with pytest.raises(ValueError):
        IGDBClient(httpx.AsyncClient(), "", "")
