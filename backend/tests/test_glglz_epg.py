import unittest

from epg_parsers.glglz import parse_glglz_epg


class GlglzEPGTests(unittest.TestCase):
    def test_parse_grid_positioned_schedule_items(self):
        html = """
        <main>
          <h1>לוח שידורים</h1>
          <button>Prev</button><button>Next</button>
          <div>יום ראשון</div><div>23.08.26</div>
          <div>יום שני</div><div>24.08.26</div>
          <ul>
            <li>06:00</li>
            <li>07:00</li>
            <li>08:00</li>
            <li>09:00</li>
          </ul>
          <a style="grid-column: 1; grid-row: 1 / span 2;">בת אור צגאי</a>
          <a style="grid-column-start: 2; grid-row-start: 2; grid-row: 2 / span 2;">מדינה בדרך עם הדר מרקס</a>
        </main>
        """

        programs = parse_glglz_epg(html_text=html)

        self.assertEqual(
            programs,
            [
                {
                    "start": 1787454000,
                    "end": 1787461200,
                    "name": "בת אור צגאי",
                    "description": "",
                },
                {
                    "start": 1787544000,
                    "end": 1787551200,
                    "name": "מדינה בדרך עם הדר מרקס",
                    "description": "",
                },
            ],
        )

    def test_rejects_incapsula_challenge(self):
        with self.assertRaises(RuntimeError):
            parse_glglz_epg(html_text="<html>Request unsuccessful. Incapsula</html>")


if __name__ == "__main__":
    unittest.main()
