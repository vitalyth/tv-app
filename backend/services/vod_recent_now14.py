from datetime import datetime

from services.vod_recent_common import (
    VodRecentSourceContext,
    folder_name_matches,
    get_vod_children_for_node,
    item_timestamp_from_fields,
    node_from_vod_item,
    recent_date_set,
    sort_direct_recent_items,
    timestamp_matches_dates,
    today_date_set,
)


HEBREW_MONTHS = {
    1: ("ינואר",),
    2: ("פברואר",),
    3: ("מרץ", "מרס"),
    4: ("אפריל",),
    5: ("מאי",),
    6: ("יוני",),
    7: ("יולי",),
    8: ("אוגוסט",),
    9: ("ספטמבר",),
    10: ("אוקטובר",),
    11: ("נובמבר",),
    12: ("דצמבר",),
}


def fetch_now14_recent_items(
    channel: dict,
    limit: int,
    use_cache: bool,
    context: VodRecentSourceContext,
) -> list[dict]:
    root_node = {
        "module": channel["module"],
        "mode": channel["mode"],
        "url": channel.get("url", ""),
        "name": channel.get("name", ""),
        "iconimage": channel.get("logo", ""),
        "moreData": channel.get("moreData", ""),
    }

    try:
        root_items = get_vod_children_for_node(root_node, use_cache, context)
    except Exception:
        return []

    all_programs_folder = next(
        (
            item
            for item in root_items
            if item.get("isFolder") and folder_name_matches(item, context, "כל התוכניות", "כל התכניות")
        ),
        None,
    )
    if not all_programs_folder:
        return []

    try:
        program_folders = [
            item
            for item in get_vod_children_for_node(node_from_vod_item(all_programs_folder, root_node), use_cache, context)
            if item.get("isFolder")
        ]
    except Exception:
        return []

    today_dates = today_date_set()
    recent_dates = recent_date_set()
    today_items: list[dict] = []
    fallback_items: list[dict] = []
    for program_order, program_folder in enumerate(program_folders):
        if len(today_items) >= limit:
            break

        program_node = node_from_vod_item(program_folder, root_node)
        try:
            month_folders = [
                item
                for item in get_vod_children_for_node(program_node, use_cache, context)
                if item.get("isFolder")
            ]
        except Exception:
            continue

        current_month_folders = [
            item for item in month_folders if _month_folder_matches_current(item, context)
        ]
        folders_to_scan = current_month_folders or month_folders[:2]

        for month_folder in folders_to_scan:
            if len(today_items) >= limit:
                break

            month_node = node_from_vod_item(month_folder, program_node)
            try:
                episodes = [
                    item
                    for item in get_vod_children_for_node(month_node, use_cache, context)
                    if item.get("isPlayable") and not item.get("isFolder", False)
                ]
            except Exception:
                continue

            for episode in episodes:
                timestamp = _episode_timestamp(episode, context)
                if not timestamp_matches_dates(timestamp, recent_dates):
                    continue

                item = {
                    **episode,
                    "programName": context.clean_kodi_label(program_folder.get("name", "")),
                    "programImage": context.normalize_vod_image(program_folder.get("logo", "")),
                    "channelName": "עכשיו 14",
                    "channelImage": context.normalize_vod_image(channel.get("logo", "")),
                    "sourceTimestamp": timestamp,
                    "sourceOrder": program_order,
                }
                if timestamp_matches_dates(timestamp, today_dates):
                    today_items.append(item)
                else:
                    fallback_items.append(item)
                break

    unique_items = {}
    source_items = today_items or fallback_items
    for item in sort_direct_recent_items(source_items, context):
        unique_items.setdefault(item["id"], item)
    return list(unique_items.values())[:limit]


def _month_folder_matches_current(item: dict, context: VodRecentSourceContext) -> bool:
    name = context.clean_kodi_label(item.get("name", ""))
    today = datetime.now()
    month_names = HEBREW_MONTHS.get(today.month, ())
    if any(month_name in name for month_name in month_names):
        return True

    numeric_patterns = [
        f"{today.month:02d}/{today.year}",
        f"{today.month}/{today.year}",
        f"{today.month:02d}.{today.year}",
        f"{today.month}.{today.year}",
        f"{today.month:02d}/{today.year % 100:02d}",
        f"{today.month}/{today.year % 100:02d}",
    ]
    return any(pattern in name for pattern in numeric_patterns)


def _episode_timestamp(item: dict, context: VodRecentSourceContext) -> float:
    timestamp = item_timestamp_from_fields(item, context)
    if timestamp:
        return timestamp
    return context.parse_aired_timestamp(item.get("aired", "") or "")
