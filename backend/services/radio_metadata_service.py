import html
import re
import time
from dataclasses import dataclass
from typing import Optional

STREAM_TITLE_RE = re.compile(r"StreamTitle='(.*)';", re.IGNORECASE)
STREAM_KEY_VALUE_RE = re.compile(r"""\b([A-Za-z_][A-Za-z0-9_]*)=(["'])(.*?)\2""")
STREAM_KEY_VALUE_FIELDS_RE = re.compile(r"""\s+\w+=(["']).*?\1""")
IGNORED_TITLES = {"unknown", "live", "radio"}
IGNORED_TITLE_PARTS = ("powered by", "cdn", "multix")
METADATA_CACHE_TTL_SECONDS = 20 * 60
_now_playing_cache: dict[str, tuple[float, "NowPlayingInfo"]] = {}


@dataclass(frozen=True)
class NowPlayingInfo:
    title: str
    detail: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "detail": self.detail,
        }


def get_radio_now_playing(channel_id: str) -> Optional[dict]:
    return get_cached_radio_now_playing(channel_id)


def get_cached_radio_now_playing(channel_id: str) -> Optional[dict]:
    cached = _now_playing_cache.get(channel_id)
    if not cached:
        return None

    saved_at, info = cached
    if time.time() - saved_at > METADATA_CACHE_TTL_SECONDS:
        _now_playing_cache.pop(channel_id, None)
        return None

    return info.to_dict()


def update_radio_now_playing(channel_id: Optional[str], raw_metadata: Optional[str]) -> Optional[dict]:
    if not channel_id:
        return None

    metadata = raw_metadata or ""
    stream_title = STREAM_TITLE_RE.search(metadata)
    info = now_playing_from_metadata_text(stream_title.group(1) if stream_title else metadata)
    if not info:
        return None

    current = _now_playing_cache.get(channel_id)
    if current and current[1] == info:
        return info.to_dict()

    _now_playing_cache[channel_id] = (time.time(), info)
    return info.to_dict()


def now_playing_from_metadata_text(raw_metadata: Optional[str]) -> Optional[NowPlayingInfo]:
    if not raw_metadata:
        return None

    info = _parse_icy_stream_info(_html_to_plain_text(raw_metadata))
    if not info or not _is_useful_now_playing_text(info.title):
        return None

    return info


def _html_to_plain_text(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<br\s*/?>", "\n", value, flags=re.IGNORECASE))).strip()


def _parse_icy_stream_info(value: str) -> Optional[NowPlayingInfo]:
    compact = re.sub(r"\s+", " ", value).strip()
    if not compact:
        return None

    fields = {
        match.group(1).lower(): match.group(3).strip()
        for match in STREAM_KEY_VALUE_RE.finditer(compact)
    }
    program = _first_value(fields, "program", "show", "showname", "programname", "program_name")
    song = _first_value(fields, "text", "title", "song", "track", "cue_title")
    artist = _first_value(fields, "artist", "trackartist", "track_artist", "cue_artist")

    if not artist:
        field_match = STREAM_KEY_VALUE_RE.search(compact)
        prefix = compact[:field_match.start()] if field_match else compact
        artist = _clean_display_metadata(prefix.rstrip("-–—:| "))
        if not _is_useful_now_playing_text(artist):
            artist = None

    if song:
        title = _clean_display_metadata(" - ".join(part for part in (artist, song) if part))
        return NowPlayingInfo(title=title, detail=_clean_display_metadata(program) if program else None)

    cleaned = _clean_display_metadata(STREAM_KEY_VALUE_FIELDS_RE.sub("", compact))
    if cleaned:
        return NowPlayingInfo(title=cleaned, detail=_clean_display_metadata(program) if program else None)

    if program:
        return NowPlayingInfo(title=_clean_display_metadata(program))

    return None


def _first_value(fields: dict[str, str], *keys: str) -> Optional[str]:
    for key in keys:
        value = fields.get(key)
        if value:
            return value

    return None


def _clean_display_metadata(value: Optional[str]) -> str:
    if not value:
        return ""

    return re.sub(r"\s+", " ", re.sub(r"\s+[-–—|:]\s*$", "", value)).strip(" -–—")


def _is_useful_now_playing_text(value: Optional[str]) -> bool:
    normalized = (value or "").lower().strip()
    return bool(normalized) and normalized not in IGNORED_TITLES and not any(
        ignored in normalized for ignored in IGNORED_TITLE_PARTS
    )
