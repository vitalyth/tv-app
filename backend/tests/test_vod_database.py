import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import services.vod_database as vod_database
from scripts import vod_db_scanner
from services.vod_database import (
    UNIFIED_SCHEMA_VERSION,
    ensure_unified_schema,
    mark_vod_program_detail_scan,
    select_vod_programs_for_detail_scan,
    vod_episode_activity_subquery,
    vod_program_activity_order_by,
)


class VodDatabaseTests(unittest.TestCase):
    def test_provider_schema_initializer_runs_once_per_database(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = str(Path(temp_dir) / "vod.db")
            calls = []

            vod_database.ensure_vod_provider_schema(
                db_path,
                "test-provider",
                lambda: calls.append("initialized"),
            )
            vod_database.ensure_vod_provider_schema(
                db_path,
                "test-provider",
                lambda: calls.append("initialized-again"),
            )

            self.assertEqual(calls, ["initialized"])

    def test_shared_connection_waits_for_database_locks(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            con = vod_database.connect_vod_db(str(Path(temp_dir) / "vod.db"))
            try:
                busy_timeout = con.execute("PRAGMA busy_timeout").fetchone()[0]
                journal_mode = con.execute("PRAGMA journal_mode").fetchone()[0]
                synchronous = con.execute("PRAGMA synchronous").fetchone()[0]
            finally:
                con.close()

            self.assertEqual(busy_timeout, 30_000)
            self.assertEqual(journal_mode, "wal")
            self.assertEqual(synchronous, 1)

    def test_shared_connection_allows_reads_during_an_exclusive_write(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = str(Path(temp_dir) / "vod.db")
            writer = vod_database.connect_vod_db(db_path)
            reader = vod_database.connect_vod_db(db_path)
            try:
                writer.execute("CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)")
                writer.execute("INSERT INTO items (value) VALUES ('visible')")
                writer.commit()

                writer.execute("BEGIN EXCLUSIVE")
                writer.execute("INSERT INTO items (value) VALUES ('pending')")
                rows = reader.execute("SELECT value FROM items ORDER BY id").fetchall()

                self.assertEqual([row[0] for row in rows], ["visible"])
            finally:
                writer.rollback()
                reader.close()
                writer.close()

    def test_kan_maintenance_handles_empty_db_and_removes_unplayable_placeholders(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            empty_db = str(Path(temp_dir) / "empty.db")
            with patch.object(vod_database, "_legacy_db_candidates", return_value=[]):
                empty_result = vod_db_scanner._run_kan_maintenance(
                    SimpleNamespace(db=empty_db)
                )
            self.assertEqual(empty_result["removedUnplayableProgramPlaceholders"], 0)

            db_path = str(Path(temp_dir) / "vod.db")
            con = sqlite3.connect(db_path)
            try:
                for table in ("episodes", "vod_episodes"):
                    provider_column = "provider TEXT," if table == "vod_episodes" else ""
                    con.execute(
                        f"""
                        CREATE TABLE {table} (
                            {provider_column}
                            id TEXT,
                            program_id TEXT,
                            stream_url TEXT,
                            kaltura_entry_id TEXT,
                            play_url TEXT,
                            url TEXT
                        )
                        """
                    )
                placeholder = (
                    "program-1",
                    "program-1",
                    "",
                    "",
                    "https://example.test/p-program-1/",
                    "https://example.test/p-program-1/",
                )
                playable = (
                    "episode-1",
                    "program-1",
                    "https://cdn.test/master.m3u8",
                    "entry-1",
                    "https://example.test/p-program-1/episode-1/",
                    "https://example.test/p-program-1/episode-1/",
                )
                con.executemany(
                    "INSERT INTO episodes VALUES (?, ?, ?, ?, ?, ?)",
                    (placeholder, playable),
                )
                con.executemany(
                    "INSERT INTO vod_episodes VALUES ('kan', ?, ?, ?, ?, ?, ?)",
                    (placeholder, playable),
                )
                con.commit()
            finally:
                con.close()

            result = vod_db_scanner._run_kan_maintenance(
                SimpleNamespace(db=db_path)
            )
            self.assertEqual(result["removedUnplayableProgramPlaceholders"], 2)

            con = sqlite3.connect(db_path)
            try:
                self.assertEqual(con.execute("SELECT id FROM episodes").fetchall(), [("episode-1",)])
                self.assertEqual(
                    con.execute("SELECT id FROM vod_episodes").fetchall(),
                    [("episode-1",)],
                )
            finally:
                con.close()

    def test_unified_episode_created_at_uses_legacy_updated_at(self):
        con = sqlite3.connect(":memory:")
        con.row_factory = sqlite3.Row
        try:
            con.executescript(
                """
                CREATE TABLE episodes (
                    id TEXT PRIMARY KEY,
                    program_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    created_at TEXT,
                    updated_at TEXT
                );

                INSERT INTO episodes (id, program_id, title, created_at, updated_at)
                VALUES ('ep-1', 'program-1', 'Episode 1', '2099-01-01 00:00:00', '2001-02-03 04:05:06');

                CREATE TABLE vod_schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                INSERT INTO vod_schema_meta (key, value)
                VALUES ('unified_schema_version', '2');

                CREATE TABLE vod_episodes (
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
                    created_at TEXT,
                    updated_at TEXT,
                    PRIMARY KEY (provider, id)
                );

                INSERT INTO vod_episodes (provider, id, program_id, title, created_at, updated_at)
                VALUES ('kan', 'ep-1', 'program-1', 'Episode 1', '2099-01-01 00:00:00', '2099-01-01 00:00:00');
                """
            )

            ensure_unified_schema(con, providers=("kan",))

            row = con.execute(
                "SELECT created_at, updated_at FROM vod_episodes WHERE provider = 'kan' AND id = 'ep-1'"
            ).fetchone()
            schema_version = con.execute(
                "SELECT value FROM vod_schema_meta WHERE key = 'unified_schema_version'"
            ).fetchone()[0]
            created_index = con.execute(
                """
                SELECT 1
                FROM sqlite_master
                WHERE type = 'index'
                  AND name = 'idx_vod_episodes_provider_program_created'
                """
            ).fetchone()

            self.assertEqual(schema_version, UNIFIED_SCHEMA_VERSION)
            self.assertIsNotNone(created_index)
            self.assertEqual(row["created_at"], "2001-02-03 04:05:06")
            self.assertEqual(row["updated_at"], "2001-02-03 04:05:06")

            con.execute(
                "UPDATE episodes SET updated_at = '2020-01-01 00:00:00' WHERE id = 'ep-1'"
            )
            row = con.execute(
                "SELECT created_at, updated_at FROM vod_episodes WHERE provider = 'kan' AND id = 'ep-1'"
            ).fetchone()
            self.assertEqual(row["created_at"], "2001-02-03 04:05:06")
            self.assertEqual(row["updated_at"], "2020-01-01 00:00:00")

            con.execute(
                """
                INSERT INTO episodes (id, program_id, title, created_at, updated_at)
                VALUES ('ep-2', 'program-1', 'Episode 2', '2099-01-01 00:00:00', '2002-03-04 05:06:07')
                """
            )
            row = con.execute(
                "SELECT created_at, updated_at FROM vod_episodes WHERE provider = 'kan' AND id = 'ep-2'"
            ).fetchone()
            self.assertEqual(row["created_at"], "2002-03-04 05:06:07")
            self.assertEqual(row["updated_at"], "2002-03-04 05:06:07")
        finally:
            con.close()

    def test_incremental_detail_scan_selection_skips_fresh_programs(self):
        con = sqlite3.connect(":memory:")
        con.row_factory = sqlite3.Row
        try:
            con.executescript(
                """
                CREATE TABLE programs (
                    id TEXT PRIMARY KEY,
                    last_full_scan_at TEXT,
                    last_incremental_scan_at TEXT,
                    updated_at TEXT
                );
                CREATE TABLE episodes (
                    id TEXT PRIMARY KEY,
                    program_id TEXT NOT NULL,
                    stream_url TEXT
                );

                INSERT INTO programs (id, last_full_scan_at) VALUES
                    ('fresh', '2099-01-01 00:00:00'),
                    ('missing', NULL),
                    ('never', NULL),
                    ('stale', '2001-01-01 00:00:00'),
                    ('streams', '2099-01-01 00:00:00');
                INSERT INTO episodes (id, program_id, stream_url) VALUES
                    ('ep-never', 'never', 'https://stream.example/never.m3u8'),
                    ('ep-stale', 'stale', 'https://stream.example/stale.m3u8'),
                    ('ep-fresh', 'fresh', 'https://stream.example/fresh.m3u8'),
                    ('ep-streams', 'streams', '');
                """
            )
            programs = [{"id": key} for key in ("fresh", "missing", "never", "stale", "streams")]

            selected, summary = select_vod_programs_for_detail_scan(
                con,
                programs,
                program_table="programs",
                episode_table="episodes",
                program_id_getter=lambda program: program["id"],
                incremental=True,
                limit_programs=3,
                full_scan_interval_hours=168,
                with_streams=True,
            )

            self.assertEqual([program["id"] for program in selected], ["missing", "never", "stale"])
            self.assertEqual(summary["candidatePrograms"], 4)
            self.assertEqual(summary["selectedPrograms"], 3)
            self.assertEqual(summary["reasons"], {
                "new-program": 1,
                "never-scanned": 1,
                "scheduled-full": 1,
            })

            mark_vod_program_detail_scan(con, "programs", "missing")
            row = con.execute(
                "SELECT last_full_scan_at, last_incremental_scan_at, updated_at FROM programs WHERE id = 'missing'"
            ).fetchone()
            self.assertTrue(row["last_full_scan_at"])
            self.assertTrue(row["last_incremental_scan_at"])
            self.assertTrue(row["updated_at"])
        finally:
            con.close()

    def test_incremental_scan_prioritizes_newest_unscanned_programs(self):
        con = sqlite3.connect(":memory:")
        con.row_factory = sqlite3.Row
        try:
            con.executescript(
                """
                CREATE TABLE programs (
                    id TEXT PRIMARY KEY,
                    last_full_scan_at TEXT,
                    last_incremental_scan_at TEXT,
                    updated_at TEXT
                );
                CREATE TABLE episodes (
                    id TEXT PRIMARY KEY,
                    program_id TEXT NOT NULL,
                    stream_url TEXT
                );

                INSERT INTO programs (id) VALUES ('old-unscanned');
                INSERT INTO programs (id, last_full_scan_at, last_incremental_scan_at)
                VALUES ('tried-empty', '2026-09-17 00:00:00', '2026-09-17 00:00:00');
                INSERT INTO programs (id) VALUES ('new-unscanned');
                """
            )
            programs = [
                {"id": "old-unscanned"},
                {"id": "tried-empty"},
                {"id": "new-unscanned"},
            ]

            selected, summary = select_vod_programs_for_detail_scan(
                con,
                programs,
                program_table="programs",
                episode_table="episodes",
                program_id_getter=lambda program: program["id"],
                incremental=True,
                limit_programs=2,
                full_scan_interval_hours=168,
            )

            self.assertEqual(
                [program["id"] for program in selected],
                ["new-unscanned", "old-unscanned"],
            )
            self.assertEqual(summary["candidatePrograms"], 3)
            self.assertEqual(summary["reasons"], {"new-program": 2})
            self.assertEqual(summary["candidateReasons"], {
                "new-program": 2,
                "missing-episodes": 1,
            })
        finally:
            con.close()

    def test_incremental_rotation_prioritizes_new_then_oldest_scanned_program(self):
        con = sqlite3.connect(":memory:")
        con.row_factory = sqlite3.Row
        try:
            con.executescript(
                """
                CREATE TABLE programs (
                    id TEXT PRIMARY KEY,
                    last_full_scan_at TEXT,
                    last_incremental_scan_at TEXT,
                    updated_at TEXT
                );
                CREATE TABLE episodes (
                    id TEXT PRIMARY KEY,
                    program_id TEXT NOT NULL,
                    stream_url TEXT
                );

                INSERT INTO programs (id, last_full_scan_at, last_incremental_scan_at)
                VALUES ('recent', '2026-09-17 10:00:00', '2026-09-17 10:00:00');
                INSERT INTO programs (id, last_full_scan_at, last_incremental_scan_at)
                VALUES ('oldest', '2026-09-17 10:00:00', '2026-09-10 10:00:00');
                INSERT INTO programs (id) VALUES ('new-program');
                INSERT INTO programs (id, last_full_scan_at, last_incremental_scan_at)
                VALUES ('recent-empty', '2026-09-17 11:00:00', '2026-09-17 11:00:00');
                INSERT INTO episodes (id, program_id) VALUES ('recent-episode', 'recent');
                INSERT INTO episodes (id, program_id) VALUES ('oldest-episode', 'oldest');
                """
            )
            programs = [
                {"id": "recent"},
                {"id": "oldest"},
                {"id": "new-program"},
                {"id": "recent-empty"},
            ]

            selected, summary = select_vod_programs_for_detail_scan(
                con,
                programs,
                program_table="programs",
                episode_table="episodes",
                program_id_getter=lambda program: program["id"],
                incremental=True,
                limit_programs=2,
                full_scan_interval_hours=0,
                include_incremental=True,
            )

            self.assertEqual(
                [program["id"] for program in selected],
                ["new-program", "oldest"],
            )
            self.assertEqual(summary["candidatePrograms"], 4)
            self.assertEqual(summary["selectedPrograms"], 2)
            self.assertEqual(summary["reasons"], {
                "new-program": 1,
                "incremental": 1,
            })
        finally:
            con.close()

    def test_episode_activity_sort_prefers_numeric_provider_id_then_date(self):
        con = sqlite3.connect(":memory:")
        con.row_factory = sqlite3.Row
        try:
            con.executescript(
                """
                CREATE TABLE vod_episodes (
                    provider TEXT NOT NULL,
                    id TEXT NOT NULL,
                    source_id TEXT,
                    program_id TEXT NOT NULL,
                    published_timestamp REAL,
                    created_at TEXT
                );

                INSERT INTO vod_episodes (provider, id, source_id, program_id, published_timestamp, created_at)
                VALUES
                    ('kan', '10', NULL, 'older-program-id', 4102444800, '2026-09-14 00:00:00'),
                    ('kan', '20', NULL, 'newer-program-id', 1, '2026-09-14 00:00:00'),
                    ('reshet', 'entry-a', NULL, 'older-date', 100, '2026-09-14 00:00:00'),
                    ('reshet', 'entry-b', NULL, 'newer-date', 200, '2026-09-14 00:00:00');
                """
            )

            numeric_rows = con.execute(
                f"""
                SELECT program_id
                FROM ({vod_episode_activity_subquery("kan")})
                ORDER BY
                    latest_episode_source_sort_key IS NULL,
                    COALESCE(latest_episode_source_sort_key, latest_episode_date_sort_key, 0) DESC
                """
            ).fetchall()
            dated_rows = con.execute(
                f"""
                SELECT program_id
                FROM ({vod_episode_activity_subquery("reshet")})
                ORDER BY
                    latest_episode_source_sort_key IS NULL,
                    COALESCE(latest_episode_source_sort_key, latest_episode_date_sort_key, 0) DESC
                """
            ).fetchall()

            self.assertEqual([row["program_id"] for row in numeric_rows], ["newer-program-id", "older-program-id"])
            self.assertEqual([row["program_id"] for row in dated_rows], ["newer-date", "older-date"])
        finally:
            con.close()

    def test_program_activity_sort_uses_provider_recency_before_insertion_time(self):
        con = sqlite3.connect(":memory:")
        con.row_factory = sqlite3.Row
        try:
            con.executescript(
                """
                CREATE TABLE activity (
                    name TEXT,
                    source_key INTEGER,
                    date_key REAL,
                    added_at TEXT
                );
                INSERT INTO activity VALUES
                    ('old-provider-new-insert', 10, 100, '2026-09-17 12:00:00'),
                    ('new-provider-old-insert', 20, 200, '2026-09-14 12:00:00');
                """
            )

            rows = con.execute(
                f"""
                SELECT name
                FROM activity
                ORDER BY {vod_program_activity_order_by(
                    "source_key",
                    "date_key",
                    "added_at",
                )}
                """
            ).fetchall()

            self.assertEqual(
                [row["name"] for row in rows],
                ["new-provider-old-insert", "old-provider-new-insert"],
            )
        finally:
            con.close()

    def test_unified_schema_sync_runs_once_per_db_provider_in_process(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            con = sqlite3.connect(f"{temp_dir}/vod.db")
            con.row_factory = sqlite3.Row
            try:
                con.executescript(
                    """
                    CREATE TABLE programs (
                        id TEXT PRIMARY KEY,
                        title TEXT NOT NULL,
                        updated_at TEXT
                    );
                    CREATE TABLE seasons (
                        season_id TEXT PRIMARY KEY,
                        program_id TEXT NOT NULL,
                        title TEXT,
                        updated_at TEXT
                    );
                    CREATE TABLE episodes (
                        id TEXT PRIMARY KEY,
                        program_id TEXT NOT NULL,
                        title TEXT NOT NULL,
                        updated_at TEXT
                    );
                    """
                )

                with patch.object(
                    vod_database,
                    "_sync_episodes",
                    wraps=vod_database._sync_episodes,
                ) as sync_episodes:
                    ensure_unified_schema(con, providers=("kan",))
                    ensure_unified_schema(con, providers=("kan",))

                self.assertEqual(sync_episodes.call_count, 1)
            finally:
                con.close()


if __name__ == "__main__":
    unittest.main()
