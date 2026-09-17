import json
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


CHANNELS_PATH = Path(__file__).resolve().parents[1] / "plugin_video_idanplus" / "resources" / "channels.json"


class LiveChannelConfigTests(unittest.TestCase):
    def test_kan_live_sources_do_not_request_large_dvr_windows(self):
        channels = json.loads(CHANNELS_PATH.read_text(encoding="utf-8"))

        channel_ids = (
            "ch_11",
            "ch_11b",
            "ch_11c",
            "ch_23",
            "ch_23b",
            "ch_33",
            "ch_33b",
            "rd_88",
            "rd_bet",
            "rd_gimel",
            "rd_culture",
            "rd_music",
            "rd_moreshet",
            "rd_kankids",
            "rd_reka",
            "rd_makan",
        )

        for channel_id in channel_ids:
            with self.subTest(channel_id=channel_id):
                stream_url = channels[channel_id]["linkDetails"]["link"]
                self.assertNotIn("dvr", parse_qs(urlsplit(stream_url).query))


if __name__ == "__main__":
    unittest.main()
