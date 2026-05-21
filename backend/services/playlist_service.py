
from urllib.parse import urlencode
from plugin_video_idanplus.resources import main as idan_main
from models.schemas import Channel
from services.custom_channel_service import load_custom_channels

def remove_api_prefix(url: str) -> str:
    return url.replace("/api", "", 1)

def generate_playlist(base_url):
    channels = idan_main.GetUserChannels(type='tv') + load_custom_channels()
    lines = ["#EXTM3U"]

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

        channel_id = ch.channelID

        proxy_url = f"{base_url}/stream?{urlencode({'channel_id': channel_id})}"

        logo_base = remove_api_prefix(base_url)
        logo = f"{logo_base}/ch/{ch.logo}"

        lines.append(
            f'#EXTINF:-1 tvg-id="{ch.tvgID}" tvg-name="{ch.name}" tvg-logo="{logo}",{ch.name}'
        )

        lines.append(proxy_url)

    return "\n".join(lines)