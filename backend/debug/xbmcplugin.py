import subprocess
from constants import Color

items = []
channel_stream = ''

def addDirectoryItem(handle, url, listitem, isFolder):
    #print('=====', handle, url, listitem, isFolder)
    #print(f"{Color.CYAN}{listitem.getLabel()}{Color.RESET}\n")
    #print(f"{Color.GREEN}ADD ITEM:{Color.RESET} {url}\n\n")
    items.append({'name': listitem.getLabel(), 'url': url})

def endOfDirectory(handle):
    print("END DIRECTORY")

def setContent(handle, content):
    print(f"SET CONTENT: {content} - {channel_stream}")

def setResolvedUrl(handle, succeeded, listitem):
    global channel_stream

    stream = getattr(listitem, "path", "")

    if "|" in stream:
        url, headers = stream.split("|", 1)
    else:
        url = stream

    channel_stream = url
    
    print("\n🎬 PLAY VIDEO")
    print("stream:", url)

    #subprocess.Popen(["open", "-g", "-a", "VLC", url])

def getStream():
    print('getStream::::', channel_stream)
    return channel_stream
