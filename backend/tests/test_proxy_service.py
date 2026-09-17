import importlib
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.responses import Response


class _UpstreamResponse:
    def __init__(self, url, content=b"segment", status_code=200, content_length=None):
        self.url = url
        self.content = content
        self.status_code = status_code
        self.closed = False
        self.headers = {"content-type": "video/mp4"}
        if content_length is not None:
            self.headers["Content-Length"] = str(content_length)

    def close(self):
        self.closed = True


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

    def test_buffered_segment_retries_an_empty_success_response(self):
        url = (
            "https://n-121-13.il.cdn-redge.media/webcache/gorigin/hls/oil/"
            "kancdn/vod/123/LIBCODER_SMOOTH_1080_KAN/Manifest.ism/fragment.mp4"
        )
        empty = _UpstreamResponse(url, content=b"", content_length=7)
        complete = _UpstreamResponse(url, content=b"segment", content_length=7)

        with patch.object(self.module.session, "get", return_value=complete) as retry:
            response = self.module._buffered_segment_response(
                url,
                {},
                empty,
                "video/mp4",
                retries=2,
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.body, b"segment")
        self.assertTrue(empty.closed)
        retry.assert_called_once()

    def test_browser_kan_vod_segment_uses_buffered_response(self):
        url = (
            "https://n-121-13.il.cdn-redge.media/webcache/gorigin/hls/oil/"
            "kancdn/vod/123/LIBCODER_SMOOTH_1080_KAN/Manifest.ism/fragment.mp4"
        )
        upstream = _UpstreamResponse(url)
        expected = Response(content=b"buffered", media_type="video/mp4")
        request = SimpleNamespace(headers={}, method="GET", query_params={})

        with patch.object(self.module.session, "get", return_value=upstream), patch.object(
            self.module,
            "_buffered_segment_response",
            return_value=expected,
        ) as buffered:
            response = self.module.handle_proxy(
                request,
                url,
                "https://www.kan.org.il/",
                cast=False,
            )

        self.assertIs(response, expected)
        buffered.assert_called_once()


if __name__ == "__main__":
    unittest.main()
