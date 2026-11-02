import json
import os
from pathlib import Path

DEFAULT_CUSTOM_CHANNELS_PATH = Path(__file__).resolve().parent.parent / "data" / "custom_channels.json"


def load_custom_channels():
    path = Path(os.getenv("CUSTOM_CHANNELS_FILE", DEFAULT_CUSTOM_CHANNELS_PATH))

    if not path.exists():
        return []

    with path.open("r", encoding="utf-8") as input_file:
        data = json.load(input_file)

    return data if isinstance(data, list) else []


def get_custom_channel(channel_id: str):
    for channel in load_custom_channels():
        if channel.get("id") == channel_id or channel.get("channelID") == channel_id:
            return channel

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

    return order_channels(merged_channels, custom_channels)


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
