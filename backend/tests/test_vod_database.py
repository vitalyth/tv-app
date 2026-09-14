import sqlite3
import unittest

from services.vod_database import (
    UNIFIED_SCHEMA_VERSION,
    ensure_unified_schema,
    mark_vod_program_detail_scan,
    select_vod_programs_for_detail_scan,
    vod_episode_activity_subquery,
)


class VodDatabaseTests(unittest.TestCase):
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
                "missing-episodes": 1,
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


if __name__ == "__main__":
    unittest.main()
