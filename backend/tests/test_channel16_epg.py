import json
import tempfile
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import patch

from epg_parsers.channel16 import CHANNEL16_ID, parse_channel16_epg
from services.epg_storage import load_channel_programs


def program():
    start = int(datetime(2026, 11, 3, 8, tzinfo=timezone.utc).timestamp())
    return {"start": start, "end": start + 3600, "name": "פוקוס", "description": "תוכנית אירוח מלאה", "image": "https://fykswkmjb.filerobot.com/test.jpg"}


class Channel16EPGTests(unittest.TestCase):
    @patch('epg_parsers.channel16.fetch_yes_schedule')
    def test_official_mapping_and_duplicate_days_keep_description_image_and_exact_times(self, fetch):
        fetch.return_value = [program()]
        self.assertEqual(parse_channel16_epg(today=date(2026, 11, 3)), [program()])
        self.assertEqual(fetch.call_count, 7)
        self.assertEqual(fetch.call_args_list[0].args, ('CN66', date(2026, 11, 3)))

    @patch('parse_epg.enrich_programs_with_vod', side_effect=lambda channel, rows: rows)
    @patch('parse_epg.parse_channel16_epg')
    def test_cli_persists_metadata_and_keeps_it_when_next_import_is_empty(self, parse, enrich):
        import parse_epg
        with tempfile.TemporaryDirectory() as directory:
            args=['parse_epg.py', '--channel16-only', '--output-dir', str(Path(directory)/'epg')]
            for rows in [[program()], []]:
                parse.return_value = rows
                with patch('sys.argv', args):parse_epg.main()
            self.assertEqual(load_channel_programs(CHANNEL16_ID, Path(directory)/'epg.sqlite'), [program()])

    def test_existing_catalog_channel_is_a_supported_epg_channel(self):
        from parse_epg import FORMAL_EPG_CHANNEL_IDS
        data=json.loads((Path(__file__).resolve().parents[1]/'data/custom_channels.json').read_text())
        channel=next(row for row in data if row.get('id')=='ch_16tv')
        self.assertEqual(channel['tvgID'], CHANNEL16_ID)
        self.assertIn(CHANNEL16_ID, FORMAL_EPG_CHANNEL_IDS)
