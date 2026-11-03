import os
from pathlib import Path

APP_VERSION = "0.1.3"
BASE_DIR = Path(__file__).resolve().parent
CACHE_DIR = Path(os.getenv("BACKEND_CACHE_DIR", BASE_DIR / "cache"))


def get_vod_db_path(*provider_env_names: str) -> str:
    """Use provider overrides, the shared DB, then the legacy deployment setting."""
    for env_name in (*provider_env_names, "VOD_DB_PATH", "KAN_VOD_DB_PATH"):
        value = os.getenv(env_name, "").strip()
        if value:
            return value
    return "db/kan_vod.db"
