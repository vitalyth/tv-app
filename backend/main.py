from fastapi import FastAPI, Request
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from services.channel_service import get_live_channels
from services.stream_service import get_stream
from services.proxy_service import handle_proxy
from services.epg_service_ext import get_epg
from services.playlist_service import generate_playlist
import os
from models.schemas import Channel
from plugin_video_idanplus.resources import main as idan_main
from plugin_video_idanplus.resources.lib.iptv import MakeIPTVlist
from config import APP_VERSION

ROOT_PATH = os.getenv("ROOT_PATH", "")

app = FastAPI(
    title="TV App API",
    version=APP_VERSION,
    root_path=ROOT_PATH,
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
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

@app.get("/proxy")
def proxy(request: Request, url: str, referer: str = None):
    return handle_proxy(request, url, referer)

@app.get("/epg")
def epg():
    return get_epg()

@app.get("/playlist.m3u")
def playlist(request: Request):
    content = generate_playlist(str(request.base_url).rstrip("/"))

    return Response(
        content=content,
        media_type="application/x-mpegURL"
    )

@app.get("/iptv")
def iptv(request: Request):
    channels = idan_main.GetUserChannels(type='tv')
    MakeIPTVlist(channels)

    return Response(content='IPTV playlist generated', media_type="text/plain")