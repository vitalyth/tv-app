import os
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

from config import CACHE_DIR

BASE_DIR = Path(__file__).resolve().parent
KAN_VOD_DB_PATH = os.getenv("KAN_VOD_DB_PATH", "db/kan_vod.db")
KESHET_VOD_SCAN_LIMIT_PROGRAMS = os.getenv("KESHET_VOD_SCAN_LIMIT_PROGRAMS", "40")


@dataclass
class ScheduledJob:
    name: str
    command: list[str]
    interval_seconds: int
    next_run: float = 0


def read_interval(env_name: str, default_seconds: int) -> int:
    raw_value = os.getenv(env_name, "").strip()
    if not raw_value:
        return default_seconds

    try:
        interval = int(raw_value)
    except ValueError:
        print(f"Invalid {env_name}={raw_value!r}; using {default_seconds}s", flush=True)
        return default_seconds

    return max(interval, 60)


def run_job(job: ScheduledJob) -> None:
    started_at = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{started_at}] Starting {job.name}: {' '.join(job.command)}", flush=True)

    result = subprocess.run(job.command, cwd=BASE_DIR)
    finished_at = time.strftime("%Y-%m-%d %H:%M:%S")

    if result.returncode == 0:
        print(f"[{finished_at}] Finished {job.name}", flush=True)
    else:
        print(f"[{finished_at}] {job.name} failed with exit code {result.returncode}", flush=True)

    log_cache_file_status()
    job.next_run = time.time() + job.interval_seconds


def log_cache_file_status() -> None:
    for cache_file in (CACHE_DIR / "epg.sqlite", CACHE_DIR / "vod_recent.json"):
        if not cache_file.exists():
            print(f"Cache file missing: {cache_file}", flush=True)
            continue

        stat = cache_file.stat()
        updated_at = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime))
        print(f"Cache file {cache_file} updated {updated_at}, {stat.st_size} bytes", flush=True)

    db_path = BASE_DIR / KAN_VOD_DB_PATH if not os.path.isabs(KAN_VOD_DB_PATH) else Path(KAN_VOD_DB_PATH)
    if db_path.exists():
        stat = db_path.stat()
        updated_at = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime))
        print(f"Kan VOD DB {db_path} updated {updated_at}, {stat.st_size} bytes", flush=True)


def main() -> int:
    stop_requested = False

    def request_stop(signum, frame):
        nonlocal stop_requested
        stop_requested = True
        print(f"Received signal {signum}; stopping scheduler...", flush=True)

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)

    python = sys.executable
    jobs = [
        ScheduledJob(
            name="epg",
            command=[python, "parse_epg.py", "--all-channels"],
            interval_seconds=read_interval("EPG_INTERVAL_SECONDS", 24 * 60 * 60),
        ),
        ScheduledJob(
            name="kan_vod_scan",
            command=[
                python,
                "scripts/vod_db_scanner.py",
                "scan",
                "--provider",
                "kan",
                "--db",
                KAN_VOD_DB_PATH,
                "--incremental",
                "--verbose",
            ],
            interval_seconds=read_interval("KAN_VOD_SCAN_INTERVAL_SECONDS", 8 * 60 * 60),
        ),
        ScheduledJob(
            name="keshet_vod_scan",
            command=[
                python,
                "scripts/vod_db_scanner.py",
                "scan",
                "--provider",
                "keshet",
                "--db",
                KAN_VOD_DB_PATH,
                "--limit-programs",
                KESHET_VOD_SCAN_LIMIT_PROGRAMS,
                "--incremental",
                "--verbose",
            ],
            interval_seconds=read_interval(
                "KESHET_VOD_SCAN_INTERVAL_SECONDS",
                read_interval("KAN_VOD_SCAN_INTERVAL_SECONDS", 8 * 60 * 60),
            ),
        ),
        ScheduledJob(
            name="vod_recent",
            command=[python, "refresh_vod_recent.py"],
            interval_seconds=read_interval("VOD_RECENT_INTERVAL_SECONDS", 12 * 60 * 60),
        ),
        ScheduledJob(
            name="epg_vod_enrichment",
            command=[python, "enrich_epg_vod.py"],
            interval_seconds=read_interval("EPG_VOD_ENRICH_INTERVAL_SECONDS", 3 * 60 * 60),
        ),
    ]

    print(f"Scheduler cache directory: {CACHE_DIR}", flush=True)
    print("Scheduler started; running all jobs now.", flush=True)
    for job in jobs:
        if stop_requested:
            break
        run_job(job)

    while not stop_requested:
        now = time.time()
        due_jobs = [job for job in jobs if job.next_run <= now]

        if due_jobs:
            for job in due_jobs:
                if stop_requested:
                    break
                run_job(job)
            continue

        next_run = min(job.next_run for job in jobs)
        sleep_seconds = max(1, min(60, int(next_run - now)))
        time.sleep(sleep_seconds)

    print("Scheduler stopped.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
