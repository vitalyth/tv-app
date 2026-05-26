from fastapi import FastAPI, Request, Query
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from urllib.parse import quote
from services.channel_service import get_live_channels, get_vod_channels, get_vod_items, get_vod_recent_items
from services.epg_service import get_now_epg
from services.stream_service import get_stream, get_vod_stream
from services.proxy_service import cors_preflight, handle_proxy, handle_local_file_proxy
from services.epg_service_ext import EPGService
from services.playlist_service import generate_playlist
from services.local_series_service import LOCAL_VOD_TV_DIR, scan_local_series
import os
import socket
from models.schemas import Channel
from plugin_video_idanplus.resources import main as idan_main
from plugin_video_idanplus.resources.lib import common, iptv, epg
from services.custom_channel_service import get_custom_channel
from config import APP_VERSION

def get_local_addresses(port: int = 8001) -> list[str]:
    """Auto-detect server's IP and hostname addresses"""
    origins = [
        "http://localhost:3000",
        "http://localhost:3001",
    ]
    
    try:
        # Get hostname
        hostname = socket.gethostname()
        origins.append(f"http://{hostname}:{port}")
        
        # Get local IP (connect to external host and check which IP was used)
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        
        origins.append(f"http://{local_ip}:{port}")
        
        print(f"✓ Auto-detected server addresses: {local_ip}, {hostname}")
    except Exception as e:
        print(f"⚠ Could not auto-detect server addresses: {e}")
    
    return origins

ROOT_PATH = os.getenv("ROOT_PATH", "")

# CORS configuration - auto-detects IP/hostname or use CORS_ORIGINS env var
CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    ",".join(get_local_addresses(port=8001))
).split(",")


def get_request_api_prefix(request: Request) -> str:
    """Return the API prefix for generated relative URLs.

    Local dev usually has no prefix: /local-series/stream
    Docker/prod may run FastAPI with ROOT_PATH=/api: /api/local-series/stream
    """
    prefix = request.scope.get("root_path", "") or request.headers.get("x-forwarded-prefix", "") or ROOT_PATH
    return prefix.rstrip("/")

app = FastAPI(
    title="TV App API",
    version=APP_VERSION,
    root_path=ROOT_PATH,
    docs_url="/docs",
    openapi_url="/openapi.json",
)

epg_service = EPGService(ttl_seconds=3600)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in CORS_ORIGINS],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
    allow_headers=["*"],  # Need all headers for streaming (Range, User-Agent, etc)
)

@app.get("/version")
def get_version():
    return {"version": APP_VERSION}

@app.get('/live_channels')
def live_channels():
    return get_live_channels()

@app.get('/vod_channels')
def vod_channels():
    return get_vod_channels()

@app.get('/vod_items')
def vod_items(
    module: str = Query(..., min_length=1, max_length=50, pattern="^[a-zA-Z0-9_-]+$"),
    mode: int = Query(...),
    url: str = "",
    name: str = "",
    iconimage: str = "",
    moreData: str = "",
):
    return get_vod_items(module, mode, url, name, iconimage, moreData)

@app.get('/vod_recent')
def vod_recent():
    return get_vod_recent_items()

@app.post('/live_channel')
def live_channel(channel: Channel):
    return {"stream": get_stream(channel)}

@app.post('/vod_stream')
def vod_stream(request: Request, item: dict):
    if item.get("module") == "local-series":
        url = item.get("url") or ""

        if url.startswith("http://") or url.startswith("https://"):
            return {"stream": url}

        base_url = str(request.base_url).rstrip("/")

        if (
            request.headers.get("x-forwarded-proto") == "https"
            or '"scheme":"https"' in request.headers.get("cf-visitor", "")
        ):
            base_url = base_url.replace("http://", "https://", 1)

        root_path = get_request_api_prefix(request)

        if root_path and base_url.endswith(root_path):
            base_with_prefix = base_url
        else:
            base_with_prefix = f"{base_url}{root_path}"

        if root_path and url.startswith(root_path + "/"):
            url = url[len(root_path):]

        if url.startswith("/"):
            return {"stream": f"{base_with_prefix}{url}"}

        return {"stream": f"{base_with_prefix}/{url}"}

    return {"stream": get_vod_stream(item)}

@app.get("/stream")
def stream(request: Request, channel_id: str = Query(..., min_length=1, max_length=50, pattern="^[a-zA-Z0-9_-]+$")):
    custom_channel = get_custom_channel(channel_id)

    if custom_channel:
        return handle_proxy(
            request,
            custom_channel["streamUrl"],
            (custom_channel.get("linkDetails") or {}).get("referer", "")
        )

    channel_data = common.GetChannel(channel_id)
    channel = Channel.model_validate(channel_data)
    channel.id = channel_id
    channel.channelID = channel_id
    url = get_stream(channel)
    referer = (channel.linkDetails or {}).get("referer", "")

    return handle_proxy(request, url, referer)

@app.get("/proxy")
@app.get("/vod_proxy")
def proxy(request: Request, url: str, referer: str = None, cast: bool = False):
    return handle_proxy(request, url, referer, cast=cast)

@app.head("/proxy")
@app.head("/vod_proxy")
def proxy_head(request: Request, url: str, referer: str = None, cast: bool = False):
    return handle_proxy(request, url, referer, cast=cast)

@app.options("/proxy")
@app.options("/vod_proxy")
def proxy_options():
    return cors_preflight()

@app.get("/epg")
def epg():
    return get_now_epg()

@app.get("/epg.xml")
def epg_xml():
    xml = epg_service.get_epg_xml()
    return Response(content=xml, media_type="application/xml")

@app.get("/playlist.m3u")
def playlist(request: Request):
    content = generate_playlist(str(request.base_url).rstrip("/"))

    return Response(
        content=content,
        media_type="application/x-mpegURL"
    )

@app.get("/iptv")
def iptv_list(request: Request):
    channels = idan_main.GetUserChannels(type='tv')
    iptv.MakeIPTVlist(channels)

    return Response(content='IPTV playlist generated', media_type="text/plain")



def _local_series_stream_url(request: Request, path: str) -> str:
    base_url = str(request.base_url).rstrip("/")

    if (
        request.headers.get("x-forwarded-proto") == "https"
        or '"scheme":"https"' in request.headers.get("cf-visitor", "")
    ):
        base_url = base_url.replace("http://", "https://", 1)

    root_path = get_request_api_prefix(request)

    if root_path and base_url.endswith(root_path):
        base_with_prefix = base_url
    else:
        base_with_prefix = f"{base_url}{root_path}"

    return f"{base_with_prefix}/stream/local-series?path={quote(path)}"


def _is_safe_local_media_path(path: str) -> bool:
    real_root = os.path.realpath(LOCAL_VOD_TV_DIR)
    real_file = os.path.realpath(path)
    return real_file == real_root or real_file.startswith(real_root + os.sep)


def _rewrite_local_hls_playlist(request: Request, playlist_path: str) -> Response:
    if not _is_safe_local_media_path(playlist_path):
        return Response("Invalid file path", status_code=403)

    if not os.path.isfile(playlist_path):
        return Response("File not found", status_code=404)

    playlist_dir = os.path.dirname(playlist_path)

    with open(playlist_path, "r", encoding="utf-8") as playlist_file:
        lines = playlist_file.read().splitlines()

    rewritten_lines = []

    for line in lines:
        stripped = line.strip()

        if (
            not stripped
            or stripped.startswith("#")
            or stripped.startswith("http://")
            or stripped.startswith("https://")
            or stripped.startswith("data:")
            or stripped.startswith("blob:")
        ):
            rewritten_lines.append(line)
            continue

        segment_path = os.path.normpath(os.path.join(playlist_dir, stripped))
        rewritten_lines.append(_local_series_stream_url(request, segment_path))

    content = "\n".join(rewritten_lines) + "\n"

    return Response(
        content=content,
        media_type="application/vnd.apple.mpegurl",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Range, Origin, Accept, Content-Type, User-Agent, Referer",
            "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range, Content-Type",
            "Cache-Control": "no-cache",
        },
    )


@app.get("/local-series")
def local_series(request: Request):
    return scan_local_series(api_prefix=get_request_api_prefix(request))

@app.get("/stream/local-series")
@app.head("/stream/local-series")
def local_series_stream(request: Request, path: str = Query(..., min_length=1)):
    if path.lower().endswith(".m3u8"):
        return _rewrite_local_hls_playlist(request, path)

    return handle_local_file_proxy(request, path, LOCAL_VOD_TV_DIR)
