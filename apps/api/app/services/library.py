import re
import unicodedata
import uuid
from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.models import Game, GamePlatform, LibraryEntry, Platform
from app.integrations.igdb import IGDBClient, IGDBInvalidResponseError

CATALOG_GAME_FIELDS = "id,name,platforms.id,platforms.name,platforms.abbreviation"


class CatalogGameNotFoundError(LookupError):
    """The requested IGDB game does not exist."""


class CatalogPlatformNotFoundError(LookupError):
    """The selected IGDB platform is not valid for the requested game."""


class LibraryUnavailableError(RuntimeError):
    """The library write could not be completed safely."""


class _IGDBPlatform(BaseModel):
    model_config = ConfigDict(extra="ignore", strict=True)

    id: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=100)
    abbreviation: str | None = None


class _IGDBGame(BaseModel):
    model_config = ConfigDict(extra="ignore", strict=True)

    id: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=255)
    platforms: list[_IGDBPlatform] = Field(default_factory=list)


@dataclass(frozen=True)
class CatalogLibrarySelection:
    igdb_id: int
    title: str
    platform_igdb_id: int
    platform_name: str
    platform_slug: str


@dataclass(frozen=True)
class LibraryWriteResult:
    entry: LibraryEntry
    game: Game
    platform: Platform
    created: bool


async def resolve_catalog_selection(
    client: IGDBClient,
    igdb_id: int,
    platform_igdb_id: int,
) -> CatalogLibrarySelection:
    query = (
        f"fields {CATALOG_GAME_FIELDS}; "
        f"where id = {igdb_id}; limit 1;"
    )
    raw_games = await client.query("games", query)
    if not raw_games:
        raise CatalogGameNotFoundError

    try:
        game = _IGDBGame.model_validate(raw_games[0])
    except (ValidationError, ValueError, TypeError) as exc:
        raise IGDBInvalidResponseError("Invalid IGDB game response") from exc
    if game.id != igdb_id:
        raise IGDBInvalidResponseError("IGDB returned an unexpected game")

    platform = next(
        (candidate for candidate in game.platforms if candidate.id == platform_igdb_id),
        None,
    )
    if platform is None:
        raise CatalogPlatformNotFoundError

    return CatalogLibrarySelection(
        igdb_id=game.id,
        title=game.name,
        platform_igdb_id=platform.id,
        platform_name=platform.name,
        platform_slug=_platform_slug(platform.name),
    )


def add_catalog_selection_to_library(
    session: Session,
    profile_id: uuid.UUID,
    selection: CatalogLibrarySelection,
) -> LibraryWriteResult:
    for attempt in range(2):
        try:
            return _write_library_entry(session, profile_id, selection)
        except IntegrityError as exc:
            session.rollback()
            if attempt == 1:
                raise LibraryUnavailableError("Concurrent library write failed") from exc
        except SQLAlchemyError as exc:
            session.rollback()
            raise LibraryUnavailableError("Library database unavailable") from exc
    raise LibraryUnavailableError("Library write failed")


def _write_library_entry(
    session: Session,
    profile_id: uuid.UUID,
    selection: CatalogLibrarySelection,
) -> LibraryWriteResult:
    game = session.scalar(select(Game).where(Game.igdb_id == selection.igdb_id))
    if game is None:
        game = Game(igdb_id=selection.igdb_id, title=selection.title)
        session.add(game)
        session.flush()
    elif game.title != selection.title:
        game.title = selection.title

    platform = session.scalar(
        select(Platform).where(Platform.igdb_id == selection.platform_igdb_id)
    )
    if platform is None:
        platform = session.scalar(select(Platform).where(Platform.slug == selection.platform_slug))
        if platform is None:
            platform = Platform(
                igdb_id=selection.platform_igdb_id,
                slug=selection.platform_slug,
                name=selection.platform_name,
            )
            session.add(platform)
            session.flush()
        elif platform.igdb_id is None:
            platform.igdb_id = selection.platform_igdb_id
            platform.name = selection.platform_name
        else:
            qualified_slug = _qualified_platform_slug(
                selection.platform_slug,
                selection.platform_igdb_id,
            )
            platform = Platform(
                igdb_id=selection.platform_igdb_id,
                slug=qualified_slug,
                name=selection.platform_name,
            )
            session.add(platform)
            session.flush()
    elif platform.name != selection.platform_name:
        platform.name = selection.platform_name

    game_platform = session.scalar(
        select(GamePlatform).where(
            GamePlatform.game_id == game.id,
            GamePlatform.platform_id == platform.id,
        )
    )
    if game_platform is None:
        session.add(GamePlatform(game_id=game.id, platform_id=platform.id))

    entry = session.scalar(
        select(LibraryEntry).where(
            LibraryEntry.profile_id == profile_id,
            LibraryEntry.game_id == game.id,
            LibraryEntry.platform_id == platform.id,
        )
    )
    created = entry is None
    if entry is None:
        entry = LibraryEntry(
            profile_id=profile_id,
            game_id=game.id,
            platform_id=platform.id,
            status="backlog",
            source="manual",
        )
        session.add(entry)
    session.commit()
    return LibraryWriteResult(entry=entry, game=game, platform=platform, created=created)


def _platform_slug(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")
    return (slug or "platform")[:60]


def _qualified_platform_slug(slug: str, igdb_id: int) -> str:
    suffix = f"-igdb-{igdb_id}"
    return f"{slug[: 60 - len(suffix)].rstrip('-')}{suffix}"
