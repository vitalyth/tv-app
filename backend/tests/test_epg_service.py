import json
import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

from services import epg_service
from services.epg_storage import upsert_all_epg, upsert_channel_programs


class EPGServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'epg.sqlite'
        self.db_patch = patch.object(epg_service, 'FALLBACK_EPG_DB', self.path)
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)
        upsert_all_epg({'sport5': [
            {'start': 0, 'end': 100, 'name': 'History'},
            {'start': 100, 'end': 200, 'name': 'Live', 'hasVod': True,
             'vodProgramLink': '/vod/live', 'vodMatch': {'episode': {'id': 'episode'}}},
            {'start': 200, 'end': 300, 'name': 'Next'},
            {'start': 300, 'end': 400, 'name': 'Future'},
        ]}, self.path)

    def test_time_window_is_filtered_before_decoding_history(self):
        # A corrupt historical record proves out-of-window JSON isn't even read.
        with sqlite3.connect(self.path) as connection:
            connection.execute("UPDATE epg_programs SET data = 'invalid-json' WHERE start = 0")
        result = epg_service.get_now_epg(start=100, end=300)
        self.assertEqual([p['name'] for p in result['sport5']], ['Live', 'Next'])
        self.assertEqual(result['sport5'][0]['vodLink'], '/vod/live')

    def test_overlapping_window_boundaries_and_search(self):
        result = epg_service.get_now_epg(start=150, end=250)
        self.assertEqual([p['name'] for p in result['sport5']], ['Live', 'Next'])
        result = epg_service.get_now_epg(start=100, end=300, query='  next  ')
        self.assertEqual([p['name'] for p in result['sport5']], ['Next'])
        self.assertEqual(epg_service.get_now_epg(start=500, end=600), {})

    @patch.object(epg_service.time, 'time', return_value=20000)
    def test_live_channels_default_window_is_passed_to_sqlite(self, _clock):
        with patch.object(epg_service, '_load_fallback_epg', return_value={}) as loader:
            epg_service.get_now_epg()
        loader.assert_called_once_with(start=9200, end=63200, query=None)

    def test_new_imports_are_visible_and_response_mutations_do_not_leak(self):
        first = epg_service.get_now_epg(start=100, end=300)
        first['sport5'][0]['vodMatch']['episode']['id'] = 'changed'
        second = epg_service.get_now_epg(start=100, end=300)
        self.assertEqual(second['sport5'][0]['vodMatch']['episode']['id'], 'episode')
        upsert_channel_programs('sport5', [{'start': 200, 'end': 300, 'name': 'Updated'}], self.path)
        refreshed = epg_service.get_now_epg(start=100, end=300)
        self.assertEqual(refreshed['sport5'][-1]['name'], 'Updated')

    def test_legacy_overlap_resolution_does_not_return_out_of_window_fragments(self):
        with sqlite3.connect(self.path) as connection:
            for updated_at, program in enumerate([
                {'start': 150, 'end': 400, 'name': 'Older block'},
                {'start': 50, 'end': 300, 'name': 'Newer block'},
            ]):
                connection.execute(
                    'INSERT INTO epg_programs VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    ('legacy', program['start'], program['end'], program['name'],
                     '', '', json.dumps(program), updated_at),
                )
        result = epg_service.get_now_epg(start=100, end=200)
        self.assertEqual([p['name'] for p in result['legacy']], ['Newer block'])

    def test_simultaneous_different_windows_do_not_share_response_data(self):
        with ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(epg_service.get_now_epg, 100, 200)
            second = executor.submit(epg_service.get_now_epg, 200, 300)
        self.assertEqual([p['name'] for p in first.result()['sport5']], ['Live'])
        self.assertEqual([p['name'] for p in second.result()['sport5']], ['Next'])


if __name__ == '__main__':
    unittest.main()
