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

        channels_by_id[channel_id] = len(merged_channels)
        merged_channels.append(custom_channel)

    return merged_channels
