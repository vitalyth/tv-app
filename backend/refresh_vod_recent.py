import sys
from pathlib import Path

# Ensure local backend module imports work when run from the backend directory.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from services.channel_service import refresh_vod_recent_cache


if __name__ == "__main__":
    print("Refreshing VOD recent cache...")
    recent_items = refresh_vod_recent_cache()
    print(f"Wrote {len(recent_items)} recent VOD items to cache.")
