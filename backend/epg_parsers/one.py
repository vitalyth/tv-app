"""ONE and ONE2 EPG from the official yes broadcast API."""

from datetime import date
from zoneinfo import ZoneInfo

from epg_parsers.yes import fetch_yes_schedule, parse_yes_epgs

ONE_CHANNELS = {"one1": "TR01", "one2": "CH58"}
ISRAEL_TZ = ZoneInfo("Asia/Jerusalem")
DEFAULT_DAYS = 7


def parse_one_epgs(channel_ids=None, *, today: date | None = None, days: int = DEFAULT_DAYS) -> dict[str, list[dict]]:
    return parse_yes_epgs(ONE_CHANNELS, channel_ids, today=today, days=days, fetcher=fetch_yes_schedule)


def parse_one_epg(channel_id: str) -> list[dict]:
    programs = parse_one_epgs([channel_id])[channel_id]
    if not programs:
        raise RuntimeError(f"No published ONE schedule for {channel_id}")
    return programs
