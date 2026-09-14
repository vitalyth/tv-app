import importlib
import tempfile
import unittest
from unittest.mock import Mock, patch


class C14VodServiceTests(unittest.TestCase):
    def setUp(self):
        self.module = importlib.import_module("services.c14_vod_service")

    def test_best_hls_variant_from_manifest_prefers_highest_resolution_and_bandwidth(self):
        manifest = """
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=928000,AVERAGE-BANDWIDTH=800000,RESOLUTION=960x540
playlist.m3u8?id=9&bitrate=800000&fmp4
#EXT-X-STREAM-INF:BANDWIDTH=2928000,AVERAGE-BANDWIDTH=2800000,RESOLUTION=1280x720
playlist.m3u8?id=1&bitrate=2800000&fmp4
"""

        self.assertEqual(
            self.module._best_hls_variant_from_manifest(
                "https://cdn.example/video/Manifest.ism/playlist.m3u8?fmp4",
                manifest,
            ),
            "https://cdn.example/video/Manifest.ism/playlist.m3u8?id=1&bitrate=2800000&fmp4",
        )

    def test_resolve_c14_vod_stream_returns_highest_hls_variant(self):
        playlist = {
            "sources": {
                "DASH": [{"src": "//cdn.example/video/Manifest.ism"}],
                "HLS": [{"src": "//cdn.example/video/Manifest.ism/playlist.m3u8?fmp4"}],
            }
        }
        manifest = """
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=628000,AVERAGE-BANDWIDTH=500000,RESOLUTION=640x360
playlist.m3u8?id=13&bitrate=500000&fmp4
#EXT-X-STREAM-INF:BANDWIDTH=2928000,AVERAGE-BANDWIDTH=2800000,RESOLUTION=1280x720
playlist.m3u8?id=1&bitrate=2800000&fmp4
"""
        response = Mock(text=manifest)
        response.raise_for_status = Mock()

        with patch.object(self.module, "_fetch_json_or_none", return_value=playlist), patch.object(
            self.module.requests,
            "get",
            return_value=response,
        ):
            stream_url = self.module.resolve_c14_vod_stream("986505")

        self.assertEqual(
            stream_url,
            "https://cdn.example/video/Manifest.ism/playlist.m3u8?id=1&bitrate=2800000&fmp4",
        )

    def test_get_c14_vod_stream_uses_cached_catchup_url_without_provider_lookup(self):
        catchup_url = (
            "https://n-121-5.il.cdn-redge.media/livedash/oil/ch14/live/now14/"
            "live.livx?indexMode&startTime=811101695000&stopTime=811106915000"
        )
        original_db_path = self.module.C14_VOD_DB_PATH
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                self.module.C14_VOD_DB_PATH = f"{temp_dir}/vod.db"
                con = self.module._connect()
                try:
                    con.execute(
                        """
                        INSERT INTO c14_episodes (
                            id, program_id, title, url, play_url, source_type
                        )
                        VALUES ('1735246', '985753', 'episode', 'https://example.test', ?, ?)
                        """,
                        (catchup_url, self.module.C14_SOURCE_CATCHUP),
                    )
                    con.commit()
                finally:
                    con.close()

                with patch.object(self.module, "resolve_c14_vod_stream") as resolve:
                    stream_url = self.module.get_c14_vod_stream("1735246")

                resolve.assert_not_called()
                self.assertEqual(stream_url, catchup_url)
        finally:
            self.module.C14_VOD_DB_PATH = original_db_path


if __name__ == "__main__":
    unittest.main()
