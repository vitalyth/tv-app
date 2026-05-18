import importlib
import json
import os
import re
import time
import threading
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

from config import CACHE_DIR
from plugin_video_idanplus.resources import main as idan_main
from resources.lib import cache as addon_cache
from services.epg_service import get_now_epg
from models.schemas import Channel

IDANPLUS_VOD_CHANNELS = [
    {
        "id": "vod_kan11",
        "name": "כאן 11",
        "mode": 0,
        "logo": "kan.jpg",
        "module": "kan",
        "url": "",
        "type": "vod",
    },
    {
        "id": "vod_keshet12",
        "name": "קשת 12",
        "mode": 0,
        "logo": "mako.png",
        "module": "keshet",
        "url": "",
        "type": "vod",
    },
    {
        "id": "vod_reshet13",
        "name": "רשת 13",
        "mode": -1,
        "logo": "13.jpg",
        "module": "reshet",
        "url": "",
        "type": "vod",
    },
    {
        "id": "vod_14tv",
        "name": "עכשיו 14",
        "mode": -1,
        "logo": "14tv.png",
        "module": "14tv",
        "url": "",
        "type": "vod",
    },
    {
        "id": "vod_kankids23",
        "name": "כאן חינוכית 23",
        "mode": 5,
        "logo": "23tv.jpg",
        "module": "kan",
        "url": "https://www.kankids.org.il",
        "type": "vod",
    },
    {
        "id": "vod_kan_archive",
        "name": "כאן - ארכיון",
        "mode": 41,
        "logo": "kan.jpg",
        "module": "kan",
        "url": "https://www.kan.org.il/lobby/archive/",
        "type": "vod",
    },
    {
        "id": "vod_24",
        "name": "ערוץ 24 החדש",
        "mode": 1,
        "logo": "24telad.png",
        "module": "keshet",
        "url": "https://www.mako.co.il/mako-vod-index?filter=provider&vcmId=3377c13070733210VgnVCM2000002a0c10acRCRD",
        "type": "vod",
    },
    {
        "id": "vod_i24news",
        "name": "i24news",
        "mode": -1,
        "logo": "i24news.png",
        "module": "i24news",
        "url": "",
        "type": "vod",
    },
    {
        "id": "vod_9tv",
        "name": "ערוץ 9",
        "mode": 0,
        "logo": "9tv.png",
        "module": "9tv",
        "url": "",
        "type": "vod",
    },
    {
        "id": "vod_sport5",
        "name": "ספורט 5",
        "mode": -1,
        "logo": "Sport5.png",
        "module": "sport5",
        "url": "",
        "type": "vod",
    },
    {
        "id": "vod_sport1",
        "name": "ספורט 1",
        "mode": -1,
        "logo": "sport1.jpg",
        "module": "sport1",
        "url": "",
        "type": "vod",
    },
]

VOD_RECENT_PRIORITY_CHANNEL_IDS = ["vod_keshet12", "vod_reshet13", "vod_14tv"]
VOD_SOURCE_CACHE_TTL_HOURS = 24
_original_addon_cache_get = addon_cache.get
_vod_source_lock = threading.RLock()

VOD_RECENT_TTL = 30 * 60
VOD_RECENT_CACHE_DIR = CACHE_DIR
VOD_RECENT_CACHE_FILE = VOD_RECENT_CACHE_DIR / "vod_recent.json"
_vod_recent_cache_lock = threading.Lock()
_vod_recent_cache: list[dict] | None = None
_vod_recent_cache_updated = 0.0

CHANNELS_BY_CATEGORY = {
    "news": [
        "ch_11", "ch_11b", "ch_11c",
        "ch_14", "ch_14b", "ch_14b2",
        "ch_99", "ch_99c",
        "ch_ynet",
        "ch_i24news", "ch_i24newsen", "ch_i24newsfr", "ch_i24newsar",
        "rd_bet", "rd_reka", "rd_makan", "rd_gly"
    ],

    "entertainment": [
        "ch_12", "ch_12b", "ch_12b2", "ch_12b3", "ch_12c",
        "ch_13", "ch_13b", "ch_13b2", "ch_13c",
        "ch_erets", "ch_savri"
    ],

    "kids": [
        "ch_23", "ch_23b",
        "rd_kankids"
    ],

    "music": [
        "ch_24",
        "ch_100", "ch_891",
        "rd_glglz", "rd_88", "rd_90", "rd_91", "rd_97",
        "rd_99", "rd_100", "rd_101", "rd_1015",
        "rd_102", "rd_102Eilat", "rd_1075",
        "rd_gimel", "rd_music",
        "rd_891", "rd_1064",
        "rd_mizrahit", "rd_kolhaymusic", "rd_kolplay",
        "rd_fm995", "rd_noshmim_mizrahit", "rd_diki"
    ],

    "sports": [
        "ch_sport5",
        "rd_sport5"
    ],

    "business": [
        "ch_10"
    ],

    "reality": [
        "ch_bb", "ch_bbb",
        "ch_13reality"
    ],

    "general": [
        "ch_33", "ch_33b",
        "ch_9"
    ],

    "religion": [
        "ch_66", "ch_kabru", "ch_musayof", "ch_97",
        "rd_moreshet", "rd_kolhay", "rd_kolbarama"
    ],

    "comedy": [
        "ch_13comedy"
    ],

    "lifestyle": [
        "ch_13nofesh"
    ],

    "talk": [
        "rd_103", "rd_1045", "rd_glz"
    ],

    "culture": [
        "rd_culture"
    ],
}

def get_category_from_reverse(channel_id):
    for category, channels in CHANNELS_BY_CATEGORY.items():
        if channel_id in channels:
            return category
    return "general"

def get_live_channels():
    nowEPG = get_now_epg()
    channels = idan_main.GetUserChannels(type='tv')

    results = []

    for channel in channels:
        programs = [] if channel['tvgID'] == '' else nowEPG.get(channel['tvgID'], [])

        ch = Channel(
            id=channel["channelID"],
            index=channel["index"],
            name=channel["name"],
            mode=channel["mode"],
            logo=channel["image"],
            category=get_category_from_reverse(channel["channelID"]),
            module=channel["module"],
            channelID=channel["channelID"],
            type=channel["type"],
            linkDetails=channel["linkDetails"],
            programs=programs,
            tvgID=channel["tvgID"]
        )

        results.append(ch)

    return results

def get_vod_channels():
    return IDANPLUS_VOD_CHANNELS

KODI_TAG_RE = re.compile(r"\[/?(?:B|I|COLOR[^\]]*)\]", re.IGNORECASE)

def clean_kodi_label(value):
    if value is None:
        return ""
    return KODI_TAG_RE.sub("", str(value)).replace("[CR]", "\n").strip()

def normalize_vod_image(iconimage):
    image = clean_kodi_label(iconimage)
    if not image:
        return ""
    if image.startswith("http://") or image.startswith("https://"):
        return image
    basename = os.path.basename(image)
    return basename or image

def _bounded_addon_cache_get(function, timeout, *args, **table):
    effective_timeout = timeout
    try:
        if int(timeout) > VOD_SOURCE_CACHE_TTL_HOURS:
            effective_timeout = VOD_SOURCE_CACHE_TTL_HOURS
    except Exception:
        pass

    return _original_addon_cache_get(function, effective_timeout, *args, **table)


def _direct_addon_cache_get(function, timeout, *args, **table):
    return function(*args)


addon_cache.get = _bounded_addon_cache_get


@contextmanager
def _vod_source_cache(use_cache: bool):
    previous_cache_get = addon_cache.get
    addon_cache.get = _bounded_addon_cache_get if use_cache else _direct_addon_cache_get
    try:
        yield
    finally:
        addon_cache.get = previous_cache_get


def get_vod_items(module, mode, url="", name="", iconimage="", moreData="", use_cache: bool = True):
    addon_common = importlib.import_module("resources.lib.common")
    module_script = importlib.import_module(f"resources.lib.{module}")
    requested_module = module
    captured_items = []

    def capture_add_dir(
        item_name,
        item_url,
        item_mode,
        item_iconimage="DefaultFolder.png",
        infos=None,
        contextMenu=None,
        module="",
        moreData="",
        totalItems=None,
        isFolder=True,
        isPlayable=False,
        addFav=True,
        urlParamsData={},
    ):
        if item_url == "toggleSortingMethod":
            return
        if item_mode == 99 and not isFolder and not isPlayable:
            return

        infos = infos or {}
        item_module = module or requested_module
        item_description = clean_kodi_label(
            infos.get("plot") or infos.get("Plot") or infos.get("description") or ""
        )
        item_title = clean_kodi_label(
            infos.get("title") or infos.get("Title") or item_name
        )
        item_image = normalize_vod_image(item_iconimage)
        captured_items.append({
            "id": f"{item_module}:{item_mode}:{item_url}:{moreData}",
            "name": clean_kodi_label(item_name),
            "url": item_url,
            "mode": item_mode,
            "logo": item_image,
            "module": item_module,
            "moreData": moreData,
            "description": item_description,
            "title": item_title,
            "plot": item_description,
            "aired": clean_kodi_label(infos.get("aired") or infos.get("Aired") or ""),
            "season": clean_kodi_label(infos.get("season") or infos.get("Season") or ""),
            "episode": clean_kodi_label(infos.get("episode") or infos.get("Episode") or ""),
            "episodeName": item_title,
            "episodeDescription": item_description,
            "episodeImage": item_image,
            "isFolder": isFolder,
            "isPlayable": isPlayable,
            "sourceOrder": len(captured_items),
        })

    with _vod_source_lock, _vod_source_cache(use_cache):
        original_add_dir = addon_common.addDir
        addon_common.addDir = capture_add_dir
        try:
            module_script.Run(
                clean_kodi_label(name),
                url or "",
                int(mode),
                iconimage or "",
                moreData or "",
            )
        except Exception as ex:
            print(f"VOD items failed for module={requested_module} mode={mode} url={url}: {ex}")
        finally:
            addon_common.addDir = original_add_dir

    return captured_items


def _parse_aired_timestamp(aired_value: str) -> float:
    if not aired_value:
        return 0.0

    value = aired_value.strip()
    if value.endswith("Z"):
        value = f"{value[:-1]}+00:00"

    try:
        return datetime.fromisoformat(value).timestamp()
    except Exception:
        pass

    common_formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
        "%d/%m/%Y %H:%M",
        "%d/%m/%Y",
    ]

    for fmt in common_formats:
        try:
            return datetime.strptime(value, fmt).timestamp()
        except Exception:
            continue

    # Fallback: if a number-like string is provided assume unix timestamp
    try:
        timestamp = float(value)
        if timestamp > 10_000_000_000:
            timestamp = timestamp / 1000
        return timestamp
    except Exception:
        return 0.0


def _sort_vod_items_by_recent(items: list[dict]) -> list[dict]:
    return sorted(
        items,
        key=lambda item: _parse_aired_timestamp(item.get("aired", "") or ""),
        reverse=True,
    )


def _select_vod_recent_items(items: list[dict], max_items: int, preserve_source_order: bool) -> list[dict]:
    if not preserve_source_order:
        return _sort_vod_items_by_recent(items)[:max_items]

    indexed_items = [
        (item, _parse_aired_timestamp(item.get("aired", "") or ""))
        for item in items
    ]
    if not any(aired_timestamp for _, aired_timestamp in indexed_items):
        return items[:max_items]

    return [
        item
        for item, _ in sorted(
            indexed_items,
            key=lambda indexed_item: (
                0 if indexed_item[1] else 1,
                -indexed_item[1],
                indexed_item[0].get("sourceOrder", 0),
            ),
        )[:max_items]
    ]


def _sort_vod_recent_cache_items(items: list[dict]) -> list[dict]:
    priority_rank = {
        channel_id: index for index, channel_id in enumerate(VOD_RECENT_PRIORITY_CHANNEL_IDS)
    }
    fallback_rank = len(priority_rank)
    indexed_items = [
        (item, _parse_aired_timestamp(item.get("aired", "") or ""))
        for item in items
    ]

    return [
        item
        for item, _ in sorted(
            indexed_items,
            key=lambda indexed_item: (
                priority_rank.get(indexed_item[0].get("vodChannelId"), fallback_rank),
                -indexed_item[1],
                indexed_item[0].get("sourceOrder", 0),
            ),
        )
    ]


def _attach_vod_channel_metadata(items: list[dict], channel: dict) -> list[dict]:
    return [
        {
            **item,
            "vodChannelId": channel["id"],
            "vodChannelName": channel["name"],
        }
        for item in items
    ]


def _get_vod_channels_for_recent(preserve_source_order: bool) -> list[dict]:
    if not preserve_source_order:
        return IDANPLUS_VOD_CHANNELS

    priority_rank = {
        channel_id: index for index, channel_id in enumerate(VOD_RECENT_PRIORITY_CHANNEL_IDS)
    }
    fallback_rank = len(priority_rank)

    return sorted(
        IDANPLUS_VOD_CHANNELS,
        key=lambda channel: (
            priority_rank.get(channel["id"], fallback_rank),
            IDANPLUS_VOD_CHANNELS.index(channel),
        ),
    )


def _ensure_vod_recent_cache_dir() -> None:
    VOD_RECENT_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _read_vod_recent_cache_file() -> list[dict] | None:
    if not VOD_RECENT_CACHE_FILE.exists():
        return None

    try:
        with VOD_RECENT_CACHE_FILE.open("r", encoding="utf-8") as cache_file:
            data = json.load(cache_file)
        if isinstance(data, list):
            return data
    except Exception:
        pass

    return None


def _write_vod_recent_cache_file(items: list[dict]) -> None:
    _ensure_vod_recent_cache_dir()
    try:
        with VOD_RECENT_CACHE_FILE.open("w", encoding="utf-8") as cache_file:
            json.dump(items, cache_file, ensure_ascii=False)
    except Exception:
        pass


def _collect_playable_vod_items(
    module: str,
    mode: int,
    url: str = "",
    name: str = "",
    iconimage: str = "",
    moreData: str = "",
    max_depth: int = 4,
    max_nodes: int = 250,
    use_cache: bool = True,
) -> list[dict]:
    seen_nodes = set()
    seen_items = set()
    playable_items: list[dict] = []
    queue = [
        {
            "module": module,
            "mode": mode,
            "url": url,
            "name": name,
            "iconimage": iconimage,
            "moreData": moreData,
            "depth": 0,
        }
    ]

    while queue and len(seen_nodes) < max_nodes:
        node = queue.pop(0)
        node_key = f"{node['module']}|{node['mode']}|{node['url']}|{node.get('moreData','')}"
        if node_key in seen_nodes:
            continue
        seen_nodes.add(node_key)

        try:
            items = get_vod_items(
                node["module"],
                node["mode"],
                node.get("url", ""),
                node.get("name", ""),
                node.get("iconimage", ""),
                node.get("moreData", ""),
                use_cache=use_cache,
            )
        except Exception:
            continue

        for item in items:
            item_id = item.get("id") or f"{item.get('module','')}|{item.get('mode','')}|{item.get('url','')}|{item.get('moreData','')}"
            if item_id in seen_items:
                continue
            seen_items.add(item_id)

            if item.get("isPlayable") and not item.get("isFolder", False):
                playable_items.append({
                    **item,
                    "sourceDepth": node["depth"],
                    "sourceOrder": len(playable_items),
                })
                continue

            if item.get("isFolder", False) and node["depth"] < max_depth:
                queue.append(
                    {
                        "module": item.get("module", node["module"]),
                        "mode": item.get("mode", node["mode"]),
                        "url": item.get("url", ""),
                        "name": item.get("name", ""),
                        "iconimage": item.get("logo", ""),
                        "moreData": item.get("moreData", ""),
                        "depth": node["depth"] + 1,
                    }
                )
                continue

            if not item.get("isFolder", True):
                playable_items.append({
                    **item,
                    "sourceDepth": node["depth"],
                    "sourceOrder": len(playable_items),
                })

    return playable_items


def _build_vod_recent_items(
    max_per_channel: int = 2,
    total_limit: int = 12,
    use_cache: bool = True,
    preserve_source_order: bool = False,
) -> list[dict]:
    recent_items: list[dict] = []

    for channel in _get_vod_channels_for_recent(preserve_source_order):
        channel_items = _collect_playable_vod_items(
            channel["module"],
            channel["mode"],
            channel.get("url", ""),
            channel.get("name", ""),
            channel.get("logo", ""),
            channel.get("moreData", ""),
            use_cache=use_cache,
        )

        if not channel_items:
            channel_items = get_vod_items(
                channel["module"],
                channel["mode"],
                channel.get("url", ""),
                channel.get("name", ""),
                channel.get("logo", ""),
                channel.get("moreData", ""),
                use_cache=use_cache,
            )

        selected_items = _select_vod_recent_items(
            channel_items,
            max_per_channel,
            preserve_source_order,
        )
        recent_items.extend(_attach_vod_channel_metadata(selected_items, channel))

    if preserve_source_order:
        return recent_items[:total_limit]

    return _sort_vod_recent_cache_items(recent_items)[:total_limit]


def refresh_vod_recent_cache(
    max_per_channel: int = 2,
    total_limit: int = 12,
    use_cache: bool = False,
    preserve_source_order: bool = True,
) -> list[dict]:
    global _vod_recent_cache, _vod_recent_cache_updated

    recent_items = _build_vod_recent_items(
        max_per_channel=max_per_channel,
        total_limit=total_limit,
        use_cache=use_cache,
        preserve_source_order=preserve_source_order,
    )
    _write_vod_recent_cache_file(recent_items)

    now = time.time()
    with _vod_recent_cache_lock:
        _vod_recent_cache = recent_items
        _vod_recent_cache_updated = now

    return recent_items


def get_vod_recent_items(max_per_channel: int = 2, total_limit: int = 12) -> list[dict]:
    file_items = _read_vod_recent_cache_file()
    if file_items is not None:
        return file_items

    # If cache was never generated yet, return an empty list immediately.
    # The scheduler / refresh_vod_recent.py should populate this file in the background.
    return []
