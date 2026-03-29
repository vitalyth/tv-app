import requests
from fastapi import FastAPI, Query, Request
from fastapi.responses import Response, StreamingResponse
from urllib.parse import urlparse, urljoin, quote, urlencode
from pydantic import BaseModel
from plugin_video_idanplus.resources import main as idan_main
from services.epg_service import get_now_epg
import xbmcplugin
from fastapi.middleware.cors import CORSMiddleware
import re
import xmltodict
import os
from typing import Dict, Any
import time

# 🔥 session עם retry
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

session = requests.Session()

retries = Retry(
    total=3,
    backoff_factor=0.3,
    status_forcelist=[500, 502, 503, 504],
)

session.mount("https://", HTTPAdapter(max_retries=retries))
session.mount("http://", HTTPAdapter(max_retries=retries))

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

class Program(BaseModel):
    start: int
    end: int
    name: str
    description: str

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
    programs: list[Program]


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
    nowEPG = get_now_epg()
    channels = idan_main.GetUserChannels(type='tv')

    results = []
    for channel in channels:
        programs = [] if channel['tvgID'] == '' else nowEPG.get(channel['tvgID'], [])
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
            linkDetails = channel["linkDetails"],
            programs = programs
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
        "User-Agent": request.headers.get("user-agent", "Mozilla/5.0"),
        "Accept": "*/*",
        "Origin": origin,
        "Referer": referer or origin + "/",
    }

    if "range" in request.headers:
        headers["Range"] = request.headers["range"]

    # 🔥 request עם retry + timeout
    try:
        r = session.get(url, headers=headers, stream=True, timeout=10)
    except requests.exceptions.RequestException as e:
        print("Proxy request failed:", e)
        return Response(status_code=502)

    content_type = r.headers.get("content-type", "")

    # 🎥 וידאו / fragments
    if "video" in content_type or url.endswith((".ts", ".m4s", ".mp4")):

        def generate():
            try:
                for chunk in r.iter_content(chunk_size=1024 * 64):  # 🔥 chunk קטן ליציבות
                    if chunk:
                        yield chunk
            except Exception as e:
                print("Stream interrupted:", e)
            finally:
                r.close()

        return StreamingResponse(
            generate(),
            status_code=r.status_code,
            media_type=content_type,
            headers={
                "Content-Range": r.headers.get("Content-Range", ""),
                "Accept-Ranges": "bytes",
                "Access-Control-Allow-Origin": "*"
            }
        )

    # 📄 טקסט (m3u8 או אחר)
    try:
        text = r.text
    except Exception:
        return Response(status_code=500)

    is_m3u8 = (
        "mpegurl" in content_type
        or url.endswith(".m3u8")
        or "#EXTM3U" in text
    )

    # לא m3u8 → תחזיר רגיל
    if not is_m3u8:
        return Response(
            content=r.content,
            media_type=content_type,
            headers={"Access-Control-Allow-Origin": "*"}
        )

    # 🎯 rewrite ל־m3u8
    base_url = url.rsplit("/", 1)[0] + "/"

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


_stream_cache = {}
CACHE_TTL = 0  # שניות

@app.get("/playlist.m3u")
def playlist(request: Request):
    channels = idan_main.GetUserChannels(type='tv')
    base_url = str(request.base_url).rstrip("/")

    lines = ["#EXTM3U"]

    now = time.time()

    for channel in channels:
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
            linkDetails = channel["linkDetails"],
            programs = []
        )

        stream_url = None
        referer = None

        result = live_channel(ch)
        stream_url = result["stream"]


        # ========================
        # 🔥 CACHE
        # ========================
       
        cached = _stream_cache.get(ch.channelID)

        if cached and now - cached["time"] < CACHE_TTL:
            stream_url = cached["url"]
            referer = cached.get("referer")

        else:
            try:
                result = live_channel(ch)
                stream_url = result["stream"]

                # 🔥 קביעת referer
                if ch.linkDetails:
                    referer = ch.linkDetails.get("referer")

                if not referer and stream_url:
                    parsed = urlparse(stream_url)
                    referer = f"{parsed.scheme}://{parsed.netloc}/"

                # 🔥 שמירה בקאש
                _stream_cache[ch.channelID] = {
                    "url": stream_url,
                    "referer": referer,
                    "time": now
                }

            except Exception as e:
                print(f"Error in channel {ch.channelID}: {e}")
                continue
    

        if not stream_url:
            continue

        # ========================
        # 🔥 PROXY URL (FIX לשגיאה שלך)
        # ========================
        params = {
            "url": stream_url,
            "referer": referer or ""
        }

        proxy_url = f"{base_url}/proxy?{urlencode(params)}"
        logo = f"http://192.168.86.75:8001/ch/{ch.logo}"

        lines.append(
            f'#EXTINF:-1 tvg-id="{ch.channelID}" tvg-name="{ch.name}" tvg-logo="{logo}",{ch.name}'
        )
        lines.append(proxy_url)

    return Response(
        content="\n".join(lines),
        media_type="application/x-mpegURL"
    )