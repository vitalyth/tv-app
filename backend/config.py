import os
from pathlib import Path

APP_VERSION = "0.1.2"
BASE_DIR = Path(__file__).resolve().parent
CACHE_DIR = Path(os.getenv("BACKEND_CACHE_DIR", BASE_DIR.parent / "cache"))
