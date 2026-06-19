import time
import copy
import json
from pathlib import Path
from plugin_video_idanplus.resources.lib.epg import GetEPG
from config import CACHE_DIR

_epg_cache = None
_last_update = 0
_epg_cache_fallback_mtime = 0
_fallback_epg_cache = None
_fallback_epg_mtime = 0

EPG_TTL = 30 * 60 # 30 minutes
FALLBACK_EPG_FILE = CACHE_DIR / "epg.json"

WINDOW_BACK = 3 * 60 * 60     # 3 hours back
WINDOW_FORWARD = 12 * 60 * 60 # 12 hours forward

def _programs_have_current(programs, now):
    for program in programs:
        if program.get("end", 0) > now:
            return True
    return False

def _has_current_programs(epg_list, now):
    for programs in epg_list.values():
        if _programs_have_current(programs, now):
            return True
    return False

def _merge_fallback_epg(epg_list, now):
    fallback_epg = _load_fallback_epg()
    if not fallback_epg:
        return epg_list

    if not epg_list:
        print(">>> Using local EPG fallback...")
        return fallback_epg

    merged_epg = copy.deepcopy(epg_list)
    added_channels = 0
    refreshed_channels = 0

    for channel, fallback_programs in fallback_epg.items():
        if not _programs_have_current(fallback_programs, now):
            continue

        current_programs = merged_epg.get(channel, [])
        if not current_programs:
            merged_epg[channel] = fallback_programs
            added_channels += 1
        elif not _programs_have_current(current_programs, now):
            merged_epg[channel] = fallback_programs
            refreshed_channels += 1

    if added_channels or refreshed_channels:
        print(f">>> Merged local EPG fallback: {added_channels} added, {refreshed_channels} refreshed")

    return merged_epg

def _load_fallback_epg():
    global _fallback_epg_cache, _fallback_epg_mtime

    if not FALLBACK_EPG_FILE.exists():
        return {}

    fallback_mtime = FALLBACK_EPG_FILE.stat().st_mtime
    if _fallback_epg_cache is not None and fallback_mtime == _fallback_epg_mtime:
        return copy.deepcopy(_fallback_epg_cache)

    with FALLBACK_EPG_FILE.open("r", encoding="utf-8") as fallback_file:
        fallback_epg = json.load(fallback_file)

    _fallback_epg_cache = fallback_epg
    _fallback_epg_mtime = fallback_mtime
    return copy.deepcopy(fallback_epg)

def _get_fallback_epg_mtime():
    if not FALLBACK_EPG_FILE.exists():
        return 0
    return FALLBACK_EPG_FILE.stat().st_mtime

def get_now_epg(start: int | None = None, end: int | None = None):
    global _epg_cache, _last_update, _epg_cache_fallback_mtime

    now = int(time.time())
    window_start = start if start is not None else now - WINDOW_BACK
    window_end = end if end is not None else now + WINDOW_FORWARD
    fallback_mtime = _get_fallback_epg_mtime()

    # use in-memory cache if valid
    if (
        _epg_cache is not None
        and fallback_mtime == _epg_cache_fallback_mtime
        and now - _last_update < EPG_TTL
    ):
        epgList = copy.deepcopy(_epg_cache)
    else:
        # Priority 1: local cache/epg.json
        epgList = _load_fallback_epg()

        if epgList and _has_current_programs(epgList, now):
            print(">>> Using local EPG cache: cache/epg.json")
        else:
            if epgList:
                print(">>> Local EPG cache has no current programs, refreshing from source...")
            else:
                print(">>> Local EPG cache is missing/empty, refreshing from source...")

            # Priority 2: external EPG source
            #epgList = GetEPG(deltaInSec=0)
            #epgList = GetEPG(deltaInSec=1 * 60 * 60) # 1 hour
            epgList = GetEPG() # default 24 hours

            # Keep using cache/epg.json as fallback for missing/stale channels
            epgList = _merge_fallback_epg(epgList, now)

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

    return epgList
