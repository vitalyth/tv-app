import argparse
import json

from services.keshet_vod_service import refresh_keshet_vod_catalog


def main() -> int:
    parser = argparse.ArgumentParser(description="Refresh Keshet VOD catalog into SQLite")
    parser.add_argument("--with-details", action="store_true", help="Scan program detail pages after catalog refresh")
    parser.add_argument("--with-streams", action="store_true", help="Resolve streams while scanning program details")
    parser.add_argument("--limit-programs", type=int, default=0, help="Limit detail scan to the first N programs")
    parser.add_argument("--verbose", action="store_true", help="Show detailed scan output")
    args = parser.parse_args()

    result = refresh_keshet_vod_catalog(
        with_details=args.with_details,
        limit_programs=args.limit_programs or None,
        with_streams=args.with_streams,
        verbose=args.verbose,
    )
    print(json.dumps(result, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
