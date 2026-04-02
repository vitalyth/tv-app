import time
from urllib.parse import urlparse, urlencode
from plugin_video_idanplus.resources import main as idan_main
from models.schemas import Channel
from services.stream_service import get_stream
from services.cache_service import get as cache_get, set as cache_set

CACHE_TTL = 120 # seconds

def generate_playlist(base_url):
    channels = idan_main.GetUserChannels(type='tv')
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
            linkDetails=channel["linkDetails"],
            programs=[],
            tvgID=channel["tvgID"]
        )

        stream_url = None
        referer = None

        cached = cache_get(ch.channelID)

        if cached and now - cached["time"] < CACHE_TTL:
            stream_url = cached["url"]
            referer = cached.get("referer")
        else:
            try:
                stream_url = get_stream(ch)

                if ch.linkDetails:
                    referer = ch.linkDetails.get("referer")

                if not referer and stream_url:
                    parsed = urlparse(stream_url)
                    referer = f"{parsed.scheme}://{parsed.netloc}/"

                cache_set(ch.channelID, {
                    "url": stream_url,
                    "referer": referer,
                    "time": now
                })

            except Exception:
                continue

        if not stream_url:
            continue

        params = {
            "url": stream_url,
            "referer": referer or ""
        }

        proxy_url = f"{base_url}/proxy?{urlencode(params)}"
        logo = f"http://192.168.86.75:8001/ch/{ch.logo}"

        lines.append(
            f'#EXTINF:-1 tvg-id="{ch.tvgID}" tvg-name="{ch.name}" tvg-logo="{logo}",{ch.name}'
        )

        lines.append(proxy_url)

    return "\n".join(lines)