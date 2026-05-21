import re
from datetime import datetime

from services.vod_recent_common import (
    VodRecentSourceContext,
    folder_name_matches,
    get_vod_children_for_node,
    item_timestamp_from_fields,
    node_from_vod_item,
)


def fetch_keshet_recent_items(
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

    recent_items: list[dict] = []
    for source_order, program_folder in enumerate(program_folders[:4]):
        program_node = node_from_vod_item(program_folder, root_node)
        program_items = context.collect_playable_vod_items(
            program_node["module"],
            program_node["mode"],
            program_node.get("url", ""),
            program_node.get("name", ""),
            program_node.get("iconimage", ""),
            program_node.get("moreData", ""),
            max_depth=4,
            max_nodes=80,
            use_cache=use_cache,
        )
        selected_item = _select_latest_episode(program_items, context)
        if not selected_item:
            continue

        source_timestamp = selected_item.get("sourceTimestamp") or item_timestamp_from_fields(selected_item, context)
        if not source_timestamp:
            source_timestamp = datetime.now().timestamp()

        recent_items.append(
            {
                **selected_item,
                "programName": context.clean_kodi_label(program_folder.get("name", "")),
                "programImage": context.normalize_vod_image(program_folder.get("logo", "")),
                "channelName": "קשת 12",
                "channelImage": context.normalize_vod_image(channel.get("logo", "")),
                "sourceTimestamp": source_timestamp,
                "sourceOrder": source_order,
            }
        )

    return recent_items[:limit]


def _select_latest_episode(items: list[dict], context: VodRecentSourceContext) -> dict | None:
    playable_items = [
        {
            **item,
            "sourceTimestamp": item_timestamp_from_fields(item, context),
            "episodeNumber": _text_episode_number(item, context),
        }
        for item in items
        if item.get("isPlayable") and not item.get("isFolder", False)
    ]
    if not playable_items:
        return None

    return sorted(
        playable_items,
        key=lambda item: (
            item.get("sourceTimestamp", 0) > 0,
            item.get("sourceTimestamp", 0),
            item.get("episodeNumber", 0),
            -item.get("sourceOrder", 0),
        ),
        reverse=True,
    )[0]


def _text_episode_number(item: dict, context: VodRecentSourceContext) -> int:
    values = [
        item.get("episode", ""),
        item.get("episodeName", ""),
        item.get("title", ""),
        item.get("name", ""),
    ]
    for value in values:
        text = context.clean_kodi_label(str(value or ""))
        match = re.search(r"(?:פרק|episode|ep)\D*(\d{1,4})", text, re.IGNORECASE)
        if match:
            return int(match.group(1))

    return 0
