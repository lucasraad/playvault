from app.core.config import Settings


def test_postgresql_url_uses_psycopg_driver() -> None:
    settings = Settings(
        database_url="postgresql://postgres:password@localhost:5432/postgres"
    )

    assert settings.database_url is not None
    assert settings.database_url.startswith("postgresql+psycopg://")
