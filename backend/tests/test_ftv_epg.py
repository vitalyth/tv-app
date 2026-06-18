import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from epg_parsers.ftv import parse_epgpw_json, parse_ftv_epg, parse_smscz_page


class FashionTVEPGTests(unittest.TestCase):
    def test_parse_smscz_program_table(self):
        html = """
        <table data-konec="1781814600" data-k="20260618 0130" class="porad">
          <tr>
            <td class="cas"><span class="ntvp_cas">01.30</span></td>
            <td class="nazev"><span><a href="/show">Fashion Destination</a></span></td>
          </tr>
          <tr><td class="info1"><div class="of">Runway highlights &amp; interviews.</div></td></tr>
        </table>
        """

        self.assertEqual(
            parse_smscz_page(html),
            [
                {
                    "start": 1781739000,
                    "end": 1781814600,
                    "name": "Fashion Destination",
                    "description": "Runway highlights & interviews.",
                }
            ],
        )

    def test_parse_ftv_returns_empty_when_source_has_no_programs(self):
        today = datetime(2026, 6, 18, 12, 0, tzinfo=ZoneInfo("America/New_York"))

        self.assertEqual(parse_ftv_epg(today=today, days=1, html_pages=[""]), [])

    def test_parse_epgpw_json(self):
        data = {
            "epg_list": [
                {
                    "start_date": "2026-06-18T00:00:00+00:00",
                    "title": "Top Models",
                    "desc": "Behind the scenes.",
                },
                {
                    "start_date": "2026-06-18T00:30:00+00:00",
                    "title": "Lingerie",
                    "desc": "Runway trends.",
                },
            ]
        }

        self.assertEqual(
            parse_epgpw_json(data),
            [
                {
                    "start": 1781740800,
                    "end": 1781742600,
                    "name": "Top Models",
                    "description": "Behind the scenes.",
                },
                {
                    "start": 1781742600,
                    "end": 1781744400,
                    "name": "Lingerie",
                    "description": "Runway trends.",
                },
            ],
        )


if __name__ == "__main__":
    unittest.main()
