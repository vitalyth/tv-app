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
from typing import Dict, Any

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
    index: int
    name: str
    logo: str
    category: str
    linkDetails: Dict[str, Any]
    module: str
    channelID: str
    mode: int
    type: str


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

    results = []
    for channel in channels:
        print('channel===>', channel)
        ch = Channel(
            id=channel["channelID"],
            index=channel["index"],
            name=channel["name"],
            mode=channel["mode"],
            logo=channel["image"],
            category='',
            module=channel["module"],
            channelID=channel["channelID"],
            type=channel["type"],
            linkDetails = channel["linkDetails"]
        )

        results.append(ch)
    return results

@app.post('/live_channel')
def live_channel(channel: Channel):
    moreData = '1'
    moduleScript = __import__('resources.lib.{0}'.format(channel.module), fromlist=[channel.module])
    moduleScript.Run(channel.name, channel.channelID, channel.mode, '', moreData)

    return {'stream': xbmcplugin.getStream()}

'''
def build_proxy_url(base_proxy, full_url):
    return f"{base_proxy}/proxy?{urlencode({'url': full_url})}"
'''

@app.get("/proxy")
def proxy(request: Request, url: str, referer: str = None):
    parsed = urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"

    headers = {
        "User-Agent": request.headers.get(
            "user-agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        ),
        "Accept": "*/*",
        "Origin": origin,
        "Referer": referer or origin + "/",
    }

    if "range" in request.headers:
        headers["Range"] = request.headers["range"]

    # IMPORTANT: allow redirects
    r = requests.get(url, headers=headers, stream=True, allow_redirects=True)

    content_type = r.headers.get("content-type", "").lower()

    # -----------------------------
    # DASH (livx / mpd) -> FULL passthrough
    # -----------------------------
    if (
        "livedash" in url
        or url.endswith(".livx")
        or "dash+xml" in content_type
    ):
        return StreamingResponse(
            r.iter_content(chunk_size=1024 * 1024),
            status_code=r.status_code,
            media_type=r.headers.get("content-type", "application/dash+xml"),
            headers={
                "Access-Control-Allow-Origin": "*",
                "Accept-Ranges": r.headers.get("accept-ranges", "bytes"),
                "Content-Length": r.headers.get("content-length", ""),
            }
        )

    # -----------------------------
    # Video segments
    # -----------------------------
    if any(x in content_type for x in ["video", "mp2t"]) or url.endswith((".ts", ".m4s", ".mp4")):
        return StreamingResponse(
            r.iter_content(chunk_size=1024 * 1024),
            status_code=r.status_code,
            media_type=content_type,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Accept-Ranges": "bytes",
                "Content-Range": r.headers.get("Content-Range", ""),
            }
        )

    # -----------------------------
    # HLS (m3u8)
    # -----------------------------
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

    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("host", "localhost")
    base_proxy = f"{proto}://{host}"

    new_lines = []

    for line in text.splitlines():
        line = line.strip()

        if not line:
            new_lines.append(line)
            continue

        if line.startswith("#"):
            def replace_uri(match):
                uri = match.group(1)
                full_url = urljoin(base_url, uri)

                params = {
                    "url": full_url,
                    "referer": referer or origin + "/"
                }

                proxied = f"{base_proxy}/proxy?{urlencode(params)}"
                return f'URI="{proxied}"'

            line = re.sub(r'URI="([^"]+)"', replace_uri, line)
            new_lines.append(line)
            continue

        full_url = urljoin(base_url, line)

        params = {
            "url": full_url,
            "referer": referer or origin + "/"
        }

        proxied = f"{base_proxy}/proxy?{urlencode(params)}"

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