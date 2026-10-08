"""Add an optional IGDB reference to platforms.

Revision ID: 004_platform_igdb_id
Revises: 003_initial_domain
"""

import sqlalchemy as sa
from alembic import op

revision = "004_platform_igdb_id"
down_revision = "003_initial_domain"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("platforms", sa.Column("igdb_id", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "ck_platforms_igdb_id_positive",
        "platforms",
        "igdb_id > 0",
    )
    op.create_unique_constraint("uq_platforms_igdb_id", "platforms", ["igdb_id"])


def downgrade() -> None:
    op.drop_constraint("uq_platforms_igdb_id", "platforms", type_="unique")
    op.drop_constraint("ck_platforms_igdb_id_positive", "platforms", type_="check")
    op.drop_column("platforms", "igdb_id")
