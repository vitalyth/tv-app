import time
import copy
from plugin_video_idanplus.resources.lib.epg import GetEPG

_epg_cache = None
_last_update = 0

EPG_TTL = 30 * 60 # 30 minutes

WINDOW_BACK = 3 * 60 * 60     # 3 hours back
WINDOW_FORWARD = 12 * 60 * 60 # 12 hours forward

def get_now_epg():
    global _epg_cache, _last_update

    now = int(time.time())
    window_start = now - WINDOW_BACK
    window_end = now + WINDOW_FORWARD

    # use cache if valid
    if _epg_cache is not None and (now - _last_update < EPG_TTL):
        epgList = copy.deepcopy(_epg_cache)
    else:
        print(">>> Refreshing EPG...")
        #epgList = GetEPG(deltaInSec=0)
        #epgList = GetEPG(deltaInSec=1 * 60 * 60) # 1 hour
        epgList = GetEPG() # default 24 hours
        _epg_cache = epgList
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