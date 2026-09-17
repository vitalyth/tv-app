import unittest

from services.stream_service import _limit_kan_live_dvr


class StreamServiceTests(unittest.TestCase):
    def test_limits_kan_hls_dvr_and_preserves_kodi_headers(self):
        stream = (
            "https://r.il.cdn-redge.media/livehls/oil/kancdn-live/live/kan11/"
            "live.livx/playlist.m3u8?dvr=21600000|User-Agent=test"
        )

        self.assertEqual(
            _limit_kan_live_dvr(stream, max_dvr_ms=120000),
            "https://r.il.cdn-redge.media/livehls/oil/kancdn-live/live/kan11/"
            "live.livx/playlist.m3u8?dvr=120000|User-Agent=test",
        )

    def test_limits_kan_dash_dvr(self):
        stream = (
            "https://r.il.cdn-redge.media/livedash/oil/kancdn-live/live/kan_edu/"
            "live.livx?dvr=14400000"
        )

        self.assertIn("dvr=120000", _limit_kan_live_dvr(stream, max_dvr_ms=120000))

    def test_does_not_extend_an_existing_shorter_window(self):
        stream = (
            "https://r.il.cdn-redge.media/livehls/oil/kancdn-live/live/kan11/"
            "live.livx/playlist.m3u8?dvr=60000"
        )

        self.assertEqual(_limit_kan_live_dvr(stream, max_dvr_ms=120000), stream)

    def test_leaves_non_kan_streams_unchanged(self):
        stream = "https://example.com/live/playlist.m3u8?dvr=21600000"

        self.assertEqual(_limit_kan_live_dvr(stream, max_dvr_ms=120000), stream)

    def test_leaves_other_redge_streams_unchanged(self):
        stream = (
            "https://example.il.cdn-redge.media/livehls/oil/other-provider/live/channel/"
            "playlist.m3u8?dvr=21600000"
        )

        self.assertEqual(_limit_kan_live_dvr(stream, max_dvr_ms=120000), stream)


if __name__ == "__main__":
    unittest.main()
