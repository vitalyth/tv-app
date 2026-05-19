import re
from datetime import datetime, timedelta, date
from html import unescape
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from epg_parsers.common import dedupe_and_sort_programs


WALLA_HIDABROOT_URL = "https://tv-guide.walla.co.il/channel/545"
ISRAEL_TZ = ZoneInfo("Asia/Jerusalem")
APP_TZ = ZoneInfo("America/New_York")

# In Walla's timeline, width is proportional to duration.
# From the HTML: 120px = 30 minutes, 240px = 60 minutes, 480px = 120 minutes.
PIXELS_PER_MINUTE = 4


def fetch_html(url: str = WALLA_HIDABROOT_URL) -> str:
    request = Request(
        url,
        headers={
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
            ),
        },
    )
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="ignore")


def clean_html_text(value: str) -> str:
    value = re.sub(r"<!--.*?-->", "", value or "", flags=re.DOTALL)
    value = re.sub(r"<[^>]+>", "", value)
    value = unescape(value)
    return " ".join(value.split()).strip()


def parse_walla_date(value: str, today: datetime) -> date | None:
    match = re.search(r"(\d{1,2})\.(\d{1,2})", value or "")
    if not match:
        return None

    day = int(match.group(1))
    month = int(match.group(2))
    year = today.year
    schedule_date = date(year, month, day)

    # Handle schedules around New Year.
    if schedule_date < today.date() - timedelta(days=30):
        schedule_date = date(year + 1, month, day)

    return schedule_date


def parse_clock(value: str) -> tuple[int, int] | None:
    value = clean_html_text(value).replace(" ", "")
    match = re.search(r"([01]?\d|2[0-3]):([0-5]\d)", value)
    if not match:
        return None
    return int(match.group(1)), int(match.group(2))


def parse_width_minutes(style: str) -> int | None:
    match = re.search(r"width\s*:\s*([0-9.]+)px", style or "")
    if not match:
        return None

    width = float(match.group(1))
    minutes = round(width / PIXELS_PER_MINUTE)

    if minutes <= 0:
        return None

    return minutes


def extract_tv_guide_sections(html: str) -> list[str]:
    parts = re.split(r'<div\s+class="tv-guide"\s*>', html)
    return parts[1:]


def parse_section(section_html: str, today: datetime) -> list[dict]:
    date_match = re.search(
        r'<span\s+class="date"\s*>(.*?)</span>',
        section_html,
        flags=re.DOTALL,
    )
    if not date_match:
        return []

    schedule_date = parse_walla_date(clean_html_text(date_match.group(1)), today)
    if not schedule_date:
        return []

    cards = re.findall(
        r'<div[^>]*class="[^"]*css-ual8pl[^"]*"[^>]*style="([^"]*)"[^>]*>\s*'
        r'<h3[^>]*>(.*?)</h3>\s*'
        r'<time[^>]*>(.*?)</time>',
        section_html,
        flags=re.DOTALL,
    )

    day_programs = []
    previous_minutes_of_day = None
    current_date = schedule_date

    for style, raw_name, raw_time in cards:
        name = clean_html_text(raw_name)
        clock = parse_clock(raw_time)
        duration_minutes = parse_width_minutes(style)

        if not name or not clock:
            continue

        hour, minute = clock
        minutes_of_day = hour * 60 + minute

        if previous_minutes_of_day is not None and minutes_of_day < previous_minutes_of_day:
            current_date = current_date + timedelta(days=1)

        previous_minutes_of_day = minutes_of_day

        start_dt = datetime(
            current_date.year,
            current_date.month,
            current_date.day,
            hour,
            minute,
            tzinfo=ISRAEL_TZ,
        )

        if duration_minutes is None:
            duration_minutes = 30

        end_dt = start_dt + timedelta(minutes=duration_minutes)

        day_programs.append(
            {
                "start": int(start_dt.timestamp()),
                "end": int(end_dt.timestamp()),
                "name": name,
                "description": "",
            }
        )

    return day_programs


def parse_hidabroot_epg(today: datetime | None = None) -> list[dict]:
    today = today or datetime.now(APP_TZ)
    html = fetch_html()

    programs = []
    for section_html in extract_tv_guide_sections(html):
        programs.extend(parse_section(section_html, today))

    return dedupe_and_sort_programs(programs)


if __name__ == "__main__":
    import json

    print(json.dumps(parse_hidabroot_epg(), ensure_ascii=False, indent=2))
