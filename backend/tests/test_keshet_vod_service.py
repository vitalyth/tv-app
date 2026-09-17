import importlib
import tempfile
import unittest
from unittest.mock import Mock, patch


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

    def test_pick_media_link_prefers_provider_weight_over_aws_default(self):
        media = [
            {
                "cdn": "AWS",
                "cdnLB": "20",
                "format": "AWS_HLS",
                "url": "https://cdn.example/aws/index.m3u8",
            },
            {
                "cdn": "AKAMAI",
                "cdnLB": "80",
                "format": "AKAMAI_HLS",
                "url": "https://cdn.example/akamai/master.m3u8",
            },
        ]

        self.assertEqual(
            self.module._pick_media_link(media),
            ("https://cdn.example/akamai/master.m3u8", "AKAMAI"),
        )

    def test_pick_media_link_prefers_master_playlist_when_weight_ties(self):
        media = [
            {
                "cdn": "AWS",
                "cdnLB": "80",
                "format": "AWS_HLS",
                "url": "https://cdn.example/aws/index.m3u8",
            },
            {
                "cdn": "AKAMAI",
                "cdnLB": "80",
                "format": "AKAMAI_HLS",
                "url": "https://cdn.example/akamai/master.m3u8",
            },
        ]

        self.assertEqual(
            self.module._pick_media_link(media),
            ("https://cdn.example/akamai/master.m3u8", "AKAMAI"),
        )

    def test_resolve_keshet_vod_stream_returns_signed_master_playlist(self):
        media = [
            {
                "cdn": "AKAMAI",
                "cdnLB": "80",
                "format": "AKAMAI_HLS",
                "url": "https://mako-vod.akamaized.net/i/VOD/KESHET/show/episode_,550,2200,.mp4.csmil/master.m3u8",
            }
        ]
        with patch.object(self.module, "_get_media_playlist", return_value=media), patch.object(
            self.module,
            "_get_ticket",
            return_value="hdnea=abc",
        ):
            stream_url = self.module.resolve_keshet_vod_stream(
                "https://www.mako.co.il/VodPlaylist"
                "?videoChannelId=channel-1&vcmid=episode-1"
            )

        self.assertEqual(
            stream_url,
            "https://mako-vod.akamaized.net/i/VOD/KESHET/show/episode_,550,2200,.mp4.csmil/master.m3u8?hdnea=abc",
        )

    def test_episode_fallback_metadata_from_media_url_uses_playlist_date(self):
        metadata = self.module._episode_fallback_metadata_from_media_url(
            "https://mako-vod.akamaized.net/i/VOD/KESHET/show/Ulpan_Shishi_070826_VOD_x/"
            "Ulpan_Shishi_070826_VOD_x_,550,850,1400,2200,.mp4.csmil/master.m3u8"
        )

        self.assertEqual(metadata["title"], "07.08.26")
        self.assertEqual(metadata["published"], "07.08.26")
        self.assertIsNotNone(metadata.get("published_timestamp"))

    def test_backfill_placeholder_episode_metadata_updates_existing_episode(self):
        original_db_path = self.module.KESHT_VOD_DB_PATH
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                self.module.KESHT_VOD_DB_PATH = f"{temp_dir}/vod.db"
                con = self.module._connect()
                try:
                    con.execute(
                        """
                        INSERT INTO keshet_programs (id, mainid, title, description, url)
                        VALUES ('program-1', 'main-1', 'תוכנית', '', 'https://www.mako.co.il/show')
                        """
                    )
                    con.execute(
                        """
                        INSERT INTO keshet_episodes (id, program_id, title, description, url, play_url)
                        VALUES (
                            'episode-1',
                            'program-1',
                            'פרק episode-1VgnVCM100000700a10acRCRD',
                            '',
                            'https://www.mako.co.il/VodPlaylist?vcmid=episode-1&videoChannelId=channel-1',
                            'https://www.mako.co.il/VodPlaylist?vcmid=episode-1&videoChannelId=channel-1'
                        )
                        """
                    )
                    con.commit()
                    media = [
                        {
                            "cdn": "AKAMAI",
                            "cdnLB": "80",
                            "format": "AKAMAI_HLS",
                            "url": "https://mako-vod.akamaized.net/i/VOD/KESHET/show/"
                            "Ulpan_Shishi_070826_VOD_x/Ulpan_Shishi_070826_VOD_x_,550,2200,.mp4.csmil/master.m3u8",
                        }
                    ]

                    with patch.object(self.module, "_get_media_playlist", return_value=media):
                        updated = self.module._backfill_placeholder_episode_metadata(con, "program-1")

                    row = con.execute(
                        "SELECT title, published, published_timestamp FROM keshet_episodes WHERE id = 'episode-1'"
                    ).fetchone()
                finally:
                    con.close()

                self.assertEqual(updated, 1)
                self.assertEqual(row["title"], "07.08.26")
                self.assertEqual(row["published"], "07.08.26")
                self.assertIsNotNone(row["published_timestamp"])
        finally:
            self.module.KESHT_VOD_DB_PATH = original_db_path


if __name__ == "__main__":
    unittest.main()
