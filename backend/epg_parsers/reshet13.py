import html
import json
import re
from datetime import datetime, timedelta
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from epg_parsers.common import dedupe_and_sort_programs, fill_short_gaps


RESHET13_TV_GUIDE_URL = "https://13tv.co.il/tv-guide/"
ISRAEL_TZ = ZoneInfo("Asia/Jerusalem")
DEFAULT_LAST_PROGRAM_MINUTES = 30


def fetch_html(url: str = RESHET13_TV_GUIDE_URL) -> str:
    request = Request(
        url,
        headers={
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
        },
    )

    with urlopen(request, timeout=30) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def extract_next_data(html_text: str) -> dict:
    match = re.search(
        r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
        html_text,
        re.DOTALL,
    )
    if not match:
        raise ValueError("Reshet 13 page did not include __NEXT_DATA__")

    return json.loads(html.unescape(match.group(1)))


def extract_broadcast_week(data: dict) -> list[dict]:
    content = (
        data.get("props", {})
        .get("pageProps", {})
        .get("page", {})
        .get("Content", {})
        .get("PageGrid", [])
    )
    for block in content:
        broadcast_week = block.get("broadcastWeek")
        if isinstance(broadcast_week, list):
            return broadcast_week

    return []


def parse_start(show: dict) -> int | None:
    show_date = (show.get("show_date") or "").strip()
    start_time = (show.get("start_time") or "").strip()
    if not show_date or not start_time:
        return None

    try:
        parsed = datetime.strptime(f"{show_date} {start_time}", "%Y-%m-%d %H:%M").replace(tzinfo=ISRAEL_TZ)
    except ValueError:
        return None

    return int(parsed.timestamp())


def normalize_image(show: dict) -> str:
    image = show.get("image") or ""
    image_obj = show.get("imageObj") or {}
    image = image or image_obj.get("d") or image_obj.get("m") or ""

    if image.startswith("//"):
        return f"https:{image}"

    return image


def parse_reshet13_epg(html_text: str | None = None) -> list[dict]:
    html_text = html_text or fetch_html()
    data = extract_next_data(html_text)
    broadcast_week = extract_broadcast_week(data)

    programs = []
    for day in broadcast_week:
        for show in day.get("shows") or []:
            title = " ".join((show.get("title") or "").split())
            start = parse_start(show)
            if not title or start is None:
                continue

            programs.append(
                {
                    "start": start,
                    "end": start + int(timedelta(minutes=DEFAULT_LAST_PROGRAM_MINUTES).total_seconds()),
                    "name": title,
                    "description": show.get("desc") or "",
                    "image": normalize_image(show),
                }
            )

    programs = dedupe_and_sort_programs(programs)
    for index in range(len(programs) - 1):
        programs[index]["end"] = programs[index + 1]["start"]

    print(f"Parsed {len(programs)} Reshet 13 programs from {RESHET13_TV_GUIDE_URL}")
    return fill_short_gaps(programs)


if __name__ == "__main__":
    print(json.dumps(parse_reshet13_epg(), ensure_ascii=False, indent=2))
