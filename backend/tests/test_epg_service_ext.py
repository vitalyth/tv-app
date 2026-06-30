import unittest
from xml.etree import ElementTree

from services.epg_service_ext import EPGService


class EPGServiceTests(unittest.TestCase):
    def test_xml_uses_loaded_guide_programs(self):
        calls = []

        def load_epg():
            calls.append("load")
            return {
                "12": [
                    {
                        "start": 1_700_000_000,
                        "end": 1_700_001_800,
                        "name": 'News & "Updates"',
                        "description": "Guide <source>",
                        "image": "https://example.com/program.jpg",
                    }
                ]
            }

        service = EPGService(ttl_seconds=3600, data_loader=load_epg)

        first_xml = service.get_epg_xml()
        second_xml = service.get_epg_xml()
        root = ElementTree.fromstring(first_xml)
        programme = root.find("./programme")

        self.assertEqual(["load"], calls)
        self.assertEqual(first_xml, second_xml)
        self.assertEqual("12", root.findtext("./channel/display-name"))
        self.assertEqual("12", programme.attrib["channel"])
        self.assertEqual("20231114221320 +0000", programme.attrib["start"])
        self.assertEqual("News & \"Updates\"", programme.findtext("./title"))
        self.assertEqual("Guide <source>", programme.findtext("./desc"))
        self.assertEqual("https://example.com/program.jpg", programme.find("./icon").attrib["src"])


if __name__ == "__main__":
    unittest.main()
