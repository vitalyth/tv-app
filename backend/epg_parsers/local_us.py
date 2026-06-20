import json
import re
from datetime import datetime, timedelta, time, timezone
from html import unescape
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from epg_parsers.common import dedupe_and_sort_programs

APP_TZ = ZoneInfo("America/New_York")
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"

PLUTO_CHANNELS = {
    "CBSNewsBoston.us": "5eb1af2ad345340008fccd1e",
}

TVPASSPORT_CHANNELS = {
    "WBTSCD151.us": "nbc-wbts-cd-nashua-nh-hd/30964",
    "WCVBTV501.us": "abc-wcvb-boston-ma-hd/3661",
    "WFXT251.us": "fox-wfxt-boston-ma-hd/3657",
    "WGBHDT2.us": "pbs-world-wgbh-tv2-boston-ma/7753",
}
TVPASSPORT_ITEM_RE = re.compile(r'<div[^>]*class="list-group-item"[^>]*>', re.I)
DATA_ATTR_RE = re.compile(r'\bdata-([A-Za-z0-9_-]+)="([^"]*)"')

LOCAL_US_CHANNEL_IDS = [
    "CBSNewsBoston.us",
    "WBTSCD151.us",
    "WCVBTV501.us",
    "WFXT251.us",
    "WGBHDT2.us",
]
LOCAL_US_FALLBACK_TITLES = {
    "CBSNewsBoston.us": "CBS News Boston Live",
    "WBTSCD151.us": "NBC10 Boston Live",
    "WCVBTV501.us": "WCVB Boston Live",
    "WFXT251.us": "Boston 25 Live",
    "WGBHDT2.us": "GBH World Live",
}


def _fetch_text(url: str, timeout: int = 30) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8")


def _day_start(today: datetime | None = None) -> datetime:
    today = today.astimezone(APP_TZ) if today else datetime.now(APP_TZ)
    return datetime.combine(today.date(), time.min, tzinfo=APP_TZ)


def _parse_iso_timestamp(value: str) -> int:
    return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp())


def _parse_pluto_epg(channel_id: str, today: datetime | None = None, days: int = 5) -> list[dict]:
    pluto_id = PLUTO_CHANNELS[channel_id]
    start = _day_start(today).astimezone(timezone.utc)
    stop = (start + timedelta(days=days)).astimezone(timezone.utc)
    url = (
        f"https://api.pluto.tv/v2/channels/{pluto_id}"
        f"?start={start.isoformat().replace('+00:00', 'Z')}"
        f"&stop={stop.isoformat().replace('+00:00', 'Z')}"
    )
    data = json.loads(_fetch_text(url))

    programs = []
    for item in data.get("timelines", []):
        start_ts = _parse_iso_timestamp(item.get("start", ""))
        end_ts = _parse_iso_timestamp(item.get("stop", ""))
        if end_ts <= start_ts:
            continue

        episode = item.get("episode") or {}
        title = item.get("title") or episode.get("name") or data.get("name") or "Live"
        subtitle = episode.get("name") or ""
        description = episode.get("description") or data.get("summary") or ""
        if subtitle and subtitle != title:
            title = f"{title}: {subtitle}"

        programs.append(
            {
                "start": start_ts,
                "end": end_ts,
                "name": title,
                "description": description,
            }
        )

    return dedupe_and_sort_programs(programs)


def _parse_tvpassport_epg(channel_id: str, today: datetime | None = None, days: int = 5) -> list[dict]:
    site_id = TVPASSPORT_CHANNELS[channel_id]
    start_day = _day_start(today)
    programs = []

    for day_offset in range(days):
        target_day = start_day + timedelta(days=day_offset)
        date_part = target_day.strftime("%Y-%m-%d")
        url = f"https://www.tvpassport.com/tv-listings/stations/{site_id}/{date_part}"
        html = _fetch_text(url)

        for match in TVPASSPORT_ITEM_RE.finditer(html):
            attrs = {
                key.lower(): unescape(value)
                for key, value in DATA_ATTR_RE.findall(match.group(0))
            }
            raw_start = attrs.get("st")
            raw_duration = attrs.get("duration")
            title = attrs.get("showname") or attrs.get("showtitle") or "Live"
            if not raw_start or not raw_duration or not title:
                continue

            try:
                start_dt = datetime.strptime(raw_start, "%Y-%m-%d %H:%M:%S").replace(tzinfo=APP_TZ)
                duration = int(raw_duration)
            except ValueError:
                continue

            end_dt = start_dt + timedelta(minutes=duration)
            episode_title = attrs.get("episodetitle") or ""
            if episode_title and episode_title not in title:
                title = f"{title}: {episode_title}"

            programs.append(
                {
                    "start": int(start_dt.timestamp()),
                    "end": int(end_dt.timestamp()),
                    "name": title,
                    "description": attrs.get("description") or "",
                }
            )

    return _fill_leading_gap(channel_id, programs, start_day)


def _fill_leading_gap(channel_id: str, programs: list[dict], start_day: datetime) -> list[dict]:
    programs = dedupe_and_sort_programs(programs)
    if not programs:
        return programs

    start_ts = int(start_day.timestamp())
    first_start = programs[0]["start"]
    if first_start <= start_ts:
        return programs

    fallback_title = LOCAL_US_FALLBACK_TITLES.get(channel_id, "Live")
    return dedupe_and_sort_programs(
        [
            {
                "start": start_ts,
                "end": first_start,
                "name": fallback_title,
                "description": "Live programming. Detailed schedule starts with the next listed program.",
            },
            *programs,
        ]
    )


def parse_local_us_epg(channel_id: str, today: datetime | None = None, days: int = 5) -> list[dict]:
    if channel_id in PLUTO_CHANNELS:
        return _parse_pluto_epg(channel_id, today=today, days=days)

    if channel_id in TVPASSPORT_CHANNELS:
        return _parse_tvpassport_epg(channel_id, today=today, days=days)

    raise ValueError(f"Unsupported local US channel: {channel_id}")


def parse_all_local_us_epg(today: datetime | None = None, days: int = 5) -> dict[str, list[dict]]:
    return {
        channel_id: parse_local_us_epg(channel_id, today=today, days=days)
        for channel_id in LOCAL_US_CHANNEL_IDS
    }
