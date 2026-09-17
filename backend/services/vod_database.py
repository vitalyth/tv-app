from __future__ import annotations

import os
import shutil
import sqlite3
import threading
import time
from typing import Any, Callable


DEFAULT_VOD_DB_PATH = "db/vod.db"
LEGACY_KAN_VOD_DB_PATH = "db/kan_vod.db"
UNIFIED_SCHEMA_VERSION = "3"
VOD_DB_BUSY_TIMEOUT_MS = 30_000
_ENSURED_SCHEMA_KEYS: set[tuple[str, tuple[str, ...], str]] = set()
_PROVIDER_SCHEMA_LOCK = threading.Lock()
_INITIALIZED_PROVIDER_SCHEMAS: set[tuple[str, str]] = set()


def connect_vod_db(db_path: str) -> sqlite3.Connection:
    """Open the shared VOD database with concurrency-safe settings."""
    db_path = prepare_vod_db_path(db_path)
    parent = os.path.dirname(db_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    con = sqlite3.connect(db_path, timeout=VOD_DB_BUSY_TIMEOUT_MS / 1000)
    con.row_factory = sqlite3.Row
    try:
        con.execute(f"PRAGMA busy_timeout = {VOD_DB_BUSY_TIMEOUT_MS}")
        journal_mode = str(con.execute("PRAGMA journal_mode = WAL").fetchone()[0]).lower()
        if journal_mode == "wal":
            con.execute("PRAGMA synchronous = NORMAL")
            con.execute("PRAGMA wal_autocheckpoint = 1000")
        return con
    except Exception:
        con.close()
        raise


def ensure_vod_provider_schema(
    db_path: str,
    provider: str,
    initializer: Callable[[], None],
) -> None:
    """Run provider schema setup once per database and process."""
    key = (os.path.realpath(db_path), provider)
    if key in _INITIALIZED_PROVIDER_SCHEMAS:
        return

    with _PROVIDER_SCHEMA_LOCK:
        if key in _INITIALIZED_PROVIDER_SCHEMAS:
            return
        initializer()
        _INITIALIZED_PROVIDER_SCHEMAS.add(key)


def get_vod_db_path(*provider_env_names: str) -> str:
    """Resolve the shared VOD DB path while keeping old env names compatible."""
    for name in provider_env_names:
        value = os.getenv(name)
        if value:
            return value

    return (
        os.getenv("VOD_DB_PATH")
        or os.getenv("KAN_VOD_DB_PATH")
        or DEFAULT_VOD_DB_PATH
    )


def get_vod_env(*env_names: str, default: str) -> str:
    """Resolve a VOD setting with generic names before legacy names."""
    for name in env_names:
        value = os.getenv(name)
        if value is not None and value != "":
            return value
    return default


def parse_vod_sqlite_timestamp(value: Any) -> float | None:
    text = str(value or "").strip()
    if not text:
        return None

    normalized = text.replace("T", " ")[:19]
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return time.mktime(time.strptime(normalized, fmt))
        except ValueError:
            continue

    return None


def vod_episode_activity_subquery(provider: str) -> str:
    """Return the shared latest-episode sort source used by provider series APIs."""
    provider_sql = _literal(provider)
    return f"""
        SELECT
            program_id,
            MAX(created_at) AS latest_episode_added_at,
            MAX(
                CASE
                    WHEN TRIM(COALESCE(id, '')) != ''
                     AND id NOT GLOB '*[^0-9]*'
                    THEN CAST(id AS INTEGER)
                    WHEN TRIM(COALESCE(source_id, '')) != ''
                     AND source_id NOT GLOB '*[^0-9]*'
                    THEN CAST(source_id AS INTEGER)
                    ELSE NULL
                END
            ) AS latest_episode_source_sort_key,
            MAX(
                COALESCE(
                    NULLIF(published_timestamp, 0),
                    CAST(strftime('%s', created_at) AS REAL),
                    0
                )
            ) AS latest_episode_date_sort_key
        FROM vod_episodes
        WHERE provider = {provider_sql}
        GROUP BY program_id
    """


def vod_episode_source_sort_key_expr(
    columns: set[str],
    table_alias: str = "e",
) -> str:
    """Rank episodes by provider numeric id when present, otherwise by episode date."""
    expressions = []
    if "id" in columns:
        expressions.append(_numeric_text_expr(f"{table_alias}.id"))
    if "source_id" in columns:
        expressions.append(_numeric_text_expr(f"{table_alias}.source_id"))
    if "published_timestamp" in columns:
        expressions.append(f"NULLIF({table_alias}.published_timestamp, 0)")
    if "created_at" in columns:
        expressions.append(f"CAST(strftime('%s', {table_alias}.created_at) AS REAL)")
    if "updated_at" in columns:
        expressions.append(f"CAST(strftime('%s', {table_alias}.updated_at) AS REAL)")
    expressions.append("0")
    return f"COALESCE({', '.join(expressions)})"


def vod_episode_source_sort_kind_expr(
    columns: set[str],
    table_alias: str = "e",
) -> str:
    numeric_conditions = []
    if "id" in columns:
        numeric_conditions.append(_numeric_text_condition(f"{table_alias}.id"))
    if "source_id" in columns:
        numeric_conditions.append(_numeric_text_condition(f"{table_alias}.source_id"))

    date_conditions = []
    if "published_timestamp" in columns:
        date_conditions.append(f"NULLIF({table_alias}.published_timestamp, 0) IS NOT NULL")
    if "created_at" in columns:
        date_conditions.append(f"TRIM(COALESCE({table_alias}.created_at, '')) != ''")
    if "updated_at" in columns:
        date_conditions.append(f"TRIM(COALESCE({table_alias}.updated_at, '')) != ''")

    numeric_sql = " OR ".join(numeric_conditions) or "0"
    date_sql = " OR ".join(date_conditions) or "0"
    return f"""
        CASE
            WHEN {numeric_sql} THEN 'id'
            WHEN {date_sql} THEN 'date'
            ELSE ''
        END
    """


def select_vod_programs_for_detail_scan(
    con: sqlite3.Connection,
    programs: list[Any],
    *,
    program_table: str,
    episode_table: str,
    program_id_getter: Callable[[Any], Any],
    incremental: bool,
    limit_programs: int | None,
    full_scan_interval_hours: int,
    with_streams: bool = False,
) -> tuple[list[Any], dict[str, Any]]:
    """Choose provider programs for detail scans with one policy for all VOD providers."""
    entries = [
        (str(program_id_getter(program) or "").strip(), program)
        for program in programs
    ]
    entries = [(program_id, program) for program_id, program in entries if program_id]
    limit = max(0, int(limit_programs or 0))
    summary: dict[str, Any] = {
        "mode": "incremental" if incremental else "full",
        "totalPrograms": len(entries),
        "limitPrograms": limit,
        "selectedPrograms": 0,
        "skippedPrograms": 0,
        "reasons": {},
    }

    if not entries:
        return [], summary

    if not incremental:
        selected = [program for _, program in entries[:limit or None]]
        summary["selectedPrograms"] = len(selected)
        summary["skippedPrograms"] = len(entries) - len(selected)
        summary["reasons"] = {"full": len(selected)}
        return selected, summary

    stats = _vod_program_scan_stats(
        con,
        program_table=program_table,
        episode_table=episode_table,
        with_streams=with_streams,
    )

    candidates: list[tuple[str, Any, str, int, float, int]] = []
    candidate_reasons: dict[str, int] = {}
    for catalog_index, (program_id, program) in enumerate(entries):
        stat = stats.get(program_id, {})
        reason = _vod_program_scan_reason(
            stat,
            full_scan_interval_hours=full_scan_interval_hours,
            with_streams=with_streams,
        )
        if not reason:
            continue
        last_scan = parse_vod_sqlite_timestamp(
            stat.get("last_incremental_scan_at") or stat.get("last_full_scan_at")
        ) or 0
        candidates.append(
            (
                program_id,
                program,
                reason,
                int(stat.get("row_id") or 0),
                last_scan,
                catalog_index,
            )
        )
        candidate_reasons[reason] = candidate_reasons.get(reason, 0) + 1

    reason_priority = {
        "new-program": 0,
        "never-scanned": 1,
        "scheduled-full": 2,
        "missing-streams": 3,
        "missing-episodes": 4,
    }
    candidates.sort(
        key=lambda item: (
            reason_priority.get(item[2], 99),
            -item[3] if item[2] == "new-program" else item[4],
            item[5],
        )
    )
    selected_candidates = candidates[:limit or None]
    selected_reasons: dict[str, int] = {}
    for _, _, reason, _, _, _ in selected_candidates:
        selected_reasons[reason] = selected_reasons.get(reason, 0) + 1

    selected = [program for _, program, _, _, _, _ in selected_candidates]
    summary["candidatePrograms"] = len(candidates)
    summary["selectedPrograms"] = len(selected)
    summary["skippedPrograms"] = len(entries) - len(selected)
    summary["reasons"] = selected_reasons
    if len(candidates) != len(selected_candidates):
        summary["candidateReasons"] = candidate_reasons
    return selected, summary


def mark_vod_program_detail_scan(
    con: sqlite3.Connection,
    program_table: str,
    program_id: str,
) -> None:
    columns = _table_columns(con, program_table)
    assignments = []
    if "last_full_scan_at" in columns:
        assignments.append("last_full_scan_at = CURRENT_TIMESTAMP")
    if "last_incremental_scan_at" in columns:
        assignments.append("last_incremental_scan_at = CURRENT_TIMESTAMP")
    if "updated_at" in columns:
        assignments.append("updated_at = CURRENT_TIMESTAMP")
    if not assignments:
        return

    con.execute(
        f"UPDATE {_sql_identifier(program_table)} SET {', '.join(assignments)} WHERE id = ?",
        (program_id,),
    )


def prepare_vod_db_path(db_path: str) -> str:
    """Create the DB directory and copy the legacy DB name to vod.db once."""
    parent = os.path.dirname(db_path)
    if parent:
        os.makedirs(parent, exist_ok=True)

    if os.path.exists(db_path):
        return db_path

    for legacy_path in _legacy_db_candidates(db_path):
        if legacy_path != db_path and os.path.exists(legacy_path):
            shutil.copy2(legacy_path, db_path)
            break

    return db_path


PROVIDER_TABLES: dict[str, dict[str, str]] = {
    "kan": {
        "programs": "programs",
        "seasons": "seasons",
        "episodes": "episodes",
    },
    "keshet": {
        "programs": "keshet_programs",
        "seasons": "keshet_seasons",
        "episodes": "keshet_episodes",
    },
    "reshet": {
        "programs": "reshet_programs",
        "seasons": "reshet_seasons",
        "episodes": "reshet_episodes",
    },
    "c14": {
        "programs": "c14_programs",
        "seasons": "c14_seasons",
        "episodes": "c14_episodes",
    },
    "i24": {
        "programs": "i24_programs",
        "seasons": "i24_seasons",
        "episodes": "i24_episodes",
    },
}

PROGRAM_COLUMNS = (
    "provider",
    "id",
    "mainid",
    "source_id",
    "locale",
    "title",
    "description",
    "url",
    "image",
    "program_format",
    "program_genre",
    "latest_episode_published",
    "latest_episode_timestamp",
    "latest_item_published",
    "latest_item_timestamp",
    "last_full_scan_at",
    "last_incremental_scan_at",
    "updated_at",
)

SEASON_COLUMNS = (
    "provider",
    "season_id",
    "program_id",
    "title",
    "url",
    "season_number",
    "latest_episode_published",
    "latest_episode_timestamp",
    "last_scanned_at",
    "updated_at",
)

EPISODE_COLUMNS = (
    "provider",
    "id",
    "source_id",
    "program_id",
    "season_id",
    "title",
    "description",
    "url",
    "image",
    "play_url",
    "stream_url",
    "kaltura_entry_id",
    "published",
    "published_timestamp",
    "display_order",
    "source_type",
    "created_at",
    "updated_at",
)


def ensure_unified_schema(
    con: sqlite3.Connection,
    providers: tuple[str, ...] | None = None,
) -> None:
    """Create and keep canonical VOD tables in sync with provider tables."""
    selected = providers or tuple(PROVIDER_TABLES.keys())
    cache_key = _schema_cache_key(con, selected)
    if cache_key in _ENSURED_SCHEMA_KEYS:
        return

    _rebuild_unified_tables_if_needed(con)
    _create_unified_tables(con)
    for provider in selected:
        tables = PROVIDER_TABLES[provider]
        _sync_programs(con, provider, tables["programs"])
        _sync_seasons(con, provider, tables["seasons"])
        _sync_episodes(con, provider, tables["episodes"])
    _set_unified_schema_version(con)
    _ENSURED_SCHEMA_KEYS.add(cache_key)


def _schema_cache_key(
    con: sqlite3.Connection,
    providers: tuple[str, ...],
) -> tuple[str, tuple[str, ...], str]:
    rows = con.execute("PRAGMA database_list").fetchall()
    main_path = ""
    for row in rows:
        if row[1] == "main":
            main_path = str(row[2] or "")
            break

    if main_path:
        db_key = os.path.realpath(main_path)
    else:
        db_key = f":memory:{id(con)}"

    return db_key, tuple(sorted(providers)), UNIFIED_SCHEMA_VERSION


def _create_unified_tables(con: sqlite3.Connection) -> None:
    con.executescript(
        """
        CREATE TABLE IF NOT EXISTS vod_schema_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS vod_programs (
            provider TEXT NOT NULL,
            id TEXT NOT NULL,
            mainid TEXT,
            source_id TEXT,
            locale TEXT,
            title TEXT NOT NULL,
            description TEXT,
            url TEXT,
            image TEXT,
            program_format TEXT,
            program_genre TEXT,
            latest_episode_published TEXT,
            latest_episode_timestamp REAL,
            latest_item_published TEXT,
            latest_item_timestamp REAL,
            last_full_scan_at TEXT,
            last_incremental_scan_at TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (provider, id)
        );

        CREATE TABLE IF NOT EXISTS vod_seasons (
            provider TEXT NOT NULL,
            season_id TEXT NOT NULL,
            program_id TEXT NOT NULL,
            title TEXT,
            url TEXT,
            season_number INTEGER,
            latest_episode_published TEXT,
            latest_episode_timestamp REAL,
            last_scanned_at TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (provider, season_id)
        );

        CREATE TABLE IF NOT EXISTS vod_episodes (
            provider TEXT NOT NULL,
            id TEXT NOT NULL,
            source_id TEXT,
            program_id TEXT NOT NULL,
            season_id TEXT,
            title TEXT NOT NULL,
            description TEXT,
            url TEXT,
            image TEXT,
            play_url TEXT,
            stream_url TEXT,
            kaltura_entry_id TEXT,
            published TEXT,
            published_timestamp REAL,
            display_order INTEGER,
            source_type TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (provider, id)
        );

        CREATE INDEX IF NOT EXISTS idx_vod_programs_provider_title
            ON vod_programs(provider, title);
        CREATE INDEX IF NOT EXISTS idx_vod_programs_provider_genre
            ON vod_programs(provider, program_genre);
        CREATE INDEX IF NOT EXISTS idx_vod_seasons_provider_program
            ON vod_seasons(provider, program_id);
        CREATE INDEX IF NOT EXISTS idx_vod_episodes_provider_program
            ON vod_episodes(provider, program_id);
        CREATE INDEX IF NOT EXISTS idx_vod_episodes_provider_program_created
            ON vod_episodes(provider, program_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_vod_episodes_provider_season
            ON vod_episodes(provider, season_id);
        CREATE INDEX IF NOT EXISTS idx_vod_episodes_provider_created
            ON vod_episodes(provider, created_at);
        CREATE INDEX IF NOT EXISTS idx_vod_episodes_provider_published
            ON vod_episodes(provider, published_timestamp);
        """
    )


def _rebuild_unified_tables_if_needed(con: sqlite3.Connection) -> None:
    if _get_unified_schema_version(con) == UNIFIED_SCHEMA_VERSION:
        return

    if not any(_has_table(con, table) for table in ("vod_programs", "vod_seasons", "vod_episodes")):
        return

    _drop_sync_triggers(con)
    con.executescript(
        """
        DROP TABLE IF EXISTS vod_episodes;
        DROP TABLE IF EXISTS vod_seasons;
        DROP TABLE IF EXISTS vod_programs;
        """
    )


def _get_unified_schema_version(con: sqlite3.Connection) -> str | None:
    if not _has_table(con, "vod_schema_meta"):
        return None

    row = con.execute(
        "SELECT value FROM vod_schema_meta WHERE key = 'unified_schema_version'"
    ).fetchone()
    return str(row[0]) if row else None


def _set_unified_schema_version(con: sqlite3.Connection) -> None:
    con.execute(
        """
        INSERT INTO vod_schema_meta (key, value)
        VALUES ('unified_schema_version', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (UNIFIED_SCHEMA_VERSION,),
    )


def _drop_sync_triggers(con: sqlite3.Connection) -> None:
    trigger_names = [
        row[0]
        for row in con.execute(
            """
            SELECT name
            FROM sqlite_master
            WHERE type = 'trigger'
              AND name LIKE 'sync_%_vod_%'
            """
        ).fetchall()
    ]
    for trigger_name in trigger_names:
        con.execute(f"DROP TRIGGER IF EXISTS {trigger_name}")


def _sync_programs(con: sqlite3.Connection, provider: str, table: str) -> None:
    if not _has_table(con, table):
        return
    columns = _table_columns(con, table)
    _create_program_triggers(con, provider, table, columns)
    if not _needs_table_sync(con, provider, table, "vod_programs"):
        return
    select_values = [
        _literal(provider),
        _select_expr(columns, "id", "''"),
        _select_expr(columns, "mainid"),
        _select_expr(columns, "source_id"),
        _select_expr(columns, "locale"),
        _select_expr(columns, "title", "''"),
        _select_expr(columns, "description"),
        _select_expr(columns, "url"),
        _select_expr(columns, "image"),
        _select_expr(columns, "program_format"),
        _select_expr(columns, "program_genre"),
        _select_expr(columns, "latest_episode_published"),
        _select_expr(columns, "latest_episode_timestamp"),
        _select_expr(columns, "latest_item_published"),
        _select_expr(columns, "latest_item_timestamp"),
        _select_expr(columns, "last_full_scan_at"),
        _select_expr(columns, "last_incremental_scan_at"),
        _select_expr(columns, "updated_at", "CURRENT_TIMESTAMP"),
    ]
    update_assignments = _update_assignments(PROGRAM_COLUMNS, skip={"provider", "id"})
    con.execute(
        f"""
        INSERT INTO vod_programs ({", ".join(PROGRAM_COLUMNS)})
        SELECT {", ".join(select_values)}
        FROM {table}
        WHERE TRIM(COALESCE(id, '')) != ''
        ON CONFLICT(provider, id) DO UPDATE SET
            {update_assignments}
        """
    )


def _sync_seasons(con: sqlite3.Connection, provider: str, table: str) -> None:
    if not _has_table(con, table):
        return
    columns = _table_columns(con, table)
    _create_season_triggers(con, provider, table, columns)
    if not _needs_table_sync(con, provider, table, "vod_seasons"):
        return
    select_values = [
        _literal(provider),
        _select_expr(columns, "season_id", "''"),
        _select_expr(columns, "program_id", "''"),
        _select_expr(columns, "title"),
        _select_expr(columns, "url"),
        _select_expr(columns, "season_number"),
        _select_expr(columns, "latest_episode_published"),
        _select_expr(columns, "latest_episode_timestamp"),
        _select_expr(columns, "last_scanned_at"),
        _select_expr(columns, "updated_at", "CURRENT_TIMESTAMP"),
    ]
    update_assignments = _update_assignments(SEASON_COLUMNS, skip={"provider", "season_id"})
    con.execute(
        f"""
        INSERT INTO vod_seasons ({", ".join(SEASON_COLUMNS)})
        SELECT {", ".join(select_values)}
        FROM {table}
        WHERE TRIM(COALESCE(season_id, '')) != ''
        ON CONFLICT(provider, season_id) DO UPDATE SET
            {update_assignments}
        """
    )


def _sync_episodes(con: sqlite3.Connection, provider: str, table: str) -> None:
    if not _has_table(con, table):
        return
    columns = _table_columns(con, table)
    _create_episode_triggers(con, provider, table, columns)
    _repair_episode_created_at(con, provider, table, columns)
    if not _needs_table_sync(con, provider, table, "vod_episodes"):
        return
    select_values = [
        _literal(provider),
        _select_expr(columns, "id", "''"),
        _select_expr(columns, "source_id"),
        _select_expr(columns, "program_id", "''"),
        _select_expr(columns, "season_id"),
        _select_expr(columns, "title", "''"),
        _select_expr(columns, "description"),
        _select_expr(columns, "url"),
        _select_expr(columns, "image"),
        _select_expr(columns, "play_url"),
        _select_expr(columns, "stream_url"),
        _select_expr(columns, "kaltura_entry_id"),
        _select_expr(columns, "published"),
        _select_expr(columns, "published_timestamp"),
        _select_expr(columns, "display_order"),
        _select_expr(columns, "source_type"),
        _coalesce_non_empty(
            _select_expr(columns, "updated_at"),
            _select_expr(columns, "created_at"),
            "CURRENT_TIMESTAMP",
        ),
        _coalesce_non_empty(_select_expr(columns, "updated_at"), "CURRENT_TIMESTAMP"),
    ]
    update_assignments = _update_assignments(
        EPISODE_COLUMNS,
        skip={"provider", "id"},
        preserve={"created_at"},
    )
    con.execute(
        f"""
        INSERT INTO vod_episodes ({", ".join(EPISODE_COLUMNS)})
        SELECT {", ".join(select_values)}
        FROM {table}
        WHERE TRIM(COALESCE(id, '')) != ''
        ON CONFLICT(provider, id) DO UPDATE SET
            {update_assignments}
        """
    )


def _create_program_triggers(
    con: sqlite3.Connection,
    provider: str,
    table: str,
    columns: set[str],
) -> None:
    values = [
        _literal(provider),
        _new_expr(columns, "id", "''"),
        _new_expr(columns, "mainid"),
        _new_expr(columns, "source_id"),
        _new_expr(columns, "locale"),
        _new_expr(columns, "title", "''"),
        _new_expr(columns, "description"),
        _new_expr(columns, "url"),
        _new_expr(columns, "image"),
        _new_expr(columns, "program_format"),
        _new_expr(columns, "program_genre"),
        _new_expr(columns, "latest_episode_published"),
        _new_expr(columns, "latest_episode_timestamp"),
        _new_expr(columns, "latest_item_published"),
        _new_expr(columns, "latest_item_timestamp"),
        _new_expr(columns, "last_full_scan_at"),
        _new_expr(columns, "last_incremental_scan_at"),
        _new_expr(columns, "updated_at", "CURRENT_TIMESTAMP"),
    ]
    upsert = _trigger_upsert("vod_programs", PROGRAM_COLUMNS, values, ("provider", "id"))
    for suffix, timing in (("ai", "AFTER INSERT"), ("au", "AFTER UPDATE")):
        _replace_trigger(con, f"sync_{table}_vod_programs_{suffix}", table, timing, upsert)
    _replace_trigger(
        con,
        f"sync_{table}_vod_programs_ad",
        table,
        "AFTER DELETE",
        f"""
        DELETE FROM vod_episodes WHERE provider = {_literal(provider)} AND program_id = OLD.id;
        DELETE FROM vod_seasons WHERE provider = {_literal(provider)} AND program_id = OLD.id;
        DELETE FROM vod_programs WHERE provider = {_literal(provider)} AND id = OLD.id;
        """,
    )


def _create_season_triggers(
    con: sqlite3.Connection,
    provider: str,
    table: str,
    columns: set[str],
) -> None:
    values = [
        _literal(provider),
        _new_expr(columns, "season_id", "''"),
        _new_expr(columns, "program_id", "''"),
        _new_expr(columns, "title"),
        _new_expr(columns, "url"),
        _new_expr(columns, "season_number"),
        _new_expr(columns, "latest_episode_published"),
        _new_expr(columns, "latest_episode_timestamp"),
        _new_expr(columns, "last_scanned_at"),
        _new_expr(columns, "updated_at", "CURRENT_TIMESTAMP"),
    ]
    upsert = _trigger_upsert("vod_seasons", SEASON_COLUMNS, values, ("provider", "season_id"))
    for suffix, timing in (("ai", "AFTER INSERT"), ("au", "AFTER UPDATE")):
        _replace_trigger(con, f"sync_{table}_vod_seasons_{suffix}", table, timing, upsert)
    _replace_trigger(
        con,
        f"sync_{table}_vod_seasons_ad",
        table,
        "AFTER DELETE",
        f"""
        UPDATE vod_episodes
        SET season_id = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE provider = {_literal(provider)} AND season_id = OLD.season_id;
        DELETE FROM vod_seasons WHERE provider = {_literal(provider)} AND season_id = OLD.season_id;
        """,
    )


def _create_episode_triggers(
    con: sqlite3.Connection,
    provider: str,
    table: str,
    columns: set[str],
) -> None:
    values = [
        _literal(provider),
        _new_expr(columns, "id", "''"),
        _new_expr(columns, "source_id"),
        _new_expr(columns, "program_id", "''"),
        _new_expr(columns, "season_id"),
        _new_expr(columns, "title", "''"),
        _new_expr(columns, "description"),
        _new_expr(columns, "url"),
        _new_expr(columns, "image"),
        _new_expr(columns, "play_url"),
        _new_expr(columns, "stream_url"),
        _new_expr(columns, "kaltura_entry_id"),
        _new_expr(columns, "published"),
        _new_expr(columns, "published_timestamp"),
        _new_expr(columns, "display_order"),
        _new_expr(columns, "source_type"),
        _coalesce_non_empty(
            _new_expr(columns, "updated_at"),
            _new_expr(columns, "created_at"),
            "CURRENT_TIMESTAMP",
        ),
        _coalesce_non_empty(_new_expr(columns, "updated_at"), "CURRENT_TIMESTAMP"),
    ]
    upsert = _trigger_upsert("vod_episodes", EPISODE_COLUMNS, values, ("provider", "id"), preserve={"created_at"})
    for suffix, timing in (("ai", "AFTER INSERT"), ("au", "AFTER UPDATE")):
        _replace_trigger(con, f"sync_{table}_vod_episodes_{suffix}", table, timing, upsert)
    _replace_trigger(
        con,
        f"sync_{table}_vod_episodes_ad",
        table,
        "AFTER DELETE",
        f"DELETE FROM vod_episodes WHERE provider = {_literal(provider)} AND id = OLD.id;",
    )


def _repair_episode_created_at(
    con: sqlite3.Connection,
    provider: str,
    table: str,
    columns: set[str],
) -> None:
    if "id" not in columns or not ({"created_at", "updated_at"} & columns):
        return

    source_created_at = _coalesce_non_empty(
        _qualified_expr(columns, "src", "updated_at"),
        _qualified_expr(columns, "src", "created_at"),
        "NULL",
    )
    con.execute(
        f"""
        UPDATE vod_episodes
        SET created_at = (
            SELECT {source_created_at}
            FROM {table} AS src
            WHERE src.id = vod_episodes.id
              AND TRIM(COALESCE(src.id, '')) != ''
            LIMIT 1
        )
        WHERE provider = ?
          AND (created_at IS NULL OR TRIM(created_at) = '')
          AND EXISTS (
              SELECT 1
              FROM {table} AS src
              WHERE src.id = vod_episodes.id
                AND TRIM(COALESCE(src.id, '')) != ''
                AND {source_created_at} IS NOT NULL
          )
        """,
        (provider,),
    )


def _trigger_upsert(
    target_table: str,
    columns: tuple[str, ...],
    values: list[str],
    conflict_columns: tuple[str, ...],
    preserve: set[str] | None = None,
) -> str:
    assignments = _update_assignments(columns, skip=set(conflict_columns), preserve=preserve or set(), table=target_table)
    return f"""
    INSERT INTO {target_table} ({", ".join(columns)})
    VALUES ({", ".join(values)})
    ON CONFLICT({", ".join(conflict_columns)}) DO UPDATE SET
        {assignments};
    """


def _replace_trigger(
    con: sqlite3.Connection,
    trigger_name: str,
    table: str,
    timing: str,
    body: str,
) -> None:
    con.execute(f"DROP TRIGGER IF EXISTS {trigger_name}")
    con.executescript(
        f"""
        CREATE TRIGGER {trigger_name}
        {timing} ON {table}
        BEGIN
            {body}
        END;
        """
    )


def _update_assignments(
    columns: tuple[str, ...],
    *,
    skip: set[str],
    preserve: set[str] | None = None,
    table: str | None = None,
) -> str:
    preserve = preserve or set()
    target = table or ""
    prefix = f"{target}." if target else ""
    assignments = []
    for column in columns:
        if column in skip:
            continue
        if column in preserve:
            assignments.append(
                f"{column} = COALESCE({_non_empty_text_expr(prefix + column)}, excluded.{column})"
            )
        else:
            assignments.append(f"{column} = excluded.{column}")
    return ",\n            ".join(assignments)


def _has_table(con: sqlite3.Connection, table: str) -> bool:
    row = con.execute(
        """
        SELECT 1
        FROM sqlite_master
        WHERE type = 'table' AND name = ?
        """,
        (table,),
    ).fetchone()
    return row is not None


def _vod_program_scan_stats(
    con: sqlite3.Connection,
    *,
    program_table: str,
    episode_table: str,
    with_streams: bool,
) -> dict[str, dict[str, Any]]:
    if not _has_table(con, program_table) or not _has_table(con, episode_table):
        return {}

    program_columns = _table_columns(con, program_table)
    episode_columns = _table_columns(con, episode_table)
    program_table_sql = _sql_identifier(program_table)
    episode_table_sql = _sql_identifier(episode_table)
    last_full_expr = "p.last_full_scan_at" if "last_full_scan_at" in program_columns else "NULL"
    last_incremental_expr = "p.last_incremental_scan_at" if "last_incremental_scan_at" in program_columns else "NULL"
    stream_count_expr = "0"
    if with_streams and "stream_url" in episode_columns:
        stream_count_expr = """
            COUNT(
                DISTINCT CASE
                    WHEN TRIM(COALESCE(e.stream_url, '')) != ''
                    THEN e.id
                END
            )
        """

    rows = con.execute(
        f"""
        SELECT
            p.id AS id,
            p.rowid AS row_id,
            {last_full_expr} AS last_full_scan_at,
            {last_incremental_expr} AS last_incremental_scan_at,
            COUNT(DISTINCT e.id) AS episode_count,
            {stream_count_expr} AS stream_count
        FROM {program_table_sql} p
        LEFT JOIN {episode_table_sql} e ON e.program_id = p.id
        GROUP BY p.id
        """
    ).fetchall()

    return {
        str(row["id"]): {
            "row_id": int(row["row_id"] or 0),
            "last_full_scan_at": row["last_full_scan_at"],
            "last_incremental_scan_at": row["last_incremental_scan_at"],
            "episode_count": int(row["episode_count"] or 0),
            "stream_count": int(row["stream_count"] or 0),
        }
        for row in rows
    }


def _vod_program_scan_reason(
    stat: dict[str, Any],
    *,
    full_scan_interval_hours: int,
    with_streams: bool,
) -> str | None:
    episode_count = int(stat.get("episode_count") or 0)
    stream_count = int(stat.get("stream_count") or 0)
    last_full_scan_at = stat.get("last_full_scan_at")
    last_incremental_scan_at = stat.get("last_incremental_scan_at")

    if episode_count <= 0:
        if not last_full_scan_at and not last_incremental_scan_at:
            return "new-program"
        return "missing-episodes"
    if with_streams and stream_count < episode_count:
        return "missing-streams"
    if not last_full_scan_at:
        return "never-scanned"
    if int(full_scan_interval_hours or 0) > 0:
        last_full_scan = parse_vod_sqlite_timestamp(last_full_scan_at)
        if last_full_scan is None:
            return "never-scanned"
        if time.time() - last_full_scan >= int(full_scan_interval_hours) * 60 * 60:
            return "scheduled-full"
    return None


def _table_columns(con: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in con.execute(f"PRAGMA table_info({table})").fetchall()}


def _sql_identifier(identifier: str) -> str:
    if not identifier or not identifier.replace("_", "").isalnum():
        raise ValueError(f"Unsafe SQL identifier: {identifier!r}")
    return '"' + identifier.replace('"', '""') + '"'


def _legacy_db_candidates(db_path: str) -> list[str]:
    candidates = []
    for env_name in ("LEGACY_VOD_DB_PATH", "LEGACY_KAN_VOD_DB_PATH", "KAN_VOD_DB_PATH"):
        legacy_env = os.getenv(env_name)
        if legacy_env:
            candidates.append(legacy_env)

    parent = os.path.dirname(db_path)
    if parent:
        candidates.append(os.path.join(parent, "kan_vod.db"))

    candidates.append(LEGACY_KAN_VOD_DB_PATH)
    return list(dict.fromkeys(candidates))


def _needs_table_sync(
    con: sqlite3.Connection,
    provider: str,
    source_table: str,
    target_table: str,
) -> bool:
    source_count, source_updated = con.execute(
        f"""
        SELECT
            COUNT(*) AS count,
            COALESCE(MAX(COALESCE(updated_at, '')), '') AS updated_at
        FROM {source_table}
        """
    ).fetchone()
    target_count, target_updated = con.execute(
        f"""
        SELECT
            COUNT(*) AS count,
            COALESCE(MAX(COALESCE(updated_at, '')), '') AS updated_at
        FROM {target_table}
        WHERE provider = ?
        """,
        (provider,),
    ).fetchone()
    return int(source_count or 0) != int(target_count or 0) or str(source_updated or "") != str(target_updated or "")


def _select_expr(columns: set[str], column: str, default: str = "NULL") -> str:
    return column if column in columns else default


def _new_expr(columns: set[str], column: str, default: str = "NULL") -> str:
    return f"NEW.{column}" if column in columns else default


def _qualified_expr(columns: set[str], qualifier: str, column: str, default: str = "NULL") -> str:
    return f"{qualifier}.{column}" if column in columns else default


def _coalesce_non_empty(*exprs: str) -> str:
    if not exprs:
        return "NULL"
    normalized = [_non_empty_text_expr(expr) for expr in exprs[:-1]]
    return f"COALESCE({', '.join(normalized + [exprs[-1]])})"


def _non_empty_text_expr(expr: str) -> str:
    return f"NULLIF(TRIM(CAST({expr} AS TEXT)), '')"


def _numeric_text_expr(expr: str) -> str:
    return f"""
        CASE
            WHEN {_numeric_text_condition(expr)}
            THEN CAST({expr} AS INTEGER)
            ELSE NULL
        END
    """


def _numeric_text_condition(expr: str) -> str:
    text_expr = f"TRIM(COALESCE({expr}, ''))"
    return f"{text_expr} != '' AND {text_expr} NOT GLOB '*[^0-9]*'"


def _literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"
