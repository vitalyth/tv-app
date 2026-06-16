import unittest

from epg_parsers.kan_worldcup import parse_kan_worldcup_epg


class KanWorldCupEPGTests(unittest.TestCase):
    def test_parse_google_calendar_ics_event(self):
        ics = """BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART:20260616T010000Z
DTEND:20260616T030000Z
DESCRIPTION:שלב הבתים | בית 7\\n16 ביוני 2026 | 04:00\\nלוס אנג'לס\\, ארה"ב\\n
 שידור חי בכאן BOX
SUMMARY:⚽ איראן - ניו זילנד | כאן BOX
END:VEVENT
END:VCALENDAR
"""

        programs = parse_kan_worldcup_epg(ics)

        self.assertEqual(
            programs,
            [
                {
                    "start": 1781571600,
                    "end": 1781578800,
                    "name": "איראן - ניו זילנד | כאן BOX",
                    "description": "שלב הבתים | בית 7\n16 ביוני 2026 | 04:00\nלוס אנג'לס, ארה\"ב\nשידור חי בכאן BOX",
                }
            ],
        )


if __name__ == "__main__":
    unittest.main()
