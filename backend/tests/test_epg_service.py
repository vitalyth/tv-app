import threading
import time
import unittest
from unittest.mock import patch

from services import epg_service


class EpgServiceTests(unittest.TestCase):
    def setUp(self):
        epg_service._epg_cache = None
        epg_service._last_update = 0
        epg_service._epg_cache_fallback_mtime = 0
        epg_service._epg_cache_window_start = 0
        epg_service._epg_cache_window_end = 0

    @staticmethod
    def _epg(start: int, end: int) -> dict:
        return {
            "channel-1": [
                {
                    "start": start,
                    "end": end,
                    "name": "Program",
                    "description": "",
                }
            ]
        }

    def test_cache_loads_only_a_padded_request_window(self):
        loaded_ranges = []

        def load(*, start=None, end=None, query=None):
            loaded_ranges.append((start, end, query))
            return self._epg(1_100, 1_200)

        with (
            patch.object(epg_service, "_load_fallback_epg", side_effect=load),
            patch.object(epg_service, "_get_fallback_epg_mtime", return_value=5),
            patch.object(epg_service, "add_vod_links_to_epg", side_effect=lambda value: value),
            patch.object(epg_service.time, "time", return_value=1_500),
        ):
            result = epg_service.get_now_epg(start=1_000, end=2_000)

        self.assertEqual(
            loaded_ranges,
            [
                (
                    1_000 - epg_service.EPG_CACHE_WINDOW_PADDING,
                    2_000 + epg_service.EPG_CACHE_WINDOW_PADDING,
                    None,
                )
            ],
        )
        self.assertEqual(len(result["channel-1"]), 1)

    def test_nearby_requests_reuse_the_padded_cache(self):
        calls = 0

        def load(*, start=None, end=None, query=None):
            nonlocal calls
            calls += 1
            return self._epg(1_100, 1_200)

        with (
            patch.object(epg_service, "_load_fallback_epg", side_effect=load),
            patch.object(epg_service, "_get_fallback_epg_mtime", return_value=5),
            patch.object(epg_service, "add_vod_links_to_epg", side_effect=lambda value: value),
            patch.object(epg_service.time, "time", return_value=1_500),
        ):
            epg_service.get_now_epg(start=1_000, end=2_000)
            epg_service.get_now_epg(start=1_100, end=2_100)

        self.assertEqual(calls, 1)

    def test_concurrent_requests_load_the_cache_once(self):
        calls = 0
        calls_lock = threading.Lock()

        def load(*, start=None, end=None, query=None):
            nonlocal calls
            with calls_lock:
                calls += 1
            time.sleep(0.05)
            return self._epg(1_100, 1_200)

        with (
            patch.object(epg_service, "_load_fallback_epg", side_effect=load),
            patch.object(epg_service, "_get_fallback_epg_mtime", return_value=5),
            patch.object(epg_service, "add_vod_links_to_epg", side_effect=lambda value: value),
            patch.object(epg_service.time, "time", return_value=1_500),
        ):
            threads = [
                threading.Thread(
                    target=epg_service.get_now_epg,
                    kwargs={"start": 1_000, "end": 2_000},
                )
                for _ in range(8)
            ]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()

        self.assertEqual(calls, 1)


if __name__ == "__main__":
    unittest.main()
