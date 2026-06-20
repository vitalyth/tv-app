from __future__ import annotations

from datetime import datetime, timezone
from urllib.request import Request, urlopen

from epg_parsers.common import dedupe_and_sort_programs


KAN_WORLDCUP_CALENDAR_ID = "934a16c417dfa3d96a57bbe246d41e996cac752f5a3e2c6b2ff210064dc8ca8e@group.calendar.google.com"
KAN_WORLDCUP_ICS_URL = (
    "https://calendar.google.com/calendar/ical/"
    f"{KAN_WORLDCUP_CALENDAR_ID.replace('@', '%40')}/public/basic.ics"
)


def fetch_ics(url: str = KAN_WORLDCUP_ICS_URL) -> str:
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8")


def _unfold_ics_lines(ics: str) -> list[str]:
    lines: list[str] = []
    for raw_line in ics.splitlines():
        if raw_line.startswith((" ", "\t")) and lines:
            lines[-1] += raw_line[1:]
            continue
        lines.append(raw_line.rstrip("\r"))
    return lines


def _parse_ics_fields(ics: str) -> list[dict[str, str]]:
    events: list[dict[str, str]] = []
    current: dict[str, str] | None = None

    for line in _unfold_ics_lines(ics):
        if line == "BEGIN:VEVENT":
            current = {}
            continue

        if line == "END:VEVENT":
            if current:
                events.append(current)
            current = None
            continue

        if current is None or ":" not in line:
            continue

        key, value = line.split(":", 1)
        current[key.split(";", 1)[0]] = value

    return events


def _unescape_ics_text(value: str) -> str:
    return (
        value.replace("\\n", "\n")
        .replace("\\N", "\n")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
    )


def _parse_utc_timestamp(value: str) -> int:
    if value.endswith("Z"):
        dt = datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    else:
        dt = datetime.strptime(value, "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)

    return int(dt.timestamp())


def _clean_summary(summary: str) -> str:
    summary = _unescape_ics_text(summary).strip()
    return summary.removeprefix("⚽").strip()


def parse_kan_worldcup_epg(ics: str | None = None) -> list[dict]:
    ics = ics if ics is not None else fetch_ics()
    programs = []

    for event in _parse_ics_fields(ics):
        if not event.get("DTSTART") or not event.get("DTEND") or not event.get("SUMMARY"):
            continue

        programs.append(
            {
                "start": _parse_utc_timestamp(event["DTSTART"]),
                "end": _parse_utc_timestamp(event["DTEND"]),
                "name": _clean_summary(event["SUMMARY"]),
                "description": _unescape_ics_text(event.get("DESCRIPTION", "")).strip(),
            }
        )

    return dedupe_and_sort_programs(programs)
