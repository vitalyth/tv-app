import unittest
import sys
from pathlib import Path


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


if __name__ == "__main__":
    unittest.main()
