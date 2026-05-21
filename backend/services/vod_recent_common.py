import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Callable


@dataclass
class VodRecentSourceContext:
    get_vod_items: Callable
    collect_playable_vod_items: Callable
    make_vod_recent_item: Callable
    clean_kodi_label: Callable
    normalize_vod_image: Callable
    http_get_json: Callable
    http_get_text: Callable
    extract_next_data: Callable
    first_image: Callable
    timestamp_to_date: Callable
    normalize_unix_timestamp: Callable
    parse_aired_timestamp: Callable


def today_and_yesterday_dates() -> set:
    today = datetime.now().date()
    return {today, today - timedelta(days=1)}


def today_date_set() -> set:
    return {datetime.now().date()}


def recent_date_set(days: int = 3) -> set:
    today = datetime.now().date()
    return {today - timedelta(days=offset) for offset in range(days)}


def timestamp_matches_dates(timestamp: float, allowed_dates: set) -> bool:
    if not timestamp:
        return False
    return datetime.fromtimestamp(timestamp).date() in allowed_dates


def vod_recent_timestamp(item: dict, context: VodRecentSourceContext) -> float:
    source_timestamp = item.get("sourceTimestamp")
    if source_timestamp:
        try:
            return float(source_timestamp)
        except Exception:
            pass
    return context.parse_aired_timestamp(item.get("aired", "") or "")


def sort_direct_recent_items(items: list[dict], context: VodRecentSourceContext) -> list[dict]:
    return sorted(
        items,
        key=lambda item: (
            -vod_recent_timestamp(item, context),
            item.get("sourceOrder", 0),
        ),
    )


def item_timestamp_from_fields(item: dict, context: VodRecentSourceContext) -> float:
    for field in ("name", "title", "episodeName", "description"):
        text = context.clean_kodi_label(str(item.get(field, "") or ""))
        timestamp = context.parse_aired_timestamp(text)
        if timestamp:
            return timestamp

        date_match = re.search(r"(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})", text)
        if date_match:
            timestamp = context.parse_aired_timestamp(date_match.group(1).replace(".", "/").replace("-", "/"))
            if timestamp:
                return timestamp

    timestamp = vod_recent_timestamp(item, context)
    if timestamp:
        return timestamp

    return 0.0


def folder_name_matches(item: dict, context: VodRecentSourceContext, *needles: str) -> bool:
    name = context.clean_kodi_label(str(item.get("name", "") or "")).strip()
    return any(needle in name for needle in needles)


def node_from_vod_item(item: dict, fallback: dict | None = None) -> dict:
    fallback = fallback or {}
    return {
        "module": item.get("module", fallback.get("module", "")),
        "mode": item.get("mode", fallback.get("mode", 0)),
        "url": item.get("url", fallback.get("url", "")),
        "name": item.get("name", fallback.get("name", "")),
        "iconimage": item.get("logo", fallback.get("iconimage", "")),
        "moreData": item.get("moreData", fallback.get("moreData", "")),
    }


def get_vod_children_for_node(node: dict, use_cache: bool, context: VodRecentSourceContext) -> list[dict]:
    return context.get_vod_items(
        node.get("module", ""),
        node.get("mode", 0),
        node.get("url", ""),
        node.get("name", ""),
        node.get("iconimage", ""),
        node.get("moreData", ""),
        use_cache=use_cache,
    )
