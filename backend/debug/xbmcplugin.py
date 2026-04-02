from contextvars import ContextVar
import subprocess
from constants import Color

items = []
_channel_stream = ContextVar("channel_stream", default=None)

def addDirectoryItem(handle, url, listitem, isFolder):
    items.append({'name': listitem.getLabel(), 'url': url})

def endOfDirectory(handle):
    print("END DIRECTORY")

def setContent(handle, content):
    print(f"SET CONTENT: {content}")

def setResolvedUrl(handle, succeeded, listitem):
    stream = getattr(listitem, "path", "")

    if "|" in stream:
        url, headers = stream.split("|", 1)
    else:
        url = stream

    _channel_stream.set(url)
    
    print("\n🎬 PLAY VIDEO")
    print("stream:", url)

def getStream():
    stream = _channel_stream.get()
    print('getStream::::', stream)
    return stream

def clearStream():
    _channel_stream.set(None)

