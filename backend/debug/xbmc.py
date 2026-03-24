from constants import Color

LOGDEBUG = 0
LOGINFO = 1
LOGWARNING = 2
LOGERROR = 3
LOGFATAL = 4


def log(msg, level=LOGINFO):
    print("LOG:", msg)

def getInfoLabel(label):
    if label == "System.BuildVersion":
        return "20.0"
    return ""

def executebuiltin(cmd, *args):
    #print(f"{Color.YELLOW}[XBMC BUILTIN] {cmd}{Color.RESET}")
    pass