import importlib
import hashlib
import json
import os
import re
import requests
import time
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path

from bs4 import BeautifulSoup
from config import CACHE_DIR
from plugin_video_idanplus.resources import main as idan_main
from resources.lib import cache as addon_cache
from services.epg_service import get_now_epg
from models.schemas import Channel
from services.custom_channel_service import load_custom_channels
from services.kan_vod_service import get_kan_vod_recent_episodes
from services.vod_recent_common import VodRecentSourceContext
from services.vod_recent_sources import fetch_direct_vod_recent_items

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

VOD_RECENT_PRIORITY_CHANNEL_IDS = ["vod_kan11", "vod_keshet12", "vod_reshet13", "vod_14tv"]
VOD_RECENT_LOOKBACK_DAYS = 3
VOD_RECENT_TOTAL_LIMIT = 40
VOD_SOURCE_CACHE_TTL_HOURS = 24
VOD_ITEMS_CACHE_TTL_SECONDS = int(os.getenv("VOD_ITEMS_CACHE_TTL_SECONDS", str(7 * 24 * 60 * 60)))
VOD_ITEMS_CACHE_DIR = CACHE_DIR / "vod_items"
VOD_RECENT_DIRECT_CHANNEL_IDS = {"vod_kan11", "vod_keshet12", "vod_reshet13", "vod_14tv"}
_original_addon_cache_get = addon_cache.get
_original_addon_cache_clear = addon_cache.clear
_original_addon_cache_database = addon_cache.database
_addon_cache_connection_scopes = threading.local()
_vod_source_lock = threading.RLock()

VOD_RECENT_TTL = 30 * 60
VOD_RECENT_CACHE_DIR = CACHE_DIR
VOD_RECENT_CACHE_FILE = VOD_RECENT_CACHE_DIR / "vod_recent.json"
_vod_recent_cache_lock = threading.Lock()
_vod_recent_cache: list[dict] | None = None
_vod_recent_cache_updated = 0.0


def _vod_items_cache_key(module: str, mode: int, url: str, name: str, iconimage: str, more_data: str) -> str:
    payload = json.dumps(
        {
            "module": module,
            "mode": int(mode),
            "url": url or "",
            "name": name or "",
            "iconimage": iconimage or "",
            "moreData": more_data or "",
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()


def _vod_items_cache_path(cache_key: str) -> Path:
    return VOD_ITEMS_CACHE_DIR / f"{cache_key}.json"


def _read_vod_items_cache(cache_key: str) -> list[dict]:
    cache_path = _vod_items_cache_path(cache_key)
    if not cache_path.exists():
        return []

    try:
        payload = json.loads(cache_path.read_text(encoding="utf-8"))
    except Exception:
        return []

    if time.time() - float(payload.get("savedAt", 0)) > VOD_ITEMS_CACHE_TTL_SECONDS:
        return []

    items = payload.get("items")
    return items if isinstance(items, list) else []


def _write_vod_items_cache(cache_key: str, items: list[dict]) -> None:
    if not items:
        return

    VOD_ITEMS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = _vod_items_cache_path(cache_key)
    tmp_path = cache_path.with_suffix(".tmp")
    tmp_path.write_text(
        json.dumps({"savedAt": time.time(), "items": items}, ensure_ascii=False),
        encoding="utf-8",
    )
    tmp_path.replace(cache_path)

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
        "kan_worldcup",
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
    channels = idan_main.GetUserChannels(type='tv') + load_custom_channels()

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

def clean_kodi_url(value):
    url = clean_kodi_label(value)
    if not url:
        return ""

    for separator in ("|", "%7C", "%7c"):
        if separator in url:
            return url.split(separator, 1)[0]

    return url

def normalize_vod_image(iconimage):
    image = clean_kodi_url(iconimage)
    if not image:
        return ""
    if image.startswith("http://") or image.startswith("https://"):
        return image
    basename = os.path.basename(image)
    return basename or image


def _http_get_json(url: str, headers: dict | None = None, timeout: int = 20) -> dict | list | None:
    try:
        response = requests.get(url, headers=headers or {}, timeout=timeout)
        response.raise_for_status()
        return response.json()
    except Exception as ex:
        print(f"Direct VOD JSON fetch failed for url={url}: {ex}")
        return None


def _http_get_text(url: str, headers: dict | None = None, timeout: int = 20) -> str:
    try:
        response = requests.get(url, headers=headers or {}, timeout=timeout)
        response.raise_for_status()
        return response.text
    except Exception as ex:
        print(f"Direct VOD text fetch failed for url={url}: {ex}")
        return ""


def _first_image(images) -> str:
    if isinstance(images, list) and images:
        first = images[0]
        if isinstance(first, dict):
            return first.get("url") or ""
        if isinstance(first, str):
            return first
    return ""


def _timestamp_to_date(timestamp: int | float | str | None) -> str:
    if timestamp in (None, ""):
        return ""
    try:
        value = _normalize_unix_timestamp(timestamp)
        if not value:
            return ""
        return datetime.fromtimestamp(value).strftime("%d/%m/%Y")
    except Exception:
        return ""


def _normalize_unix_timestamp(value: int | float | str | None) -> float:
    if value in (None, ""):
        return 0.0
    try:
        timestamp = float(value)
        if timestamp > 10_000_000_000:
            timestamp = timestamp / 1000
        return timestamp
    except Exception:
        return 0.0


def _make_vod_recent_item(
    *,
    module: str,
    mode: int,
    url: str,
    name: str,
    logo: str,
    more_data: str = "",
    description: str = "",
    aired: str = "",
    program_name: str = "",
    program_image: str = "",
    channel_name: str = "",
    channel_image: str = "",
    source_timestamp: float = 0,
) -> dict:
    item_id = f"{module}:{mode}:{url}:{more_data}"
    return {
        "id": item_id,
        "name": clean_kodi_label(name),
        "url": url,
        "mode": mode,
        "logo": normalize_vod_image(logo),
        "module": module,
        "moreData": more_data,
        "description": clean_kodi_label(description),
        "title": clean_kodi_label(name),
        "plot": clean_kodi_label(description),
        "aired": aired,
        "season": "",
        "episode": "",
        "programName": clean_kodi_label(program_name),
        "programImage": normalize_vod_image(program_image),
        "channelName": clean_kodi_label(channel_name),
        "channelImage": normalize_vod_image(channel_image),
        "episodeName": clean_kodi_label(name),
        "episodeDescription": clean_kodi_label(description),
        "episodeImage": normalize_vod_image(logo),
        "isFolder": False,
        "isPlayable": True,
        "sourceTimestamp": source_timestamp,
    }


def _extract_next_data(html: str) -> dict | None:
    match = re.search(
        r'<script[^>]*id=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>',
        html,
        re.DOTALL,
    )
    if not match:
        match = re.search(r'"application/json">(.*?)</script>', html, re.DOTALL)
    if not match:
        return None

    try:
        return json.loads(match.group(1))
    except Exception:
        return None


def _kan_normalize_url(url: str, base_url: str = "https://www.kan.org.il") -> str:
    from urllib.parse import urljoin

    return clean_kodi_url(urljoin(base_url, url or ""))


def _kan_program_id_from_url(url: str) -> str:
    match = re.search(r"/p-(\d+)/?", url or "")
    return match.group(1) if match else ""


def _kan_episode_id_from_url(url: str) -> str:
    for pattern in (r"/s\d+/(\d+)/?", r"/episodes?/(\d+)/?", r"/p-\d+/(\d+)/?$"):
        match = re.search(pattern, url or "")
        if match:
            return match.group(1)
    return ""


def _kan_is_episode_url(url: str, program_id: str) -> bool:
    if not url or (program_id and f"/p-{program_id}/" not in url):
        return False

    episode_id = _kan_episode_id_from_url(url)
    return bool(episode_id and episode_id != program_id)


def _kan_fetch_page(url: str) -> str:
    import cloudscraper

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/121.0.0.0 Safari/537.36"
        ),
        "Referer": "https://www.kan.org.il/",
        "Accept": "*/*",
    }
    scraper = cloudscraper.create_scraper(interpreter="native")
    last_error = None
    for attempt in range(3):
        try:
            response = scraper.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            return response.text
        except Exception as ex:
            last_error = ex
            if attempt < 2:
                time.sleep(0.5 * (attempt + 1))

    raise last_error


def _kan_card_text(card, selectors: tuple[str, ...]) -> str:
    for selector in selectors:
        node = card.select_one(selector)
        if node:
            value = clean_kodi_label(node.get_text(" ", strip=True))
            if value:
                return value
    return ""


def _kan_card_image(card, base_url: str) -> str:
    image = card.select_one("img[src]")
    if image and image.get("src"):
        return normalize_vod_image(_kan_normalize_url(image.get("src"), base_url))

    for attr in ("data-src", "data-original", "data-lazy", "data-bg"):
        image = card.select_one(f"img[{attr}]")
        if image and image.get(attr):
            return normalize_vod_image(_kan_normalize_url(image.get(attr), base_url))

    match = re.search(r"url\(['\"]?([^'\")]+)", str(card), re.I)
    if match:
        return normalize_vod_image(_kan_normalize_url(match.group(1), base_url))

    return ""


def _kan_fallback_vod_items(url: str, iconimage: str = "") -> list[dict]:
    program_id = _kan_program_id_from_url(url)
    if not program_id:
        return []

    try:
        html = _kan_fetch_page(url)
    except Exception as ex:
        print(f"KAN VOD fallback fetch failed for url={url}: {ex}")
        return []

    soup = BeautifulSoup(html, "html.parser")
    root = soup.select_one(".seasons") or soup
    items: list[dict] = []
    seen: set[str] = set()

    for anchor in root.select("a[href]"):
        episode_url = _kan_normalize_url(anchor.get("href"), url)
        if not _kan_is_episode_url(episode_url, program_id) or episode_url in seen:
            continue

        seen.add(episode_url)
        episode_id = _kan_episode_id_from_url(episode_url)
        card = (
            anchor.find_parent("li")
            or anchor.find_parent("article")
            or anchor.find_parent(class_=re.compile(r"(card|item|media|program|vod)", re.I))
            or anchor
        )

        title = _kan_card_text(card, (".card-title", ".title", "[class*='title']", "h1", "h2", "h3"))
        description = _kan_card_text(card, (".card-text", ".description", "[class*='description']", "p"))

        if not title:
            aria_label = clean_kodi_label(anchor.get("aria-label") or "")
            title = aria_label.split("-", 1)[0].strip() if aria_label else f"Episode {episode_id}"
            if aria_label and not description and "-" in aria_label:
                description = aria_label.split("-", 1)[1].strip()

        image = _kan_card_image(card, url) or normalize_vod_image(iconimage)

        items.append({
            "id": f"kan:3:{episode_url}:best",
            "name": title,
            "url": episode_url,
            "mode": 3,
            "logo": image,
            "module": "kan",
            "moreData": "best",
            "description": description,
            "title": title,
            "plot": description,
            "aired": "",
            "season": "",
            "episode": "",
            "episodeName": title,
            "episodeDescription": description,
            "episodeImage": image,
            "isFolder": False,
            "isPlayable": True,
            "sourceOrder": len(items),
        })

    return items

class _TrackedAddonCacheDatabase:
    def connect(self, *args, **kwargs):
        connection = _original_addon_cache_database.connect(*args, **kwargs)
        scopes = getattr(_addon_cache_connection_scopes, "connections", [])
        if scopes:
            scopes[-1].append(connection)
        return connection

    def __getattr__(self, name):
        return getattr(_original_addon_cache_database, name)


@contextmanager
def _close_addon_cache_connections():
    scopes = getattr(_addon_cache_connection_scopes, "connections", None)
    if scopes is None:
        scopes = []
        _addon_cache_connection_scopes.connections = scopes

    connections = []
    scopes.append(connections)
    try:
        yield
    finally:
        scopes.pop()
        for connection in reversed(connections):
            try:
                connection.close()
            except Exception:
                pass


def _bounded_addon_cache_get(function, timeout, *args, **table):
    effective_timeout = timeout
    try:
        if int(timeout) > VOD_SOURCE_CACHE_TTL_HOURS:
            effective_timeout = VOD_SOURCE_CACHE_TTL_HOURS
    except Exception:
        pass

    with _close_addon_cache_connections():
        return _original_addon_cache_get(function, effective_timeout, *args, **table)


def _safe_addon_cache_clear(*args, **kwargs):
    with _close_addon_cache_connections():
        return _original_addon_cache_clear(*args, **kwargs)


def _direct_addon_cache_get(function, timeout, *args, **table):
    return function(*args)


addon_cache.database = _TrackedAddonCacheDatabase()
addon_cache.get = _bounded_addon_cache_get
addon_cache.clear = _safe_addon_cache_clear


@contextmanager
def _vod_source_cache(use_cache: bool):
    previous_cache_get = addon_cache.get
    addon_cache.get = _bounded_addon_cache_get if use_cache else _direct_addon_cache_get
    try:
        yield
    finally:
        addon_cache.get = previous_cache_get


def _safe_kan_open_url(original_open_url):
    def safe_open_url(url, *args, **kwargs):
        response_method = kwargs.get("responseMethod")
        if response_method is None and len(args) > 5:
            response_method = args[5]
        response_method = response_method or "text"

        result = original_open_url(url, *args, **kwargs)
        if result is not None:
            return result

        if response_method != "json" or "mobapi.kan.org.il/api/mobile/subClass" not in str(url):
            return result

        try:
            cf_result = original_open_url.__globals__["GetCF"](
                url,
                original_open_url.__globals__.get("userAgent"),
                responseMethod="json",
            )
            if isinstance(cf_result, dict):
                return cf_result
        except Exception as ex:
            print(f"KAN VOD fallback failed for url={url}: {ex}")

        return {"entry": []}

    return safe_open_url


def get_vod_items(module, mode, url="", name="", iconimage="", moreData="", use_cache: bool = True):
    addon_common = importlib.import_module("resources.lib.common")
    module_script = importlib.import_module(f"resources.lib.{module}")
    requested_module = module
    requested_mode = int(mode)
    vod_items_cache_key = (
        _vod_items_cache_key(requested_module, requested_mode, url, name, iconimage, moreData)
        if requested_module == "kan" and requested_mode == 2
        else ""
    )
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
        original_open_url = addon_common.OpenURL
        addon_common.addDir = capture_add_dir
        if requested_module == "kan":
            addon_common.OpenURL = _safe_kan_open_url(original_open_url)
        try:
            module_script.Run(
                clean_kodi_label(name),
                url or "",
                requested_mode,
                iconimage or "",
                moreData or "",
            )
        except Exception as ex:
            print(f"VOD items failed for module={requested_module} mode={mode} url={url}: {ex}")
        finally:
            addon_common.addDir = original_add_dir
            addon_common.OpenURL = original_open_url

    if not captured_items and requested_module == "kan" and requested_mode == 2:
        captured_items = _kan_fallback_vod_items(url or "", iconimage or "")

    if captured_items and vod_items_cache_key:
        _write_vod_items_cache(vod_items_cache_key, captured_items)
    elif vod_items_cache_key:
        cached_items = _read_vod_items_cache(vod_items_cache_key)
        if cached_items:
            print(f"Using cached Kan VOD items for url={url}")
            return cached_items

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
        "%d/%m/%y",
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


def _vod_recent_cutoff_timestamp(days: int = VOD_RECENT_LOOKBACK_DAYS) -> float:
    return (datetime.now() - timedelta(days=days)).timestamp()


def _timestamp_matches_recent_days(timestamp: float, days: int = VOD_RECENT_LOOKBACK_DAYS) -> bool:
    return timestamp >= _vod_recent_cutoff_timestamp(days)


def _timestamp_matches_dates(timestamp: float, allowed_dates: set) -> bool:
    if not timestamp:
        return False
    return datetime.fromtimestamp(timestamp).date() in allowed_dates


def _vod_recent_item_matches_channel_window(item: dict) -> bool:
    timestamp = _item_timestamp_from_fields(item)
    channel_id = item.get("vodChannelId")

    if channel_id == "vod_kan11":
        return True
    if channel_id == "vod_reshet13":
        return _timestamp_matches_dates(timestamp, _today_and_yesterday_dates())
    if channel_id == "vod_14tv":
        return _timestamp_matches_recent_days(timestamp)

    return _timestamp_matches_recent_days(timestamp)


def _today_and_yesterday_dates() -> set:
    today = datetime.now().date()
    return {today, today - timedelta(days=1)}


def _today_date_set() -> set:
    return {datetime.now().date()}


def _item_timestamp_from_fields(item: dict) -> float:
    for field in ("name", "title", "episodeName", "description"):
        text = clean_kodi_label(str(item.get(field, "") or ""))
        timestamp = _parse_aired_timestamp(text)
        if timestamp:
            return timestamp

        date_match = re.search(r"(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})", text)
        if date_match:
            timestamp = _parse_aired_timestamp(date_match.group(1).replace(".", "/").replace("-", "/"))
            if timestamp:
                return timestamp

    timestamp = _vod_recent_timestamp(item)
    if timestamp:
        return timestamp

    return 0.0


def _sort_vod_items_by_recent(items: list[dict]) -> list[dict]:
    return sorted(
        items,
        key=_vod_recent_timestamp,
        reverse=True,
    )


def _select_vod_recent_items(items: list[dict], max_items: int, preserve_source_order: bool) -> list[dict]:
    if not preserve_source_order:
        return _sort_vod_items_by_recent(items)[:max_items]

    indexed_items = [
        (item, _vod_recent_timestamp(item))
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
        (item, _vod_recent_timestamp(item))
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


def _vod_recent_timestamp(item: dict) -> float:
    source_timestamp = item.get("sourceTimestamp")
    if source_timestamp:
        try:
            return float(source_timestamp)
        except Exception:
            pass
    return _parse_aired_timestamp(item.get("aired", "") or "")


def _fetch_kan_vod_recent_items(limit: int) -> list[dict]:
    recent_items: list[dict] = []

    for index, episode in enumerate(get_kan_vod_recent_episodes(limit)):
        episode_id = str(episode.get("id") or "")
        if not episode_id:
            continue

        title = clean_kodi_label(episode.get("title") or "")
        description = clean_kodi_label(episode.get("description") or "")
        program_name = clean_kodi_label(episode.get("program_title") or "")
        program_description = clean_kodi_label(episode.get("program_description") or "")
        season_title = clean_kodi_label(episode.get("season_title") or "")
        published = episode.get("published") or ""
        source_timestamp = _parse_aired_timestamp(published)
        episode_image = normalize_vod_image(episode.get("image") or episode.get("program_image") or "")
        program_image = normalize_vod_image(episode.get("program_image") or episode.get("image") or "")

        recent_items.append(
            {
                "id": f"kan-vod:{episode_id}",
                "episodeId": episode_id,
                "name": title,
                "url": episode.get("stream_url") or episode.get("play_url") or episode.get("url") or "",
                "streamUrl": episode.get("stream_url") or "",
                "playUrl": episode.get("play_url") or episode.get("url") or "",
                "mode": 0,
                "logo": episode_image or program_image or normalize_vod_image("kan.jpg"),
                "module": "kan-vod",
                "moreData": "",
                "description": description,
                "title": title,
                "plot": description,
                "aired": published,
                "season": str(episode.get("season_number") or ""),
                "episode": episode_id,
                "programId": episode.get("program_id") or "",
                "programName": program_name,
                "programDescription": program_description,
                "programImage": program_image,
                "seasonName": season_title,
                "channelName": "כאן 11",
                "channelImage": normalize_vod_image("kan.jpg"),
                "episodeName": title,
                "episodeDescription": description,
                "episodeImage": episode_image,
                "isFolder": False,
                "isPlayable": True,
                "sourceTimestamp": source_timestamp,
                "sourceOrder": index,
            }
        )

    return recent_items


def _fetch_direct_vod_recent_items(channel: dict, limit: int, use_cache: bool) -> list[dict]:
    if channel["id"] == "vod_kan11":
        return _fetch_kan_vod_recent_items(limit)

    return fetch_direct_vod_recent_items(
        channel,
        limit,
        use_cache,
        VodRecentSourceContext(
            get_vod_items=get_vod_items,
            collect_playable_vod_items=_collect_playable_vod_items,
            make_vod_recent_item=_make_vod_recent_item,
            clean_kodi_label=clean_kodi_label,
            normalize_vod_image=normalize_vod_image,
            http_get_json=_http_get_json,
            http_get_text=_http_get_text,
            extract_next_data=_extract_next_data,
            first_image=_first_image,
            timestamp_to_date=_timestamp_to_date,
            normalize_unix_timestamp=_normalize_unix_timestamp,
            parse_aired_timestamp=_parse_aired_timestamp,
        ),
    )


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
    priority_rank = {
        channel_id: index for index, channel_id in enumerate(VOD_RECENT_PRIORITY_CHANNEL_IDS)
    }
    fallback_rank = len(priority_rank)

    return sorted(
        [
            channel
            for channel in IDANPLUS_VOD_CHANNELS
            if channel["id"] in priority_rank
        ],
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
    except Exception as ex:
        print(f"Failed reading VOD recent cache file {VOD_RECENT_CACHE_FILE}: {ex}", flush=True)

    return None


def _write_vod_recent_cache_file(items: list[dict]) -> None:
    _ensure_vod_recent_cache_dir()
    tmp_path = VOD_RECENT_CACHE_FILE.with_name(f".{VOD_RECENT_CACHE_FILE.name}.tmp")
    with tmp_path.open("w", encoding="utf-8") as cache_file:
        json.dump(items, cache_file, ensure_ascii=False)
        cache_file.write("\n")
    os.replace(tmp_path, VOD_RECENT_CACHE_FILE)


def _vod_recent_dedupe_keys(item: dict) -> list[str]:
    keys = []
    item_id = item.get("id")
    if item_id:
        keys.append(f"id:{item_id}")

    channel_id = item.get("vodChannelId", "")
    program_name = clean_kodi_label(item.get("programName", "")).lower()
    item_name = clean_kodi_label(item.get("name", "")).lower()
    item_name = re.sub(r"\s*[-–]\s*\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\s*$", "", item_name).strip()
    item_name = re.sub(r"\s+", " ", item_name)
    if channel_id and item_name:
        keys.append(f"semantic:{channel_id}:{program_name}:{item_name}")

    return keys


def _merge_vod_recent_cache_items(new_items: list[dict], total_limit: int) -> list[dict]:
    existing_items = _read_vod_recent_cache_file() or []
    merged_by_id: dict[str, dict] = {}
    seen_keys: set[str] = set()

    for item in [*new_items, *existing_items]:
        item_id = item.get("id")
        if not item_id or item_id in merged_by_id:
            continue

        if not _vod_recent_item_matches_channel_window(item):
            continue

        item_keys = _vod_recent_dedupe_keys(item)
        if any(key in seen_keys for key in item_keys):
            continue

        merged_by_id[item_id] = item
        seen_keys.update(item_keys)

    return _sort_vod_recent_cache_items(list(merged_by_id.values()))[:total_limit]


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
    max_per_channel: int = 10,
    total_limit: int = VOD_RECENT_TOTAL_LIMIT,
    use_cache: bool = True,
    preserve_source_order: bool = False,
    allow_internal_fallback: bool = True,
) -> list[dict]:
    recent_items: list[dict] = []

    for channel in _get_vod_channels_for_recent(preserve_source_order):
        channel_items: list[dict] = []
        direct_source_channel = channel["id"] in VOD_RECENT_DIRECT_CHANNEL_IDS
        if channel["id"] in VOD_RECENT_DIRECT_CHANNEL_IDS:
            channel_items = _fetch_direct_vod_recent_items(
                channel,
                max(max_per_channel * 4, total_limit),
                use_cache,
            )

        if not channel_items and (allow_internal_fallback or not direct_source_channel):
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
        return _sort_vod_recent_cache_items(recent_items)[:total_limit]

    return _sort_vod_recent_cache_items(recent_items)[:total_limit]


def refresh_vod_recent_cache(
    max_per_channel: int = 10,
    total_limit: int = VOD_RECENT_TOTAL_LIMIT,
    use_cache: bool = False,
    preserve_source_order: bool = True,
    allow_internal_fallback: bool = False,
) -> list[dict]:
    global _vod_recent_cache, _vod_recent_cache_updated

    recent_items = _build_vod_recent_items(
        max_per_channel=max_per_channel,
        total_limit=total_limit,
        use_cache=use_cache,
        preserve_source_order=preserve_source_order,
        allow_internal_fallback=allow_internal_fallback,
    )
    recent_items = _merge_vod_recent_cache_items(recent_items, total_limit)
    _write_vod_recent_cache_file(recent_items)

    now = time.time()
    with _vod_recent_cache_lock:
        _vod_recent_cache = recent_items
        _vod_recent_cache_updated = now

    return recent_items


def get_vod_recent_items(max_per_channel: int = 10, total_limit: int = VOD_RECENT_TOTAL_LIMIT) -> list[dict]:
    file_items = _read_vod_recent_cache_file()
    if file_items is not None:
        return file_items

    # If cache was never generated yet, return an empty list immediately.
    # The scheduler / refresh_vod_recent.py should populate this file in the background.
    return []
