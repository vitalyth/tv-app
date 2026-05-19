import json
import os
from pathlib import Path


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
