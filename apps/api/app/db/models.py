import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth.users.id", ondelete="CASCADE"), primary_key=True
    )
    username: Mapped[str] = mapped_column(String(40), unique=True)
    display_name: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Game(Base):
    __tablename__ = "games"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), index=True)
    igdb_id: Mapped[int | None] = mapped_column(Integer, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (CheckConstraint("igdb_id > 0", name="ck_games_igdb_id_positive"),)


class Platform(Base):
    __tablename__ = "platforms"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(60), unique=True)
    name: Mapped[str] = mapped_column(String(100))


class GamePlatform(Base):
    __tablename__ = "game_platforms"
    __table_args__ = (
        UniqueConstraint("game_id", "platform_id", name="uq_game_platforms_game_platform"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    game_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("games.id", ondelete="CASCADE")
    )
    platform_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platforms.id", ondelete="CASCADE"), index=True
    )


class LibraryEntry(Base):
    __tablename__ = "library_entries"
    __table_args__ = (
        UniqueConstraint(
            "profile_id", "game_id", "platform_id", name="uq_library_owner_game_platform"
        ),
        CheckConstraint(
            "status IN ('backlog', 'playing', 'paused', 'completed', 'abandoned', 'perfected')",
            name="ck_library_entries_status",
        ),
        CheckConstraint(
            "source IN ('manual', 'steam', 'xbox', 'playstation', 'nintendo')",
            name="ck_library_entries_source",
        ),
        CheckConstraint("playtime_minutes >= 0", name="ck_library_entries_playtime"),
        CheckConstraint("rating BETWEEN 0 AND 10", name="ck_library_entries_rating"),
        CheckConstraint(
            "completion_percent BETWEEN 0 AND 100", name="ck_library_entries_completion"
        ),
        Index("ix_library_entries_profile_status", "profile_id", "status"),
        Index("ix_library_entries_game_id", "game_id"),
        Index("ix_library_entries_platform_id", "platform_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE")
    )
    game_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("games.id", ondelete="RESTRICT")
    )
    platform_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platforms.id", ondelete="RESTRICT")
    )
    status: Mapped[str] = mapped_column(String(20), default="backlog", server_default="backlog")
    source: Mapped[str] = mapped_column(String(20), default="manual", server_default="manual")
    playtime_minutes: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    rating: Mapped[Decimal | None] = mapped_column(Numeric(3, 1))
    completion_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WishlistEntry(Base):
    __tablename__ = "wishlist_entries"
    __table_args__ = (
        UniqueConstraint("profile_id", "game_id", name="uq_wishlist_owner_game"),
        Index("ix_wishlist_entries_game_id", "game_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE")
    )
    game_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("games.id", ondelete="RESTRICT")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
