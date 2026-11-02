"""Sport 1–4 schedules from the official site's broadcast API."""

import json
import re
import threading
import time as clock
from datetime import date, datetime, time, timedelta
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup
from curl_cffi import requests as curl_requests

from epg_parsers.common import dedupe_and_sort_programs
from epg_parsers.yes import fetch_yes_schedule

SPORT1_CHANNELS = {"sport1": 2, "sport2": 3, "sport3": 4, "sport4": 5}
YES_CHANNELS = {"sport1": "PT53", "sport2": "PT98", "sport3": "CH09", "sport4": "CH11"}
ISRAEL_TZ = ZoneInfo("Asia/Jerusalem")
DEFAULT_DAYS = 7
SCHEDULE_URL = "https://sport1.maariv.co.il/broadcast-schedule/"
API_URL = "https://sport1.maariv.co.il/wp-json/sport1/v1/broadcast/day/{day}/channel/{channel}"
_fetch_lock = threading.Lock()
_last_fetch = 0.0


def fetch_schedule(channel_id: str, schedule_date: date) -> str:
    global _last_fetch
    with _fetch_lock:
        delay = max(0, 1 - (clock.monotonic() - _last_fetch))
        if delay:
            clock.sleep(delay)
        _last_fetch = clock.monotonic()
    url = API_URL.format(day=schedule_date.isoformat(), channel=SPORT1_CHANNELS[channel_id])
    headers = {"User-Agent": "Mozilla/5.0", "Referer": SCHEDULE_URL}
    try:
        with urlopen(Request(url, headers=headers), timeout=20) as response:
            payload = response.read()
    except HTTPError as exc:
        if exc.code != 403:
            raise
        # The site can reject urllib's TLS fingerprint while accepting Chrome.
        response = curl_requests.get(url, headers=headers, impersonate="chrome", timeout=20)
        try:
            if response.status_code >= 400:
                raise HTTPError(url, response.status_code, "Sport 1 schedule request failed", response.headers, None)
            payload = response.content
        finally:
            response.close()
    html = json.loads(payload)
    if not isinstance(html, str):
        raise ValueError("Sport 1 API did not return an HTML schedule")
    return html


def parse_schedule_html(html: str, channel_id: str, schedule_date: date) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    channel = soup.select_one(f"#channel-{SPORT1_CHANNELS[channel_id]}-container")
    group = channel.select_one(f".shows-container-for-{schedule_date.isoformat()}") if channel else None
    if group is None:
        raise ValueError(f"Sport 1 response missing {channel_id} schedule for {schedule_date}")
    entries = []
    for row in group.select(".show-container"):
        time_node = row.select_one(".show-starting-time")
        title_node = row.select_one(".show-name")
        description_node = row.select_one(".show-description")
        value = time_node.get_text(" ", strip=True) if time_node else ""
        title = title_node.get_text(" ", strip=True) if title_node else ""
        if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value) or not title:
            continue
        hour, minute = map(int, value.split(":"))
        start = datetime.combine(schedule_date, time(hour, minute), tzinfo=ISRAEL_TZ)
        description = description_node.get_text(" ", strip=True) if description_node else ""
        if any(node.get_text(strip=True) == "ישיר" for node in row.select(".show-second-status")):
            description = f"{description}\nישיר".strip()
        entries.append({"start": int(start.timestamp()), "name": title, "description": description})
    return entries


def parse_sport1_epgs(channel_ids=None, *, today: date | None = None, days: int = DEFAULT_DAYS) -> dict[str, list[dict]]:
    selected = list(SPORT1_CHANNELS if channel_ids is None else channel_ids)
    if any(channel not in SPORT1_CHANNELS for channel in selected):
        raise ValueError("Unknown Sport 1 channel")
    if days < 1:
        raise ValueError("days must be positive")
    today = today or datetime.now(ISRAEL_TZ).date()
    entries = {channel: [] for channel in selected}
    limited = False
    yes_limited = False
    yes_programs = {channel: [] for channel in selected}
    # Fetch one boundary day so the last published program has a known end.
    # Round robin keeps all channels current if later requests are throttled.
    for offset in range(days + 1):
        if (limited and yes_limited) or not selected:
            break
        schedule_date = today + timedelta(days=offset)
        for channel in selected:
            if not limited:
                try:
                    html = fetch_schedule(channel, schedule_date)
                    entries[channel].extend(parse_schedule_html(html, channel, schedule_date))
                except (HTTPError, URLError, TimeoutError, ValueError, curl_requests.exceptions.RequestException) as exc:
                    print(f"Sport 1 {channel} {schedule_date}: {exc}", flush=True)
                    if isinstance(exc, HTTPError) and exc.code in (403, 429):
                        limited = True
            if not yes_limited:
                try:
                    yes_programs[channel].extend(fetch_yes_schedule(YES_CHANNELS[channel], schedule_date))
                except (HTTPError, URLError, TimeoutError, UnicodeError, RuntimeError, ValueError) as exc:
                    print(f"Sport 1 {channel} {schedule_date}: yes failed: {exc}", flush=True)
                    if isinstance(exc, HTTPError) and exc.code in (403, 429):
                        yes_limited = True
    cutoff = int(datetime.combine(today + timedelta(days=days), time.min, tzinfo=ISRAEL_TZ).timestamp())
    schedules = {}
    for channel, rows in entries.items():
        ordered = sorted({row["start"]: row for row in rows}.values(), key=lambda row: row["start"])
        programs = []
        starts = sorted({row["start"] for row in ordered + yes_programs[channel]})
        following_start = dict(zip(starts, starts[1:]))
        for current in ordered:
            end = following_start.get(current["start"])
            # Missing days must not turn a short show into a multi-day program.
            if end and current["start"] < cutoff and 0 < end - current["start"] <= 24 * 3600:
                programs.append({**current, "end": end})
        schedules[channel] = dedupe_and_sort_programs(programs + [row for row in yes_programs[channel] if row["start"] < cutoff])
    return schedules


def parse_sport1_epg(channel_id: str) -> list[dict]:
    programs = parse_sport1_epgs([channel_id])[channel_id]
    if not programs:
        raise RuntimeError(f"No published Sport 1 schedule for {channel_id}")
    return programs
