import re
from datetime import datetime, timedelta
from html.parser import HTMLParser
from urllib.parse import urljoin
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


def clean_text(value: str) -> str:
    return " ".join((value or "").replace("\xa0", " ").split()).strip()


class KnessetBroadcastParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.programs = []
        self.current_date = None
        self._capture_header_date = False
        self._in_broadcast = False
        self._broadcast_depth = 0
        self._in_desktop = False
        self._desktop_depth = 0
        self._current = None
        self._capture = None

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        classes = attrs_dict.get("class", "").split()

        if tag == "h2" and "broadcast-header-date" in classes and "desktop-date" in classes:
            self._capture_header_date = True
            return

        if tag == "div" and "broadcast-list-container" in classes:
            self._in_broadcast = True
            self._broadcast_depth = 1
            self._current = {"time": "", "name": "", "description": [], "image": ""}
            return

        if not self._in_broadcast:
            return

        if tag == "div":
            self._broadcast_depth += 1
            if "brodcast-listing-desktop" in classes:
                self._in_desktop = True
                self._desktop_depth = 1
                return
            if self._in_desktop:
                self._desktop_depth += 1

        if not self._in_desktop:
            return

        if tag == "p" and "broadcast-list-content-timing" in classes:
            self._capture = "time"
        elif tag == "h3" and "broadcast-list-content-title" in classes:
            self._capture = "name"
        elif tag == "div" and "broadcast-desc-alt" in classes:
            self._capture = "description"
        elif tag == "img" and self._current is not None:
            src = attrs_dict.get("src", "")
            alt = clean_text(attrs_dict.get("alt", ""))
            if src and alt and alt == clean_text(self._current.get("name", "")):
                self._current["image"] = urljoin(KNESSET_GUIDE_URL, src)

    def handle_data(self, data):
        text = clean_text(data)
        if not text:
            return

        if self._capture_header_date:
            parsed_date = parse_header_date(text)
            if parsed_date:
                self.current_date = parsed_date
            return

        if not self._in_broadcast or not self._in_desktop or not self._current or not self._capture:
            return

        if self._capture == "description":
            self._current["description"].append(text)
        else:
            self._current[self._capture] = clean_text(f"{self._current.get(self._capture, '')} {text}")

    def handle_endtag(self, tag):
        if tag == "h2" and self._capture_header_date:
            self._capture_header_date = False
            return

        if not self._in_broadcast:
            return

        if tag in {"p", "h3"}:
            self._capture = None
        elif tag == "div" and self._capture == "description":
            self._capture = None

        if tag == "div":
            if self._in_desktop:
                self._desktop_depth -= 1
                if self._desktop_depth <= 0:
                    self._in_desktop = False

            self._broadcast_depth -= 1
            if self._broadcast_depth <= 0:
                if self.current_date and self._current and self._current.get("time") and self._current.get("name"):
                    self.programs.append({**self._current, "date": self.current_date})
                self._in_broadcast = False
                self._in_desktop = False
                self._current = None
                self._capture = None


def parse_header_date(value: str):
    match = re.search(r"\b(\d{2})/(\d{2})/(\d{4})\b", value or "")
    if not match:
        return None

    day, month, year = map(int, match.groups())
    return datetime(year, month, day, tzinfo=ISRAEL_TZ).date()


def build_programs_from_broadcasts(items: list[dict]) -> list[dict]:
    programs = []
    seen = set()

    for item in items:
        parsed_time = parse_time(item.get("time", ""))
        if not parsed_time:
            continue

        start_dt = datetime(
            item["date"].year,
            item["date"].month,
            item["date"].day,
            parsed_time[0],
            parsed_time[1],
            tzinfo=ISRAEL_TZ,
        )
        key = (int(start_dt.timestamp()), clean_text(item.get("name", "")))
        if key in seen:
            continue
        seen.add(key)

        program = {
            "start": int(start_dt.timestamp()),
            "end": int((start_dt + timedelta(minutes=30)).timestamp()),
            "name": clean_text(item.get("name", "")),
            "description": clean_text(" ".join(item.get("description", []))),
        }
        image = clean_text(item.get("image", ""))
        if image:
            program["image"] = image
        programs.append(program)

    programs = dedupe_and_sort_programs(programs)
    for index in range(len(programs) - 1):
        current = programs[index]
        next_program = programs[index + 1]
        if next_program["start"] > current["start"]:
            current["end"] = next_program["start"]

    return programs


def parse_structured_broadcasts(html_text: str) -> list[dict]:
    parser = KnessetBroadcastParser()
    parser.feed(html_text)
    return build_programs_from_broadcasts(parser.programs)


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
    structured_programs = parse_structured_broadcasts(html)
    if structured_programs:
        return fill_short_gaps(dedupe_and_sort_programs(structured_programs))

    text_parts = html_to_text(html)
    programs = build_programs_from_text(text_parts, today)

    return fill_short_gaps(dedupe_and_sort_programs(programs))
