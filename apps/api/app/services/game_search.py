import json
import re
from datetime import UTC, date, datetime

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.integrations.igdb import IGDBClient, IGDBInvalidResponseError

GAME_SEARCH_FIELDS = (
    "id,name,slug,summary,first_release_date,cover.image_id,"
    "platforms.id,platforms.name,platforms.abbreviation,genres.id,genres.name"
)
SEARCH_TERM_PATTERN = re.compile(r"^[\w\s:.'&+!?(),/\-]+$", re.UNICODE)


class GameSearchPlatform(BaseModel):
    igdb_id: int = Field(gt=0)
    name: str = Field(min_length=1)
    abbreviation: str | None = None


class GameSearchGenre(BaseModel):
    igdb_id: int = Field(gt=0)
    name: str = Field(min_length=1)


class GameSearchResult(BaseModel):
    igdb_id: int = Field(gt=0)
    name: str = Field(min_length=1)
    slug: str = Field(min_length=1)
    summary: str | None = None
    first_release_date: date | None = None
    cover_url: str | None = None
    platforms: list[GameSearchPlatform] = Field(default_factory=list)
    genres: list[GameSearchGenre] = Field(default_factory=list)


class GameSearchResponse(BaseModel):
    query: str
    limit: int
    results: list[GameSearchResult]


class _IGDBCover(BaseModel):
    model_config = ConfigDict(extra="ignore", strict=True)

    image_id: str = Field(min_length=1, pattern=r"^[A-Za-z0-9_-]+$")


class _IGDBRelatedItem(BaseModel):
    model_config = ConfigDict(extra="ignore", strict=True)

    id: int = Field(gt=0)
    name: str = Field(min_length=1)
    abbreviation: str | None = None


class _IGDBGame(BaseModel):
    model_config = ConfigDict(extra="ignore", strict=True)

    id: int = Field(gt=0)
    name: str = Field(min_length=1)
    slug: str = Field(min_length=1)
    summary: str | None = None
    first_release_date: int | None = None
    cover: _IGDBCover | None = None
    platforms: list[_IGDBRelatedItem] = Field(default_factory=list)
    genres: list[_IGDBRelatedItem] = Field(default_factory=list)


def normalize_search_term(value: str) -> str:
    normalized = " ".join(value.split())
    if not 2 <= len(normalized) <= 80:
        raise ValueError("Search query must contain between 2 and 80 characters")
    if not SEARCH_TERM_PATTERN.fullmatch(normalized):
        raise ValueError("Search query contains unsupported characters")
    return normalized


def build_game_search_query(search_term: str, limit: int) -> str:
    if not 1 <= limit <= 20:
        raise ValueError("Search limit must be between 1 and 20")
    encoded_term = json.dumps(search_term, ensure_ascii=False)
    return (
        f"search {encoded_term}; fields {GAME_SEARCH_FIELDS}; "
        f"where version_parent = null; limit {limit};"
    )


async def search_games(
    client: IGDBClient,
    search_term: str,
    limit: int,
) -> GameSearchResponse:
    normalized = normalize_search_term(search_term)
    raw_results = await client.query("games", build_game_search_query(normalized, limit))
    try:
        results = [_to_search_result(_IGDBGame.model_validate(item)) for item in raw_results]
    except (ValidationError, ValueError, OSError, OverflowError) as exc:
        raise IGDBInvalidResponseError("Invalid IGDB game response") from exc
    return GameSearchResponse(query=normalized, limit=limit, results=results)


def _to_search_result(game: _IGDBGame) -> GameSearchResult:
    release_date = _timestamp_to_date(game.first_release_date)
    cover_url = None
    if game.cover is not None:
        cover_url = (
            "https://images.igdb.com/igdb/image/upload/"
            f"t_cover_big/{game.cover.image_id}.jpg"
        )
    return GameSearchResult(
        igdb_id=game.id,
        name=game.name,
        slug=game.slug,
        summary=game.summary,
        first_release_date=release_date,
        cover_url=cover_url,
        platforms=[
            GameSearchPlatform(
                igdb_id=platform.id,
                name=platform.name,
                abbreviation=platform.abbreviation,
            )
            for platform in game.platforms
        ],
        genres=[GameSearchGenre(igdb_id=genre.id, name=genre.name) for genre in game.genres],
    )


def _timestamp_to_date(timestamp: int | None) -> date | None:
    if timestamp is None:
        return None
    return datetime.fromtimestamp(timestamp, UTC).date()
