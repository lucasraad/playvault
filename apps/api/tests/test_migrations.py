from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import CheckConstraint, UniqueConstraint

from app.core.config import get_settings
from app.db.base import Base


def test_alembic_script_directory_is_valid() -> None:
    api_root = Path(__file__).resolve().parents[1]
    config = Config(api_root / "alembic.ini")

    script = ScriptDirectory.from_config(config)

    assert Path(script.dir).resolve() == (api_root / "migrations").resolve()


def test_initial_domain_metadata_keeps_game_and_library_distinct() -> None:
    tables = Base.metadata.tables
    assert set(tables) == {
        "auth.users",
        "profiles",
        "games",
        "platforms",
        "game_platforms",
        "library_entries",
        "wishlist_entries",
    }
    assert tables["auth.users"].info["external"] is True
    assert next(iter(tables["profiles"].c.id.foreign_keys)).target_fullname == "auth.users.id"
    entry = tables["library_entries"]
    assert {column.name for column in entry.columns} >= {
        "profile_id",
        "game_id",
        "platform_id",
        "status",
        "source",
        "playtime_minutes",
        "rating",
        "completion_percent",
    }
    assert any(
        isinstance(constraint, UniqueConstraint)
        and {column.name for column in constraint.columns}
        == {"profile_id", "game_id", "platform_id"}
        for constraint in entry.constraints
    )
    assert sum(isinstance(constraint, CheckConstraint) for constraint in entry.constraints) == 5


def test_initial_migration_renders_isolated_tables(monkeypatch, capsys) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:password@localhost/test")
    get_settings.cache_clear()
    api_root = Path(__file__).resolve().parents[1]
    try:
        command.upgrade(Config(api_root / "alembic.ini"), "head", sql=True)
    finally:
        get_settings.cache_clear()
    sql = capsys.readouterr().out

    for table in (
        "profiles",
        "games",
        "platforms",
        "game_platforms",
        "library_entries",
        "wishlist_entries",
    ):
        assert f"CREATE TABLE {table}" in sql
        assert f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY" in sql
        assert f"REVOKE ALL ON TABLE public.{table} FROM anon, authenticated, service_role" in sql
    assert "CREATE TABLE auth.users" not in sql
