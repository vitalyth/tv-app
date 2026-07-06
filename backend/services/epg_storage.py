import json
import sqlite3
import time
from pathlib import Path
from typing import Any

from config import CACHE_DIR
from epg_parsers.common import dedupe_and_sort_programs


DEFAULT_EPG_DB_PATH = CACHE_DIR / "epg.sqlite"


def get_epg_db_path(db_path: Path | str | None = None) -> Path:
    return Path(db_path) if db_path else DEFAULT_EPG_DB_PATH


def init_epg_db(db_path: Path | str | None = None) -> Path:
    path = get_epg_db_path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(path) as con:
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("PRAGMA synchronous=NORMAL")
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS epg_programs (
                channel_id TEXT NOT NULL,
                start INTEGER NOT NULL,
                end INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                image TEXT NOT NULL DEFAULT '',
                data TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (channel_id, start, end, name)
            )
            """
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_epg_programs_channel_time "
            "ON epg_programs(channel_id, start, end)"
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_epg_programs_time "
            "ON epg_programs(start, end)"
        )

    return path


def _normalize_program(program: dict[str, Any]) -> dict[str, Any] | None:
    try:
        start = int(program["start"])
        end = int(program["end"])
    except (KeyError, TypeError, ValueError):
        return None

    name = str(program.get("name") or "").strip()
    if not name or end <= start:
        return None

    normalized = dict(program)
    normalized["start"] = start
    normalized["end"] = end
    normalized["name"] = name
    normalized["description"] = str(normalized.get("description") or "")

    image = normalized.get("image")
    normalized["image"] = image.strip() if isinstance(image, str) else ""

    return normalized


def _row_to_program(row: sqlite3.Row) -> dict[str, Any]:
    data = json.loads(row["data"])
    data["start"] = int(row["start"])
    data["end"] = int(row["end"])
    data["name"] = row["name"]
    data["description"] = row["description"]
    if row["image"]:
        data["image"] = row["image"]
    elif "image" in data:
        data.pop("image", None)
    return data


def replace_channel_programs(
    channel_id: str,
    programs: list[dict[str, Any]],
    db_path: Path | str | None = None,
) -> list[dict[str, Any]]:
    path = init_epg_db(db_path)
    normalized_programs = dedupe_and_sort_programs(
        [program for program in (_normalize_program(program) for program in programs) if program]
    )
    updated_at = int(time.time())

    with sqlite3.connect(path) as con:
        con.execute("DELETE FROM epg_programs WHERE channel_id = ?", (channel_id,))
        con.executemany(
            """
            INSERT OR REPLACE INTO epg_programs
                (channel_id, start, end, name, description, image, data, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    channel_id,
                    program["start"],
                    program["end"],
                    program["name"],
                    program.get("description", ""),
                    program.get("image", ""),
                    json.dumps(program, ensure_ascii=False, separators=(",", ":")),
                    updated_at,
                )
                for program in normalized_programs
            ],
        )

    return normalized_programs


def replace_all_epg(
    epg: dict[str, list[dict[str, Any]]],
    db_path: Path | str | None = None,
) -> dict[str, list[dict[str, Any]]]:
    path = init_epg_db(db_path)
    updated_at = int(time.time())
    normalized_epg = {
        str(channel_id): dedupe_and_sort_programs(
            [program for program in (_normalize_program(program) for program in programs or []) if program]
        )
        for channel_id, programs in epg.items()
    }

    with sqlite3.connect(path) as con:
        con.execute("DELETE FROM epg_programs")
        rows = []
        for channel_id, programs in normalized_epg.items():
            rows.extend(
                (
                    channel_id,
                    program["start"],
                    program["end"],
                    program["name"],
                    program.get("description", ""),
                    program.get("image", ""),
                    json.dumps(program, ensure_ascii=False, separators=(",", ":")),
                    updated_at,
                )
                for program in programs
            )
        con.executemany(
            """
            INSERT OR REPLACE INTO epg_programs
                (channel_id, start, end, name, description, image, data, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )

    return normalized_epg


def load_channel_programs(
    channel_id: str,
    db_path: Path | str | None = None,
    start: int | None = None,
    end: int | None = None,
    query: str | None = None,
) -> list[dict[str, Any]]:
    path = get_epg_db_path(db_path)
    if not path.exists():
        return []

    clauses = ["channel_id = ?"]
    params: list[Any] = [channel_id]
    if start is not None:
        clauses.append("end > ?")
        params.append(int(start))
    if end is not None:
        clauses.append("start < ?")
        params.append(int(end))
    search_query = (query or "").strip().lower()
    if search_query:
        clauses.append("(LOWER(name) LIKE ? ESCAPE '\\' OR LOWER(description) LIKE ? ESCAPE '\\')")
        like_query = f"%{_escape_like(search_query)}%"
        params.extend([like_query, like_query])

    with sqlite3.connect(path) as con:
        con.row_factory = sqlite3.Row
        rows = con.execute(
            f"""
            SELECT start, end, name, description, image, data
            FROM epg_programs
            WHERE {' AND '.join(clauses)}
            ORDER BY start, end, name
            """,
            params,
        ).fetchall()

    return [_row_to_program(row) for row in rows]


def load_all_epg(
    db_path: Path | str | None = None,
    start: int | None = None,
    end: int | None = None,
    query: str | None = None,
) -> dict[str, list[dict[str, Any]]]:
    path = get_epg_db_path(db_path)
    if not path.exists():
        return {}

    clauses = []
    params: list[Any] = []
    if start is not None:
        clauses.append("end > ?")
        params.append(int(start))
    if end is not None:
        clauses.append("start < ?")
        params.append(int(end))
    search_query = (query or "").strip().lower()
    if search_query:
        clauses.append("(LOWER(name) LIKE ? ESCAPE '\\' OR LOWER(description) LIKE ? ESCAPE '\\')")
        like_query = f"%{_escape_like(search_query)}%"
        params.extend([like_query, like_query])

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    with sqlite3.connect(path) as con:
        con.row_factory = sqlite3.Row
        rows = con.execute(
            f"""
            SELECT channel_id, start, end, name, description, image, data
            FROM epg_programs
            {where}
            ORDER BY channel_id, start, end, name
            """,
            params,
        ).fetchall()

    epg: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        epg.setdefault(row["channel_id"], []).append(_row_to_program(row))
    return epg


def _escape_like(value: str) -> str:
    return (
        value
        .replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
    )


def epg_db_mtime(db_path: Path | str | None = None) -> float:
    path = get_epg_db_path(db_path)
    if not path.exists():
        return 0
    return path.stat().st_mtime
