import json
import tempfile
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

from epg_parsers.sport5 import SPORT5_CHANNELS, parse_schedule_page, parse_sport5_epg
from services.epg_storage import load_channel_programs, upsert_channel_programs


def page(*rows):
    return "<table>" + "".join(
        f'<tr><td class="date"><div>{clock}</div><img alt="ישיר"></td>'
        f'<td><div class="spaceleft"></div></td><td class="text">{title}</td></tr>'
        for clock, title in rows
    ) + "</table>"


class Sport5EPGTests(unittest.TestCase):
    def test_parses_ajax_rows_and_ignores_unpublished_entries(self):
        html = page(("", ""), ("20:15", "  מכבי &amp; הפועל<br>יורוליג "), ("25:00", "bad"), ("21:00", ""))
        self.assertEqual(parse_schedule_page(html, date(2026, 10, 30)), [{
            "start": int(datetime(2026, 10, 30, 18, 15, tzinfo=timezone.utc).timestamp()),
            "name": "מכבי & הפועל יורוליג", "description": "",
        }])

    @patch("epg_parsers.sport5.fetch_schedule")
    def test_six_channels_use_their_own_tab_and_next_day_boundary(self, fetch):
        for channel_id, tab in SPORT5_CHANNELS.items():
            with self.subTest(channel=channel_id):
                fetch.reset_mock()
                fetch.side_effect = [page(("22:00", "משחק"), ("23:30", "סיכום")), page(("00:15", "חדשות"))]
                programs = parse_sport5_epg(channel_id, today=date(2026, 10, 30), days=1)
                self.assertEqual([p["name"] for p in programs], ["משחק", "סיכום"])
                self.assertEqual([p["end"] - p["start"] for p in programs], [5400, 2700])
                self.assertEqual(programs[0]["end"], programs[1]["start"])
                self.assertEqual(fetch.call_args_list[0].args, (tab, date(2026, 10, 30)))
                self.assertEqual(fetch.call_args_list[1].args, (tab, date(2026, 10, 31)))

    @patch("epg_parsers.sport5.fetch_schedule")
    def test_israel_dst_transition_uses_elapsed_time(self, fetch):
        fetch.side_effect = [page(("00:30", "טניס"), ("02:30", "כדורסל")), page(("00:00", "למחרת"))]
        programs = parse_sport5_epg("sport5", today=date(2026, 10, 25), days=1)
        self.assertEqual(programs[0]["end"] - programs[0]["start"], 3 * 3600)

    @patch("epg_parsers.sport5.fetch_schedule")
    def test_no_invented_end_time_when_last_program_has_no_successor(self, fetch):
        fetch.side_effect = [page(("22:00", "משחק")), '<div class="no-programs">יפורסם בהקדם</div>']
        self.assertEqual(parse_sport5_epg("sport5", today=date(2026, 10, 30), days=1), [])

    @patch("epg_parsers.sport5.fetch_schedule")
    def test_does_not_fill_a_missing_schedule_day_with_a_long_program(self, fetch):
        fetch.side_effect = [page(("20:00", "משחק")), page(), page(("21:00", "חדשות"))]
        self.assertEqual(parse_sport5_epg("sport5", today=date(2026, 10, 30), days=2), [])

    @patch("epg_parsers.sport5.fetch_schedule")
    def test_future_day_failure_does_not_discard_available_programs(self, fetch):
        fetch.side_effect = [page(("20:00", "משחק"), ("22:00", "סיכום")), RuntimeError("unpublished")]
        programs = parse_sport5_epg("sport5_max", today=date(2026, 10, 30), days=1)
        self.assertEqual([p["name"] for p in programs], ["משחק"])

    @patch("epg_parsers.sport5.fetch_schedule", side_effect=RuntimeError("unavailable"))
    def test_total_source_failure_is_reported(self, fetch):
        with self.assertRaises(RuntimeError):
            parse_sport5_epg("sport5", today=date(2026, 10, 30), days=1)

    @patch("epg_parsers.sport5.fetch_schedule")
    def test_stops_at_unpublished_future_day_instead_of_hammering_source(self, fetch):
        fetch.side_effect = [page(("20:00", "משחק"), ("22:00", "סיכום")), HTTPError("url", 500, "unpublished", {}, None)]
        programs = parse_sport5_epg("sport5", today=date(2026, 10, 30))
        self.assertEqual(len(programs), 1)
        self.assertEqual(fetch.call_count, 2)

    @patch("epg_parsers.sport5.fetch_schedule")
    def test_stops_after_rate_limit(self, fetch):
        fetch.side_effect = HTTPError("url", 403, "rate limited", {}, None)
        with self.assertRaises(RuntimeError):
            parse_sport5_epg("sport5", today=date(2026, 10, 30))
        self.assertEqual(fetch.call_count, 1)

    def test_rejects_challenge_and_error_pages(self):
        for html in ["<html>Incapsula</html>", "Bad gateway", ""]:
            with self.subTest(html=html), self.assertRaises(RuntimeError):
                parse_schedule_page(html, date(2026, 10, 30))

    def test_empty_import_preserves_existing_schedule_in_sqlite(self):
        with tempfile.TemporaryDirectory() as directory:
            db = Path(directory) / "epg.sqlite"
            programs = [{"start": 1000, "end": 2000, "name": "משחק", "description": ""}]
            upsert_channel_programs("sport5_max", programs, db)
            upsert_channel_programs("sport5_max", [], db)
            self.assertEqual(load_channel_programs("sport5_max", db), programs)

    def test_catalog_connects_every_linear_sport5_channel_to_a_distinct_schedule(self):
        backend = Path(__file__).resolve().parents[1]
        catalog = json.loads((backend / "data/custom_channels.json").read_text())
        channels = [c for c in catalog if c.get("streamProvider") == "nextbet" and c.get("streamSlug") in {
            "yes-5", "yes-5-live", "yes-5-plus", "yes-5-gold", "yes-5-stars", "sport-5-max",
        }]
        self.assertEqual(len(channels), 6)
        self.assertEqual({c["tvgID"] for c in channels}, set(SPORT5_CHANNELS))
        # The original website studio stream retains its own radio/studio EPG.
        self.assertNotIn("tvgID", next(c for c in catalog if c.get("channelID") == "ch_sport5"))

    @patch("parse_epg.enrich_epg_with_vod", side_effect=lambda epg: epg)
    @patch("parse_epg.enrich_programs_with_vod", side_effect=lambda channel, programs: programs)
    @patch("parse_epg.parse_sport5_epg")
    def test_single_channel_cli_persists_official_schedule(self, parse, enrich_programs, enrich_epg):
        import parse_epg

        programs = [{"start": 1000, "end": 2000, "name": "משחק", "description": ""}]
        parse.return_value = programs
        with tempfile.TemporaryDirectory() as directory:
            with patch("sys.argv", ["parse_epg.py", "--channel", "sport5_max", "--output-dir", str(Path(directory) / "epg")]):
                parse_epg.main()
            self.assertEqual(load_channel_programs("sport5_max", Path(directory) / "epg.sqlite"), programs)
        parse.assert_called_once_with("sport5_max")
        self.assertTrue(set(SPORT5_CHANNELS).issubset(parse_epg.FORMAL_EPG_CHANNEL_IDS))


if __name__ == "__main__":
    unittest.main()
