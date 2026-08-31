import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from epg_parsers.common import merge_existing_with_new_programs
from services.epg_storage import load_channel_programs, upsert_channel_programs


class EpgOverlapResolutionTests(unittest.TestCase):
    def test_new_schedule_replaces_old_boundary_overlap(self):
        existing = [
            {"start": 100, "end": 200, "name": "Old show"},
            {"start": 200, "end": 300, "name": "News"},
        ]
        refreshed = [
            {"start": 195, "end": 295, "name": "News"},
            {"start": 295, "end": 400, "name": "Next show"},
        ]

        merged = merge_existing_with_new_programs(
            existing,
            refreshed,
            now=datetime.fromtimestamp(150, ZoneInfo("America/New_York")),
        )

        self.assertEqual(
            merged,
            [
                {"start": 100, "end": 195, "name": "Old show"},
                {"start": 195, "end": 295, "name": "News"},
                {"start": 295, "end": 400, "name": "Next show"},
            ],
        )

    def test_new_schedule_replaces_matching_show_with_shifted_times(self):
        existing = [
            {"start": 100, "end": 200, "name": "Election Area - Raviv Drucker"},
        ]
        refreshed = [
            {"start": 105, "end": 190, "name": "Election Area - Raviv Drucker"},
        ]

        merged = merge_existing_with_new_programs(
            existing,
            refreshed,
            now=datetime.fromtimestamp(150, ZoneInfo("America/New_York")),
        )

        self.assertEqual(
            merged,
            [
                {"start": 105, "end": 190, "name": "Election Area - Raviv Drucker"},
            ],
        )

    def test_different_program_inside_existing_slot_splits_existing_program(self):
        existing = [
            {"start": 100, "end": 400, "name": "Long block"},
        ]
        refreshed = [
            {"start": 200, "end": 300, "name": "Breaking update"},
        ]

        merged = merge_existing_with_new_programs(
            existing,
            refreshed,
            now=datetime.fromtimestamp(150, ZoneInfo("America/New_York")),
        )

        self.assertEqual(
            merged,
            [
                {"start": 100, "end": 200, "name": "Long block"},
                {"start": 200, "end": 300, "name": "Breaking update"},
                {"start": 300, "end": 400, "name": "Long block"},
            ],
        )

    def test_sqlite_upsert_removes_any_stale_overlap_for_channel(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            db_path = Path(tmp_dir) / "epg.sqlite"

            upsert_channel_programs(
                "13",
                [
                    {"start": 100, "end": 200, "name": "Morning"},
                    {"start": 200, "end": 300, "name": "Election Area"},
                ],
                db_path,
            )
            upsert_channel_programs(
                "13",
                [
                    {"start": 195, "end": 295, "name": "Election Area - Raviv Drucker"},
                    {"start": 295, "end": 400, "name": "Next"},
                ],
                db_path,
            )

            self.assertEqual(
                load_channel_programs("13", db_path),
                [
                    {"start": 100, "end": 195, "name": "Morning", "description": ""},
                    {
                        "start": 195,
                        "end": 295,
                        "name": "Election Area - Raviv Drucker",
                        "description": "",
                    },
                    {"start": 295, "end": 400, "name": "Next", "description": ""},
                ],
            )


if __name__ == "__main__":
    unittest.main()
