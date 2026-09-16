import importlib
import unittest


class ProxyServiceTests(unittest.TestCase):
    def setUp(self):
        self.module = importlib.import_module("services.proxy_service")

    def test_mako_akamai_proxy_origin_uses_mako_referer_origin(self):
        self.assertEqual(
            self.module._origin_for_proxy_request(
                "https://mako-vod.akamaized.net/i/VOD/KESHET/show/index_2200.m3u8",
                "https://www.mako.co.il/",
            ),
            "https://www.mako.co.il",
        )

    def test_proxy_origin_defaults_to_source_origin(self):
        self.assertEqual(
            self.module._origin_for_proxy_request(
                "https://cdn.example/video/index.m3u8",
                "https://www.mako.co.il/",
            ),
            "https://cdn.example",
        )

    def test_mako_akamai_proxy_headers_use_browser_identity(self):
        headers = {
            "User-Agent": "ExoPlayerLib/2.19.1",
            "Accept": "*/*",
            "Origin": "https://mako-vod.akamaized.net",
            "Referer": "https://mako-vod.akamaized.net/",
        }

        self.module._apply_mako_vod_headers(headers, "https://www.mako.co.il/")

        self.assertIn("Chrome/", headers["User-Agent"])
        self.assertIn("mpegurl", headers["Accept"].lower())
        self.assertEqual(headers["Origin"], "https://www.mako.co.il")
        self.assertEqual(headers["Referer"], "https://www.mako.co.il/")


if __name__ == "__main__":
    unittest.main()
