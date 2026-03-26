import time
import copy
from plugin_video_idanplus.resources.lib.epg import GetEPG

_epg_cache = None
_last_update = 0

EPG_TTL = 60  # 👈 1 minute

def get_now_epg():
    global _epg_cache, _last_update

    now = int(time.time())

    # use cache if valid
    if _epg_cache is not None and (now - _last_update < EPG_TTL):
        epgList = copy.deepcopy(_epg_cache)
    else:
        print(">>> Refreshing EPG...")
        epgList = GetEPG(deltaInSec=0)
        _epg_cache = epgList
        _last_update = now
        epgList = copy.deepcopy(epgList)

    # filter current + next
    for channel in list(epgList.keys()):
        programs = []
        programsCount = len(epgList[channel])

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

        epgList[channel] = programs

    return epgList