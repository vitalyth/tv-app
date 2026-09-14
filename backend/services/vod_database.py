from __future__ import annotations

import os
import shutil
import sqlite3


DEFAULT_VOD_DB_PATH = "db/vod.db"
LEGACY_KAN_VOD_DB_PATH = "db/kan_vod.db"
UNIFIED_SCHEMA_VERSION = "2"


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
    _rebuild_unified_tables_if_needed(con)
    _create_unified_tables(con)
    selected = providers or tuple(PROVIDER_TABLES.keys())
    for provider in selected:
        tables = PROVIDER_TABLES[provider]
        _sync_programs(con, provider, tables["programs"])
        _sync_seasons(con, provider, tables["seasons"])
        _sync_episodes(con, provider, tables["episodes"])
    _set_unified_schema_version(con)


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
            _select_expr(columns, "created_at"),
            _select_expr(columns, "updated_at"),
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
            _new_expr(columns, "created_at"),
            _new_expr(columns, "updated_at"),
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
        _qualified_expr(columns, "src", "created_at"),
        _qualified_expr(columns, "src", "updated_at"),
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


def _table_columns(con: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in con.execute(f"PRAGMA table_info({table})").fetchall()}


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


def _literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"
