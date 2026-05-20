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