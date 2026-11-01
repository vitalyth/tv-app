import json
import tempfile
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlsplit

from epg_parsers.sport5 import SPORT5_CHANNELS, fetch_schedule, parse_schedule_page, parse_sport5_epg
from services.epg_storage import load_channel_programs, upsert_channel_programs


def page(*rows):
    return "<table>" + "".join(
        f'<tr><td class="date"><div>{clock}</div></td>'
        f'<td><div class="spaceleft"></div></td><td class="text">{title}</td></tr>'
        for clock, title in rows
    ) + "</table>"


class Sport5EPGTests(unittest.TestCase):
    @patch("epg_parsers.sport5.clock.sleep")
    @patch("epg_parsers.sport5.urlopen")
    def test_requests_use_the_sites_unpadded_date_format(self, open_url, sleep):
        html = page(("20:00", "משחק"))
        open_url.return_value.__enter__.return_value.read.return_value = html.encode("utf-8-sig")
        for requested, expected in [
            (date(2026, 11, 1), "2026-11-1"),
            (date(2026, 3, 9), "2026-3-9"),
            (date(2026, 10, 30), "2026-10-30"),
        ]:
            with self.subTest(date=requested):
                self.assertEqual(fetch_schedule("5P", requested), html)
                request = open_url.call_args.args[0]
                self.assertEqual(parse_qs(urlsplit(request.full_url).query), {
                    "Type": ["5P"], "Date": [expected],
                })

    @patch("epg_parsers.sport5.clock.sleep")
    @patch("epg_parsers.sport5.curl_requests.get")
    @patch("epg_parsers.sport5.urlopen")
    def test_http_500_falls_back_to_browser_on_same_direct_url(self, open_url, browser_get, sleep):
        open_url.side_effect = HTTPError("url", 500, "Akamai", {}, None)
        response = browser_get.return_value
        response.status_code = 200
        response.content = page(("20:00", "משחק")).encode("utf-8-sig")
        rows = parse_schedule_page(fetch_schedule("GOLD", date(2026, 11, 2)), date(2026, 11, 2))
        self.assertEqual(len(rows), 1)
        self.assertEqual(browser_get.call_args.args[0], open_url.call_args.args[0].full_url)
        self.assertEqual(browser_get.call_args.kwargs["impersonate"], "chrome")
        self.assertEqual(open_url.call_count, 1)
        response.close.assert_called_once()

    @patch("epg_parsers.sport5.clock.sleep")
    @patch("epg_parsers.sport5.curl_requests.get")
    @patch("epg_parsers.sport5.urlopen")
    def test_browser_rate_limit_stops_without_retrying_more_days(self, open_url, browser_get, sleep):
        for status in (403, 429):
            with self.subTest(status=status):
                open_url.reset_mock()
                browser_get.reset_mock()
                open_url.side_effect = HTTPError("url", 500, "Akamai", {}, None)
                browser_get.return_value.status_code = status
                with self.assertRaises(RuntimeError):
                    parse_sport5_epg("sport5_gold", today=date(2026, 11, 2))
                self.assertEqual(open_url.call_count, 1)
                self.assertEqual(browser_get.call_count, 1)
                browser_get.return_value.close.assert_called_once()

    @patch("epg_parsers.sport5.clock.sleep")
    @patch("epg_parsers.sport5.curl_requests.get")
    @patch("epg_parsers.sport5.urlopen")
    def test_browser_network_error_uses_existing_source_failure_handling(self, open_url, browser_get, sleep):
        from curl_cffi.requests.exceptions import RequestException

        open_url.side_effect = HTTPError("url", 500, "Akamai", {}, None)
        browser_get.side_effect = RequestException("connection failed")
        with self.assertRaises(URLError):
            fetch_schedule("GOLD", date(2026, 11, 2))

    @patch("epg_parsers.sport5.clock.sleep")
    @patch("epg_parsers.sport5.urlopen")
    @patch("epg_parsers.sport5._fetch_browser_schedule", side_effect=HTTPError("url", 500, "temporary", {}, None))
    def test_retries_a_transient_http_500_for_the_same_date(self, browser_fetch, open_url, sleep):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = page(("20:00", "משחק")).encode("utf-8")
        open_url.side_effect = [HTTPError("url", 500, "temporary error", {}, None), response]
        rows = parse_schedule_page(fetch_schedule("5STARS", date(2026, 11, 2)), date(2026, 11, 2))
        self.assertEqual(len(rows), 1)
        self.assertEqual(open_url.call_count, 2)
        self.assertEqual(open_url.call_args_list[0].args[0].full_url, open_url.call_args_list[1].args[0].full_url)
        sleep.assert_any_call(3)

    @patch("epg_parsers.sport5.clock.sleep")
    @patch("epg_parsers.sport5.urlopen")
    @patch("epg_parsers.sport5._fetch_browser_schedule", side_effect=HTTPError("url", 500, "temporary", {}, None))
    def test_retry_is_bounded_and_does_not_retry_rate_limits(self, browser_fetch, open_url, sleep):
        for status, expected_attempts in [(500, 2), (403, 1), (429, 1)]:
            with self.subTest(status=status):
                open_url.reset_mock()
                browser_fetch.reset_mock()
                open_url.side_effect = HTTPError("url", status, "error", {}, None)
                with self.assertRaises(HTTPError):
                    fetch_schedule("5STARS", date(2026, 11, 2))
                self.assertEqual(open_url.call_count, expected_attempts)
                self.assertEqual(browser_fetch.call_count, 2 if status == 500 else 0)

    def test_parses_ajax_rows_and_ignores_unpublished_entries(self):
        html = page(("", ""), ("20:15", "  מכבי &amp; הפועל<br>יורוליג "), ("25:00", "bad"), ("21:00", ""))
        self.assertEqual(parse_schedule_page(html, date(2026, 10, 30)), [{
            "start": int(datetime(2026, 10, 30, 18, 15, tzinfo=timezone.utc).timestamp()),
            "name": "מכבי & הפועל יורוליג", "description": "",
        }])

    def test_live_time_badges_are_preserved_in_description_only(self):
        html = page(
            ('20:00<img alt="ישיר" title="ישיר">', "משחק"),
            ('21:00<img title="ישיר">', "כדורסל"),
            ('22:00<span>ישיר</span>', "טניס"),
            ('23:00<img alt="שידור חוזר">', "ישיר בשם התוכנית בלבד"),
            ("23:30", "חדשות"),
        )
        programs = parse_schedule_page(html, date(2026, 11, 1))
        self.assertEqual([p["description"] for p in programs], ["ישיר", "ישיר", "ישיר", "", ""])
        self.assertEqual(programs[0]["name"], "משחק")

    @patch("epg_parsers.sport5.fetch_schedule")
    def test_live_description_survives_program_end_calculation_and_storage(self, fetch):
        fetch.side_effect = [
            page(('20:00<img alt="ישיר">', "משחק"), ("22:00", "סיכום")),
            page(("00:00", "חדשות")),
        ]
        programs = parse_sport5_epg("sport5", today=date(2026, 11, 1), days=1)
        with tempfile.TemporaryDirectory() as directory:
            db = Path(directory) / "epg.sqlite"
            upsert_channel_programs("sport5", programs, db)
            stored = load_channel_programs("sport5", db)
        self.assertEqual([p["description"] for p in stored], ["ישיר", ""])

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
    def test_future_http_error_does_not_hide_later_published_days(self, fetch):
        fetch.side_effect = [
            page(("20:00", "משחק"), ("22:00", "סיכום")),
            HTTPError("url", 500, "unavailable", {}, None),
            page(("20:00", "משחק עתידי"), ("22:00", "סיכום עתידי")),
            page(("00:00", "חדשות")),
        ]
        programs = parse_sport5_epg("sport5_live", today=date(2026, 10, 30), days=3)
        self.assertEqual([p["name"] for p in programs], ["משחק", "משחק עתידי", "סיכום עתידי"])
        self.assertEqual(fetch.call_count, 4)

    @patch("epg_parsers.sport5.fetch_schedule", return_value=page())
    def test_default_window_matches_sites_ten_days_plus_end_boundary(self, fetch):
        self.assertEqual(parse_sport5_epg("sport5", today=date(2026, 11, 1)), [])
        self.assertEqual(fetch.call_count, 11)
        self.assertEqual(fetch.call_args.args, ("5", date(2026, 11, 11)))

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
