import json
import re
from datetime import datetime, timedelta
from html import unescape
from html.parser import HTMLParser
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from epg_parsers.common import dedupe_and_sort_programs, fill_short_gaps


GLGLZ_SCHEDULE_URL = "https://glz.co.il/%D7%92%D7%9C%D7%92%D7%9C%D7%A6/%D7%9C%D7%95%D7%97-%D7%A9%D7%99%D7%93%D7%95%D7%A8%D7%99%D7%9D/"
ISRAEL_TZ = ZoneInfo("Asia/Jerusalem")
APP_TZ = ZoneInfo("America/New_York")
DEFAULT_DAYS = 7

HEBREW_DAY_NAMES = {
    "יום ראשון",
    "יום שני",
    "יום שלישי",
    "יום רביעי",
    "יום חמישי",
    "יום שישי",
    "יום שבת",
}


class ScheduleHTMLParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.stack: list[dict] = []
        self.positioned_elements: list[dict] = []

    def handle_starttag(self, tag, attrs):
        attrs_dict = {key.lower(): value or "" for key, value in attrs}
        if tag in {"h1", "h2", "h3", "h4", "h5", "li", "p", "div", "section", "article"}:
            self.parts.append("\n")
        self.stack.append({"tag": tag, "attrs": attrs_dict, "text": []})

    def handle_endtag(self, tag):
        if not self.stack:
            return

        element = self.stack.pop()
        text = normalize_text(" ".join(element["text"]))
        if text:
            if self.stack:
                self.stack[-1]["text"].append(text)
            if has_schedule_position(element["attrs"]):
                self.positioned_elements.append(
                    {
                        "text": text,
                        "attrs": element["attrs"],
                    }
                )

        if tag in {"h1", "h2", "h3", "h4", "h5", "li", "p", "div", "section", "article"}:
            self.parts.append("\n")

    def handle_data(self, data):
        text = normalize_text(data)
        if not text:
            return
        self.parts.append(text)
        if self.stack:
            self.stack[-1]["text"].append(text)

    def lines(self) -> list[str]:
        text = unescape(" ".join(self.parts))
        return [line.strip() for line in re.split(r"\s*\n\s*", text) if line.strip()]


def fetch_html(url: str = GLGLZ_SCHEDULE_URL) -> str:
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


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def has_schedule_position(attrs: dict) -> bool:
    style = attrs.get("style", "")
    return any(
        key in attrs and attrs.get(key)
        for key in ("data-date", "data-day", "data-start", "data-end", "data-start-time", "data-end-time")
    ) or "grid-row" in style or "grid-column" in style


def parse_schedule_page(html: str) -> tuple[list[datetime], list[str], list[dict]]:
    if "_Incapsula_Resource" in html or "Request unsuccessful. Incapsula" in html:
        raise RuntimeError("GLZ returned an Incapsula challenge page instead of the schedule")

    parser = ScheduleHTMLParser()
    parser.feed(html)
    lines = parser.lines()
    dates = extract_schedule_dates(lines)
    hours = extract_time_axis(lines)
    return dates, hours, parser.positioned_elements


def extract_schedule_dates(lines: list[str]) -> list[datetime]:
    dates: list[datetime] = []
    in_schedule = False

    for index, line in enumerate(lines):
        if line == "לוח שידורים":
            in_schedule = True
            continue
        if not in_schedule:
            continue

        if line in HEBREW_DAY_NAMES and index + 1 < len(lines):
            date_match = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$", lines[index + 1])
            if date_match:
                day = int(date_match.group(1))
                month = int(date_match.group(2))
                year = int(date_match.group(3))
                if year < 100:
                    year += 2000
                dates.append(datetime(year, month, day, tzinfo=ISRAEL_TZ))

        if dates and line == "06:00":
            break

    return dates


def extract_time_axis(lines: list[str]) -> list[str]:
    start_index = next((index for index, line in enumerate(lines) if line == "06:00"), None)
    if start_index is None:
        return []

    hours = []
    for line in lines[start_index:]:
        if re.match(r"^\d{2}:\d{2}$", line):
            hours.append(line)
            continue
        if hours:
            break

    return hours


def parse_int_attr(attrs: dict, names: tuple[str, ...]) -> int | None:
    for name in names:
        value = attrs.get(name)
        if value:
            match = re.search(r"\d+", value)
            if match:
                return int(match.group(0))
    return None


def parse_css_int(style: str, property_name: str) -> int | None:
    match = re.search(rf"{re.escape(property_name)}\s*:\s*(\d+)", style, re.IGNORECASE)
    if match:
        return int(match.group(1))
    return None


def parse_css_span(style: str, property_name: str) -> int | None:
    match = re.search(rf"{re.escape(property_name)}\s*:[^;]*span\s+(\d+)", style, re.IGNORECASE)
    if match:
        return int(match.group(1))
    return None


def parse_time(value: str | None) -> tuple[int, int] | None:
    if not value:
        return None
    match = re.search(r"(\d{1,2}):([0-5]\d)", value)
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2))
    if hour == 24:
        hour = 0
    if hour > 24:
        return None
    return hour, minute


def datetime_for_time(day_start: datetime, hour: int, minute: int) -> datetime:
    result = day_start.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if hour < 6:
        result += timedelta(days=1)
    return result


def clean_program_name(text: str) -> str:
    text = normalize_text(text)
    text = re.sub(r"\bImage\b", "", text).strip()
    text = re.sub(r"^(Button:\s*)?", "", text).strip()
    return text.strip(" -–")


def positioned_element_to_program(element: dict, dates: list[datetime], hours: list[str]) -> dict | None:
    attrs = element.get("attrs", {})
    style = attrs.get("style", "")
    title = clean_program_name(element.get("text", ""))
    if not title or title in {"Image", "לוח שידורים"}:
        return None

    date_value = attrs.get("data-date") or attrs.get("data-day-date")
    day_start = None
    if date_value:
        for pattern in ("%Y-%m-%d", "%d.%m.%Y", "%d.%m.%y"):
            try:
                day_start = datetime.strptime(date_value, pattern).replace(tzinfo=ISRAEL_TZ)
                break
            except ValueError:
                pass

    column = parse_int_attr(attrs, ("data-day", "data-column", "data-col", "aria-colindex"))
    if column is None:
        column = parse_css_int(style, "grid-column-start") or parse_css_int(style, "grid-column")

    if day_start is None and column is not None and 1 <= column <= len(dates):
        day_start = dates[column - 1]

    if day_start is None:
        return None

    explicit_start = parse_time(
        attrs.get("data-start")
        or attrs.get("data-start-time")
        or attrs.get("data-from")
        or attrs.get("aria-label")
        or title
    )
    explicit_end = parse_time(
        attrs.get("data-end")
        or attrs.get("data-end-time")
        or attrs.get("data-to")
        or attrs.get("aria-label")
    )

    if explicit_start:
        start_dt = datetime_for_time(day_start, explicit_start[0], explicit_start[1])
    else:
        row = parse_int_attr(attrs, ("data-row", "aria-rowindex"))
        if row is None:
            row = parse_css_int(style, "grid-row-start") or parse_css_int(style, "grid-row")
        if row is None or row < 1 or row > len(hours):
            return None
        start_time = parse_time(hours[row - 1])
        if not start_time:
            return None
        start_dt = datetime_for_time(day_start, start_time[0], start_time[1])

    if explicit_end:
        end_dt = datetime_for_time(day_start, explicit_end[0], explicit_end[1])
        if end_dt <= start_dt:
            end_dt += timedelta(days=1)
    else:
        row = parse_int_attr(attrs, ("data-row", "aria-rowindex"))
        if row is None:
            row = parse_css_int(style, "grid-row-start") or parse_css_int(style, "grid-row")
        span = parse_int_attr(attrs, ("data-row-span", "data-span", "aria-rowspan"))
        if span is None:
            span = parse_css_span(style, "grid-row")
        if row is not None and span and row - 1 + span < len(hours):
            end_time = parse_time(hours[row - 1 + span])
            if end_time:
                end_dt = datetime_for_time(day_start, end_time[0], end_time[1])
            else:
                end_dt = start_dt + timedelta(hours=1)
        else:
            end_dt = start_dt + timedelta(hours=1)

    return {
        "start": int(start_dt.timestamp()),
        "end": int(end_dt.timestamp()),
        "name": title,
        "description": "",
    }


def parse_glglz_epg(
    today: datetime | None = None,
    days: int = DEFAULT_DAYS,
    html_text: str | None = None,
) -> list[dict]:
    html = html_text if html_text is not None else fetch_html()
    dates, hours, positioned_elements = parse_schedule_page(html)
    programs = [
        program
        for program in (
            positioned_element_to_program(element, dates, hours)
            for element in positioned_elements
        )
        if program is not None
    ]

    programs = dedupe_and_sort_programs(programs)
    if today is not None and days > 0:
        start = today.astimezone(APP_TZ)
        start_ts = int(datetime(start.year, start.month, start.day, tzinfo=APP_TZ).timestamp())
        end_ts = int((datetime(start.year, start.month, start.day, tzinfo=APP_TZ) + timedelta(days=days)).timestamp())
        programs = [program for program in programs if start_ts <= program["start"] < end_ts]

    return fill_short_gaps(programs)


if __name__ == "__main__":
    print(json.dumps(parse_glglz_epg(), ensure_ascii=False, indent=2))
