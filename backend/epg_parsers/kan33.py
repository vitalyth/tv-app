import html
import json
import re
from datetime import datetime, timedelta
from html.parser import HTMLParser
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from epg_parsers.common import dedupe_and_sort_programs, fill_short_gaps

KAN33_SCHEDULE_URL = "https://www.kan.org.il/umbraco/surface/LoadBroadcastSchedule/LoadSchedule"
ISRAEL_TZ = ZoneInfo("Asia/Jerusalem")
APP_TZ = ZoneInfo("America/New_York")
CHANNEL_ID = "4532"
CURRENT_PAGE_ID = "1517"
OUTPUT_CHANNEL_ID = "33"


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in {"br", "p", "div", "li", "section", "article", "h1", "h2", "h3", "h4", "button"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"p", "div", "li", "section", "article", "h1", "h2", "h3", "h4", "button"}:
            self.parts.append("\n")

    def handle_data(self, data):
        text = " ".join(data.split())
        if text:
            self.parts.append(text)

    def text(self) -> str:
        return html.unescape(" ".join(self.parts))


def fetch_html(url: str) -> str:
    request = Request(
        url,
        headers={
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
            ),
        },
    )
    with urlopen(request, timeout=30) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def build_schedule_url(day: datetime) -> str:
    params = {
        "day": day.strftime("%d-%m-%Y"),
        "channelId": CHANNEL_ID,
        "currentPageId": CURRENT_PAGE_ID,
    }
    return f"{KAN33_SCHEDULE_URL}?{urlencode(params)}"


def parse_datetime(value: str) -> datetime | None:
    value = (value or "").strip()
    if not value:
        return None

    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=ISRAEL_TZ)
        return parsed
    except ValueError:
        return None


def clean_text(value: str) -> str:
    value = html.unescape(re.sub(r"<[^>]+>", " ", value or ""))
    return " ".join(value.split())


def is_noise_line(value: str) -> bool:
    normalized = " ".join((value or "").split())
    if not normalized:
        return True
    noise = {
        "הצג/הסתר פרטי תוכנית",
        "הפעל/השהה תוכן",
        "הפעל/השהה",
    }
    return normalized in noise


def extract_text(html_text: str) -> str:
    parser = TextExtractor()
    parser.feed(html_text)
    text = parser.text()
    lines = [line.strip() for line in re.split(r"\s*\n\s*", text) if line.strip()]
    return "\n".join(line for line in lines if not is_noise_line(line))


def parse_structured_objects(html_text: str) -> list[dict]:
    # Some Kan pages include serialized JSON in attributes/scripts. This parser
    # tries common field names first, before falling back to visible text parsing.
    programs: list[dict] = []
    candidates = re.findall(r"\{[^{}]*(?:Start|start|Begin|begin)[^{}]*(?:End|end)[^{}]*\}", html_text)

    for candidate in candidates:
        try:
            obj = json.loads(html.unescape(candidate))
        except Exception:
            continue

        title = obj.get("Title") or obj.get("title") or obj.get("Name") or obj.get("name")
        start_value = obj.get("Start") or obj.get("start") or obj.get("StartDate") or obj.get("startDate") or obj.get("Begin")
        end_value = obj.get("End") or obj.get("end") or obj.get("EndDate") or obj.get("endDate")
        start_dt = parse_datetime(str(start_value or ""))
        end_dt = parse_datetime(str(end_value or ""))

        if not title or not start_dt or not end_dt:
            continue

        programs.append(
            {
                "start": int(start_dt.timestamp()),
                "end": int(end_dt.timestamp()),
                "name": clean_text(str(title)),
                "description": clean_text(str(obj.get("Description") or obj.get("description") or "")),
            }
        )

    return programs


def parse_time_based_text(html_text: str, schedule_day: datetime) -> list[dict]:
    text = extract_text(html_text)
    time_matches = list(re.finditer(r"(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)", text))
    if not time_matches:
        return []

    base_day = datetime(schedule_day.year, schedule_day.month, schedule_day.day, tzinfo=ISRAEL_TZ)
    programs = []
    previous_start: datetime | None = None

    for index, match in enumerate(time_matches):
        hour = int(match.group(1))
        minute = int(match.group(2))
        start_dt = base_day.replace(hour=hour, minute=minute)
        if previous_start and start_dt <= previous_start:
            start_dt += timedelta(days=1)
        previous_start = start_dt

        segment_start = match.end()
        segment_end = time_matches[index + 1].start() if index + 1 < len(time_matches) else len(text)
        segment = text[segment_start:segment_end]
        lines = [line.strip(" -–—\t") for line in segment.splitlines()]
        lines = [line for line in lines if line and not is_noise_line(line)]
        if not lines:
            continue

        title = lines[0]
        description = " ".join(lines[1:]).strip()
        programs.append(
            {
                "start": int(start_dt.timestamp()),
                "end": 0,
                "name": title,
                "description": description,
            }
        )

    for index, program in enumerate(programs):
        if index + 1 < len(programs):
            program["end"] = programs[index + 1]["start"]
        else:
            program["end"] = program["start"] + 30 * 60

    return programs


def parse_kan33_day(html_text: str, schedule_day: datetime) -> list[dict]:
    structured_programs = parse_structured_objects(html_text)
    if structured_programs:
        return structured_programs

    return parse_time_based_text(html_text, schedule_day)


def parse_kan33_epg(days: int = 5, today: datetime | None = None) -> list[dict]:
    today = today or datetime.now(APP_TZ)
    today = today.astimezone(APP_TZ)

    programs: list[dict] = []
    for offset in range(days):
        schedule_day = today + timedelta(days=offset)
        url = build_schedule_url(schedule_day)
        html_text = fetch_html(url)
        day_programs = parse_kan33_day(html_text, schedule_day)
        print(f"Parsed {len(day_programs)} Kan 33 programs from {url}")
        programs.extend(day_programs)

    return fill_short_gaps(dedupe_and_sort_programs(programs))
