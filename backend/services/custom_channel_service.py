import json
import os
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

DEFAULT_CUSTOM_CHANNELS_PATH = Path(__file__).resolve().parent.parent / "data" / "custom_channels.json"


def load_custom_channels():
    path = Path(os.getenv("CUSTOM_CHANNELS_FILE", DEFAULT_CUSTOM_CHANNELS_PATH))

    if not path.exists():
        return []

    with path.open("r", encoding="utf-8") as input_file:
        data = json.load(input_file)

    return data if isinstance(data, list) else []


def get_custom_channel(channel_id: str):
    custom_channels = load_custom_channels()
    for channel in custom_channels:
        if channel.get("id") == channel_id or channel.get("channelID") == channel_id:
            return channel

    # A previous source keeps its original resolver identity even though the
    # logical channel now defaults to a direct stream.
    for channel in custom_channels:
        original_id = channel.get("channelID") or channel.get("id")
        if channel.get("primarySource") and channel_id == f"{original_id}_previous":
            previous = {**channel, "id": channel_id, "channelID": channel_id,
                        "sourceChannelID": original_id}
            previous.pop("primarySource", None)
            return previous

    return None


def merge_custom_channels(channels):
    custom_channels = load_custom_channels()
    channels_by_id = {
        channel.get("channelID") or channel.get("id"): index
        for index, channel in enumerate(channels)
    }
    merged_channels = list(channels)

    for custom_channel in custom_channels:
        channel_id = custom_channel.get("channelID") or custom_channel.get("id")

        if channel_id in channels_by_id:
            index = channels_by_id[channel_id]
            current_channel = merged_channels[index]
            link_details = {
                **(current_channel.get("linkDetails") or {}),
                **(custom_channel.get("linkDetails") or {}),
            }
            merged_channels[index] = {
                **current_channel,
                **custom_channel,
                "channelID": channel_id,
                "linkDetails": link_details,
            }
            continue

        # An override for an absent/hidden upstream channel is not a new channel.
        if "index" not in custom_channel or "type" not in custom_channel:
            continue

        channels_by_id[channel_id] = len(merged_channels)
        merged_channels.append(custom_channel)

    ordered = order_channels(merged_channels, custom_channels)
    ordered = order_channels(_apply_primary_sources(ordered, custom_channels), custom_channels)
    return _label_backup_sources(ordered, custom_channels)


def _stream_identity(channel):
    if channel.get("streamProvider"):
        return (channel["streamProvider"], channel.get("streamSlug"))
    details = channel.get("linkDetails") or {}
    url = channel.get("streamUrl") or details.get("link") or details.get("live")
    if not url:
        return None
    parsed = urlsplit(url.strip())
    # Rendition/DVR options do not make another source. Keep authentication
    # parameters and different hosts/paths distinct.
    query = [(key, value) for key, value in parse_qsl(parsed.query, keep_blank_values=True)
             if key not in {"bitrate", "audioId", "videoId", "dvr", "indexMode"}]
    return ("url", urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(),
                              parsed.path.rstrip("/"), urlencode(sorted(query)), "")))


def _same_source_group(left, right):
    if left.get("index") != right.get("index") or left.get("type") != right.get("type"):
        return False
    left_number, right_number = left.get("channelNumber"), right.get("channelNumber")
    return not (left_number and right_number) or str(left_number) == str(right_number)


def _apply_primary_sources(channels, custom_channels):
    result = list(channels)
    for config in custom_channels:
        preferred = config.get("primarySource") or {}
        if not preferred.get("streamUrl"):
            continue
        channel_id = config.get("channelID") or config.get("id")
        current = next((channel for channel in result
                        if (channel.get("channelID") or channel.get("id")) == channel_id), None)
        if current is None:
            continue
        preferred_identity = _stream_identity(preferred)
        previous_identity = _stream_identity(current)
        group = [channel for channel in result if _same_source_group(current, channel)]
        duplicates = [channel for channel in group if channel is not current
                      and _stream_identity(channel) == preferred_identity]
        # Retain the logical ID, guide metadata, number and display order.
        primary = {**current, "module": "custom", "mode": 0,
                   "streamUrl": preferred["streamUrl"],
                   "linkDetails": {**(preferred.get("linkDetails") or {}),
                                   "link": preferred["streamUrl"]}}
        primary.pop("streamProvider", None)
        primary.pop("streamSlug", None)
        primary.pop("sourceChannelID", None)
        result = [primary if channel is current else channel for channel in result
                  if not any(channel is duplicate for duplicate in duplicates)]
        previous_exists = any(channel is not current and previous_identity is not None
                              and _stream_identity(channel) == previous_identity for channel in group)
        previous_id = f"{channel_id}_previous"
        if previous_identity != preferred_identity and not previous_exists and not any(
                (channel.get("channelID") or channel.get("id")) == previous_id for channel in result):
            previous = {**current, "id": previous_id, "channelID": previous_id,
                        "sourceChannelID": channel_id,
                        "name": current["name"],
                        "orderNumber": current["orderNumber"] + 1}
            previous.pop("primarySource", None)
            result.append(previous)
    return result


def _label_backup_sources(channels, custom_channels):
    result = list(channels)
    for config in custom_channels:
        if not (config.get("primarySource") or {}).get("streamUrl"):
            continue
        channel_id = config.get("channelID") or config.get("id")
        primary = next((channel for channel in result
                        if channel.get("channelID") == channel_id), None)
        if primary is None:
            continue
        number = 0
        for position, channel in enumerate(result):
            if channel is primary or not _same_source_group(primary, channel):
                continue
            number += 1
            result[position] = {**channel, "name": f"{primary['name']} - גיבוי {number}"}
    return result


def order_channels(channels, custom_channels=None):
    """Apply the shared display order without changing source-group indices."""
    if custom_channels is None:
        custom_channels = load_custom_channels()
    overrides = {
        channel.get("channelID") or channel.get("id"): channel["orderNumber"]
        for channel in custom_channels if isinstance(channel.get("orderNumber"), int)
    }
    orders = [*overrides.values(), *(channel["orderNumber"] for channel in channels
               if isinstance(channel.get("orderNumber"), int))]
    next_order = max(orders, default=0) + 10
    ordered = []
    for channel in channels:
        channel_id = channel.get("channelID") or channel.get("id")
        order = overrides.get(channel_id, channel.get("orderNumber"))
        if not isinstance(order, int):
            order = next_order
            next_order += 10
        ordered.append({**channel, "orderNumber": order})
    return sorted(ordered, key=lambda channel: channel["orderNumber"])
