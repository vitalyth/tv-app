import tempfile
import unittest
import sys
from pathlib import Path
from unittest.mock import patch


DEBUG_DIR = Path(__file__).resolve().parents[1] / "debug"
PLUGIN_DIR = Path(__file__).resolve().parents[1] / "plugin_video_idanplus"
for path in (DEBUG_DIR, PLUGIN_DIR):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from services import channel_service


class VodRecentSortingTests(unittest.TestCase):
    def test_source_sort_key_controls_recent_item_order(self):
        items = [
            {
                "id": "provider:newer-source-id",
                "vodChannelId": "vod_kan11",
                "sourceTimestamp": 100,
                "sourceSortKey": 20,
                "sourceSortKind": "id",
                "sourceOrder": 1,
            },
            {
                "id": "provider:newer-date",
                "vodChannelId": "vod_kan11",
                "sourceTimestamp": 9_999_999_999,
                "sourceSortKey": 9_999_999_999,
                "sourceSortKind": "date",
                "sourceOrder": 0,
            },
        ]

        selected = channel_service._select_vod_recent_items(
            items,
            max_items=2,
            preserve_source_order=True,
        )
        sorted_cache = channel_service._sort_vod_recent_cache_items(items)

        self.assertEqual(
            [item["id"] for item in selected],
            ["provider:newer-source-id", "provider:newer-date"],
        )
        self.assertEqual(
            [item["id"] for item in sorted_cache],
            ["provider:newer-source-id", "provider:newer-date"],
        )

    def test_id_sorted_recent_items_are_not_filtered_by_date_window(self):
        item = {
            "id": "provider:newer-source-id",
            "vodChannelId": "vod_14tv",
            "sourceTimestamp": 100,
            "sourceSortKey": 20,
            "sourceSortKind": "id",
            "sourceOrder": 0,
        }

        self.assertTrue(channel_service._vod_recent_item_matches_channel_window(item))
        self.assertEqual(channel_service._prefer_today_or_yesterday_items([item]), [item])

    def test_i24_is_part_of_direct_vod_recent_sources(self):
        self.assertIn("vod_i24news", channel_service.VOD_RECENT_PRIORITY_CHANNEL_IDS)
        self.assertIn("vod_i24news", channel_service.VOD_RECENT_DIRECT_CHANNEL_IDS)
        self.assertIn(
            "vod_i24news",
            [channel["id"] for channel in channel_service._get_vod_channels_for_recent(True)],
        )

    def test_vod_recent_stream_endpoint_is_provider_specific(self):
        self.assertEqual(
            channel_service._vod_recent_stream_endpoint("keshet-vod", "episode id/1"),
            "/keshet-vod/stream?episode_id=episode%20id%2F1",
        )

    def test_vod_recent_cached_items_get_stream_endpoint(self):
        item = {
            "id": "c14-vod:1725739",
            "module": "c14-vod",
        }

        repaired = channel_service._vod_recent_item_with_stream_endpoint(item)

        self.assertEqual(repaired["episodeId"], "1725739")
        self.assertEqual(repaired["streamEndpoint"], "/c14-vod/stream?episode_id=1725739")

    def test_unplayable_kan_program_row_is_not_a_recent_episode(self):
        item = {
            "id": "kan-vod:1096531",
            "module": "kan-vod",
            "episodeId": "1096531",
            "programId": "1096531",
            "url": "https://www.kan.org.il/content/kan/kan-11/p-1096531/",
            "playUrl": "https://www.kan.org.il/content/kan/kan-11/p-1096531/",
            "streamUrl": "",
        }

        self.assertTrue(channel_service._is_vod_recent_placeholder_item(item))

        playable_child = {
            **item,
            "episodeId": "1096785",
            "playUrl": "https://www.kan.org.il/content/kan/kan-11/p-1096531/s1/1096785/",
        }
        self.assertFalse(channel_service._is_vod_recent_placeholder_item(playable_child))

    def test_vod_recent_file_cache_uses_memory_until_file_changes(self):
        original_cache_file = channel_service.VOD_RECENT_CACHE_FILE
        original_cache = channel_service._vod_recent_cache
        original_mtime = channel_service._vod_recent_cache_mtime
        original_updated = channel_service._vod_recent_cache_updated

        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                cache_file = Path(temp_dir) / "vod_recent.json"
                cache_file.write_text('[{"id": "item-1", "vodChannelId": "vod_kan11"}]', encoding="utf-8")
                channel_service.VOD_RECENT_CACHE_FILE = cache_file
                channel_service._vod_recent_cache = None
                channel_service._vod_recent_cache_mtime = 0.0
                channel_service._vod_recent_cache_updated = 0.0

                with patch.object(channel_service.json, "load", wraps=channel_service.json.load) as json_load:
                    first = channel_service._read_vod_recent_cache_file()
                    second = channel_service._read_vod_recent_cache_file()

                self.assertEqual(first, [{"id": "item-1", "vodChannelId": "vod_kan11"}])
                self.assertEqual(second, first)
                self.assertEqual(json_load.call_count, 1)
        finally:
            channel_service.VOD_RECENT_CACHE_FILE = original_cache_file
            channel_service._vod_recent_cache = original_cache
            channel_service._vod_recent_cache_mtime = original_mtime
            channel_service._vod_recent_cache_updated = original_updated


if __name__ == "__main__":
    unittest.main()
