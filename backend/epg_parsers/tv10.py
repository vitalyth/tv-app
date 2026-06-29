import json
from datetime import datetime, timedelta
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from epg_parsers.common import dedupe_and_sort_programs, fill_short_gaps


TV10_PROGRAMMES_URL = "https://vod.tv10.co.il/api/products/lives/programmes"

# Use Boston time to decide what "today" means for the app/user.
APP_TZ = ZoneInfo("America/New_York")

# TV10 API expects the schedule window in Eastern time, for example:
# since=2026-05-20T04:00-0400&till=2026-05-21T04:00-0400
API_TZ = ZoneInfo("America/New_York")

LIVE_ID = "790191"
DEFAULT_DAYS = 5
SCHEDULE_DAY_START_HOUR = 4


def fetch_json(url: str):
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
            ),
        },
    )

    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def parse_dt(value: str) -> int:
    return int(datetime.fromisoformat(value).timestamp())


def get_current_schedule_day_start(now: datetime) -> datetime:
    now = now.astimezone(APP_TZ)

    today_start = now.replace(
        hour=SCHEDULE_DAY_START_HOUR,
        minute=0,
        second=0,
        microsecond=0,
    )

    # If Boston time is before 04:00, the active TV day started yesterday at 04:00.
    if now < today_start:
        today_start = today_start - timedelta(days=1)

    return today_start.astimezone(API_TZ)


def build_day_url(start: datetime) -> str:
    end = start + timedelta(days=1)

    params = [
        ("liveId[]", LIVE_ID),
        ("since", start.strftime("%Y-%m-%dT%H:%M%z")),
        ("till", end.strftime("%Y-%m-%dT%H:%M%z")),
        ("lang", "HEB"),
        ("platform", "BROWSER"),
    ]

    return f"{TV10_PROGRAMMES_URL}?{urlencode(params)}"


def extract_items(data):
    if isinstance(data, list):
        return data

    return data.get("items") or data.get("programmes") or data.get("data") or []


def first_image_url(item: dict) -> str:
    images = item.get("images") or {}
    if not isinstance(images, dict):
        return ""

    for image_group in images.values():
        if not isinstance(image_group, list):
            continue

        for image in image_group:
            if not isinstance(image, dict):
                continue

            url = image.get("url") or image.get("templateUrl") or ""
            if not url:
                continue

            url = url.replace("{height:393}", "393").replace("{width:704}", "704")
            if url.startswith("//"):
                return f"https:{url}"
            return url

    return ""


def parse_tv10_epg(today: datetime | None = None, days: int = DEFAULT_DAYS) -> list[dict]:
    now = today or datetime.now(APP_TZ)
    first_day_start = get_current_schedule_day_start(now)

    programs = []

    for day_offset in range(days):
        day_start = first_day_start + timedelta(days=day_offset)
        url = build_day_url(day_start)

        data = fetch_json(url)
        items = extract_items(data)

        print(f"Parsed {len(items)} TV10 programs from {url}")

        for item in items:
            title = item.get("title") or item.get("name")
            start_time = item.get("start") or item.get("startDate") or item.get("since")
            end_time = item.get("end") or item.get("endDate") or item.get("till")

            if not title or not start_time or not end_time:
                continue

            programs.append(
                {
                    "start": parse_dt(start_time),
                    "end": parse_dt(end_time),
                    "name": title,
                    "description": item.get("description") or item.get("summary") or "",
                    "image": first_image_url(item),
                }
            )

    return fill_short_gaps(dedupe_and_sort_programs(programs))


if __name__ == "__main__":
    print(json.dumps(parse_tv10_epg(), ensure_ascii=False, indent=2))
