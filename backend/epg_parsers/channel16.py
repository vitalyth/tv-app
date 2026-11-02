"""Channel 16 EPG from the official yes broadcast API."""

from datetime import date

from epg_parsers.yes import fetch_yes_schedule, parse_yes_epgs

CHANNEL16_ID = "16tv"
YES_CHANNELS = {CHANNEL16_ID: "CN66"}


def parse_channel16_epg(*, today: date | None = None, days: int = 7) -> list[dict]:
    return parse_yes_epgs(YES_CHANNELS, today=today, days=days, fetcher=fetch_yes_schedule)[CHANNEL16_ID]
