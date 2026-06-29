import json
from datetime import datetime, timedelta
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from epg_parsers.common import dedupe_and_sort_programs, fill_short_gaps

try:
    from curl_cffi import requests as curl_requests
except ImportError:
    curl_requests = None


MAKO_SCHEDULE_PAGE_URL = "https://www.mako.co.il/tv-tv-schedule?partner=NavBar"
MAKO_EPG_URL = "https://www.mako.co.il/AjaxPage?jspName=EPGResponse.jsp"
ISRAEL_TZ = ZoneInfo("Asia/Jerusalem")
DEFAULT_DAYS = 7


def fetch_json(url: str = MAKO_EPG_URL):
    headers = {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": MAKO_SCHEDULE_PAGE_URL,
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
        ),
        "X-Requested-With": "XMLHttpRequest",
    }

    if curl_requests is not None:
        session = curl_requests.Session(impersonate="chrome124")
        session.get(MAKO_SCHEDULE_PAGE_URL, headers=headers, timeout=30)
        response = session.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        return response.json()

    request = Request(url, headers=headers)
    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def parse_start_timestamp(item: dict) -> int | None:
    start_utc = item.get("StartTimeUTC")
    if start_utc:
        try:
            return int(int(start_utc) / 1000)
        except (TypeError, ValueError):
            pass

    start_time = item.get("StartTime") or item.get("Date")
    if not start_time:
        return None

    for pattern in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M"):
        try:
            parsed = datetime.strptime(start_time, pattern).replace(tzinfo=ISRAEL_TZ)
            return int(parsed.timestamp())
        except ValueError:
            continue

    return None


def parse_duration_seconds(item: dict) -> int:
    duration_ms = item.get("DurationMs")
    if duration_ms:
        try:
            return int(int(duration_ms) / 1000)
        except (TypeError, ValueError):
            pass

    duration = item.get("Duration") or ""
    parts = duration.split(":")
    if len(parts) == 2:
        try:
            hours, minutes = parts
            return int(timedelta(hours=int(hours), minutes=int(minutes)).total_seconds())
        except ValueError:
            return 0

    return 0


def normalize_image_url(value: str) -> str:
    value = (value or "").strip()
    if value.startswith("//"):
        return f"https:{value}"
    return value


def extract_items(data) -> list[dict]:
    if isinstance(data, list):
        return data

    if isinstance(data, dict):
        for key in ("items", "programs", "programmes", "data"):
            items = data.get(key)
            if isinstance(items, list):
                return items

    return []


def parse_mako12_epg(days: int = DEFAULT_DAYS) -> list[dict]:
    data = fetch_json()
    items = extract_items(data)
    programs = []

    for item in items:
        title = item.get("ProgramName") or item.get("Title") or item.get("Name")
        start = parse_start_timestamp(item)
        duration_seconds = parse_duration_seconds(item)

        if not title or start is None or duration_seconds <= 0:
            continue

        programs.append(
            {
                "start": start,
                "end": start + duration_seconds,
                "name": title,
                "description": item.get("EventDescription") or item.get("Description") or "",
                "image": normalize_image_url(item.get("Picture") or item.get("MobilePicture") or ""),
            }
        )

    programs = dedupe_and_sort_programs(programs)
    if days > 0 and programs:
        first_start = programs[0]["start"]
        cutoff = first_start + int(timedelta(days=days).total_seconds())
        programs = [program for program in programs if program["start"] < cutoff]

    print(f"Parsed {len(programs)} Mako 12 programs from {MAKO_EPG_URL}")
    return fill_short_gaps(programs)


if __name__ == "__main__":
    print(json.dumps(parse_mako12_epg(), ensure_ascii=False, indent=2))
