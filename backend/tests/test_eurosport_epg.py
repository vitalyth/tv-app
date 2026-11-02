import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

from epg_parsers.eurosport import EUROSPORT_CHANNELS, parse_eurosport_epgs
from services.epg_storage import load_channel_programs, upsert_channel_programs
from test_one_epg import program


class EurosportEPGTests(unittest.TestCase):
    @patch('epg_parsers.eurosport.fetch_yes_schedule')
    def test_mapping_and_unpublished_days_do_not_invent_programs(self, fetch):
        def schedule(channel, day):
            return [] if channel == 'CH33' and day.day >= 7 else [program(day.day)]
        fetch.side_effect = schedule
        result = parse_eurosport_epgs(today=date(2026, 11, 2))
        self.assertEqual(EUROSPORT_CHANNELS, {'eurosport1': 'PT39', 'eurosport2': 'CH33'})
        self.assertEqual([c.args for c in fetch.call_args_list[:2]], [('PT39', date(2026, 11, 2)), ('CH33', date(2026, 11, 2))])
        self.assertEqual(result['eurosport1'], [program(day) for day in range(2, 9)])
        self.assertEqual(result['eurosport2'], [program(day) for day in range(2, 7)])

    @patch('parse_epg.enrich_programs_with_vod', side_effect=lambda channel, rows: rows)
    @patch('parse_epg.parse_eurosport_epgs')
    def test_dedicated_import_keeps_cached_channel_on_empty_response(self, parse, enrich):
        import parse_epg
        with tempfile.TemporaryDirectory() as directory:
            db = Path(directory) / 'epg.sqlite'
            upsert_channel_programs('eurosport2', [program()], db)
            parse.return_value = {'eurosport1': [program()], 'eurosport2': []}
            with patch('sys.argv', ['parse_epg.py', '--eurosport-only', '--output-dir', str(Path(directory) / 'epg')]):
                parse_epg.main()
            for channel in EUROSPORT_CHANNELS:
                self.assertEqual(len(load_channel_programs(channel, db)), 1)

    def test_catalog_links_both_existing_channels(self):
        catalog = json.loads((Path(__file__).resolve().parents[1] / 'data/custom_channels.json').read_text())
        for channel in EUROSPORT_CHANNELS:
            row = next(row for row in catalog if row.get('id') == 'ch_' + channel)
            self.assertEqual(row['tvgID'], channel)
