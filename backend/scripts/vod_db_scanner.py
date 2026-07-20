import argparse
import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _run_kan_scan(args: argparse.Namespace) -> dict:
    command = [
        sys.executable,
        str(SCRIPT_DIR / "kan_db_scanner.py"),
        "scan",
        "--db",
        args.db,
    ]

    if args.incremental:
        command.append("--incremental")
        command.extend(["--full-scan-interval-hours", str(args.full_scan_interval_hours)])
    if args.with_streams:
        command.append("--with-streams")
    if args.verbose:
        command.append("--verbose")
    if args.limit_programs:
        command.extend(["--limit-programs", str(args.limit_programs)])
    if args.limit_episodes:
        command.extend(["--limit-episodes", str(args.limit_episodes)])

    result = subprocess.run(command, cwd=BACKEND_DIR)
    response = {
        "provider": "kan",
        "command": command,
        "returnCode": result.returncode,
    }

    if result.returncode == 0 and args.ensure_episodes and not args.catalog_only:
        ensure_result = _ensure_kan_programs_have_episodes(args)
        response["ensureEpisodes"] = ensure_result
        if ensure_result.get("returnCode") != 0:
            response["returnCode"] = ensure_result["returnCode"]

    return response


def _kan_programs_without_episodes(db_path: str, limit: int = 0) -> list[dict]:
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    try:
        query = """
            SELECT p.id, p.title
            FROM programs p
            LEFT JOIN episodes e ON e.program_id = p.id
            GROUP BY p.id, p.title
            HAVING COUNT(e.id) = 0
            ORDER BY p.title
        """
        if limit:
            query += " LIMIT ?"
            rows = con.execute(query, (limit,)).fetchall()
        else:
            rows = con.execute(query).fetchall()
        return [dict(row) for row in rows]
    finally:
        con.close()


def _ensure_kan_programs_have_episodes(args: argparse.Namespace) -> dict:
    limit = args.ensure_episodes_limit or args.limit_programs
    missing = _kan_programs_without_episodes(args.db, limit=limit)
    if not missing:
        return {"missingPrograms": 0, "scannedPrograms": 0, "returnCode": 0}

    command = [
        sys.executable,
        str(SCRIPT_DIR / "kan_db_scanner.py"),
        "scan",
        "--db",
        args.db,
    ]
    for program in missing:
        command.extend(["--program-id", str(program["id"])])
    if args.with_streams:
        command.append("--with-streams")
    if args.verbose:
        command.append("--verbose")
    if args.limit_episodes:
        command.extend(["--limit-episodes", str(args.limit_episodes)])

    print(
        f"Kan ensure episodes: scanning {len(missing)} programs without episodes",
        flush=True,
    )
    result = subprocess.run(command, cwd=BACKEND_DIR)
    return {
        "missingPrograms": len(missing),
        "scannedPrograms": len(missing) if result.returncode == 0 else 0,
        "returnCode": result.returncode,
    }


def _run_keshet_scan(args: argparse.Namespace) -> dict:
    os.environ["KESHET_VOD_DB_PATH"] = args.db
    os.environ.setdefault("KAN_VOD_DB_PATH", args.db)

    from services.keshet_vod_service import (
        refresh_keshet_vod_catalog,
        scan_keshet_vod_programs_without_episodes,
    )

    result = refresh_keshet_vod_catalog(
        with_details=not args.catalog_only,
        limit_programs=args.limit_programs or None,
        with_streams=args.with_streams,
        verbose=args.verbose,
    )
    ensure_result = None
    if args.ensure_episodes and not args.catalog_only:
        ensure_result = scan_keshet_vod_programs_without_episodes(
            limit=args.ensure_episodes_limit,
            with_streams=args.with_streams,
            verbose=args.verbose,
        )

    return_code = 0
    if ensure_result and ensure_result.get("returnCode") != 0:
        return_code = ensure_result["returnCode"]

    return {
        "provider": "keshet",
        "returnCode": return_code,
        **result,
        **({"ensureEpisodes": ensure_result} if ensure_result else {}),
    }


def command_scan(args: argparse.Namespace) -> int:
    providers = ["kan", "keshet"] if args.provider == "all" else [args.provider]
    results = []

    for provider in providers:
        if provider == "kan":
            result = _run_kan_scan(args)
        elif provider == "keshet":
            result = _run_keshet_scan(args)
        else:
            raise ValueError(f"Unsupported VOD provider: {provider}")

        results.append(result)
        if args.verbose:
            print(json.dumps(result, ensure_ascii=False), flush=True)

    print(json.dumps({"results": results}, ensure_ascii=False), flush=True)
    return 0 if all(item.get("returnCode") == 0 for item in results) else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Unified VOD DB scanner")
    sub = parser.add_subparsers(dest="command", required=True)

    scan = sub.add_parser("scan", help="Scan VOD providers into SQLite")
    scan.add_argument(
        "--provider",
        choices=["kan", "keshet", "all"],
        default="all",
        help="Which VOD provider to scan. Default: all.",
    )
    scan.add_argument(
        "--db",
        default=os.getenv("KAN_VOD_DB_PATH", "db/kan_vod.db"),
        help="SQLite DB path shared by VOD providers.",
    )
    scan.add_argument("--incremental", action="store_true", help="Use incremental mode where supported")
    scan.add_argument(
        "--full-scan-interval-hours",
        type=int,
        default=168,
        help="When --incremental is set for Kan, force a full program scan after this many hours.",
    )
    scan.add_argument("--with-streams", action="store_true", help="Resolve stream URLs during scan")
    scan.add_argument("--limit-programs", type=int, default=0, help="Limit scanned programs")
    scan.add_argument("--limit-episodes", type=int, default=0, help="Limit scanned episodes where supported")
    scan.add_argument(
        "--no-ensure-episodes",
        dest="ensure_episodes",
        action="store_false",
        help="Do not run the provider post-pass that scans programs still missing episodes.",
    )
    scan.add_argument(
        "--ensure-episodes-limit",
        type=int,
        default=0,
        help="Limit the provider post-pass for programs that still have no episodes. Default: no limit.",
    )
    scan.add_argument(
        "--catalog-only",
        action="store_true",
        help="Only refresh provider catalog when supported; do not scan episode details.",
    )
    scan.add_argument("--verbose", action="store_true", help="Show detailed scan output")
    scan.set_defaults(func=command_scan)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
