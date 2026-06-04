#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import requests
import argparse
import csv
import json
import time
import signal
import sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

URL = "https://mobapi.kan.org.il/api/mobile/subClass"
BACKEND_DIR = Path(__file__).resolve().parents[1]

DEFAULT_CSV_OUTPUT = BACKEND_DIR / "kan_subclass_scan.csv"
DEFAULT_JSON_OUTPUT = BACKEND_DIR / "kan_subclass_scan_full.json"

headers = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://www.kan.org.il/",
    "Accept": "application/json,text/plain,*/*",
}

rows = []
full_results = []
stop_requested = False


def request_stop(signum=None, frame=None):
    global stop_requested
    stop_requested = True
    print("\n\nStopping gracefully... saving results collected so far.", flush=True)


def save_results(csv_output: Path, json_output: Path):
    csv_output.parent.mkdir(parents=True, exist_ok=True)
    json_output.parent.mkdir(parents=True, exist_ok=True)

    with csv_output.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["id", "entries", "first_title"],
        )
        writer.writeheader()
        writer.writerows(rows)

    with json_output.open("w", encoding="utf-8") as f:
        json.dump(full_results, f, ensure_ascii=False, indent=2)

    print(f"\nSaved CSV:  {csv_output.resolve()}", flush=True)
    print(f"Saved JSON: {json_output.resolve()}", flush=True)
    print(f"Found {len(rows)} valid IDs", flush=True)


signal.signal(signal.SIGINT, request_stop)
signal.signal(signal.SIGTERM, request_stop)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Scan Kan mobile subClass IDs")
    parser.add_argument("--start-id", type=int, default=1)
    parser.add_argument("--end-id", type=int, default=5000)
    parser.add_argument("--csv-output", type=Path, default=DEFAULT_CSV_OUTPUT)
    parser.add_argument("--json-output", type=Path, default=DEFAULT_JSON_OUTPUT)
    parser.add_argument("--delay", type=float, default=0.05)
    parser.add_argument("--connect-timeout", type=float, default=5)
    parser.add_argument("--read-timeout", type=float, default=10)
    parser.add_argument("--workers", type=int, default=20)
    parser.add_argument("--progress-every", type=int, default=250)
    parser.add_argument("--quiet", action="store_true", help="Only print summary/progress, not every entry title")
    parser.add_argument(
        "--max-consecutive-errors",
        type=int,
        default=5,
        help="Stop after this many consecutive request errors. Use 0 to disable.",
    )
    return parser


def fetch_subclass(id_: int, args: argparse.Namespace) -> tuple[int, list[dict], Exception | None]:
    try:
        r = requests.get(
            URL,
            params={"from": 1, "id": id_},
            headers=headers,
            timeout=(args.connect_timeout, args.read_timeout),
        )

        if r.status_code != 200:
            return id_, [], None

        try:
            data = r.json()
        except ValueError:
            return id_, [], None

        return id_, data.get("entry") or [], None
    except Exception as e:
        return id_, [], e


def handle_result(id_: int, entries: list[dict], args: argparse.Namespace) -> bool:
    if not entries:
        return False

    print(f"\n=== ID {id_} | entries={len(entries)} ===", flush=True)

    compact_entries = []

    for item in entries:
        title = item.get("title", "")
        link = (item.get("link") or {}).get("href", "")
        if not args.quiet:
            print(f"  {title} | {link}", flush=True)

        compact_entries.append({
            "title": title,
            "link": link,
            "id": item.get("id"),
            "mainid": (item.get("extensions") or {}).get("mainid"),
        })

    rows.append({
        "id": id_,
        "entries": len(entries),
        "first_title": entries[0].get("title", ""),
    })

    full_results.append({
        "id": id_,
        "entries_count": len(entries),
        "entries": compact_entries,
    })

    return True


def main():
    args = build_parser().parse_args()
    consecutive_errors = 0
    scanned = 0
    total = args.end_id - args.start_id + 1
    workers = max(1, args.workers)

    try:
        id_iter = iter(range(args.start_id, args.end_id + 1))

        while not stop_requested:
            batch = []
            for _ in range(workers):
                try:
                    batch.append(next(id_iter))
                except StopIteration:
                    break

            if not batch:
                break

            with ThreadPoolExecutor(max_workers=workers) as executor:
                futures = {
                    executor.submit(fetch_subclass, id_, args): id_
                    for id_ in batch
                }

                for future in as_completed(futures):
                    if stop_requested:
                        break

                    id_, entries, error = future.result()
                    scanned += 1

                    if error:
                        print(f"ERROR id={id_}: {error}", flush=True)
                        consecutive_errors += 1
                    else:
                        consecutive_errors = 0
                        handle_result(id_, entries, args)

                    if args.progress_every and scanned % args.progress_every == 0:
                        print(f"Progress: {scanned}/{total} IDs scanned", flush=True)

                    if args.max_consecutive_errors and consecutive_errors >= args.max_consecutive_errors:
                        print(
                            f"Stopping after {consecutive_errors} consecutive request errors.",
                            flush=True,
                        )
                        return

            if stop_requested:
                break

            if args.delay:
                time.sleep(args.delay)

    finally:
        rows.sort(key=lambda item: item["id"])
        full_results.sort(key=lambda item: item["id"])
        save_results(args.csv_output, args.json_output)


if __name__ == "__main__":
    main()
