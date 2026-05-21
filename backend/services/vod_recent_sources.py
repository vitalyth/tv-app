from services.vod_recent_common import VodRecentSourceContext
from services.vod_recent_keshet12 import fetch_keshet_recent_items
from services.vod_recent_now14 import fetch_now14_recent_items
from services.vod_recent_reshet13 import fetch_reshet_recent_items


def fetch_direct_vod_recent_items(
    channel: dict,
    limit: int,
    use_cache: bool,
    context: VodRecentSourceContext,
) -> list[dict]:
    if channel["id"] == "vod_keshet12":
        return fetch_keshet_recent_items(channel, limit, use_cache, context)
    if channel["id"] == "vod_reshet13":
        return fetch_reshet_recent_items(limit, context)
    if channel["id"] == "vod_14tv":
        return fetch_now14_recent_items(channel, limit, use_cache, context)
    return []
