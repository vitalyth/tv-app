import importlib
import os
import re

from plugin_video_idanplus.resources import main as idan_main
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

def get_vod_items(module, mode, url="", name="", iconimage="", moreData=""):
    addon_common = importlib.import_module("resources.lib.common")
    module_script = importlib.import_module(f"resources.lib.{module}")
    requested_module = module
    captured_items = []
    original_add_dir = addon_common.addDir

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
        captured_items.append({
            "id": f"{item_module}:{item_mode}:{item_url}:{moreData}",
            "name": clean_kodi_label(item_name),
            "url": item_url,
            "mode": item_mode,
            "logo": normalize_vod_image(item_iconimage),
            "module": item_module,
            "moreData": moreData,
            "description": clean_kodi_label(
                infos.get("plot") or infos.get("Plot") or infos.get("description") or ""
            ),
            "isFolder": isFolder,
            "isPlayable": isPlayable,
        })

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
