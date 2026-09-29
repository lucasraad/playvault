"""Initial domain schema.

Revision ID: 003_initial_domain
Revises:
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "003_initial_domain"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("username", sa.String(length=40), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["id"], ["auth.users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
    )
    op.create_table(
        "games",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("igdb_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("igdb_id > 0", name="ck_games_igdb_id_positive"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("igdb_id"),
    )
    op.create_index("ix_games_title", "games", ["title"])
    op.create_table(
        "platforms",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("slug", sa.String(length=60), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_table(
        "game_platforms",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("game_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("platform_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(["game_id"], ["games.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["platform_id"], ["platforms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("game_id", "platform_id", name="uq_game_platforms_game_platform"),
    )
    op.create_index("ix_game_platforms_platform_id", "game_platforms", ["platform_id"])
    op.create_table(
        "library_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("profile_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("game_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("platform_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="backlog", nullable=False),
        sa.Column("source", sa.String(length=20), server_default="manual", nullable=False),
        sa.Column("playtime_minutes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("rating", sa.Numeric(precision=3, scale=1), nullable=True),
        sa.Column("completion_percent", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "status IN ('backlog', 'playing', 'paused', 'completed', 'abandoned', 'perfected')",
            name="ck_library_entries_status",
        ),
        sa.CheckConstraint(
            "source IN ('manual', 'steam', 'xbox', 'playstation', 'nintendo')",
            name="ck_library_entries_source",
        ),
        sa.CheckConstraint("playtime_minutes >= 0", name="ck_library_entries_playtime"),
        sa.CheckConstraint("rating BETWEEN 0 AND 10", name="ck_library_entries_rating"),
        sa.CheckConstraint(
            "completion_percent BETWEEN 0 AND 100", name="ck_library_entries_completion"
        ),
        sa.ForeignKeyConstraint(["profile_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["game_id"], ["games.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["platform_id"], ["platforms.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "profile_id", "game_id", "platform_id", name="uq_library_owner_game_platform"
        ),
    )
    op.create_index(
        "ix_library_entries_profile_status", "library_entries", ["profile_id", "status"]
    )
    op.create_index("ix_library_entries_game_id", "library_entries", ["game_id"])
    op.create_index("ix_library_entries_platform_id", "library_entries", ["platform_id"])
    op.create_table(
        "wishlist_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("profile_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("game_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["profile_id"], ["profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["game_id"], ["games.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("profile_id", "game_id", name="uq_wishlist_owner_game"),
    )
    op.create_index("ix_wishlist_entries_game_id", "wishlist_entries", ["game_id"])

    # These tables are accessed only through FastAPI. No Data API role receives access.
    for table in (
        "profiles",
        "games",
        "platforms",
        "game_platforms",
        "library_entries",
        "wishlist_entries",
    ):
        op.execute(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"REVOKE ALL ON TABLE public.{table} FROM anon, authenticated, service_role")


def downgrade() -> None:
    op.drop_table("wishlist_entries")
    op.drop_table("library_entries")
    op.drop_table("game_platforms")
    op.drop_table("platforms")
    op.drop_table("games")
    op.drop_table("profiles")
