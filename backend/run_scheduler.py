import os
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent


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

    job.next_run = time.time() + job.interval_seconds


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
            name="vod_recent",
            command=[python, "refresh_vod_recent.py"],
            interval_seconds=read_interval("VOD_RECENT_INTERVAL_SECONDS", 12 * 60 * 60),
        ),
    ]

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
