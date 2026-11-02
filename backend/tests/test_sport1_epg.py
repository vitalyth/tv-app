import json
import tempfile
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

from epg_parsers.sport1 import SPORT1_CHANNELS, fetch_schedule, parse_schedule_html, parse_sport1_epgs
from services.epg_storage import load_channel_programs, upsert_channel_programs


def page(channel, day, *times):
    rows = ''.join(f'<div class="show-container"><p class="show-starting-time">{time}</p>'
                   '<p class="show-name">משחק &amp; שידור</p><p class="show-description">ליגה</p>'
                   '<p class="show-status">עכשיו</p><p class="show-second-status">ישיר</p></div>' for time in times)
    return f'<div id="channel-{SPORT1_CHANNELS[channel]}-container"><div class="shows-container-for-{day}">{rows}</div></div>'


class Sport1EPGTests(unittest.TestCase):
    def test_exact_channel_and_date_scope_and_israel_time(self):
        day = date(2026, 11, 2)
        html = page('sport2', day, '01:00') + page('sport1', day, '19:25', '25:00') + page('sport1', '2026-11-03', '01:00')
        rows = parse_schedule_html(html, 'sport1', day)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['start'], int(datetime(2026, 11, 2, 17, 25, tzinfo=timezone.utc).timestamp()))
        self.assertEqual(rows[0]['name'], 'משחק & שידור')
        self.assertEqual(rows[0]['description'], 'ליגה\nישיר')

    def test_now_is_not_live_and_summer_time_is_respected(self):
        day = date(2026, 7, 2)
        rows = parse_schedule_html(page('sport1', day, '19:25').replace('ישיר', ''), 'sport1', day)
        self.assertEqual(rows[0]['description'], 'ליגה')
        self.assertEqual(rows[0]['start'], int(datetime(2026, 7, 2, 16, 25, tzinfo=timezone.utc).timestamp()))

    def test_empty_schedule_is_valid_but_wrong_channel_or_challenge_is_not(self):
        day = date(2026, 11, 2)
        self.assertEqual(parse_schedule_html(page('sport1', day), 'sport1', day), [])
        for html in ['<html>Access denied</html>', page('sport2', day, '12:00'), page('sport1', '2026-11-03', '12:00')]:
            with self.assertRaises(ValueError):
                parse_schedule_html(html, 'sport1', day)

    @patch('epg_parsers.sport1.fetch_schedule')
    def test_round_robin_mapping_midnight_and_boundary(self, fetch):
        day = date(2026, 11, 2)
        fetch.side_effect = lambda channel, day: page(channel, day, '00:20', '23:20')
        schedules = parse_sport1_epgs(today=day, days=1)
        self.assertEqual(SPORT1_CHANNELS, {'sport1': 2, 'sport2': 3, 'sport3': 4, 'sport4': 5})
        self.assertEqual([call.args for call in fetch.call_args_list[:4]], [(channel, day) for channel in SPORT1_CHANNELS])
        for programs in schedules.values():
            self.assertEqual(len(programs), 2)
            self.assertEqual(programs[-1]['end'] - programs[-1]['start'], 3600)

    @patch('epg_parsers.sport1.fetch_schedule')
    def test_unpublished_next_day_does_not_invent_program_end(self, fetch):
        fetch.side_effect = lambda channel, day: page(channel, day, *(['12:00', '13:00'] if day.day == 2 else []))
        schedules = parse_sport1_epgs(['sport1'], today=date(2026, 11, 2), days=1)
        self.assertEqual(len(schedules['sport1']), 1)

    @patch('epg_parsers.sport1.fetch_schedule')
    def test_rate_limit_stops_batch(self, fetch):
        fetch.side_effect = HTTPError('url', 429, 'limited', {}, None)
        self.assertEqual(parse_sport1_epgs(days=7), dict.fromkeys(SPORT1_CHANNELS, []))
        self.assertEqual(fetch.call_count, 1)

    @patch('epg_parsers.sport1.clock.sleep')
    @patch('epg_parsers.sport1.urlopen')
    def test_api_returns_json_encoded_html_using_official_channel_id(self, request, sleep):
        request.return_value.__enter__.return_value.read.return_value = json.dumps('<div>schedule</div>').encode()
        self.assertEqual(fetch_schedule('sport4', date(2026, 11, 2)), '<div>schedule</div>')
        self.assertTrue(request.call_args.args[0].full_url.endswith('/day/2026-11-02/channel/5'))

    @patch('parse_epg.enrich_programs_with_vod', side_effect=lambda channel, programs: programs)
    @patch('parse_epg.parse_sport1_epgs')
    def test_cli_saves_four_channels_and_retains_cache_on_failure(self, parse, enrich):
        import parse_epg
        rows = [{'start': 1000, 'end': 2000, 'name': 'משחק', 'description': 'ישיר'}]
        with tempfile.TemporaryDirectory() as directory:
            db = Path(directory) / 'epg.sqlite'
            upsert_channel_programs('sport4', rows, db)
            parse.return_value = {channel: rows if channel != 'sport4' else [] for channel in SPORT1_CHANNELS}
            with patch('sys.argv', ['parse_epg.py', '--sport1-only', '--output-dir', str(Path(directory) / 'epg')]):
                parse_epg.main()
            for channel in SPORT1_CHANNELS:
                self.assertEqual(len(load_channel_programs(channel, db)), 1)
