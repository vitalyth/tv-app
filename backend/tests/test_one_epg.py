import json
import tempfile
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from epg_parsers.one import ONE_CHANNELS, parse_one_epg, parse_one_epgs
from epg_parsers.yes import parse_yes_schedule
from services.epg_storage import load_channel_programs, upsert_channel_programs


def program(day=2):
    start = int(datetime(2026, 11, day, 18, tzinfo=timezone.utc).timestamp())
    return {'start': start, 'end': start + 7200, 'name': 'משחק', 'description': 'ישיר'}


class OneEPGTests(unittest.TestCase):
    @patch('epg_parsers.one.fetch_yes_schedule')
    def test_both_channel_ids_round_robin_and_seven_days(self, fetch):
        fetch.side_effect = lambda channel, day: [program(day.day)]
        schedules = parse_one_epgs(today=date(2026, 11, 2))
        self.assertEqual(ONE_CHANNELS, {'one1': 'TR01', 'one2': 'CH58'})
        self.assertEqual([c.args for c in fetch.call_args_list[:2]], [('TR01', date(2026, 11, 2)), ('CH58', date(2026, 11, 2))])
        self.assertEqual(fetch.call_count, 14)
        self.assertEqual([len(rows) for rows in schedules.values()], [7, 7])

    @patch('epg_parsers.one.fetch_yes_schedule')
    def test_spillover_and_duplicate_days_keep_exact_ends_and_exclude_outside_window(self, fetch):
        rows = [program(), program(3), program(5)]
        fetch.return_value = rows
        schedules = parse_one_epgs(['one1'], today=date(2026, 11, 2), days=2)
        self.assertEqual(schedules['one1'], rows[:2])

    @patch('epg_parsers.one.fetch_yes_schedule')
    def test_failed_day_does_not_stop_other_channels_or_future_days(self, fetch):
        fetch.side_effect = [URLError('unavailable'), [program()], [program(3)], []]
        schedules = parse_one_epgs(today=date(2026, 11, 2), days=2)
        self.assertEqual(schedules, {'one1': [program(3)], 'one2': [program()]})

    @patch('epg_parsers.one.fetch_yes_schedule')
    def test_provider_limit_stops_requests_and_preserves_partial_results(self, fetch):
        fetch.side_effect = [[program()], HTTPError('url', 429, 'limited', {}, None)]
        schedules = parse_one_epgs(today=date(2026, 11, 2))
        self.assertEqual(fetch.call_count, 2)
        self.assertEqual(schedules, {'one1': [program()], 'one2': []})

    def test_shared_yes_parser_channel_scope_utc_live_label_and_image(self):
        row = {'channelId': 'TR01', 'title': 'כדורגל (ישיר)', 'description': 'ספרד',
               'starts': '2026-11-02T18:00:00Z', 'ends': '2026-11-02T20:00:00Z', 'imageUrl': 'https://example.com/image.jpg'}
        rows = parse_yes_schedule({'items': [row, {**row, 'channelId': 'CH58'}, {**row, 'ends': 'invalid'}]}, 'TR01')
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['start'], program()['start'])
        self.assertEqual(rows[0]['end'], program()['end'])
        self.assertIn('ישיר', rows[0]['description'])
        self.assertEqual(rows[0]['image'], row['imageUrl'])

    @patch('epg_parsers.one.fetch_yes_schedule', return_value=[])
    def test_single_channel_failure_is_explicit(self, fetch):
        with self.assertRaises(RuntimeError):
            parse_one_epg('one1')

    @patch('parse_epg.enrich_programs_with_vod', side_effect=lambda channel, rows: rows)
    @patch('parse_epg.parse_one_epgs')
    def test_dedicated_cli_preserves_cache_when_a_channel_is_empty(self, parse, enrich):
        import parse_epg
        with tempfile.TemporaryDirectory() as directory:
            db = Path(directory) / 'epg.sqlite'
            upsert_channel_programs('one2', [program()], db)
            parse.return_value = {'one1': [program()], 'one2': []}
            with patch('sys.argv', ['parse_epg.py', '--one-only', '--output-dir', str(Path(directory) / 'epg')]):
                parse_epg.main()
            self.assertEqual(len(load_channel_programs('one1', db)), 1)
            self.assertEqual(len(load_channel_programs('one2', db)), 1)

    def test_catalog_is_wired_to_parser_ids(self):
        catalog = json.loads((Path(__file__).resolve().parents[1] / 'data/custom_channels.json').read_text())
        for channel_id in ONE_CHANNELS:
            channel = next(row for row in catalog if row.get('id') == 'ch_' + channel_id)
            self.assertEqual(channel['tvgID'], channel_id)
