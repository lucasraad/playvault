from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory


def test_alembic_script_directory_is_valid() -> None:
    api_root = Path(__file__).resolve().parents[1]
    config = Config(api_root / "alembic.ini")

    script = ScriptDirectory.from_config(config)

    assert Path(script.dir).resolve() == (api_root / "migrations").resolve()
