from fastapi import FastAPI, Request, Query
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from services.channel_service import get_live_channels
from services.stream_service import get_stream
from services.proxy_service import cors_preflight, handle_proxy
from services.epg_service_ext import get_epg, EPGService
from services.playlist_service import generate_playlist
import os
import socket
from models.schemas import Channel
from plugin_video_idanplus.resources import main as idan_main
from plugin_video_idanplus.resources.lib import common, iptv, epg
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

@app.post('/live_channel')
def live_channel(channel: Channel):
    return {"stream": get_stream(channel)}

@app.get("/stream")
def stream(request: Request, channel_id: str = Query(..., min_length=1, max_length=50, regex="^[a-zA-Z0-9_-]+$")):
    channel_data = common.GetChannel(channel_id)
    channel = Channel.model_validate(channel_data)
    channel.id = channel_id
    channel.channelID = channel_id
    url = get_stream(channel)
    referer = (channel.linkDetails or {}).get("referer", "")
    return handle_proxy(request, url, referer)

@app.get("/proxy")
def proxy(request: Request, url: str, referer: str = None, cast: bool = False, cast_master: bool = False):
    return handle_proxy(request, url, referer, cast=cast, cast_master=cast_master)

@app.head("/proxy")
def proxy_head(request: Request, url: str, referer: str = None, cast: bool = False, cast_master: bool = False):
    return handle_proxy(request, url, referer, cast=cast, cast_master=cast_master)

@app.options("/proxy")
def proxy_options():
    return cors_preflight()

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
