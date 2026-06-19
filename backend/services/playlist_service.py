
from urllib.parse import urlencode
from plugin_video_idanplus.resources import main as idan_main
from models.schemas import Channel
from services.custom_channel_service import merge_custom_channels

def remove_api_prefix(url: str) -> str:
    return url.replace("/api", "", 1)

def generate_playlist(base_url, use_api_prefix=True, use_vpn_routes=True):
    channels = merge_custom_channels(idan_main.GetUserChannels(type='tv'))
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

        stream_base = base_url.rstrip("/")

        if use_api_prefix and not stream_base.endswith("/api"):
            stream_base = f"{stream_base}/api"

        stream_params = {"channel_id": channel_id}
        link_details = channel.get("linkDetails") or {}
        if use_vpn_routes and (channel_id.startswith("ch_11") or link_details.get("vpn")):
            stream_params["vpn"] = "true"

        proxy_url = f"{stream_base}/stream?{urlencode(stream_params)}"

        logo_base = remove_api_prefix(base_url)
        logo = f"{logo_base}/ch/{ch.logo}"

        lines.append(
            f'#EXTINF:-1 tvg-id="{ch.tvgID}" tvg-name="{ch.name}" tvg-logo="{logo}",{ch.name}'
        )

        lines.append(proxy_url)

    return "\n".join(lines)
