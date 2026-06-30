import html
import re
from datetime import datetime, timedelta
from html.parser import HTMLParser
from urllib.parse import quote, urljoin
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from epg_parsers.common import dedupe_and_sort_programs, fill_short_gaps


NINE_TV_SCHEDULE_URL = "https://www.9tv.co.il/BroadcastSchedule"
NINE_TV_DAY_URL = "https://www.9tv.co.il/BroadcastSchedule/getBrodcastSchedule/?date={date}"
ISRAEL_TZ = ZoneInfo("Asia/Jerusalem")


def fetch_html(url: str) -> str:
    request = Request(
        url,
        headers={
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ru-RU,ru;q=0.9,he-IL;q=0.8,he;q=0.7,en-US;q=0.6,en;q=0.5",
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
            ),
        },
    )
    with urlopen(request, timeout=30) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def parse_available_dates(html_text: str) -> list[datetime]:
    dates = []
    for match in re.finditer(r"currentClick\(\d+,\s*'([^']+)'", html_text):
        try:
            parsed = datetime.strptime(match.group(1), "%d/%m/%Y %H:%M:%S").replace(tzinfo=ISRAEL_TZ)
        except ValueError:
            continue
        if parsed not in dates:
            dates.append(parsed)
    return dates


def make_day_url(day: datetime) -> str:
    value = day.strftime("%d/%m/%Y 00:00:00")
    return NINE_TV_DAY_URL.format(date=quote(value, safe=""))


class NineTvScheduleParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.programs = []
        self._in_item = False
        self._current = None
        self._capture = None

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        classes = attrs_dict.get("class", "").split()

        if tag == "a" and "guide_list_link" in classes and not self._in_item:
            self._in_item = True
            self._current = {"time": "", "name": "", "description": [], "image": ""}
            return

        if not self._in_item:
            return

        if tag == "div" and "guide_list_time" in classes:
            self._capture = "time"
        elif tag == "h3" and "guide_info_title" in classes:
            self._capture = "name"
        elif tag == "div" and "guide_info_pict" in classes:
            image = extract_background_image(attrs_dict.get("style", ""))
            if image:
                self._current["image"] = image
        elif tag == "div" and self._current and self._current.get("name") and not classes:
            self._capture = "description"

    def handle_data(self, data):
        if not self._in_item or not self._current or not self._capture:
            return

        value = data.strip()
        if not value:
            return

        if self._capture == "description":
            self._current["description"].append(value)
        else:
            self._current[self._capture] = " ".join([self._current.get(self._capture, ""), value]).strip()

    def handle_endtag(self, tag):
        if not self._in_item:
            return

        if tag in {"div", "h3"}:
            self._capture = None
        elif tag == "a":
            if self._current and self._current.get("time") and self._current.get("name"):
                self.programs.append(self._current)
            self._in_item = False
            self._current = None
            self._capture = None


def extract_background_image(style: str) -> str:
    match = re.search(r"url\(([^)]+)\)", style or "")
    if not match:
        return ""
    return match.group(1).strip("\"'")


def parse_day_programs(html_text: str, day: datetime) -> list[dict]:
    parser = NineTvScheduleParser()
    parser.feed(html_text)

    programs = []
    for item in parser.programs:
        try:
            hour, minute = item["time"].split(":", 1)
            start = day.replace(hour=int(hour), minute=int(minute), second=0, microsecond=0)
        except ValueError:
            continue

        image = urljoin(NINE_TV_SCHEDULE_URL, item.get("image", ""))
        programs.append(
            {
                "start": int(start.timestamp()),
                "end": int((start + timedelta(minutes=30)).timestamp()),
                "name": html.unescape(item["name"]).strip(),
                "description": html.unescape(" ".join(item.get("description", [])).strip()),
                "image": image,
            }
        )

    programs = dedupe_and_sort_programs(programs)
    for index in range(len(programs) - 1):
        programs[index]["end"] = programs[index + 1]["start"]
    if programs:
        programs[-1]["end"] = int((datetime.fromtimestamp(programs[-1]["start"], ISRAEL_TZ) + timedelta(minutes=30)).timestamp())

    return programs


def parse_9tv_epg() -> list[dict]:
    first_html = fetch_html(NINE_TV_SCHEDULE_URL)
    days = parse_available_dates(first_html)
    if not days:
        days = [datetime.now(ISRAEL_TZ).replace(hour=0, minute=0, second=0, microsecond=0)]

    programs = []
    for index, day in enumerate(days):
        html_text = first_html if index == 0 else fetch_html(make_day_url(day))
        programs.extend(parse_day_programs(html_text, day))

    print(f"Parsed {len(programs)} 9TV programs from {NINE_TV_SCHEDULE_URL}")
    return fill_short_gaps(dedupe_and_sort_programs(programs))
