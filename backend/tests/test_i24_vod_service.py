import importlib
import os
import sys
import unittest
from unittest.mock import patch


class I24VodServiceTests(unittest.TestCase):
    def test_default_scan_locales_include_hebrew(self):
        sys.modules.pop("services.i24_vod_service", None)
        os.environ.pop("I24_VOD_SCAN_LOCALES", None)

        module = importlib.import_module("services.i24_vod_service")

        self.assertIn("he", module.I24_VOD_SCAN_LOCALES)

    def test_section_items_are_collected_across_multiple_pages(self):
        sys.modules.pop("services.i24_vod_service", None)
        module = importlib.import_module("services.i24_vod_service")

        with patch.object(
            module,
            "_fetch_insight_json",
            side_effect=[
                {"items": [{"id": "ep-1", "title": "First"}]},
                {"items": [{"id": "ep-2", "title": "Second"}]},
                {"items": []},
            ],
        ):
            items = module._fetch_i24_section_items("he", "section-1", max_pages=3, page_limit=1)

        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["id"], "ep-1")
        self.assertEqual(items[1]["id"], "ep-2")

    def test_episode_month_is_grouped_into_named_season(self):
        sys.modules.pop("services.i24_vod_service", None)
        module = importlib.import_module("services.i24_vod_service")

        season = module._season_info_for_episode(
            locale="he",
            program_id="he:program-1",
            episode={"published_timestamp": 1753584000, "published": "2025-07-27T00:00:00Z"},
            index=0,
        )

        self.assertEqual(season["season_id"], "he:program-1:2025-07")
        self.assertEqual(season["title"], "יולי 2025")
        self.assertEqual(season["season_number"], 7)

    def test_page_sections_are_parsed_into_programs_and_episodes(self):
        sys.modules.pop("services.i24_vod_service", None)
        module = importlib.import_module("services.i24_vod_service")

        page_payload = {
            "_id": "page-123",
            "sections": [{"title": "המהדורה המרכזית", "sectionId": "section-1"}],
        }
        section_payload = {
            "sectionId": "section-1",
            "items": [
                {
                    "id": "ep-1",
                    "title": "פרק 1",
                    "description": "תיאור",
                    "videoUrl": "https://example.com/video.m3u8",
                    "optimizedPoster": "https://example.com/poster.jpg",
                    "guid": "guid-1",
                }
            ],
        }

        programs = module._build_programs_from_page_sections(
            locale="he",
            page_id="page-123",
            page_payload=page_payload,
            section_payloads=[section_payload],
        )

        self.assertEqual(len(programs), 1)
        self.assertEqual(programs[0]["title"], "המהדורה המרכזית")
        self.assertEqual(programs[0]["source_id"], "section-1")
        self.assertEqual(programs[0]["url"], "https://video.i24news.tv/r/hebrew/page/page-123")
        self.assertEqual(len(programs[0]["episodes"]), 1)
        self.assertEqual(programs[0]["episodes"][0]["title"], "פרק 1")
        self.assertEqual(programs[0]["episodes"][0]["play_url"], "https://example.com/video.m3u8")
        self.assertEqual(programs[0]["image"], "https://example.com/poster.jpg")


if __name__ == "__main__":
    unittest.main()
