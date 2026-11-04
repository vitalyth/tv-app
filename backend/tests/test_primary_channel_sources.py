import copy
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from services.custom_channel_service import get_custom_channel, load_custom_channels, merge_custom_channels
from services.stream_service import get_stream


class PrimaryChannelSourcesTests(unittest.TestCase):
    def setUp(self):
        self.original = {
            "id": "channel", "channelID": "channel", "index": 1, "type": "tv",
            "name": "Channel", "channelNumber": "11", "module": "kan", "mode": 10,
            "tvgID": "11", "logo": "kan11.png", "orderNumber": 40,
            "linkDetails": {"link": "https://old.example/live.m3u8"},
        }
        self.config = {
            "id": "channel", "channelID": "channel", "orderNumber": 40,
            "primarySource": {"streamUrl": "https://new.example/live.m3u8",
                              "linkDetails": {"vpn": True, "manifest_type": "hls"}},
        }
        self.loader = patch("services.custom_channel_service.load_custom_channels", return_value=[self.config])
        self.loader.start()
        self.addCleanup(self.loader.stop)

    def test_primary_keeps_identity_guide_and_number_and_previous_remains_selectable(self):
        original = copy.deepcopy(self.original)
        primary, previous = merge_custom_channels([original])
        for key in ("id", "channelID", "index", "channelNumber", "tvgID", "logo", "orderNumber"):
            self.assertEqual(primary[key], original[key])
        self.assertEqual(primary["module"], "custom")
        self.assertEqual(primary["linkDetails"]["link"], self.config["primarySource"]["streamUrl"])
        self.assertTrue(primary["linkDetails"]["vpn"])
        self.assertEqual(previous["sourceChannelID"], "channel")
        self.assertEqual(previous["module"], "kan")
        self.assertEqual(previous["name"], "Channel - גיבוי 1")
        self.assertEqual(previous["linkDetails"], original["linkDetails"])
        self.assertEqual(original, self.original)
        self.assertEqual(merge_custom_channels([primary, previous]), [primary, previous])

    def test_already_present_source_is_promoted_without_duplicate(self):
        alternate = {**self.original, "id": "alternate", "channelID": "alternate", "orderNumber": 50,
                     "linkDetails": {"link": self.config["primarySource"]["streamUrl"]}}
        result = merge_custom_channels([self.original, alternate])
        self.assertEqual([c["channelID"] for c in result], ["channel", "channel_previous"])
        links = [c["linkDetails"]["link"] for c in result]
        self.assertEqual(len(links), len(set(links)))

    def test_existing_master_or_quality_variant_is_not_added_twice(self):
        channel = {**self.original, "linkDetails": {
            "link": self.config["primarySource"]["streamUrl"] + "?bitrate=928000&audioId=1&videoId=12"}}
        self.assertEqual(len(merge_custom_channels([channel])), 1)

    def test_existing_previous_source_is_reused(self):
        alternate = {**self.original, "id": "backup", "channelID": "backup", "orderNumber": 50}
        result = merge_custom_channels([self.original, alternate])
        self.assertEqual([c["channelID"] for c in result], ["channel", "backup"])

    def test_backup_names_are_numbered_in_display_order(self):
        alternates = [{**self.original, "id": f"backup_{i}", "channelID": f"backup_{i}",
                       "name": f"Old name {i}", "orderNumber": 50 + i,
                       "linkDetails": {"link": f"https://backup{i}.example/live.m3u8"}}
                      for i in range(2)]
        result = merge_custom_channels([self.original, *alternates])
        self.assertEqual([channel["name"] for channel in result],
                         ["Channel", "Channel - גיבוי 1", "Channel - גיבוי 2", "Channel - גיבוי 3"])
        self.assertEqual(merge_custom_channels(result), result)

    def test_preference_does_not_resurrect_hidden_channel(self):
        self.assertEqual(merge_custom_channels([]), [])

    @patch("services.stream_service.__import__", create=True)
    @patch("services.stream_service.xbmcplugin.clearStream")
    @patch("services.stream_service.xbmcplugin.getStream", return_value="https://old.example/resolved.m3u8")
    def test_previous_addon_source_resolves_using_its_original_channel_id(self, stream, clear, import_module):
        previous = merge_custom_channels([self.original])[1]
        module = SimpleNamespace(Run=Mock())
        import_module.return_value = module
        self.assertEqual(get_stream(SimpleNamespace(**previous)), "https://old.example/resolved.m3u8")
        module.Run.assert_called_once_with(previous["name"], "channel", 10, "", "1")

    @patch("services.stream_service.resolve_nextbet_stream")
    def test_primary_precedes_provider_and_previous_provider_still_refreshes_tokens(self, resolver):
        self.config.update(streamProvider="nextbet", streamSlug="old-channel")
        self.assertEqual(get_stream(SimpleNamespace(channelID="channel")),
                         self.config["primarySource"]["streamUrl"])
        resolver.assert_not_called()
        resolver.return_value = "https://old.example/fresh-token.m3u8"
        self.assertEqual(get_stream(SimpleNamespace(channelID="channel_previous")), resolver.return_value)
        resolver.assert_called_once_with("old-channel")
        self.assertNotIn("primarySource", get_custom_channel("channel_previous"))


class PrimarySourceCatalogTests(unittest.TestCase):
    def test_all_sixteen_sources_are_unique_primary_without_new_logical_channels(self):
        root = Path(__file__).resolve().parents[1]
        catalog = json.loads((root / "plugin_video_idanplus/resources/channels.json").read_text())
        upstream = [{**c, "channelID": key} for key, c in catalog.items() if c.get("type") == "tv"]
        configs = load_custom_channels()
        preferences = [c for c in configs if c.get("primarySource")]
        self.assertEqual(len(preferences), 16)
        with patch("services.custom_channel_service.load_custom_channels", return_value=[
                {key: value for key, value in c.items() if key != "primarySource"} for c in configs]):
            baseline = merge_custom_channels(upstream)
        merged = merge_custom_channels(upstream)
        self.assertEqual({(c["index"], c.get("channelNumber")) for c in merged},
                         {(c["index"], c.get("channelNumber")) for c in baseline})
        for config in preferences:
            primary = next(c for c in merged if c["channelID"] == config["channelID"])
            group = [c for c in merged if c["index"] == primary["index"]
                     and c.get("channelNumber") == primary.get("channelNumber")]
            self.assertEqual(group[0]["channelID"], primary["channelID"])
            url = config["primarySource"]["streamUrl"]
            self.assertEqual(sum(c.get("linkDetails", {}).get("link") == url for c in group), 1)
            self.assertEqual(primary["streamUrl"], url)
            self.assertTrue(primary["linkDetails"]["vpn"])
            self.assertEqual([c["name"] for c in group[1:]],
                             [f"{primary['name']} - גיבוי {i}" for i in range(1, len(group))])
        self.assertEqual(merge_custom_channels(merged), merged)


if __name__ == "__main__":
    unittest.main()
