"""Eurosport 1 and 2 EPG from the official yes broadcast API."""

from datetime import date

from epg_parsers.yes import fetch_yes_schedule, parse_yes_epgs

EUROSPORT_CHANNELS = {"eurosport1": "PT39", "eurosport2": "CH33"}
DEFAULT_DAYS = 7


def parse_eurosport_epgs(channel_ids=None, *, today: date | None = None, days: int = DEFAULT_DAYS) -> dict[str, list[dict]]:
    return parse_yes_epgs(EUROSPORT_CHANNELS, channel_ids, today=today, days=days, fetcher=fetch_yes_schedule)


def parse_eurosport_epg(channel_id: str) -> list[dict]:
    programs = parse_eurosport_epgs([channel_id])[channel_id]
    if not programs:
        raise RuntimeError(f"No published Eurosport schedule for {channel_id}")
    return programs
