import os
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

from config import CACHE_DIR
from services.vod_database import get_vod_db_path, prepare_vod_db_path

BASE_DIR = Path(__file__).resolve().parent
VOD_DB_PATH = get_vod_db_path()
VOD_SCAN_LIMIT_PROGRAMS = os.getenv("VOD_SCAN_LIMIT_PROGRAMS", "0").strip() or "0"
KAN_VOD_SCAN_LIMIT_PROGRAMS = (
    os.getenv("KAN_VOD_SCAN_LIMIT_PROGRAMS", "").strip() or VOD_SCAN_LIMIT_PROGRAMS
)
KESHET_VOD_SCAN_LIMIT_PROGRAMS = (
    os.getenv("KESHET_VOD_SCAN_LIMIT_PROGRAMS", "").strip() or VOD_SCAN_LIMIT_PROGRAMS
)
RESHET_VOD_SCAN_LIMIT_PROGRAMS = (
    os.getenv("RESHET_VOD_SCAN_LIMIT_PROGRAMS", "").strip() or VOD_SCAN_LIMIT_PROGRAMS
)
C14_VOD_SCAN_LIMIT_PROGRAMS = (
    os.getenv("C14_VOD_SCAN_LIMIT_PROGRAMS", "").strip() or VOD_SCAN_LIMIT_PROGRAMS
)
I24_VOD_SCAN_LIMIT_PROGRAMS = (
    os.getenv("I24_VOD_SCAN_LIMIT_PROGRAMS", "").strip() or VOD_SCAN_LIMIT_PROGRAMS
)
VOD_METADATA_BACKFILL_LIMIT = os.getenv("VOD_METADATA_BACKFILL_LIMIT", "80")


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


def read_interval_any(env_names: tuple[str, ...], default_seconds: int) -> int:
    for env_name in env_names:
        raw_value = os.getenv(env_name, "").strip()
        if not raw_value:
            continue

        try:
            interval = int(raw_value)
        except ValueError:
            print(f"Invalid {env_name}={raw_value!r}; using {default_seconds}s", flush=True)
            return default_seconds

        return max(interval, 60)

    return default_seconds


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

    db_path = BASE_DIR / VOD_DB_PATH if not os.path.isabs(VOD_DB_PATH) else Path(VOD_DB_PATH)
    db_path = Path(prepare_vod_db_path(str(db_path)))
    if db_path.exists():
        stat = db_path.stat()
        updated_at = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime))
        print(f"VOD DB {db_path} updated {updated_at}, {stat.st_size} bytes", flush=True)


def main() -> int:
    stop_requested = False

    def request_stop(signum, frame):
        nonlocal stop_requested
        stop_requested = True
        print(f"Received signal {signum}; stopping scheduler...", flush=True)

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)

    python = sys.executable
    vod_scan_interval_seconds = read_interval_any(
        ("VOD_SCAN_INTERVAL_SECONDS", "KAN_VOD_SCAN_INTERVAL_SECONDS"),
        8 * 60 * 60,
    )
    jobs = [
        ScheduledJob(
            name="vod_db_maintenance",
            command=[
                python,
                "scripts/vod_db_scanner.py",
                "maintenance",
                "--provider",
                "all",
                "--db",
                VOD_DB_PATH,
                "--limit-episodes",
                VOD_METADATA_BACKFILL_LIMIT,
                "--verbose",
            ],
            interval_seconds=read_interval("VOD_DB_MAINTENANCE_INTERVAL_SECONDS", 24 * 60 * 60),
        ),
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
                VOD_DB_PATH,
                "--limit-programs",
                KAN_VOD_SCAN_LIMIT_PROGRAMS,
                "--incremental",
                "--verbose",
            ],
            interval_seconds=vod_scan_interval_seconds,
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
                VOD_DB_PATH,
                "--limit-programs",
                KESHET_VOD_SCAN_LIMIT_PROGRAMS,
                "--incremental",
                "--verbose",
            ],
            interval_seconds=read_interval(
                "KESHET_VOD_SCAN_INTERVAL_SECONDS",
                vod_scan_interval_seconds,
            ),
        ),
        ScheduledJob(
            name="reshet_vod_scan",
            command=[
                python,
                "scripts/vod_db_scanner.py",
                "scan",
                "--provider",
                "reshet",
                "--db",
                VOD_DB_PATH,
                "--limit-programs",
                RESHET_VOD_SCAN_LIMIT_PROGRAMS,
                "--incremental",
                "--verbose",
            ],
            interval_seconds=read_interval(
                "RESHET_VOD_SCAN_INTERVAL_SECONDS",
                vod_scan_interval_seconds,
            ),
        ),
        ScheduledJob(
            name="c14_vod_scan",
            command=[
                python,
                "scripts/vod_db_scanner.py",
                "scan",
                "--provider",
                "c14",
                "--db",
                VOD_DB_PATH,
                "--limit-programs",
                C14_VOD_SCAN_LIMIT_PROGRAMS,
                "--incremental",
                "--verbose",
            ],
            interval_seconds=read_interval(
                "C14_VOD_SCAN_INTERVAL_SECONDS",
                vod_scan_interval_seconds,
            ),
        ),
        ScheduledJob(
            name="i24_vod_scan",
            command=[
                python,
                "scripts/vod_db_scanner.py",
                "scan",
                "--provider",
                "i24",
                "--db",
                VOD_DB_PATH,
                "--limit-programs",
                I24_VOD_SCAN_LIMIT_PROGRAMS,
                "--incremental",
                "--verbose",
            ],
            interval_seconds=read_interval(
                "I24_VOD_SCAN_INTERVAL_SECONDS",
                vod_scan_interval_seconds,
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
