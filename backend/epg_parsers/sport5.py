"""Official Sport 5 channel schedules used by the site's broadcast sheet."""

import re
import threading
import time as clock
from datetime import date, datetime, time, timedelta
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup

from epg_parsers.common import dedupe_and_sort_programs

SCHEDULE_URL = "https://www.sport5.co.il/html/pages/broadcastsheet.html"
AJAX_URL = "https://www.sport5.co.il/Ajax/GetBroadcastSheetData.aspx"
ISRAEL_TZ = ZoneInfo("Asia/Jerusalem")
DEFAULT_DAYS = 5
_fetch_lock = threading.Lock()
_last_fetch = 0.0
SPORT5_CHANNELS = {
    "sport5": "5",
    "sport5_plus": "5P",
    "sport5_live": "LIVE",
    "sport5_gold": "GOLD",
    "sport5_stars": "5STARS",
    "sport5_max": "5MAX",
}


def fetch_schedule(channel_type: str, schedule_date: date) -> str:
    global _last_fetch
    # The official endpoint rate-limits bursts, including requests for unpublished days.
    with _fetch_lock:
        delay = max(0, 2 - (clock.monotonic() - _last_fetch))
        if delay:
            clock.sleep(delay)
        _last_fetch = clock.monotonic()
    query = urlencode({"Type": channel_type, "Date": schedule_date.isoformat()})
    request = Request(
        f"{AJAX_URL}?{query}",
        headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": SCHEDULE_URL,
            "X-Requested-With": "XMLHttpRequest",
        },
    )
    with urlopen(request, timeout=20) as response:
        return response.read().decode("utf-8-sig")


def parse_schedule_page(html_text: str, schedule_date: date) -> list[dict]:
    soup = BeautifulSoup(html_text, "html.parser")
    if not soup.select_one("table") and not soup.select_one(".no-programs"):
        raise RuntimeError("Sport 5 returned an invalid schedule page")

    entries = []
    for row in soup.select("tr"):
        time_cell, title_cell = row.select_one("td.date"), row.select_one("td.text")
        if time_cell is None or title_cell is None:
            continue
        match = re.search(r"\b([01]?\d|2[0-3]):([0-5]\d)\b", time_cell.get_text(" ", strip=True))
        title = " ".join(title_cell.get_text(" ", strip=True).split())
        if not match or not title:
            continue
        start = datetime.combine(
            schedule_date, time(int(match[1]), int(match[2])), tzinfo=ISRAEL_TZ
        )
        entries.append({"start": int(start.timestamp()), "name": title, "description": ""})
    return entries


def parse_sport5_epg(
    channel_id: str,
    *,
    today: datetime | date | None = None,
    days: int = DEFAULT_DAYS,
) -> list[dict]:
    channel_type = SPORT5_CHANNELS[channel_id]
    if days < 1:
        raise ValueError("days must be positive")
    if today is None:
        first_date = datetime.now(ISRAEL_TZ).date()
    elif isinstance(today, datetime):
        first_date = today.astimezone(ISRAEL_TZ).date() if today.tzinfo else today.date()
    else:
        first_date = today

    entries = []
    successful_pages = 0
    # The next day's first start supplies the final requested day's end time.
    for offset in range(days + 1):
        schedule_date = first_date + timedelta(days=offset)
        try:
            entries.extend(parse_schedule_page(fetch_schedule(channel_type, schedule_date), schedule_date))
            successful_pages += 1
        except (HTTPError, URLError, TimeoutError, UnicodeError, RuntimeError) as exc:
            # The site can return HTTP 500 for future days not published yet.
            # Keep usable days and let SQLite retain the previously cached ones.
            print(f"Sport 5 {channel_id} {schedule_date}: {exc}")
            if isinstance(exc, HTTPError):
                if exc.code in (403, 429):
                    break
                if exc.code == 500 and offset > 0 and successful_pages:
                    break
    if not successful_pages:
        raise RuntimeError(f"No Sport 5 schedule pages could be loaded for {channel_id}")

    entries = sorted({(p["start"], p["name"]): p for p in entries}.values(), key=lambda p: p["start"])
    cutoff = int(datetime.combine(first_date + timedelta(days=days), time(), tzinfo=ISRAEL_TZ).timestamp())
    programs = []
    for current, following in zip(entries, entries[1:]):
        if current["start"] >= cutoff:
            break
        # Do not turn a missing day's schedule into an invented all-day program.
        if 0 < following["start"] - current["start"] <= 24 * 3600:
            programs.append({**current, "end": following["start"]})
    return dedupe_and_sort_programs(programs)
