import importlib
import unittest


class KeshetVodServiceTests(unittest.TestCase):
    def setUp(self):
        self.module = importlib.import_module("services.keshet_vod_service")

    def test_episode_metadata_prefers_episode_history_over_program_hero(self):
        data = {
            "domoPageView": {"item_id": "episode-1"},
            "hero": {
                "subtitle": "04.09.26",
                "description": "תיאור כללי של הסדרה",
            },
            "historyObject": {
                "pageUrl": "/show/season/channel/VOD-episode.htm",
                "picUrl": "https://img.mako.co.il/episode.jpg",
                "hero": {
                    "extraInfo": "04.09.26",
                    "subtitle": "תיאור ספציפי של הפרק",
                },
            },
            "seo": {
                "schema": {
                    "name": "04.09.26",
                    "description": "תיאור מתוך schema",
                    "video": {"uploadDate": "2026-09-03T21:00:00Z"},
                }
            },
            "vod": {
                "itemVcmId": "episode-1",
            },
        }

        metadata = self.module._episode_metadata_from_page_data(data)

        self.assertEqual(metadata["id"], "episode-1")
        self.assertEqual(metadata["title"], "04.09.26")
        self.assertEqual(metadata["description"], "תיאור ספציפי של הפרק")
        self.assertEqual(metadata["image"], "https://img.mako.co.il/episode.jpg")
        self.assertEqual(metadata["published"], "04.09.26")

    def test_parse_episode_uses_embedded_episode_metadata(self):
        program = self.module.KeshetProgram(
            id="program-1",
            mainid="main-1",
            title="תוכנית",
            description="",
            url="https://www.mako.co.il/show",
            image="https://img.mako.co.il/program.jpg",
        )
        season = self.module.KeshetSeason(
            program_id="program-1",
            season_id="season-1",
            title="2026",
            url="https://www.mako.co.il/show-2026",
            season_number=1,
        )
        data = {
            "channelId": "channel-1",
            "hero": {
                "description": "תיאור כללי",
            },
            "historyObject": {
                "pageUrl": "/show-2026/channel/VOD-episode.htm",
                "picUrl": "https://img.mako.co.il/episode.jpg",
                "hero": {
                    "extraInfo": "04.09.26",
                    "subtitle": "תיאור הפרק",
                },
            },
            "vod": {
                "itemVcmId": "episode-1",
                "pageUrl": "/show-2026/channel/VOD-episode.htm",
            },
        }

        episodes = self.module._parse_episodes(program, season, data)

        self.assertEqual(len(episodes), 1)
        self.assertEqual(episodes[0].id, "episode-1")
        self.assertEqual(episodes[0].title, "04.09.26")
        self.assertEqual(episodes[0].description, "תיאור הפרק")
        self.assertEqual(episodes[0].image, "https://img.mako.co.il/episode.jpg")
        self.assertEqual(
            episodes[0].url,
            "https://www.mako.co.il/show-2026/channel/VOD-episode.htm",
        )
        self.assertEqual(
            episodes[0].play_url,
            "https://www.mako.co.il/VodPlaylist?vcmid=episode-1&videoChannelId=channel-1",
        )


if __name__ == "__main__":
    unittest.main()
