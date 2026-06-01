#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import requests
import csv
import json
import time
import signal
import sys
from pathlib import Path

URL = "https://mobapi.kan.org.il/api/mobile/subClass"
START_ID = 1
END_ID = 5000

CSV_OUTPUT = Path("kan_subclass_scan.csv")
JSON_OUTPUT = Path("kan_subclass_scan_full.json")

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


def save_results():
    with CSV_OUTPUT.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["id", "entries", "first_title"],
        )
        writer.writeheader()
        writer.writerows(rows)

    with JSON_OUTPUT.open("w", encoding="utf-8") as f:
        json.dump(full_results, f, ensure_ascii=False, indent=2)

    print(f"\nSaved CSV:  {CSV_OUTPUT.resolve()}", flush=True)
    print(f"Saved JSON: {JSON_OUTPUT.resolve()}", flush=True)
    print(f"Found {len(rows)} valid IDs", flush=True)


signal.signal(signal.SIGINT, request_stop)
signal.signal(signal.SIGTERM, request_stop)


def main():
    session = requests.Session()

    try:
        for id_ in range(START_ID, END_ID + 1):
            if stop_requested:
                break

            try:
                r = session.get(
                    URL,
                    params={"from": 1, "id": id_},
                    headers=headers,
                    timeout=(5, 10),  # connect timeout, read timeout
                )

                if r.status_code != 200:
                    continue

                try:
                    data = r.json()
                except ValueError:
                    continue

                entries = data.get("entry") or []

                if not entries:
                    continue

                print(f"\n=== ID {id_} | entries={len(entries)} ===", flush=True)

                compact_entries = []

                for item in entries:
                    title = item.get("title", "")
                    link = (item.get("link") or {}).get("href", "")
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

                time.sleep(0.05)

            except KeyboardInterrupt:
                # Extra safety if Ctrl+C happens inside requests/socket read.
                request_stop()
                break
            except requests.RequestException as e:
                print(f"ERROR id={id_}: {e}", flush=True)
                continue
            except Exception as e:
                print(f"ERROR id={id_}: {e}", flush=True)
                continue

    finally:
        save_results()


if __name__ == "__main__":
    main()
