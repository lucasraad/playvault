import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.db.session import DatabaseNotConfiguredError, get_db_session
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def clear_dependency_overrides() -> None:
    app.dependency_overrides.clear()


def test_health_check() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


class ConnectedSession:
    def execute(self, statement: object) -> None:
        del statement


class DisconnectedSession:
    def execute(self, statement: object) -> None:
        del statement
        raise OperationalError("SELECT 1", {}, Exception("connection failed"))


def test_database_health_check() -> None:
    app.dependency_overrides[get_db_session] = lambda: ConnectedSession()

    response = client.get("/health/database")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "connected"}


def test_database_health_check_when_database_is_unavailable() -> None:
    app.dependency_overrides[get_db_session] = lambda: DisconnectedSession()

    response = client.get("/health/database")

    assert response.status_code == 503
    assert response.json() == {"detail": "Database unavailable"}


def test_database_health_check_when_database_is_not_configured() -> None:
    def not_configured() -> None:
        raise DatabaseNotConfiguredError("DATABASE_URL is not configured")

    app.dependency_overrides[get_db_session] = not_configured

    response = client.get("/health/database")

    assert response.status_code == 503
    assert response.json() == {"detail": "Database unavailable"}
