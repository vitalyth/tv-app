import requests
from fastapi import FastAPI, Query, Request
from fastapi.responses import Response, StreamingResponse
from urllib.parse import urlparse, urljoin, quote, urlencode
from pydantic import BaseModel
from plugin_video_idanplus.resources import main as idan_main
import plugin_video_idanplus.resources.lib.epg as epg
import xbmcplugin
from fastapi.middleware.cors import CORSMiddleware
import re
import xmltodict
import os

ROOT_PATH = os.getenv("ROOT_PATH", "")

app = FastAPI(
    root_path=ROOT_PATH,
    docs_url="/docs",
    openapi_url="/openapi.json"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Channel(BaseModel):
    id: str
    name: str
    logo: str
    category: str
    streamUrl: str
    module: str
    channelID: str
    mode: int


'''
@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.get("/items/{item_id}")
def read_item(item_id: int, q: str | None = None):
    return {"item_id": item_id, "q": q}
'''

@app.get('/live_channels')
def live_channels():
    #epg_items = epg.GetEPG()
    channels = idan_main.GetUserChannels(type='tv')
    return channels

@app.post('/live_channel')
def live_channel(channel: Channel):
    moreData = '1'
    moduleScript = __import__('resources.lib.{0}'.format(channel.module), fromlist=[channel.module])
    moduleScript.Run(channel.name, channel.channelID, channel.mode, '', moreData)

    return {'stream': xbmcplugin.getStream()}


def build_proxy_url(base_proxy, full_url):
    return f"{base_proxy}/proxy?{urlencode({'url': full_url})}"

@app.get("/proxy")
def proxy(request: Request, url: str, referer: str = None):
    parsed = urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"

    # 🔥 פה הקסם
    headers = {
        "User-Agent": request.headers.get("user-agent", "Mozilla/5.0"),
        "Accept": "*/*",
        "Origin": origin,
        "Referer": referer or origin + "/",
    }

    if "range" in request.headers:
        headers["Range"] = request.headers["range"]

    r = requests.get(url, headers=headers, stream=True)

    content_type = r.headers.get("content-type", "")

    # 🎥 וידאו/segments
    if "video" in content_type or url.endswith((".ts", ".m4s", ".mp4")):
        return StreamingResponse(
            r.iter_content(chunk_size=1024 * 1024),
            status_code=r.status_code,
            media_type=content_type,
            headers={
                "Content-Range": r.headers.get("Content-Range", ""),
                "Accept-Ranges": "bytes",
                "Access-Control-Allow-Origin": "*"
            }
        )

    text = r.text

    is_m3u8 = (
        "mpegurl" in content_type
        or url.endswith(".m3u8")
        or "#EXTM3U" in text
    )

    if not is_m3u8:
        return Response(
            content=r.content,
            media_type=content_type,
            headers={"Access-Control-Allow-Origin": "*"}
        )

    base_url = url.rsplit("/", 1)[0] + "/"
    #base_proxy = str(request.base_url).rstrip("/")
    root_path = request.scope.get("root_path", "")

    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("host", "localhost")

    base_proxy = f"{proto}://{host}{root_path}"

    new_lines = []

    for line in text.splitlines():
        line = line.strip()

        if not line:
            new_lines.append(line)
            continue

        if line.startswith("#"):
            # גם פה חשוב לטפל ב-URI=
            def replace_uri(match):
                uri = match.group(1)
                full_url = urljoin(base_url, uri)
                proxied = f"{base_proxy}/proxy?{urlencode({'url': full_url, 'referer': referer or origin + '/'})}"
                return f'URI="{proxied}"'

            line = re.sub(r'URI="([^"]+)"', replace_uri, line)
            new_lines.append(line)
            continue

        full_url = urljoin(base_url, line)

        proxied = f"{base_proxy}/proxy?{urlencode({'url': full_url, 'referer': referer or origin + '/'})}"

        new_lines.append(proxied)

    return Response(
        content="\n".join(new_lines),
        media_type="application/vnd.apple.mpegurl",
        headers={"Access-Control-Allow-Origin": "*"}
    )

@app.get("/epg")
def epg():
    r = requests.get("https://iptv-epg.org/files/epg-il.xml")
    
    data = xmltodict.parse(r.text)

    programmes = data["tv"]["programme"]

    result = [
        {
            "channel": p.get("@channel"),
            "title": p.get("title", {}).get("#text") if isinstance(p.get("title"), dict) else None,
            "start": p.get("@start"),
            "end": p.get("@stop"),
        }
        for p in programmes
    ]

    return result