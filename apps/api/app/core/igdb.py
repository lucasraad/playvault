from fastapi import Request

from app.integrations.igdb import IGDBClient


class IGDBNotConfiguredError(RuntimeError):
    """The application has no configured IGDB client."""


def get_igdb_client(request: Request) -> IGDBClient:
    client: IGDBClient | None = getattr(request.app.state, "igdb_client", None)
    if client is None:
        raise IGDBNotConfiguredError("IGDB is not configured")
    return client
