from sqlalchemy import Column, Table
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for SQLAlchemy models."""


# Supabase owns this table. The reference is registered solely to resolve the FK.
Table(
    "users",
    Base.metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    schema="auth",
    info={"external": True},
)

# Register models with Alembic's target metadata.
from app.db import models as models  # noqa: E402, F401
