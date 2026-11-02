"""Official Sport 5 channel schedules used by the site's broadcast sheet."""

import re
import json
import threading
import time as clock
from datetime import date, datetime, time, timedelta
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup
from curl_cffi import requests as curl_requests

from epg_parsers.common import dedupe_and_sort_programs

SCHEDULE_URL = "https://www.sport5.co.il/html/pages/broadcastsheet.html"
AJAX_URL = "https://www.sport5.co.il/Ajax/GetBroadcastSheetData.aspx"
ISRAEL_TZ = ZoneInfo("Asia/Jerusalem")
# Match the ten dates offered by the official broadcast-sheet day selector.
DEFAULT_DAYS = 10
_fetch_lock = threading.Lock()
_last_fetch = 0.0
_last_yes_fetch = 0.0
SPORT5_CHANNELS = {
    "sport5": "5",
    "sport5_plus": "5P",
    "sport5_live": "LIVE",
    "sport5_gold": "GOLD",
    "sport5_stars": "5STARS",
    "sport5_max": "5MAX",
}
YES_CHANNELS = {
    "sport5": "PT26", "sport5_plus": "CH54", "sport5_live": "PT62",
    "sport5_gold": "MU03", "sport5_stars": "CH56", "sport5_max": "CN49",
}
YES_SCHEDULE_URL = "https://svc.yes.co.il/api/content/broadcast-schedule/channels/"


def fetch_yes_schedule(channel_id: str, schedule_date: date) -> list[dict]:
    """Official provider backup for unpublished/failed Sport 5 schedule days."""
    global _last_yes_fetch
    with _fetch_lock:
        delay = max(0, 1 - (clock.monotonic() - _last_yes_fetch))
        if delay:
            clock.sleep(delay)
        _last_yes_fetch = clock.monotonic()
    site_date = f"{schedule_date.year}-{schedule_date.month}-{schedule_date.day}"
    channel = YES_CHANNELS[channel_id]
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


def _fetch_browser_schedule(request: Request) -> str:
    # Akamai can reject urllib while accepting Chrome on the same connection.
    try:
        response = curl_requests.get(
            request.full_url, impersonate="chrome", timeout=20,
            headers={"Referer": SCHEDULE_URL, "X-Requested-With": "XMLHttpRequest"},
        )
    except curl_requests.exceptions.RequestException as exc:
        raise URLError(str(exc)) from exc
    try:
        if response.status_code >= 400:
            raise HTTPError(request.full_url, response.status_code, "Sport 5 browser request failed", response.headers, None)
        return response.content.decode("utf-8-sig")
    finally:
        response.close()


def fetch_schedule(channel_type: str, schedule_date: date) -> str:
    global _last_fetch
    # Match the site's JavaScript (getMonth() + 1 / getDate()), including
    # unpadded single-digit months and days.
    site_date = f"{schedule_date.year}-{schedule_date.month}-{schedule_date.day}"
    query = urlencode({"Type": channel_type, "Date": site_date})
    schedule_url = f"{AJAX_URL}?{query}"
    request = Request(
        schedule_url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": SCHEDULE_URL,
            "X-Requested-With": "XMLHttpRequest",
        },
    )
    for attempt in range(2):
        # Pace retries too: the official endpoint rate-limits bursts.
        with _fetch_lock:
            delay = max(0, 2 - (clock.monotonic() - _last_fetch))
            if delay:
                clock.sleep(delay)
            _last_fetch = clock.monotonic()
        try:
            try:
                with urlopen(request, timeout=20) as response:
                    return response.read().decode("utf-8-sig")
            except HTTPError as exc:
                if exc.code != 500:
                    raise
                exc.close()
                return _fetch_browser_schedule(request)
        except HTTPError as exc:
            # The same published date can return 500 and then succeed later.
            # Retry once, but never retry rate-limit responses (403/429).
            if exc.code != 500 or attempt:
                raise
            exc.close()
            clock.sleep(3)


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
        # The live badge is an image beside the time, so get_text alone loses it.
        time_labels = [time_cell.get_text(" ", strip=True)]
        time_labels.extend(
            str(tag.get(attribute, ""))
            for tag in time_cell.find_all(True)
            for attribute in ("alt", "title")
        )
        is_live = any(re.search(r"(?<!\w)ישיר(?!\w)", label) for label in time_labels)
        entries.append({
            "start": int(start.timestamp()), "name": title,
            "description": "ישיר" if is_live else "",
        })
    return entries


def parse_sport5_epg(
    channel_id: str,
    *,
    today: datetime | date | None = None,
    days: int = DEFAULT_DAYS,
) -> list[dict]:
    return parse_sport5_epgs([channel_id], today=today, days=days)[channel_id]


def parse_sport5_epgs(
    channel_ids: list[str] | None = None,
    *,
    today: datetime | date | None = None,
    days: int = DEFAULT_DAYS,
) -> dict[str, list[dict]]:
    """Fetch near dates for every channel before spending requests on later days."""
    channel_ids = list(SPORT5_CHANNELS) if channel_ids is None else list(dict.fromkeys(channel_ids))
    for channel_id in channel_ids:
        if channel_id not in SPORT5_CHANNELS:
            raise ValueError(f"Unknown Sport 5 channel: {channel_id}")
    if days < 1:
        raise ValueError("days must be positive")
    if today is None:
        first_date = datetime.now(ISRAEL_TZ).date()
    elif isinstance(today, datetime):
        first_date = today.astimezone(ISRAEL_TZ).date() if today.tzinfo else today.date()
    else:
        first_date = today

    entries = {channel_id: [] for channel_id in channel_ids}
    backups = {channel_id: [] for channel_id in channel_ids}
    successful_pages = {channel_id: 0 for channel_id in channel_ids}
    limited = False
    backup_limited = False
    # The next day's first start supplies the final requested day's end time.
    for offset in range(days + 1):
        schedule_date = first_date + timedelta(days=offset)
        for channel_id in channel_ids:
            rows = []
            if not limited:
                try:
                    rows = parse_schedule_page(fetch_schedule(SPORT5_CHANNELS[channel_id], schedule_date), schedule_date)
                    successful_pages[channel_id] += 1
                    entries[channel_id].extend(rows)
                except (HTTPError, URLError, TimeoutError, UnicodeError, RuntimeError) as exc:
                    print(f"Sport 5 {channel_id} {schedule_date}: {exc}", flush=True)
                    if isinstance(exc, HTTPError) and exc.code in (403, 429):
                        # A provider-wide limit must not be retried per channel.
                        limited = True
            if not rows and not backup_limited:
                try:
                    backup = fetch_yes_schedule(channel_id, schedule_date)
                    if backup:
                        successful_pages[channel_id] += 1
                    backups[channel_id].extend(backup)
                    print(f"Sport 5 {channel_id} {schedule_date}: yes backup, {len(backup)} programs", flush=True)
                except (HTTPError, URLError, TimeoutError, UnicodeError, RuntimeError, ValueError) as exc:
                    print(f"Sport 5 {channel_id} {schedule_date}: yes backup failed: {exc}", flush=True)
                    if isinstance(exc, HTTPError) and exc.code in (403, 429):
                        backup_limited = True
        if limited and backup_limited:
            break

    result = {}
    for channel_id in channel_ids:
        if not successful_pages[channel_id]:
            if len(channel_ids) == 1:
                raise RuntimeError(f"No Sport 5 schedule pages could be loaded for {channel_id}")
            # The caller retains this channel's cached programs.
            result[channel_id] = []
            continue
        result[channel_id] = _build_programs(entries[channel_id], backups[channel_id], first_date, days)
    return result


def _build_programs(entries: list[dict], backups: list[dict], first_date: date, days: int) -> list[dict]:
    # Backup rows supply exact ends and midnight boundaries for adjacent official
    # rows; do not bridge a missing day with an invented all-day program.
    entries = sorted({(p["start"], p["name"]): p for p in entries}.values(), key=lambda p: p["start"])
    starts = sorted({p["start"] for p in entries + backups})
    next_start = dict(zip(starts, starts[1:]))
    cutoff = int(datetime.combine(first_date + timedelta(days=days), time(), tzinfo=ISRAEL_TZ).timestamp())
    programs = [p for p in backups if p["start"] < cutoff]
    for current in entries:
        if current["start"] >= cutoff:
            break
        end = next_start.get(current["start"])
        if end and 0 < end - current["start"] <= 24 * 3600:
            programs.append({**current, "end": end})
    return dedupe_and_sort_programs(programs)
