import json
from datetime import datetime, time, timedelta, timezone
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from epg_parsers.common import dedupe_and_sort_programs, fill_short_gaps


I24_SCHEDULES_URL = "https://api.i24news.tv/v2/he/schedules"
ISRAEL_TZ = ZoneInfo("Asia/Jerusalem")


def fetch_json(url: str):
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
            ),
        },
    )
    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def parse_utc_clock(value: str) -> time:
    hours, minutes = value.split(":", 1)
    return time(hour=int(hours), minute=int(minutes), tzinfo=timezone.utc)


def program_description(show: dict) -> str:
    body = show.get("parsedBody") or []
    texts = [item.get("text", "") for item in body if item.get("type") == "text"]
    return "\n".join(text.strip() for text in texts if text.strip())


def parse_i24_epg(url: str = I24_SCHEDULES_URL, today: datetime | None = None) -> list[dict]:
    schedules = fetch_json(url)
    today = today or datetime.now(ISRAEL_TZ)
    week_start = today.date() - timedelta(days=(today.weekday() + 1) % 7)

    programs = []
    for schedule in schedules:
        show = schedule.get("show") or {}
        title = show.get("title")
        if not title:
            continue

        day = int(schedule["day"])
        program_date = week_start + timedelta(days=day)
        start_dt = datetime.combine(program_date, parse_utc_clock(schedule["startHour"]))
        end_day = day + (1 if schedule["endHour"] <= schedule["startHour"] else 0)
        end_dt = datetime.combine(week_start + timedelta(days=end_day), parse_utc_clock(schedule["endHour"]))

        programs.append(
            {
                "start": int(start_dt.timestamp()),
                "end": int(end_dt.timestamp()),
                "name": title,
                "description": program_description(show),
            }
        )

    return fill_short_gaps(dedupe_and_sort_programs(programs))
