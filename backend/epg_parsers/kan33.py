import html
import json
import re
import time
from urllib.error import HTTPError, URLError
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from urllib.parse import urlencode
from urllib.parse import urljoin
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from epg_parsers.common import dedupe_and_sort_programs, fill_short_gaps

try:
    from curl_cffi import requests as curl_requests
except ImportError:
    curl_requests = None

KAN33_SCHEDULE_URL = "https://www.kan.org.il/umbraco/surface/LoadBroadcastSchedule/LoadSchedule"
KAN_TV_GUIDE_URL = "https://www.kan.org.il/tv-guide/"
KAN_BASE_URL = "https://www.kan.org.il"
ISRAEL_TZ = ZoneInfo("Asia/Jerusalem")
APP_TZ = ZoneInfo("America/New_York")
KAN11_CHANNEL_ID = "4444"
KAN23_CHANNEL_ID = "4471"
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
    headers = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://www.kan.org.il/tv-guide/",
        "X-Requested-With": "XMLHttpRequest",
        "X-Time-Offset": str(int(datetime.now().astimezone().utcoffset().total_seconds() / -60)),
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
        ),
    }

    if curl_requests is not None:
        response = curl_requests.get(url, headers=headers, timeout=30, impersonate="chrome124")
        response.raise_for_status()
        body = response.text
        if "::CLOUDFLARE_ERROR" not in body and "/cdn-cgi/challenge-platform/" not in body:
            return body

    request = Request(
        url,
        headers=headers,
    )

    last_error = None
    for attempt in range(3):
        try:
            with urlopen(request, timeout=30) as response:
                charset = response.headers.get_content_charset() or "utf-8"
                body = response.read().decode(charset, errors="replace")
                if "::CLOUDFLARE_ERROR" in body or "/cdn-cgi/challenge-platform/" in body:
                    raise RuntimeError("Cloudflare challenge page returned instead of Kan schedule")
                return body
        except (HTTPError, URLError) as exc:
            last_error = exc
            if attempt == 2:
                break
            time.sleep(1 + attempt)
        except RuntimeError as exc:
            last_error = exc
            if attempt == 2:
                break
            time.sleep(1 + attempt)

    raise last_error


def build_schedule_url(day: datetime, channel_id: str = CHANNEL_ID, current_page_id: str = CURRENT_PAGE_ID) -> str:
    params = {
        "day": day.strftime("%d-%m-%Y"),
        "channelId": channel_id,
        "currentPageId": current_page_id,
    }
    return f"{KAN33_SCHEDULE_URL}?{urlencode(params)}"


def build_tv_guide_url(day: datetime, channel_id: str = CHANNEL_ID) -> str:
    params = {
        "channelId": channel_id,
        "day": day.strftime("%d-%m-%Y"),
    }
    return f"{KAN_TV_GUIDE_URL}?{urlencode(params)}"


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


def parse_kan_data_datetime(value: str) -> datetime | None:
    value = html.unescape(value or "").strip()
    if not value:
        return None

    for pattern in ("%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M"):
        try:
            return datetime.strptime(value, pattern).replace(tzinfo=timezone.utc)
        except ValueError:
            continue

    return None


def clean_text(value: str) -> str:
    value = html.unescape(re.sub(r"<[^>]+>", " ", value or ""))
    return " ".join(value.split())


def normalize_program_title(value: str) -> str:
    value = clean_text(value)
    value = re.sub(r"\bפרק\s+\d+\b", " ", value)
    value = re.sub(r"\bעונה\s+\d+\b", " ", value)
    value = re.sub(r"\b\d+\b", " ", value)
    value = re.sub(r"[\"'״׳:;,.!?()\\[\\]{}\\-–—_]+", " ", value)
    return " ".join(value.split()).lower()


def first_value(*values) -> str:
    for value in values:
        if value:
            return str(value)

    return ""


def normalize_image_url(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return ""

    if " " in value:
        value = value.split(",", 1)[0].strip().split(" ", 1)[0]

    value = urljoin(KAN_BASE_URL, value)

    azure_image = extract_kan_azure_image_url(value)
    if azure_image:
        return azure_image

    return value


def extract_kan_azure_image_url(value: str) -> str:
    match = re.search(
        r"https-kanstaticazureedgenet-download-pictures-"
        r"(\d{4})-(\d{1,2})-(\d{1,2})-(imgid-[^/?#]+)",
        value,
    )
    if not match:
        return ""

    year, month, day, filename = match.groups()
    return f"https://kanstatic.azureedge.net/download/pictures/{year}/{month}/{day}/{filename}"


def find_image_in_object(value) -> str:
    image_keys = {
        "image",
        "imageurl",
        "image_url",
        "thumbnail",
        "thumbnailurl",
        "thumbnail_url",
        "poster",
        "posterurl",
        "poster_url",
    }

    if isinstance(value, dict):
        for key, item in value.items():
            if key.lower() in image_keys and isinstance(item, str):
                image = normalize_image_url(html.unescape(item))
                if image:
                    return image

        for item in value.values():
            image = find_image_in_object(item)
            if image:
                return image

    if isinstance(value, list):
        for item in value:
            image = find_image_in_object(item)
            if image:
                return image

    return ""


def extract_first_image(html_text: str) -> str:
    patterns = [
        r'<img[^>]+(?:data-src|data-lazy-src|src)="([^"]+)"',
        r"<img[^>]+(?:data-src|data-lazy-src|src)='([^']+)'",
        r'<source[^>]+srcset="([^"]+)"',
        r"<source[^>]+srcset='([^']+)'",
        r'background-image:\s*url\(["\']?([^"\'()]+)',
        r'"(?:Image|image|ImageUrl|imageUrl|Thumbnail|thumbnail|Poster|poster)"\s*:\s*"([^"]+)"',
        r'((?:https?:)?//www\.kan\.org\.il/media/[^"\'<>\s)]+)',
        r'(/media/[^"\'<>\s)]+)',
    ]

    for pattern in patterns:
        match = re.search(pattern, html_text, flags=re.IGNORECASE)
        if not match:
            continue

        image = normalize_image_url(html.unescape(match.group(1)))
        if image:
            return image

    return ""


def extract_first_attr(html_text: str, pattern: str) -> str:
    match = re.search(pattern, html_text, flags=re.IGNORECASE | re.DOTALL)
    if not match:
        return ""

    return html.unescape(match.group(1)).strip()


def parse_results_item_html(html_text: str) -> list[dict]:
    if "results-item" not in html_text:
        return []

    blocks = re.split(r'<div\s+class="results-item[^"]*"', html_text)
    programs: list[dict] = []

    for block in blocks[1:]:
        start_value = extract_first_attr(block, r'data-date-utc="([^"]+)"')
        start_dt = parse_kan_data_datetime(start_value)
        title = clean_text(extract_first_attr(block, r'<h3[^>]*class="program-title"[^>]*>(.*?)</h3>'))
        description = clean_text(
            extract_first_attr(block, r'<div[^>]*class="program-description"[^>]*>(.*?)</div>')
        )
        image = extract_first_image(block)

        if not start_dt or not title:
            continue

        program = {
            "start": int(start_dt.timestamp()),
            "end": 0,
            "name": title,
            "description": description,
        }

        if image:
            program["image"] = normalize_image_url(image)

        programs.append(program)

    programs = dedupe_and_sort_programs(programs)
    for index, program in enumerate(programs):
        if index + 1 < len(programs):
            program["end"] = programs[index + 1]["start"]
        else:
            program["end"] = program["start"] + 30 * 60

    return programs


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
        image = find_image_in_object(obj) or first_value(
            obj.get("Image"),
            obj.get("image"),
            obj.get("ImageUrl"),
            obj.get("imageUrl"),
            obj.get("Thumbnail"),
            obj.get("thumbnail"),
            obj.get("Poster"),
            obj.get("poster"),
        )

        if not title or not start_dt or not end_dt:
            continue

        program = {
            "start": int(start_dt.timestamp()),
            "end": int(end_dt.timestamp()),
            "name": clean_text(str(title)),
            "description": clean_text(str(obj.get("Description") or obj.get("description") or "")),
        }
        if image:
            program["image"] = normalize_image_url(html.unescape(image))

        programs.append(program)

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


def parse_time_based_html(html_text: str, schedule_day: datetime) -> list[dict]:
    time_matches = list(re.finditer(r"(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)", html_text))
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

        scope_start = time_matches[index - 1].end() if index > 0 else 0
        segment_start = match.end()
        segment_end = time_matches[index + 1].start() if index + 1 < len(time_matches) else len(html_text)
        pre_time_segment = html_text[scope_start:match.start()]
        segment = html_text[segment_start:segment_end]
        lines = [line.strip(" -–—\t") for line in extract_text(segment).splitlines()]
        lines = [line for line in lines if line and not is_noise_line(line)]
        if not lines:
            continue

        program = {
            "start": int(start_dt.timestamp()),
            "end": 0,
            "name": lines[0],
            "description": " ".join(lines[1:]).strip(),
        }

        image = extract_first_image(pre_time_segment) or extract_first_image(segment)
        if image:
            program["image"] = image

        programs.append(program)

    for index, program in enumerate(programs):
        if index + 1 < len(programs):
            program["end"] = programs[index + 1]["start"]
        else:
            program["end"] = program["start"] + 30 * 60

    return programs


def parse_kan33_day(html_text: str, schedule_day: datetime) -> list[dict]:
    results_item_programs = parse_results_item_html(html_text)
    if results_item_programs:
        return results_item_programs

    structured_programs = parse_structured_objects(html_text)
    if structured_programs:
        return structured_programs

    text_programs = parse_time_based_text(html_text, schedule_day)
    if not text_programs:
        return []

    html_programs = parse_time_based_html(html_text, schedule_day)
    images_by_start = {
        program["start"]: program["image"]
        for program in html_programs
        if program.get("image")
    }

    for program in text_programs:
        image = images_by_start.get(program["start"])
        if image:
            program["image"] = image

    return text_programs


def apply_tv_guide_images(programs: list[dict], page_programs: list[dict]) -> list[dict]:
    if not programs or not page_programs:
        return programs

    image_by_start = {
        program["start"]: program["image"]
        for program in page_programs
        if program.get("image")
    }
    image_by_start_and_title = {
        (program["start"], normalize_program_title(program.get("name", ""))): program["image"]
        for program in page_programs
        if program.get("image")
    }

    for program in programs:
        image = image_by_start_and_title.get(
            (program["start"], normalize_program_title(program.get("name", "")))
        ) or image_by_start.get(program["start"])
        if image:
            program["image"] = normalize_image_url(image)

    return programs


def parse_kan_schedule_epg(
    channel_id: str,
    label: str,
    days: int = 5,
    today: datetime | None = None,
    current_page_id: str = CURRENT_PAGE_ID,
) -> list[dict]:
    today = today or datetime.now(APP_TZ)
    today = today.astimezone(APP_TZ)

    programs: list[dict] = []
    for offset in range(days):
        schedule_day = today + timedelta(days=offset)
        url = build_schedule_url(schedule_day, channel_id=channel_id, current_page_id=current_page_id)
        page_url = build_tv_guide_url(schedule_day, channel_id=channel_id)
        source_url = url
        try:
            html_text = fetch_html(url)
            day_programs = parse_kan33_day(html_text, schedule_day)
        except Exception:
            if programs:
                print(f"Skipped {label} schedule day after partial success: {url}")
                break

            print(f"Failed parsing {label} schedule endpoint, trying tv-guide page: {url}")
            day_programs = []

        if not day_programs:
            try:
                page_html = fetch_html(page_url)
                day_programs = parse_kan33_day(page_html, schedule_day)
                source_url = page_url
            except Exception:
                if programs:
                    print(f"Skipped {label} tv-guide day after partial success: {page_url}")
                    break
                raise
        else:
            try:
                page_html = fetch_html(page_url)
                page_programs = parse_kan33_day(page_html, schedule_day)
                day_programs = apply_tv_guide_images(day_programs, page_programs)
            except Exception as ex:
                print(f"Skipped {label} tv-guide images for {page_url}: {ex}")

        print(f"Parsed {len(day_programs)} {label} programs from {source_url}")
        programs.extend(day_programs)

    return fill_short_gaps(dedupe_and_sort_programs(programs))


def parse_kan11_epg(days: int = 5, today: datetime | None = None) -> list[dict]:
    return parse_kan_schedule_epg(KAN11_CHANNEL_ID, "Kan 11", days=days, today=today)


def parse_kan23_epg(days: int = 5, today: datetime | None = None) -> list[dict]:
    return parse_kan_schedule_epg(KAN23_CHANNEL_ID, "Kan 23", days=days, today=today)


def parse_kan33_epg(days: int = 5, today: datetime | None = None) -> list[dict]:
    return parse_kan_schedule_epg(CHANNEL_ID, "Kan 33", days=days, today=today)
