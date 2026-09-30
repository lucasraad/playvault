from pydantic import SecretStr

from app.core.config import Settings


def test_postgresql_url_uses_psycopg_driver() -> None:
    settings = Settings(
        database_url="postgresql://postgres:password@localhost:5432/postgres"
    )

    assert settings.database_url is not None
    assert settings.database_url.startswith("postgresql+psycopg://")


def test_igdb_secret_is_not_exposed_by_settings_repr() -> None:
    settings = Settings(
        igdb_client_id="client-id",
        igdb_client_secret=SecretStr("client-secret"),
    )

    assert "client-secret" not in repr(settings)
    assert settings.igdb_client_secret is not None
    assert settings.igdb_client_secret.get_secret_value() == "client-secret"
