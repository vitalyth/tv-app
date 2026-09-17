import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import xbmcplugin
from services.custom_channel_service import get_custom_channel


def _read_kan_live_dvr_milliseconds():
    try:
        return max(0, int(os.getenv("KAN_LIVE_DVR_MILLISECONDS", "120000")))
    except (TypeError, ValueError):
        return 120000


KAN_LIVE_DVR_MILLISECONDS = _read_kan_live_dvr_milliseconds()


def get_custom_channel_stream(custom_channel):
    return custom_channel.get("streamUrl") or (custom_channel.get("linkDetails") or {}).get("link")


def _prepare_keshet_module(module_script):
    uuid_str = str(module_script.uuid.uuid1()).upper()
    module_script.sortBy = int(module_script.common.GetAddonSetting("makoSortBy"))
    module_script.bitrate = module_script.common.GetAddonSetting(f"{module_script.module}_res")
    module_script.programNameFormat = int(module_script.common.GetAddonSetting("programNameFormat"))
    module_script.deviceID = f"W{uuid_str[:8]}{uuid_str[9:]}"
    module_script.username = module_script.common.GetAddonSetting("makoUsername")
    module_script.password = module_script.common.GetAddonSetting("makoPassword")
    module_script.makoShowShortSubtitle = (
        module_script.common.GetAddonSetting("makoShowShortSubtitle") == "true"
    )

def _clean_stream_url(stream):
    if not stream:
        return stream

    if "Missing querystring." in stream or stream.endswith("?None") or stream.endswith("&None"):
        return None

    return (
        stream
        .replace("?None&", "?")
        .replace("&None&", "&")
        .replace("?None", "")
        .replace("&None", "")
    )


def _limit_kan_live_dvr(stream, max_dvr_ms=KAN_LIVE_DVR_MILLISECONDS):
    if not stream or max_dvr_ms <= 0:
        return stream

    stream_url, separator, kodi_headers = stream.partition("|")
    parsed = urlsplit(stream_url)
    hostname = (parsed.hostname or "").lower()

    if not hostname.endswith("redge.media") or "/kancdn-live/live/" not in parsed.path.lower():
        return stream

    changed = False
    query = []
    for key, value in parse_qsl(parsed.query, keep_blank_values=True):
        if key.lower() != "dvr":
            query.append((key, value))
            continue

        try:
            limited_value = min(int(value), max_dvr_ms)
        except (TypeError, ValueError):
            limited_value = max_dvr_ms

        query.append((key, str(limited_value)))
        changed = changed or str(limited_value) != value

    if not changed:
        return stream

    limited_url = urlunsplit(parsed._replace(query=urlencode(query)))
    return f"{limited_url}{separator}{kodi_headers}" if separator else limited_url

def get_stream(channel):
    channel_id = getattr(channel, "channelID", None) or getattr(channel, "id", None)

    custom_channel = get_custom_channel(channel_id)
    if custom_channel:
        custom_stream = get_custom_channel_stream(custom_channel)
        if custom_stream:
            return custom_stream

    link_details = getattr(channel, "linkDetails", None) or {}
    direct_stream = link_details.get("link") or link_details.get("live")
    if getattr(channel, "type", None) == "radio" and direct_stream:
        return _limit_kan_live_dvr(_clean_stream_url(direct_stream))
    
    xbmcplugin.clearStream()

    moduleScript = __import__(
        f'resources.lib.{channel.module}',
        fromlist=[channel.module]
    )

    moduleScript.Run(
        channel.name,
        channel.channelID,
        channel.mode,
        '',
        '1'
    )
    return _limit_kan_live_dvr(_clean_stream_url(xbmcplugin.getStream()))

def get_vod_stream(item):
    if item.get("module") == "local-series":
        return item.get("url")

    xbmcplugin.clearStream()

    module_script = __import__(
        f"resources.lib.{item['module']}",
        fromlist=[item["module"]]
    )

    if item.get("module") == "keshet" and int(item.get("mode", -1)) in (4, 5):
        _prepare_keshet_module(module_script)
        quality = item.get("moreData", "") or "best"

        if int(item.get("mode", -1)) == 5:
            module_script.PlayItem(
                item.get("url", ""),
                item.get("name", ""),
                item.get("logo", ""),
                quality,
                swichCdn=True,
            )
        else:
            module_script.Play(
                item.get("url", ""),
                item.get("name", ""),
                item.get("logo", ""),
                quality,
                swichCdn=True,
            )

        return _clean_stream_url(xbmcplugin.getStream())

    module_script.Run(
        item.get("name", ""),
        item.get("url", ""),
        int(item.get("mode", -1)),
        item.get("logo", ""),
        item.get("moreData", "") or "best"
    )
    return _clean_stream_url(xbmcplugin.getStream())
