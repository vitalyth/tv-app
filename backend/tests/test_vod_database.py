import sqlite3
import unittest

from services.vod_database import UNIFIED_SCHEMA_VERSION, ensure_unified_schema


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


if __name__ == "__main__":
    unittest.main()
