from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo

from epg_parsers.common import dedupe_and_sort_programs


APP_TZ = ZoneInfo("America/New_York")
DEFAULT_DAYS = 7
DEFAULT_BLOCK_HOURS = 2

KESHET_THEMATIC_CHANNELS = {
    "erets": {
        "name": "ארץ נהדרת",
        "description": "מיטב פרקי ארץ נהדרת בערוץ לייב ייעודי של קשת.",
        "image": "https://img.mako.co.il/2022/09/20/ERETZ_S20_1_i_re.jpg",
    },
    "savri": {
        "name": "סברי מרנן",
        "description": "מיטב פרקי סברי מרנן בערוץ לייב ייעודי של קשת.",
        "image": "https://img.mako.co.il//2021/08/04/sabri_maranan_epg.jpg",
    },
}


def parse_keshet_thematic_epg(
    channel_id: str,
    days: int = DEFAULT_DAYS,
    block_hours: int = DEFAULT_BLOCK_HOURS,
) -> list[dict]:
    channel = KESHET_THEMATIC_CHANNELS.get(channel_id)
    if not channel:
        return []

    now = datetime.now(APP_TZ)
    start = datetime.combine(now.date(), time.min, tzinfo=APP_TZ) - timedelta(days=1)
    block_delta = timedelta(hours=block_hours)
    blocks = int((days + 1) * 24 / block_hours)

    programs = []
    for index in range(blocks):
        block_start = start + index * block_delta
        block_end = block_start + block_delta
        programs.append(
            {
                "start": int(block_start.timestamp()),
                "end": int(block_end.timestamp()),
                "name": channel["name"],
                "description": channel["description"],
                "image": channel["image"],
            }
        )

    return dedupe_and_sort_programs(programs)
