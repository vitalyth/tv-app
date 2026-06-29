import json
import re
from datetime import datetime, timedelta
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from epg_parsers.common import dedupe_and_sort_programs, fill_short_gaps

try:
    from curl_cffi import requests as curl_requests
except ImportError:
    curl_requests = None


C14_SCHEDULE_URL = "https://www.c14.co.il/shidurim"
ISRAEL_TZ = ZoneInfo("Asia/Jerusalem")


def fetch_html(url: str = C14_SCHEDULE_URL) -> str:
    headers = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
        ),
    }

    if curl_requests is not None:
        response = curl_requests.get(url, headers=headers, timeout=30, impersonate="chrome124")
        response.raise_for_status()
        if "cf-mitigated" not in response.text and "Just a moment..." not in response.text:
            return response.text

    request = Request(url, headers=headers)
    with urlopen(request, timeout=30) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        body = response.read().decode(charset, errors="replace")
        if "cf-mitigated" in body or "Just a moment..." in body:
            raise RuntimeError("Cloudflare challenge page returned instead of Channel 14 schedule")
        return body


def extract_next_f_text(html_text: str) -> str:
    parts = []
    for match in re.finditer(r"self\.__next_f\.push\((.*?)\)</script>", html_text, re.DOTALL):
        try:
            payload = json.loads(match.group(1))
        except json.JSONDecodeError:
            continue

        parts.extend(item for item in payload if isinstance(item, str))

    return "\n".join(parts)


def is_schedule_data(value) -> bool:
    if not isinstance(value, list) or not value:
        return False

    for day in value:
        if not isinstance(day, dict) or len(day) != 1:
            return False

        date_value, programs = next(iter(day.items()))
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(date_value)):
            return False
        if not isinstance(programs, list):
            return False

    return True


def extract_schedule_data(html_text: str) -> list[dict]:
    text = extract_next_f_text(html_text)
    decoder = json.JSONDecoder()

    for match in re.finditer(r'"data"\s*:\s*', text):
        start = match.end()
        try:
            value, _ = decoder.raw_decode(text[start:])
        except json.JSONDecodeError:
            continue

        if is_schedule_data(value):
            return value

    return []


def parse_clock(schedule_date: str, value: str) -> datetime | None:
    value = (value or "").strip()
    if not schedule_date or not value:
        return None

    try:
        return datetime.strptime(f"{schedule_date} {value}", "%Y-%m-%d %H:%M").replace(tzinfo=ISRAEL_TZ)
    except ValueError:
        return None


def normalize_image_url(value: str) -> str:
    value = (value or "").strip()
    if value.startswith("//"):
        return f"https:{value}"
    return value


def parse_c14_epg(html_text: str | None = None) -> list[dict]:
    html_text = html_text or fetch_html()
    schedule_data = extract_schedule_data(html_text)

    programs = []
    for day in schedule_data:
        schedule_date, items = next(iter(day.items()))
        for item in items:
            title = " ".join((item.get("program") or "").split())
            start_dt = parse_clock(schedule_date, item.get("start") or "")
            end_dt = parse_clock(schedule_date, item.get("end") or "")

            if not title or not start_dt or not end_dt:
                continue

            if end_dt <= start_dt:
                end_dt += timedelta(days=1)

            description = item.get("subtitle") or ""
            cast = item.get("cast")
            if cast and cast not in description:
                description = f"{description}\nבהגשת {cast}".strip()

            programs.append(
                {
                    "start": int(start_dt.timestamp()),
                    "end": int(end_dt.timestamp()),
                    "name": title,
                    "description": description,
                    "image": normalize_image_url(item.get("image") or ""),
                }
            )

    print(f"Parsed {len(programs)} Channel 14 programs from {C14_SCHEDULE_URL}")
    return fill_short_gaps(dedupe_and_sort_programs(programs))


if __name__ == "__main__":
    print(json.dumps(parse_c14_epg(), ensure_ascii=False, indent=2))
