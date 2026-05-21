import json
import re
from datetime import datetime, timedelta
from html import unescape
from html.parser import HTMLParser
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from epg_parsers.common import dedupe_and_sort_programs


RADIO100FM_URL = "https://www.100fm.co.il/broadcast/"
ISRAEL_TZ = ZoneInfo("Asia/Jerusalem")
APP_TZ = ZoneInfo("America/New_York")
DEFAULT_DAYS = 5


HEBREW_WEEKDAY_TO_INDEX = {
    "יום שני": 0,
    "יום שלישי": 1,
    "יום רביעי": 2,
    "יום חמישי": 3,
    "יום שישי": 4,
    "יום שבת": 5,
    "יום ראשון": 6,
}


class TextParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in {"h1", "h2", "h3", "h4", "h5", "li", "p", "div", "section", "article"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"h1", "h2", "h3", "h4", "h5", "li", "p", "div", "section", "article"}:
            self.parts.append("\n")

    def handle_data(self, data):
        text = " ".join(data.split())
        if text:
            self.parts.append(text)

    def text(self) -> str:
        return unescape(" ".join(self.parts))


def fetch_html(url: str = RADIO100FM_URL) -> str:
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


def html_to_lines(html: str) -> list[str]:
    parser = TextParser()
    parser.feed(html)
    text = parser.text()
    lines = [line.strip() for line in re.split(r"\s*\n\s*", text) if line.strip()]
    return lines


def normalize_title(value: str) -> str:
    value = re.sub(r"\s+", " ", value or "").strip()
    return value.strip(" -–")


def parse_schedule_line(value: str):
    # Supports:
    # 18:00 NON STOP MUSIC
    # 18:00 - 00:00 NON STOP MUSIC
    # 18:00–00:00 NON STOP MUSIC
    value = normalize_title(value)

    range_match = re.match(
        r"^\s*(\d{1,2}):([0-5]\d)\s*[-–]\s*(\d{1,2}):([0-5]\d)\s+(.+)$",
        value,
    )
    if range_match:
        start_hour = int(range_match.group(1))
        start_minute = int(range_match.group(2))
        end_hour = int(range_match.group(3))
        end_minute = int(range_match.group(4))
        title = normalize_title(range_match.group(5))

        start_day_offset = 0
        end_day_offset = 0

        if start_hour == 24:
            start_hour = 0
            start_day_offset = 1

        if end_hour == 24:
            end_hour = 0
            end_day_offset = 1

        if end_hour * 60 + end_minute <= start_hour * 60 + start_minute:
            end_day_offset += 1

        return {
            "start_hour": start_hour,
            "start_minute": start_minute,
            "start_day_offset": start_day_offset,
            "end_hour": end_hour,
            "end_minute": end_minute,
            "end_day_offset": end_day_offset,
            "name": title,
            "description": "",
        }

    start_match = re.match(r"^\s*(\d{1,2}):([0-5]\d)\s+(.+)$", value)
    if not start_match:
        return None

    hour = int(start_match.group(1))
    minute = int(start_match.group(2))
    title = normalize_title(start_match.group(3))

    day_offset = 0
    if hour == 24:
        hour = 0
        day_offset = 1

    if hour > 24:
        return None

    return {
        "start_hour": hour,
        "start_minute": minute,
        "start_day_offset": day_offset,
        "end_hour": None,
        "end_minute": None,
        "end_day_offset": None,
        "name": title,
        "description": "",
    }


def extract_weekly_schedule(lines: list[str]) -> dict[str, list[dict]]:
    schedules: dict[str, list[dict]] = {}
    current_day: str | None = None
    in_schedule = False

    for line in lines:
        if line == "לוח שידורים":
            in_schedule = True
            continue

        if not in_schedule:
            continue

        if line in HEBREW_WEEKDAY_TO_INDEX:
            current_day = line
            schedules.setdefault(current_day, [])
            continue

        if line.startswith("ז׳אנרים") or line.startswith("אודות") or line.startswith("תנאי שימוש"):
            break

        if not current_day:
            continue

        item = parse_schedule_line(line)
        if item:
            schedules[current_day].append(item)

    return schedules


def build_programs_for_day(schedule_items: list[dict], schedule_date) -> list[dict]:
    programs = []
    previous_minutes = None
    rollover_days = 0

    for item in schedule_items:
        minutes = item["start_hour"] * 60 + item["start_minute"]

        if previous_minutes is not None and minutes < previous_minutes:
            rollover_days += 1

        previous_minutes = minutes

        start_date = schedule_date + timedelta(days=rollover_days + item.get("start_day_offset", 0))
        start_dt = datetime(
            start_date.year,
            start_date.month,
            start_date.day,
            item["start_hour"],
            item["start_minute"],
            tzinfo=ISRAEL_TZ,
        )

        if item.get("end_hour") is not None:
            end_date = schedule_date + timedelta(days=rollover_days + item.get("end_day_offset", 0))
            end_dt = datetime(
                end_date.year,
                end_date.month,
                end_date.day,
                item["end_hour"],
                item["end_minute"],
                tzinfo=ISRAEL_TZ,
            )
        else:
            # Temporary fallback. It will be corrected globally after all days are merged.
            end_dt = start_dt + timedelta(minutes=30)

        programs.append(
            {
                "start": int(start_dt.timestamp()),
                "end": int(end_dt.timestamp()),
                "name": item["name"],
                "description": item.get("description", ""),
            }
        )

    return programs


def stretch_to_next_program(programs: list[dict]) -> list[dict]:
    programs = dedupe_and_sort_programs(programs)

    for index in range(len(programs) - 1):
        current = programs[index]
        next_program = programs[index + 1]

        # Fix short default durations and prevent timeline holes.
        if next_program["start"] > current["start"]:
            current["end"] = next_program["start"]

    return programs


def parse_100fm_epg(today: datetime | None = None, days: int = DEFAULT_DAYS) -> list[dict]:
    now = today or datetime.now(APP_TZ)
    app_start_date = now.astimezone(APP_TZ).date()

    html = fetch_html()
    schedules = extract_weekly_schedule(html_to_lines(html))

    programs = []
    for offset in range(days):
        target_date = app_start_date + timedelta(days=offset)

        # Python Monday=0 ... Sunday=6.
        weekday_index = target_date.weekday()
        hebrew_day = next(
            (day_name for day_name, index in HEBREW_WEEKDAY_TO_INDEX.items() if index == weekday_index),
            None,
        )

        if not hebrew_day:
            continue

        day_items = schedules.get(hebrew_day, [])
        programs.extend(build_programs_for_day(day_items, target_date))

    return stretch_to_next_program(programs)


if __name__ == "__main__":
    print(json.dumps(parse_100fm_epg(), ensure_ascii=False, indent=2))
