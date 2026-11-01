import time

from services.epg_vod_enrichment import add_vod_links_to_epg
from services.epg_storage import DEFAULT_EPG_DB_PATH, load_all_epg

FALLBACK_EPG_DB = DEFAULT_EPG_DB_PATH

WINDOW_BACK = 3 * 60 * 60     # 3 hours back
WINDOW_FORWARD = 12 * 60 * 60 # 12 hours forward


def _load_fallback_epg(
    start: int | None = None,
    end: int | None = None,
    query: str | None = None,
):
    return load_all_epg(FALLBACK_EPG_DB, start=start, end=end, query=query)


def get_now_epg(
    start: int | None = None,
    end: int | None = None,
    query: str | None = None,
):
    now = int(time.time())
    window_start = start if start is not None else now - WINDOW_BACK
    window_end = end if end is not None else now + WINDOW_FORWARD
    search_query = (query or "").strip()

    # Filter in SQLite before decoding JSON and resolving schedule overlaps.
    # The database retains historical programs; loading/copying all of them on
    # every cache refresh or request makes a short guide window increasingly slow.
    epg = _load_fallback_epg(
        start=window_start, end=window_end, query=search_query or None,
    )
    # Resolving legacy overlaps can leave fragments outside the requested range.
    epg = {
        channel_id: [program for program in programs
                     if program["end"] > window_start and program["start"] < window_end]
        for channel_id, programs in epg.items()
    }
    if search_query:
        return epg
    return add_vod_links_to_epg(epg)
