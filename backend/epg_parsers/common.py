import json
import os
import re
from datetime import datetime, timedelta, time
from pathlib import Path
from zoneinfo import ZoneInfo


MIN_PROGRAM_SECONDS = 60


def dedupe_and_sort_programs(programs: list[dict]) -> list[dict]:
    deduped = {}
    for program in programs:
        key = (program["start"], program["end"], program["name"])
        deduped[key] = program
    return resolve_overlapping_programs(list(deduped.values()))


def resolve_overlapping_programs(programs: list[dict]) -> list[dict]:
    """
    Keep a channel schedule linear when refreshed EPG data shifts times.

    Callers pass older programs first and newer programs last. If two programs
    overlap, the later item wins because it came from the newer schedule import.
    """
    accepted: list[dict] = []

    for program in programs:
        start = program["start"]
        end = program["end"]
        next_accepted: list[dict] = []
        for existing in accepted:
            if existing["end"] <= start or existing["start"] >= end:
                next_accepted.append(existing)
                continue

            if program_names_match(existing.get("name", ""), program.get("name", "")):
                continue

            if existing["start"] < start and end < existing["end"]:
                before = dict(existing)
                before["end"] = start
                if before["end"] - before["start"] >= MIN_PROGRAM_SECONDS:
                    next_accepted.append(before)

                after = dict(existing)
                after["start"] = end
                if after["end"] - after["start"] >= MIN_PROGRAM_SECONDS:
                    next_accepted.append(after)
                continue

            if existing["start"] < start < existing["end"]:
                trimmed = dict(existing)
                trimmed["end"] = start
                if trimmed["end"] - trimmed["start"] >= MIN_PROGRAM_SECONDS:
                    next_accepted.append(trimmed)
                continue

            if existing["start"] < end < existing["end"]:
                trimmed = dict(existing)
                trimmed["start"] = end
                if trimmed["end"] - trimmed["start"] >= MIN_PROGRAM_SECONDS:
                    next_accepted.append(trimmed)
                continue

        accepted = next_accepted
        accepted.append(program)

    return sorted(accepted, key=lambda program: (program["start"], program["end"], program["name"]))


def program_names_match(first: str, second: str) -> bool:
    first_norm = _normalize_program_name(first)
    second_norm = _normalize_program_name(second)
    if not first_norm or not second_norm:
        return False
    if first_norm == second_norm:
        return True
    if len(first_norm) >= 8 and first_norm in second_norm:
        return True
    if len(second_norm) >= 8 and second_norm in first_norm:
        return True

    first_tokens = set(first_norm.split())
    second_tokens = set(second_norm.split())
    if not first_tokens or not second_tokens:
        return False

    overlap = len(first_tokens & second_tokens)
    return overlap >= 2 and overlap / min(len(first_tokens), len(second_tokens)) >= 0.6


def _normalize_program_name(name: str) -> str:
    normalized = re.sub(r"\s+", " ", str(name or "")).strip().casefold()
    normalized = normalized.replace("...", " ")
    normalized = re.sub(r"[\"'`.,:;!?()\[\]{}|/\\_-]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


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
