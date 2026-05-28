import xbmcplugin
from services.custom_channel_service import get_custom_channel

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

def get_stream(channel):
    channel_id = getattr(channel, "channelID", None) or getattr(channel, "id", None)

    custom_channel = get_custom_channel(channel_id)
    if custom_channel:
        return custom_channel["streamUrl"]
    
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
    return _clean_stream_url(xbmcplugin.getStream())

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
