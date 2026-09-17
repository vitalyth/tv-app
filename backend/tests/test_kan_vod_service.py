import sqlite3
import unittest
from unittest.mock import patch

from services import kan_vod_service


class _Cursor:
    def __init__(self, row):
        self._row = row

    def fetchone(self):
        return self._row


class _LockedCacheConnection:
    def __init__(self):
        self.rolled_back = False
        self.closed = False

    def execute(self, sql, _params=()):
        if sql.lstrip().upper().startswith("SELECT"):
            return _Cursor(
                {
                    "id": "1082372",
                    "program_id": "12154",
                    "season_id": "12154:s4",
                    "title": "Episode 1",
                    "description": "Description",
                    "url": "https://www.kan.org.il/episode/1082372/",
                    "image": "",
                    "play_url": "https://www.kan.org.il/episode/1082372/",
                    "stream_url": None,
                    "kaltura_entry_id": None,
                    "published": None,
                }
            )
        return _Cursor(None)

    def commit(self):
        raise AssertionError("commit should not run after a locked cache write")

    def rollback(self):
        self.rolled_back = True

    def close(self):
        self.closed = True


class KanVodServiceTests(unittest.TestCase):
    def test_stream_resolution_survives_locked_cache_write(self):
        con = _LockedCacheConnection()
        stream_url = "https://cdn.example.test/1080/master.m3u8"

        with (
            patch.object(kan_vod_service, "_connect", return_value=con),
            patch.object(
                kan_vod_service.kan_db_scanner,
                "resolve_episode_stream",
                return_value=(stream_url, "entry-1"),
            ),
            patch.object(
                kan_vod_service.kan_db_scanner,
                "upsert_episode",
                side_effect=sqlite3.OperationalError("database is locked"),
            ),
        ):
            result = kan_vod_service.get_kan_vod_stream("1082372")

        self.assertEqual(result, stream_url)
        self.assertTrue(con.rolled_back)
        self.assertTrue(con.closed)


if __name__ == "__main__":
    unittest.main()
