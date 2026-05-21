import json
import os
from datetime import datetime, timedelta, time
from pathlib import Path
from zoneinfo import ZoneInfo


def dedupe_and_sort_programs(programs: list[dict]) -> list[dict]:
    deduped = {}
    for program in programs:
        key = (program["start"], program["end"], program["name"])
        deduped[key] = program
    return sorted(deduped.values(), key=lambda program: (program["start"], program["end"], program["name"]))


def fill_short_gaps(programs: list[dict], max_gap_seconds: int = 2 * 60 * 60) -> list[dict]:
    if not programs:
        return programs

    filled_programs = [dict(program) for program in programs]
    for index in range(len(filled_programs) - 1):
        current_program = filled_programs[index]
        next_program = filled_programs[index + 1]
        gap = next_program["start"] - current_program["end"]
        if 0 < gap <= max_gap_seconds:
            current_program["end"] = next_program["start"]

    return filled_programs


def write_json(data, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = output_path.with_name(f".{output_path.name}.tmp")
    with tmp_path.open("w", encoding="utf-8") as output_file:
        json.dump(data, output_file, ensure_ascii=False, indent=2)
        output_file.write("\n")
    os.replace(tmp_path, output_path)



APP_TZ = ZoneInfo("America/New_York")


def app_now() -> datetime:
    return datetime.now(APP_TZ)


def app_day_start(now: datetime | None = None) -> datetime:
    now = now or app_now()
    now = now.astimezone(APP_TZ)
    return datetime.combine(now.date(), time.min, tzinfo=APP_TZ)


def merge_existing_with_new_programs(
    existing_programs: list[dict],
    new_programs: list[dict],
    keep_previous_days: int = 2,
    now: datetime | None = None,
) -> list[dict]:
    """
    Merge newly parsed programs with the existing channel cache.

    Why:
    Some sources may start their refreshed data from tomorrow or from a later
    point in the current day. To avoid deleting still-relevant programs from
    the current Boston day, keep recent old programs until the new data starts.

    Rules:
    - Keep old programs from the last `keep_previous_days` Boston days.
    - Also keep only old programs that start before the first new program.
    - Add all new programs.
    - De-duplicate and sort by start/end/name.
    """
    existing_programs = existing_programs or []
    new_programs = new_programs or []

    if not existing_programs:
        return dedupe_and_sort_programs(new_programs)

    if not new_programs:
        return dedupe_and_sort_programs(existing_programs)

    cutoff_dt = app_day_start(now) - timedelta(days=keep_previous_days)
    cutoff_ts = int(cutoff_dt.timestamp())
    first_new_start = min(program["start"] for program in new_programs if "start" in program)

    preserved_existing = [
        program
        for program in existing_programs
        if program.get("start", 0) >= cutoff_ts and program.get("start", 0) < first_new_start
    ]

    return dedupe_and_sort_programs(preserved_existing + new_programs)
