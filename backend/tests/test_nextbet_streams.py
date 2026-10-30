import asyncio
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import requests
from fastapi import HTTPException
from starlette.requests import Request

from services import nextbet_stream_service as source
from services import proxy_service as proxy
from services.custom_channel_service import get_custom_channel, load_custom_channels, merge_custom_channels
from services.stream_service import get_custom_channel_stream


class NextbetStreamsTests(unittest.TestCase):
    def test_catalog_adds_all_source_channels_without_replacing_existing_sport5(self):
        original = {"channelID": "ch_sport5", "name": "Existing sport channel"}
        merged = merge_custom_channels([original])
        self.assertEqual(next(c for c in merged if c["channelID"] == "ch_sport5")["name"], original["name"])
        channels = [c for c in merged if c.get("streamProvider") == "nextbet"]
        self.assertEqual(len(channels), 14)
        self.assertEqual({c["streamSlug"] for c in channels}, source.CHANNEL_SLUGS)
        for channel in channels:
            self.assertEqual(channel["linkDetails"]["referer"], source.SITE_URL)
            self.assertNotIn("streamUrl", channel)
        for number in range(1, 5):
            channel = next(c for c in channels if c["streamSlug"] == f"yes-{number}")
            self.assertEqual(channel["name"], f"ספורט {number}")

    def test_new_channels_have_separate_guide_rows_from_existing_channels(self):
        backend = Path(__file__).resolve().parents[1]
        builtin = json.loads((backend / "plugin_video_idanplus/resources/channels.json").read_text())
        custom = json.loads((backend / "data/custom_channels.json").read_text())
        added_ids = {c["channelID"] for c in custom if c.get("streamProvider") == "nextbet"}
        existing_indices = {
            c["index"] for c in [*builtin.values(), *custom]
            if c.get("type") == "tv" and c.get("channelID", c.get("id")) not in added_ids
            and "index" in c
        }
        added = [c for c in custom if c.get("channelID") in added_ids]
        # The web guide groups sources by index; each new channel needs its own row.
        self.assertEqual(len({c["index"] for c in added}), 14)
        for channel in added:
            self.assertNotIn(channel["index"], existing_indices)

    def test_all_channel_logos_are_local_with_documented_sources(self):
        root = Path(__file__).resolve().parents[2]
        sources = json.loads((root / "frontend/docs/channel-logo-sources.json").read_text())
        source_by_id = {item["channelID"]: item for item in sources}
        for channel in load_custom_channels():
            if channel.get("streamProvider") != "nextbet":
                continue
            logo = channel["logo"]
            self.assertEqual(channel["image"], logo)
            self.assertNotIn("/", logo)
            self.assertTrue((root / "frontend/public/ch" / logo).is_file(), logo)
            self.assertEqual(source_by_id[channel["channelID"]]["logo"], logo)
            self.assertGreaterEqual(min(source_by_id[channel["channelID"]]["dimensions"]), 200)

    @patch.object(source.session, "get")
    def test_every_catalog_slug_is_supported_by_the_resolver(self, get):
        response = get.return_value.__enter__.return_value
        response.json.return_value = {"ok": True, "stream": "https://cdn.example/mono.css?token=fresh"}
        for channel in load_custom_channels():
            if channel.get("streamProvider") != "nextbet":
                continue
            with self.subTest(slug=channel["streamSlug"]):
                self.assertTrue(get_custom_channel_stream(channel).startswith("https://"))
                self.assertEqual(get.call_args.kwargs["params"]["stream"], channel["streamSlug"])

    @patch.object(source.session, "get")
    def test_resolves_fresh_token_for_every_playback(self, get):
        response = get.return_value.__enter__.return_value
        response.json.side_effect = [
            {"ok": True, "stream": "https://cdn.example/mono.css?token=first"},
            {"ok": True, "stream": "https://cdn.example/mono.css?token=second"},
        ]
        channel = get_custom_channel("ch_sport5_live")
        self.assertIn("token=first", get_custom_channel_stream(channel))
        self.assertIn("token=second", get_custom_channel_stream(channel))
        self.assertEqual(get.call_count, 2)
        self.assertEqual(get.call_args.kwargs["params"]["stream"], "yes-5")
        self.assertEqual(get.call_args.kwargs["headers"]["User-Agent"], "curl/8.7.1")

    @patch.object(source.session, "get")
    def test_unavailable_and_invalid_streams_return_gateway_error(self, get):
        for payload in [{"ok": False}, {"ok": True, "stream": "file:///etc/passwd"}, [], {"ok": True}]:
            with self.subTest(payload=payload):
                get.return_value.__enter__.return_value.json.return_value = payload
                with self.assertRaises(HTTPException) as raised:
                    source.resolve_stream("yes-5")
                self.assertEqual(raised.exception.status_code, 502)
        get.side_effect = requests.Timeout()
        with self.assertRaises(HTTPException) as raised:
            source.resolve_stream("sport-5-max")
        self.assertEqual(raised.exception.status_code, 502)

    def test_kan_keeps_existing_sources_without_duplicate_new_channel(self):
        backend = Path(__file__).resolve().parents[1]
        builtin = json.loads((backend / "plugin_video_idanplus/resources/channels.json").read_text())
        original = [{**data, "id": channel_id, "channelID": channel_id} for channel_id, data in builtin.items()]
        channels = merge_custom_channels(original)
        sources = [c for c in channels if c.get("index") == 1 and c.get("type") == "tv"]
        self.assertEqual({c["channelID"] for c in sources}, {"ch_11", "ch_11b", "ch_11c", "ch_11d"})
        self.assertFalse(any(c.get("channelID") == "ch_nextbet_kan11" for c in channels))
        self.assertNotIn("kan-11", source.CHANNEL_SLUGS)
        self.assertEqual(next(c for c in sources if c["channelID"] == "ch_11")["logo"], "kan11.png")

    @patch.object(proxy.session, "get")
    def test_resolved_referer_overrides_catalog_for_manifest_and_segments(self, get):
        url = "https://kan.example/live.m3u8|Referer=https%3A%2F%2Fwww.kan.org.il%2F&User-Agent=Mozilla%2F5.0"
        get.return_value = self.upstream("https://kan.example/live.m3u8", b"#EXTM3U\n#EXTINF:6,\nchunk.ts\n", "application/vnd.apple.mpegurl")
        response = proxy.handle_proxy(self.request(), url, source.SITE_URL)
        headers = get.call_args.kwargs["headers"]
        self.assertEqual(headers["Referer"], "https://www.kan.org.il/")
        self.assertEqual(headers["Origin"], "https://kan.example")
        self.assertEqual(get.call_args.args[0], "https://kan.example/live.m3u8")
        segment = next(line for line in response.body.decode().splitlines() if line.startswith("https:"))
        self.assertEqual(parse_qs(urlparse(segment).query)["referer"], ["https://www.kan.org.il/"])

    def request(self, method="GET"):
        return Request({"type": "http", "method": method, "scheme": "https", "server": ("tv.example", 443),
                        "path": "/api/stream", "root_path": "/api", "query_string": b"",
                        "headers": [(b"host", b"tv.example"), (b"user-agent", b"Some TV Player")]})

    def upstream(self, url, body, content_type):
        response = requests.Response()
        response.status_code = 200
        response.url = url
        response.headers["content-type"] = content_type
        response._content = body
        response._content_consumed = True
        return response

    @patch.object(proxy.session, "get")
    def test_css_manifest_is_refreshed_and_segments_keep_source_referer(self, get):
        url = "https://cdn.example/mono.css?token=signed&_=old"
        get.return_value = self.upstream(url, b"#EXTM3U\n#EXTINF:6,\nhttps://media.example/chunk.jpeg\n", "text/css")
        response = proxy.handle_proxy(self.request(), url, source.SITE_URL)
        self.assertEqual(response.status_code, 200)
        self.assertIn("mpegurl", response.media_type)
        sent_url = get.call_args.args[0]
        self.assertEqual(parse_qs(urlparse(sent_url).query)["token"], ["signed"])
        self.assertNotEqual(parse_qs(urlparse(sent_url).query)["_"], ["old"])
        headers = get.call_args.kwargs["headers"]
        self.assertEqual(headers["Origin"], source.SITE_URL.rstrip("/"))
        self.assertEqual(headers["User-Agent"], "Mozilla/5.0")
        segment = next(line for line in response.body.decode().splitlines() if line.startswith("https:"))
        query = parse_qs(urlparse(segment).query)
        self.assertEqual(query["url"], ["https://media.example/chunk.jpeg"])
        self.assertEqual(query["referer"], [source.SITE_URL])

    @patch.object(proxy.session, "get")
    def test_jpeg_segments_are_streamed_as_binary_video_for_get_and_head(self, get):
        body = b"\x47\xff\x00\x80" * 188
        for method in ["GET", "HEAD"]:
            with self.subTest(method=method):
                get.return_value = self.upstream("https://media.example/chunk.jpeg", body, "image/jpeg")
                response = proxy.handle_proxy(self.request(method), get.return_value.url, source.SITE_URL)
                self.assertEqual(response.media_type, "video/mp2t")
                if method == "GET":
                    async def collect():
                        return b"".join([part async for part in response.body_iterator])
                    self.assertEqual(asyncio.run(collect()), body)

    @patch.object(proxy.session, "get")
    def test_unrelated_proxy_requests_keep_existing_headers_and_urls(self, get):
        url = "https://other.example/file.css"
        get.return_value = self.upstream(url, b"plain CSS", "text/css")
        response = proxy.handle_proxy(self.request(), url, "https://other.example/")
        self.assertEqual(get.call_args.args[0], url)
        self.assertEqual(get.call_args.kwargs["headers"]["User-Agent"], "Some TV Player")
        self.assertEqual(response.media_type, "text/css")


if __name__ == "__main__":
    unittest.main()
