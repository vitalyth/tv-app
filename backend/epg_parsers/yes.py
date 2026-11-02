"""Shared client for official yes channel schedules."""

import json
import re
import threading
import time as clock
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode

from curl_cffi import requests as curl_requests

from epg_parsers.common import dedupe_and_sort_programs

YES_SCHEDULE_URL = "https://svc.yes.co.il/api/content/broadcast-schedule/channels/"
_yes_fetch_lock = threading.Lock()
_last_yes_fetch = 0.0


def fetch_yes_schedule(channel_id: str, schedule_date: date) -> list[dict]:
    """Fetch one channel/day from the official yes broadcast API."""
    global _last_yes_fetch
    with _yes_fetch_lock:
        delay = max(0, 1 - (clock.monotonic() - _last_yes_fetch))
        if delay:
            clock.sleep(delay)
        _last_yes_fetch = clock.monotonic()
    site_date = f"{schedule_date.year}-{schedule_date.month}-{schedule_date.day}"
    channel = channel_id
    url = f"{YES_SCHEDULE_URL}{channel}?{urlencode({'date': site_date, 'ignorePastItems': 'false'})}"
    try:
        response = curl_requests.get(
            url, impersonate="chrome", timeout=20,
            headers={"Accept-Language": "he-IL", "Referer": "https://www.yes.co.il/"},
        )
    except curl_requests.exceptions.RequestException as exc:
        raise URLError(str(exc)) from exc
    try:
        if response.status_code >= 400:
            raise HTTPError(url, response.status_code, "yes schedule request failed", response.headers, None)
        return parse_yes_schedule(json.loads(response.content), channel)
    finally:
        response.close()


def parse_yes_schedule(data: dict, channel_id: str) -> list[dict]:
    if not isinstance(data, dict) or not isinstance(data.get("items"), list):
        raise RuntimeError("yes returned an invalid schedule")
    programs = []
    for item in data["items"]:
        if not isinstance(item, dict) or item.get("channelId") != channel_id:
            continue
        try:
            # yes publishes true ISO UTC timestamps; do not reinterpret as local.
            start = datetime.fromisoformat(item["starts"].replace("Z", "+00:00"))
            end = datetime.fromisoformat(item["ends"].replace("Z", "+00:00"))
            if start.tzinfo is None or end.tzinfo is None or end <= start:
                continue
        except (KeyError, TypeError, ValueError, AttributeError):
            continue
        name = " ".join(str(item.get("title") or "").split())
        if not name:
            continue
        description = str(item.get("description") or "").strip()
        if re.search(r"(?<!\w)ישיר(?!\w)", name) and "ישיר" not in description:
            description = f"{description}\nישיר".strip()
        program = {"start": int(start.timestamp()), "end": int(end.timestamp()),
                   "name": name, "description": description}
        if isinstance(item.get("imageUrl"), str) and item["imageUrl"].startswith("https://"):
            program["image"] = item["imageUrl"]
        programs.append(program)
    return dedupe_and_sort_programs(programs)


def parse_yes_epgs(channels: dict[str, str], channel_ids=None, *, today: date | None = None,
                   days: int = 7, fetcher=None) -> dict[str, list[dict]]:
    """Import a bounded window fairly across channels, retaining partial results."""
    fetcher = fetcher or fetch_yes_schedule
    selected = list(channels) if channel_ids is None else list(dict.fromkeys(channel_ids))
    if any(channel not in channels for channel in selected):
        raise ValueError("Unknown yes channel")
    if days < 1:
        raise ValueError("days must be positive")
    today = today or datetime.now(ZoneInfo("Asia/Jerusalem")).date()
    start = int(datetime.combine(today, time.min, tzinfo=ZoneInfo("Asia/Jerusalem")).timestamp())
    end = int(datetime.combine(today + timedelta(days=days), time.min, tzinfo=ZoneInfo("Asia/Jerusalem")).timestamp())
    schedules = {channel: [] for channel in selected}
    for offset in range(days):
        for channel in selected:
            try:
                rows = fetcher(channels[channel], today + timedelta(days=offset))
                # yes dates can include spillover from the neighboring local day.
                schedules[channel].extend(row for row in rows if row['end'] > start and row['start'] < end)
            except (HTTPError, URLError, TimeoutError, UnicodeError, RuntimeError, ValueError) as exc:
                print(f"yes {channel} day {offset}: {exc}", flush=True)
                if isinstance(exc, HTTPError) and exc.code in (403, 429):
                    return {key: dedupe_and_sort_programs(value) for key, value in schedules.items()}
    return {key: dedupe_and_sort_programs(value) for key, value in schedules.items()}

