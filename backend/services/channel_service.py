from plugin_video_idanplus.resources import main as idan_main
from services.epg_service import get_now_epg
from models.schemas import Channel

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