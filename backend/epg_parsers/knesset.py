import re
from datetime import datetime, timedelta
from html.parser import HTMLParser
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from epg_parsers.common import dedupe_and_sort_programs, fill_short_gaps


KNESSET_GUIDE_URL = "https://www.knesset.tv/%D7%A2%D7%9B%D7%A9%D7%99%D7%95-%D7%9E%D7%A0%D7%92%D7%9F-%D7%91%D7%A2%D7%A8%D7%95%D7%A5/"
ISRAEL_TZ = ZoneInfo("Asia/Jerusalem")
APP_TZ = ZoneInfo("America/New_York")


def fetch_html(url: str = KNESSET_GUIDE_URL) -> str:
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
        raw = response.read()
    return raw.decode("utf-8", errors="ignore")


class TextParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_data(self, data):
        text = " ".join(data.split())
        if text:
            self.parts.append(text)


def html_to_text(html: str) -> list[str]:
    parser = TextParser()
    parser.feed(html)
    return parser.parts


def parse_time(value: str):
    match = re.search(r"\b([01]?\d|2[0-3]):([0-5]\d)\b", value or "")
    if not match:
        return None
    return int(match.group(1)), int(match.group(2))


def clean_title(value: str) -> str:
    value = re.sub(r"\b([01]?\d|2[0-3]):[0-5]\d\b", "", value or "")
    value = re.sub(r"\s+", " ", value).strip(" -–|")
    return value.strip()


def build_programs_from_text(text_parts: list[str], today: datetime) -> list[dict]:
    rows = []
    for index, text in enumerate(text_parts):
        parsed_time = parse_time(text)
        if not parsed_time:
            continue

        title = clean_title(text)
        if not title:
            lookahead = text_parts[index + 1:index + 4]
            title = next((clean_title(item) for item in lookahead if clean_title(item)), "")

        if not title:
            continue

        rows.append({
            "hour": parsed_time[0],
            "minute": parsed_time[1],
            "name": title,
            "description": "",
        })

    programs = []
    seen = set()
    current_date = today.date()
    previous_minutes = None

    for row in rows:
        minutes = row["hour"] * 60 + row["minute"]
        if previous_minutes is not None and minutes < previous_minutes:
            current_date += timedelta(days=1)
        previous_minutes = minutes

        start_dt = datetime(
            current_date.year,
            current_date.month,
            current_date.day,
            row["hour"],
            row["minute"],
            tzinfo=ISRAEL_TZ,
        )

        key = (int(start_dt.timestamp()), row["name"])
        if key in seen:
            continue
        seen.add(key)

        programs.append({
            "start": int(start_dt.timestamp()),
            "end": int((start_dt + timedelta(minutes=30)).timestamp()),
            "name": row["name"],
            "description": row["description"],
        })

    for index in range(len(programs) - 1):
        programs[index]["end"] = programs[index + 1]["start"]

    return programs


def parse_knesset_epg(today: datetime | None = None) -> list[dict]:
    today = today or datetime.now(APP_TZ)
    html = fetch_html()
    text_parts = html_to_text(html)
    programs = build_programs_from_text(text_parts, today)

    return fill_short_gaps(dedupe_and_sort_programs(programs))
