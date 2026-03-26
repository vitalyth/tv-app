import time
import copy
from plugin_video_idanplus.resources.lib.epg import GetEPG

# cache global
_epg_cache = None
_last_update = 0

EPG_TTL = 300  #5 min

def get_now_epg():
    global _epg_cache, _last_update

    now = int(time.time())

    # if cache exist and valid
    if _epg_cache and (now - _last_update < EPG_TTL):
        epgList = copy.deepcopy(_epg_cache)
    else:
        print(">>> Refreshing EPG...")
        epgList = GetEPG(deltaInSec=0)  # get new
        _epg_cache = epgList
        _last_update = now
        epgList = copy.deepcopy(epgList)

    # new/next
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