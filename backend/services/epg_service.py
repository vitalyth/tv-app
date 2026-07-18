import time
import copy
from services.epg_vod_enrichment import add_vod_links_to_epg
from services.epg_storage import (
    DEFAULT_EPG_DB_PATH,
    epg_db_mtime,
    load_all_epg,
)

_epg_cache = None
_last_update = 0
_epg_cache_fallback_mtime = 0

EPG_TTL = 30 * 60 # 30 minutes
FALLBACK_EPG_DB = DEFAULT_EPG_DB_PATH

WINDOW_BACK = 3 * 60 * 60     # 3 hours back
WINDOW_FORWARD = 12 * 60 * 60 # 12 hours forward

def _load_fallback_epg(
    start: int | None = None,
    end: int | None = None,
    query: str | None = None,
):
    return load_all_epg(FALLBACK_EPG_DB, start=start, end=end, query=query)

def _get_fallback_epg_mtime():
    return epg_db_mtime(FALLBACK_EPG_DB)

def get_now_epg(
    start: int | None = None,
    end: int | None = None,
    query: str | None = None,
):
    global _epg_cache, _last_update, _epg_cache_fallback_mtime

    now = int(time.time())
    window_start = start if start is not None else now - WINDOW_BACK
    window_end = end if end is not None else now + WINDOW_FORWARD
    fallback_mtime = _get_fallback_epg_mtime()
    search_query = (query or "").strip()

    if search_query:
        return _load_fallback_epg(start=window_start, end=window_end, query=search_query)

    # use in-memory cache if valid
    if (
        _epg_cache is not None
        and fallback_mtime == _epg_cache_fallback_mtime
        and now - _last_update < EPG_TTL
    ):
        epgList = copy.deepcopy(_epg_cache)
    else:
        # Runtime EPG reads only from the local SQLite cache. Source fallback
        # belongs to parse_epg.py so imported data is persisted first.
        epgList = _load_fallback_epg()
        print(f">>> Using local EPG cache: {FALLBACK_EPG_DB}")

        _epg_cache = epgList
        _epg_cache_fallback_mtime = fallback_mtime
        _last_update = now
        epgList = copy.deepcopy(epgList)

    # filter current + next
    for channel in list(epgList.keys()):
        programs = []
        programsCount = len(epgList[channel])

        #print('>>> Processing channel', channel, 'with', programsCount, 'programs')

        '''
        for i in range(programsCount):
            start = epgList[channel][i]["start"]
            end = epgList[channel][i]["end"]

            if now >= end:
                continue

            if i + 1 < programsCount:
                programs = epgList[channel][i:i+2]
            else:
                programs = epgList[channel][i:i+1]

            break
        '''

        for program in epgList[channel]:
            start = program["start"]
            end = program["end"]

            # אם התוכנית נגמרה לפני החלון → דלג
            if end <= window_start:
                continue

            # אם התוכנית מתחילה אחרי החלון → אפשר לעצור (אם ממוין)
            if start >= window_end:
                break

            # אחרת → התוכנית בתוך החלון או חופפת אליו
            programs.append(program)

        epgList[channel] = programs

    return add_vod_links_to_epg(epgList)
