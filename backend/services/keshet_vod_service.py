import json
import os
import re
import sqlite3
import time
from dataclasses import dataclass
from datetime import datetime
from html import unescape
from urllib.parse import parse_qs, quote, urljoin, urlsplit

import requests

from services.vod_database import (
    ensure_unified_schema,
    get_vod_db_path,
    get_vod_env,
    mark_vod_program_detail_scan,
    prepare_vod_db_path,
    select_vod_programs_for_detail_scan,
    vod_episode_activity_subquery,
    vod_episode_source_sort_kind_expr,
    vod_episode_source_sort_key_expr,
)


KESHT_VOD_DB_PATH = get_vod_db_path("KESHET_VOD_DB_PATH", "KESHT_VOD_DB_PATH")
KESHT_VOD_RETRIES = int(
    get_vod_env("KESHET_VOD_RETRIES", "KESHT_VOD_RETRIES", "VOD_RETRIES", "KAN_VOD_RETRIES", default="3")
)
KESHT_VOD_RETRY_DELAY_SECONDS = float(
    get_vod_env(
        "KESHET_VOD_RETRY_DELAY_SECONDS",
        "KESHT_VOD_RETRY_DELAY_SECONDS",
        "VOD_RETRY_DELAY_SECONDS",
        "KAN_VOD_RETRY_DELAY_SECONDS",
        default="1",
    )
)
KESHT_VOD_STREAM_BATCH_SIZE = int(
    get_vod_env(
        "KESHET_VOD_STREAM_BATCH_SIZE",
        "KESHT_VOD_STREAM_BATCH_SIZE",
        "VOD_STREAM_BATCH_SIZE",
        "KAN_VOD_STREAM_BATCH_SIZE",
        default="20",
    )
)
KESHT_VOD_METADATA_BACKFILL_LIMIT = int(
    get_vod_env(
        "KESHET_VOD_METADATA_BACKFILL_LIMIT",
        "KESHT_VOD_METADATA_BACKFILL_LIMIT",
        default="24",
    )
)

MAKO_BASE_URL = "https://www.mako.co.il"
MAKO_INDEX_URL = f"{MAKO_BASE_URL}/mako-vod-index"
MAKO_INDEX_CATEGORY_URL = f"{MAKO_INDEX_URL}?filter={{filter_type}}&vcmId={{vcm_id}}"
MAKO_ENTITLEMENTS_URL = "https://mass.mako.co.il/ClicksStatistics/entitlementsServicesV2.jsp"
MAKO_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
)
MAKO_HEADERS = {
    "User-Agent": MAKO_USER_AGENT,
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
    "Referer": f"{MAKO_BASE_URL}/",
    "Origin": MAKO_BASE_URL,
}
CATEGORY_SPLIT_RE = re.compile(r"\s*(?:[,;|/•·،]+)\s*")
PLACEHOLDER_EPISODE_TITLE_RE = re.compile(r"^פרק\s+\S*VgnVCM", re.IGNORECASE)
MEDIA_DATE_RE = re.compile(r"(?:^|[_/-])(\d{2})(\d{2})(\d{2})(?:[_/-])VOD", re.IGNORECASE)
HLS_STREAM_INF_RE = re.compile(r"#EXT-X-STREAM-INF:([^\r\n]*)[\r\n]+([^\r\n]+)", re.IGNORECASE)
HLS_BANDWIDTH_RE = re.compile(r"(?:^|,)BANDWIDTH=(\d+)", re.IGNORECASE)
HLS_AVERAGE_BANDWIDTH_RE = re.compile(r"(?:^|,)AVERAGE-BANDWIDTH=(\d+)", re.IGNORECASE)
HLS_RESOLUTION_RE = re.compile(r"(?:^|,)RESOLUTION=(\d+)x(\d+)", re.IGNORECASE)
MAKO_VOD_CATEGORY_FILTERS: tuple[tuple[str, str, str], ...] = (
    ("ריאליטי", "genre", "4f9dbac980653210VgnVCM2000002a0c10acRCRD"),
    ("דוקומנטרי", "genre", "8e8abac980653210VgnVCM2000002a0c10acRCRD"),
    ("דרמה", "genre", "05fcbac980653210VgnVCM2000002a0c10acRCRD"),
    ("קומדיה", "genre", "fe2dbac980653210VgnVCM2000002a0c10acRCRD"),
    ("בישול", "genre", "5d738481c9674210VgnVCM2000002a0c10acRCRD"),
    ("החדשות", "provider", "ee06c13070733210VgnVCM2000002a0c10acRCRD"),
    ("פודקאסטים", "provider", "d5aae64655ea0810VgnVCM100000700a10acRCRD"),
    ("ערוץ 24", "provider", "3377c13070733210VgnVCM2000002a0c10acRCRD"),
)


@dataclass
class KeshetProgram:
    id: str
    mainid: str
    title: str
    description: str
    url: str
    image: str | None = None
    program_format: str | None = None
    program_genre: str | None = None


@dataclass
class KeshetSeason:
    program_id: str
    season_id: str
    title: str
    url: str
    season_number: int | None = None


@dataclass
class KeshetEpisode:
    id: str
    program_id: str
    season_id: str | None
    title: str
    description: str
    url: str
    image: str | None = None
    play_url: str | None = None
    stream_url: str | None = None
    kaltura_entry_id: str | None = None
    published: str | None = None
    published_timestamp: float | None = None
    display_order: int | None = None


def _with_retries(action):
    last_error = None
    for attempt in range(1, KESHT_VOD_RETRIES + 1):
        try:
            return action()
        except Exception as ex:
            last_error = ex
            if attempt < KESHT_VOD_RETRIES:
                time.sleep(KESHT_VOD_RETRY_DELAY_SECONDS * attempt)

    if last_error:
        raise last_error
    raise RuntimeError("Keshet VOD operation failed")


def _connect() -> sqlite3.Connection:
    db_path = prepare_vod_db_path(KESHT_VOD_DB_PATH)
    parent = os.path.dirname(db_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    con = sqlite3.connect(db_path, timeout=30)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA busy_timeout = 30000")
    _init_db(con)
    return con


def _table_columns(con: sqlite3.Connection, table_name: str) -> set[str]:
    return {row[1] for row in con.execute(f"PRAGMA table_info({table_name})").fetchall()}


def _add_column_if_missing(
    con: sqlite3.Connection,
    table_name: str,
    column_name: str,
    column_def: str,
) -> None:
    if column_name not in _table_columns(con, table_name):
        con.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_def}")


def _init_db(con: sqlite3.Connection) -> None:
    con.executescript(
        """
        CREATE TABLE IF NOT EXISTS keshet_programs (
            id TEXT PRIMARY KEY,
            mainid TEXT,
            title TEXT NOT NULL,
            description TEXT,
            url TEXT NOT NULL,
            image TEXT,
            program_format TEXT,
            program_genre TEXT,
            last_full_scan_at TEXT,
            last_incremental_scan_at TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS keshet_seasons (
            season_id TEXT PRIMARY KEY,
            program_id TEXT NOT NULL,
            title TEXT,
            url TEXT NOT NULL,
            season_number INTEGER,
            last_scanned_at TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS keshet_episodes (
            id TEXT PRIMARY KEY,
            program_id TEXT NOT NULL,
            season_id TEXT,
            title TEXT NOT NULL,
            description TEXT,
            url TEXT NOT NULL,
            image TEXT,
            play_url TEXT,
            stream_url TEXT,
            kaltura_entry_id TEXT,
            published TEXT,
            published_timestamp REAL,
            display_order INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    _add_column_if_missing(con, "keshet_episodes", "display_order", "INTEGER")
    _add_column_if_missing(con, "keshet_episodes", "published_timestamp", "REAL")
    _add_column_if_missing(con, "keshet_episodes", "created_at", "TEXT")
    _add_column_if_missing(con, "keshet_episodes", "metadata_backfill_attempted_at", "TEXT")
    con.execute(
        """
        UPDATE keshet_episodes
        SET created_at = COALESCE(NULLIF(updated_at, ''), CURRENT_TIMESTAMP)
        WHERE created_at IS NULL OR TRIM(created_at) = ''
        """
    )
    con.executescript(
        """
        CREATE INDEX IF NOT EXISTS idx_keshet_programs_title ON keshet_programs(title);
        CREATE INDEX IF NOT EXISTS idx_keshet_seasons_program_id ON keshet_seasons(program_id);
        CREATE INDEX IF NOT EXISTS idx_keshet_episodes_program_id ON keshet_episodes(program_id);
        CREATE INDEX IF NOT EXISTS idx_keshet_episodes_season_id ON keshet_episodes(season_id);
        CREATE INDEX IF NOT EXISTS idx_keshet_episodes_title ON keshet_episodes(title);
        CREATE INDEX IF NOT EXISTS idx_keshet_episodes_published ON keshet_episodes(published_timestamp);
        CREATE INDEX IF NOT EXISTS idx_keshet_episodes_created_at ON keshet_episodes(created_at);
        """
    )
    ensure_unified_schema(con, providers=("keshet",))
    con.commit()


def _clean_text(value: object) -> str:
    if value is None:
        return ""
    return unescape(str(value)).replace("\u200b", "").strip()


def _normalize_unix_timestamp(value: object) -> float:
    try:
        timestamp = float(value or 0)
    except Exception:
        return 0.0
    if timestamp > 10_000_000_000:
        timestamp /= 1000
    return timestamp


def _parse_published_timestamp(value: object) -> float | None:
    text = _clean_text(value)
    if not text:
        return None

    unix_timestamp = _normalize_unix_timestamp(text)
    if unix_timestamp > 1_000_000_000:
        return unix_timestamp

    normalized = text.replace("Z", "+00:00")
    normalized = re.sub(r"\s*@\s*", " ", normalized)
    date_match = re.search(r"\d{1,2}[./]\d{1,2}[./]\d{2,4}(?:\s+\d{1,2}(?::\d{2})?)?", normalized)
    candidates = [normalized]
    if date_match:
        candidates.insert(0, date_match.group(0))

    for fmt in (
        "%d.%m.%Y",
        "%d.%m.%y",
        "%d.%m.%Y %H",
        "%d.%m.%y %H",
        "%d.%m.%Y %H:%M",
        "%d.%m.%y %H:%M",
        "%d/%m/%Y",
        "%d/%m/%y",
        "%d/%m/%Y %H",
        "%d/%m/%y %H",
        "%d/%m/%Y %H:%M",
        "%d/%m/%y %H:%M",
        "%Y-%m-%d",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S%z",
    ):
        for candidate in candidates:
            try:
                return datetime.strptime(candidate, fmt).timestamp()
            except ValueError:
                pass

    try:
        return datetime.fromisoformat(normalized).timestamp()
    except ValueError:
        return None


def _backfill_missing_episode_timestamps(con: sqlite3.Connection) -> int:
    rows = con.execute(
        """
        SELECT id, title, published
        FROM keshet_episodes
        WHERE published_timestamp IS NULL
          AND (TRIM(COALESCE(published, '')) != '' OR TRIM(COALESCE(title, '')) != '')
        """
    ).fetchall()

    updated = 0
    for row in rows:
        timestamp = _parse_published_timestamp(row["published"]) or _parse_published_timestamp(row["title"])
        if timestamp is None:
            continue

        con.execute(
            "UPDATE keshet_episodes SET published_timestamp = ? WHERE id = ?",
            (timestamp, row["id"]),
        )
        updated += 1

    if updated:
        con.commit()

    return updated


def _is_placeholder_episode_title(title: object, episode_id: object = "") -> bool:
    text = _clean_text(title)
    if not text:
        return True

    episode_key = str(episode_id or "").strip()
    if episode_key and text == f"פרק {episode_key}":
        return True

    return bool(PLACEHOLDER_EPISODE_TITLE_RE.search(text)) or (
        text.startswith("פרק ") and "vgnvcm" in text.casefold()
    )


def _episode_fallback_metadata_from_media_url(url: object) -> dict:
    match = MEDIA_DATE_RE.search(str(url or ""))
    if not match:
        return {}

    published = f"{match.group(1)}.{match.group(2)}.{match.group(3)}"
    metadata = {
        "title": published,
        "published": published,
    }
    timestamp = _parse_published_timestamp(published)
    if timestamp is not None:
        metadata["published_timestamp"] = timestamp
    return metadata


def _playlist_identifiers(play_url: object) -> tuple[str, str]:
    text = str(play_url or "").strip()
    if not text:
        return "", ""

    params = parse_qs(urlsplit(text).query)
    vcmid = _clean_text((params.get("vcmid") or [""])[0])
    video_channel_id = _clean_text((params.get("videoChannelId") or [""])[0])
    if vcmid and video_channel_id:
        return vcmid, video_channel_id

    vcmid_match = re.search(r"(?:[?&])vcmid=([^&]+)", text)
    channel_match = re.search(r"(?:[?&])videoChannelId=([^&]+)", text)
    return (
        _clean_text(vcmid_match.group(1) if vcmid_match else ""),
        _clean_text(channel_match.group(1) if channel_match else ""),
    )


def _episode_fallback_metadata_from_playlist(play_url: object) -> dict:
    vcmid, video_channel_id = _playlist_identifiers(play_url)
    if not vcmid or not video_channel_id:
        return {}

    media = _get_media_playlist(vcmid, video_channel_id)
    picked = _pick_media_link(media)
    if not picked:
        return {}

    return _episode_fallback_metadata_from_media_url(picked[0])


def _backfill_placeholder_episode_metadata(
    con: sqlite3.Connection,
    program_id: str,
    limit: int = KESHT_VOD_METADATA_BACKFILL_LIMIT,
) -> int:
    rows = con.execute(
        """
        SELECT id, title, published, published_timestamp, play_url, url
        FROM keshet_episodes
        WHERE program_id = ?
          AND (
            title IS NULL
            OR TRIM(title) = ''
            OR title LIKE 'פרק %VgnVCM%'
          )
          AND (
            metadata_backfill_attempted_at IS NULL
            OR metadata_backfill_attempted_at < datetime('now', '-1 day')
          )
        ORDER BY
            display_order IS NULL,
            display_order ASC,
            created_at DESC
        LIMIT ?
        """,
        (program_id, max(1, int(limit or KESHT_VOD_METADATA_BACKFILL_LIMIT))),
    ).fetchall()

    updates: list[tuple[str, str, float | None, str]] = []
    attempted_ids: list[str] = []
    for row in rows:
        title = _clean_text(row["title"])
        published = _clean_text(row["published"])
        published_timestamp = row["published_timestamp"]
        title_is_placeholder = _is_placeholder_episode_title(title, row["id"])

        if not title_is_placeholder:
            attempted_ids.append(row["id"])
            continue

        metadata = (
            _episode_fallback_metadata_from_media_url(row["url"])
            or _episode_fallback_metadata_from_media_url(row["play_url"])
        )
        if not metadata:
            try:
                metadata = _episode_fallback_metadata_from_playlist(row["play_url"] or row["url"])
            except Exception:
                metadata = {}

        next_title = metadata.get("title") if metadata.get("title") else title
        next_published = published or metadata.get("published") or ""
        next_timestamp = published_timestamp or metadata.get("published_timestamp")
        changed = (
            next_title != title
            or next_published != published
            or (next_timestamp is not None and next_timestamp != published_timestamp)
        )

        if changed:
            updates.append((next_title or title, next_published, next_timestamp, row["id"]))
        else:
            attempted_ids.append(row["id"])

    for next_title, next_published, next_timestamp, episode_id in updates:
        con.execute(
            """
            UPDATE keshet_episodes
            SET title = ?,
                published = ?,
                published_timestamp = ?,
                metadata_backfill_attempted_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (next_title, next_published, next_timestamp, episode_id),
        )
    for episode_id in attempted_ids:
        con.execute(
            """
            UPDATE keshet_episodes
            SET metadata_backfill_attempted_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (episode_id,),
        )

    if rows:
        con.commit()

    return len(updates)


def repair_keshet_vod_metadata(
    limit: int = 80,
    verbose: bool = False,
) -> dict:
    con = _connect()
    try:
        rows = con.execute(
            """
            SELECT program_id, COUNT(*) AS candidate_count
            FROM keshet_episodes
            WHERE (
                title IS NULL
                OR TRIM(title) = ''
                OR title LIKE 'פרק %VgnVCM%'
            )
              AND (
                metadata_backfill_attempted_at IS NULL
                OR metadata_backfill_attempted_at < datetime('now', '-1 day')
              )
            GROUP BY program_id
            ORDER BY MAX(COALESCE(published_timestamp, 0)) DESC, MAX(created_at) DESC
            """,
        ).fetchall()

        updated = 0
        scanned_programs = 0
        remaining = max(1, int(limit or 80))
        errors: list[dict] = []
        for row in rows:
            if remaining <= 0:
                break

            program_id = row["program_id"]
            candidate_count = max(1, int(row["candidate_count"] or 1))
            scan_limit = min(
                remaining,
                max(1, KESHT_VOD_METADATA_BACKFILL_LIMIT),
                candidate_count,
            )
            if verbose:
                print(
                    f"Keshet metadata maintenance: {program_id} "
                    f"({row['candidate_count']} candidates, limit {scan_limit})",
                    flush=True,
                )

            try:
                updated += _backfill_placeholder_episode_metadata(con, program_id, limit=scan_limit)
                scanned_programs += 1
            except Exception as ex:
                errors.append({"programId": program_id, "error": str(ex)})

            remaining -= scan_limit

        return {
            "provider": "keshet",
            "candidatePrograms": len(rows),
            "scannedPrograms": scanned_programs,
            "updatedEpisodes": updated,
            "errors": errors,
            "returnCode": 0 if not errors else 1,
        }
    finally:
        con.close()


def _normalize_url(url: str, base: str = MAKO_BASE_URL) -> str:
    if not url:
        return ""
    if url.startswith("//"):
        return f"https:{url}"
    return urljoin(base, url)


def _is_generic_mako_vod_image(url: str | None) -> bool:
    if not url:
        return False
    normalized = re.sub(r"[^a-z0-9]+", "", url.lower())
    return "makovod" in normalized


def _normalize_image_url(url: str | None, base: str = MAKO_BASE_URL) -> str | None:
    image = _normalize_url(url or "", base)
    if not image or _is_generic_mako_vod_image(image):
        return None
    return image


def _fetch_json(url: str, timeout: int = 30) -> dict:
    response = requests.get(url, headers=MAKO_HEADERS, timeout=timeout)
    response.raise_for_status()
    data = response.json()
    return data.get("root") if isinstance(data, dict) and "root" in data else data


def _fetch_text(url: str, timeout: int = 30) -> str:
    response = requests.get(
        url,
        headers={
            **MAKO_HEADERS,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        timeout=timeout,
    )
    response.raise_for_status()
    return response.text


def _extract_next_data(html: str) -> dict | None:
    patterns = [
        r'<script[^>]*id="__NEXT_DATA__"[^>]*type="application/json"[^>]*>(.*?)</script>',
        r'<script[^>]*type="application/json"[^>]*>(.*?)</script>',
    ]
    for pattern in patterns:
        match = re.search(pattern, html, re.S)
        if not match:
            continue
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            continue
    return None


def _next_page_data(data: dict | None) -> dict | None:
    if not isinstance(data, dict):
        return None

    page_data = data.get("props", {}).get("pageProps", {}).get("data")
    return page_data if isinstance(page_data, dict) else None


def _is_mako_episode_page_url(url: str) -> bool:
    return any(marker in url for marker in ("/VOD-", "/Video-", "/Playlist-"))


def _fetch_embedded_page_data(page_url: str) -> dict | None:
    try:
        html = _fetch_text(page_url)
    except Exception:
        return None
    return _next_page_data(_extract_next_data(html))


def _get_build_id(page_url: str) -> str | None:
    try:
        html = _fetch_text(page_url)
    except Exception:
        return None
    data = _extract_next_data(html)
    if isinstance(data, dict):
        return data.get("buildId")
    return None


def _program_next_data_url(page_url: str) -> str | None:
    normalized_url = _normalize_url(page_url)
    build_id = _get_build_id(normalized_url)
    if not build_id:
        return None

    match = re.search(r"https?://[^/]+/([^/]+)/([^/?#]+)", normalized_url)
    if not match:
        return None

    mako_vod_channel, program = match.group(1), match.group(2)
    return (
        f"{MAKO_BASE_URL}/_next/data/{build_id}/{mako_vod_channel}/{program}.json"
        f"?mako_vod_channel={mako_vod_channel}&program={program}"
    )


def _fetch_program_page_data(page_url: str) -> dict | None:
    normalized_url = _normalize_url(page_url)
    if _is_mako_episode_page_url(normalized_url):
        page_data = _fetch_embedded_page_data(normalized_url)
        if page_data:
            return page_data

    next_data_url = _program_next_data_url(normalized_url)
    if next_data_url:
        try:
            data = _fetch_json(next_data_url)
            page_data = data.get("pageProps", {}).get("data")
            if isinstance(page_data, dict):
                return page_data
        except Exception:
            pass

    try:
        data = _fetch_json(f"{normalized_url}{'&' if '?' in normalized_url else '?'}platform=responsive")
        page_data = data.get("pageProps", {}).get("data")
        if isinstance(page_data, dict):
            return page_data
        if isinstance(data, dict) and ("menu" in data or "vod" in data):
            return data
    except Exception:
        return None

    return None


def _pick_program_id(item: dict) -> str:
    page_url = item.get("pageUrl") or ""
    slug = page_url.strip("/").split("/")[-1] if page_url else ""
    return str(item.get("itemVcmId") or slug or hashlib_sha1(page_url))


def _flatten_label_values(value: object) -> list[str]:
    if not value:
        return []
    if isinstance(value, str):
        return [_clean_text(value)]
    if isinstance(value, dict):
        labels: list[str] = []
        for key in ("name", "title", "label", "value", "text"):
            text = _clean_text(value.get(key))
            if text:
                labels.append(text)
        return labels
    if isinstance(value, list):
        labels: list[str] = []
        for item in value:
            labels.extend(_flatten_label_values(item))
        return labels
    return [_clean_text(value)]


def _pick_first_labels(item: dict, keys: tuple[str, ...]) -> str | None:
    labels: list[str] = []
    seen: set[str] = set()
    for key in keys:
        for label in _flatten_label_values(item.get(key)):
            label_key = label.casefold()
            if label and label_key not in seen:
                seen.add(label_key)
                labels.append(label)
    return ", ".join(labels) if labels else None


def hashlib_sha1(value: str) -> str:
    import hashlib

    return hashlib.sha1(value.encode("utf-8")).hexdigest()


def _program_from_index_item(item: dict, category_labels: list[str] | None = None) -> KeshetProgram | None:
    title = _clean_text(item.get("title"))
    page_url = _normalize_url(item.get("pageUrl") or "")
    if not title or not page_url:
        return None

    domo = item.get("domoClick") or {}
    program_genre = _pick_first_labels(
        item,
        ("programGenre", "genre", "genres", "category", "categories", "tags"),
    )
    for category in category_labels or []:
        program_genre = _merge_category_value(program_genre, category)

    return KeshetProgram(
        id=_pick_program_id(item),
        mainid=str(domo.get("clicked_channel_id") or ""),
        title=title,
        description=_clean_text(item.get("altText") or item.get("subtitle")),
        url=page_url,
        image=_normalize_image_url(item.get("pic")),
        program_format=_pick_first_labels(
            item,
            ("programFormat", "format", "contentType", "type"),
        ),
        program_genre=program_genre or None,
    )


def fetch_keshet_programs() -> list[KeshetProgram]:
    data = _fetch_json(f"{MAKO_INDEX_URL}?platform=responsive")
    items = data.get("items") or []
    categories_by_key, category_programs = fetch_keshet_program_category_index()
    programs_by_id: dict[str, KeshetProgram] = {}

    for item in items:
        program_id = _pick_program_id(item)
        category_key_candidates = {
            program_id.casefold(),
            _normalize_url(item.get("pageUrl") or "").casefold(),
            _normalize_url((item.get("domoClick") or {}).get("clicked_item_url") or "").casefold(),
        }
        category_labels = [
            categories_by_key[key]
            for key in category_key_candidates
            if key and key in categories_by_key
        ]
        program = _program_from_index_item(item, category_labels)
        if not program:
            continue
        programs_by_id[program.id] = program

    for program in category_programs.values():
        existing = programs_by_id.get(program.id)
        if not existing:
            programs_by_id[program.id] = program
            continue
        for category in _split_program_categories(program.program_genre):
            existing.program_genre = _merge_category_value(existing.program_genre, category)

    return list(programs_by_id.values())


def fetch_keshet_program_category_index() -> tuple[dict[str, str], dict[str, KeshetProgram]]:
    categories_by_key: dict[str, str] = {}
    programs_by_id: dict[str, KeshetProgram] = {}
    for category_name, filter_type, vcm_id in MAKO_VOD_CATEGORY_FILTERS:
        try:
            data = _fetch_json(
                f"{MAKO_INDEX_CATEGORY_URL.format(filter_type=quote(filter_type), vcm_id=quote(vcm_id))}"
                "&platform=responsive"
            )
        except Exception:
            continue

        for item in data.get("items") or []:
            program = _program_from_index_item(item, [category_name])
            if program:
                existing = programs_by_id.get(program.id)
                if existing:
                    existing.program_genre = _merge_category_value(existing.program_genre, category_name)
                else:
                    programs_by_id[program.id] = program

            page_url = _normalize_url(item.get("pageUrl") or "")
            clicked_url = _normalize_url((item.get("domoClick") or {}).get("clicked_item_url") or "")
            for key in (
                _pick_program_id(item),
                page_url,
                clicked_url,
            ):
                normalized_key = str(key or "").casefold()
                if normalized_key:
                    categories_by_key[normalized_key] = category_name

    return categories_by_key, programs_by_id


def fetch_keshet_program_categories() -> dict[str, str]:
    categories_by_key, _programs_by_id = fetch_keshet_program_category_index()
    return categories_by_key


def _upsert_program(con: sqlite3.Connection, program: KeshetProgram) -> None:
    con.execute(
        """
        INSERT INTO keshet_programs (
            id, mainid, title, description, url, image, program_format, program_genre, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            mainid = excluded.mainid,
            title = excluded.title,
            description = excluded.description,
            url = excluded.url,
            image = CASE
                WHEN excluded.image IS NOT NULL AND excluded.image != '' THEN excluded.image
                WHEN lower(COALESCE(keshet_programs.image, '')) LIKE '%makovod%' THEN NULL
                ELSE keshet_programs.image
            END,
            program_format = excluded.program_format,
            program_genre = excluded.program_genre,
            updated_at = CURRENT_TIMESTAMP
        """,
        (
            program.id,
            program.mainid,
            program.title,
            program.description,
            program.url,
            program.image,
            program.program_format,
            program.program_genre,
        ),
    )


def _upsert_season(con: sqlite3.Connection, season: KeshetSeason) -> None:
    con.execute(
        """
        INSERT INTO keshet_seasons (
            season_id, program_id, title, url, season_number, updated_at
        )
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(season_id) DO UPDATE SET
            program_id = excluded.program_id,
            title = excluded.title,
            url = excluded.url,
            season_number = excluded.season_number,
            updated_at = CURRENT_TIMESTAMP
        """,
        (season.season_id, season.program_id, season.title, season.url, season.season_number),
    )


def _upsert_episode(con: sqlite3.Connection, episode: KeshetEpisode) -> None:
    con.execute(
        """
        INSERT INTO keshet_episodes (
            id, program_id, season_id, title, description, url, image, play_url,
            stream_url, kaltura_entry_id, published, published_timestamp, display_order,
            created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            program_id = excluded.program_id,
            season_id = excluded.season_id,
            title = excluded.title,
            description = excluded.description,
            url = excluded.url,
            image = excluded.image,
            play_url = excluded.play_url,
            stream_url = COALESCE(NULLIF(excluded.stream_url, ''), keshet_episodes.stream_url),
            kaltura_entry_id = COALESCE(NULLIF(excluded.kaltura_entry_id, ''), keshet_episodes.kaltura_entry_id),
            published = excluded.published,
            published_timestamp = excluded.published_timestamp,
            display_order = excluded.display_order,
            updated_at = CURRENT_TIMESTAMP
        """,
        (
            episode.id,
            episode.program_id,
            episode.season_id,
            episode.title,
            episode.description,
            episode.url,
            episode.image,
            episode.play_url,
            episode.stream_url,
            episode.kaltura_entry_id,
            episode.published,
            episode.published_timestamp,
            episode.display_order,
        ),
    )


def _split_program_categories(*values: object) -> list[str]:
    categories: list[str] = []
    seen = set()
    for value in values:
        if not value:
            continue
        for part in CATEGORY_SPLIT_RE.split(str(value)):
            category = " ".join(part.split())
            key = category.casefold()
            if category and key not in seen:
                seen.add(key)
                categories.append(category)
    return categories


def _get_program_categories(con: sqlite3.Connection) -> list[str]:
    rows = con.execute(
        """
        SELECT program_genre, program_format
        FROM keshet_programs
        WHERE TRIM(COALESCE(program_genre, '')) != ''
           OR TRIM(COALESCE(program_format, '')) != ''
        """
    ).fetchall()
    categories_by_key: dict[str, str] = {}
    for row in rows:
        for category in _split_program_categories(row["program_genre"], row["program_format"]):
            categories_by_key.setdefault(category.casefold(), category)
    return sorted(categories_by_key.values(), key=str.casefold)


def _get_program_category_options(con: sqlite3.Connection, categories: list[str]) -> list[dict]:
    category_options = {
        category.casefold(): {"name": category, "image": None, "count": 0}
        for category in categories
    }
    if not category_options:
        return []

    rows = con.execute(
        f"""
        SELECT
            p.program_genre,
            p.program_format,
            NULLIF(p.image, '') AS image,
            MAX(ve.latest_episode_added_at) AS latest_episode_added_at,
            MAX(ve.latest_episode_source_sort_key) AS latest_episode_source_sort_key,
            MAX(ve.latest_episode_date_sort_key) AS latest_episode_date_sort_key,
            COALESCE(MAX(e.published_timestamp), 0) AS latest_episode_sort_key,
            MAX(e.published_timestamp) AS latest_episode_timestamp,
            MAX(NULLIF(e.published, '')) AS latest_episode_published
        FROM keshet_programs p
        LEFT JOIN keshet_episodes e ON e.program_id = p.id
        LEFT JOIN ({vod_episode_activity_subquery("keshet")}) ve ON ve.program_id = p.id
        WHERE TRIM(COALESCE(p.program_genre, '')) != ''
           OR TRIM(COALESCE(p.program_format, '')) != ''
        GROUP BY p.id
        ORDER BY
            latest_episode_added_at IS NULL,
            latest_episode_added_at DESC,
            latest_episode_source_sort_key IS NULL,
            COALESCE(latest_episode_source_sort_key, latest_episode_date_sort_key, latest_episode_sort_key, 0) DESC,
            latest_episode_sort_key DESC,
            latest_episode_published IS NULL,
            latest_episode_published DESC,
            p.title COLLATE NOCASE
        """
    ).fetchall()

    for row in rows:
        for category in _split_program_categories(row["program_genre"], row["program_format"]):
            option = category_options.get(category.casefold())
            if not option:
                continue
            option["count"] += 1
            if not option["image"] and row["image"]:
                option["image"] = row["image"]

    return [category_options[category.casefold()] for category in categories]


def _merge_category_value(current_value: object, category: str) -> str:
    categories = _split_program_categories(current_value)
    if category.casefold() not in {item.casefold() for item in categories}:
        categories.append(category)
    return ", ".join(categories)


def _enrich_existing_program_categories(con: sqlite3.Connection) -> int:
    categories_by_key, category_programs = fetch_keshet_program_category_index()
    if not categories_by_key:
        return 0

    updated = 0
    rows = con.execute(
        """
        SELECT id, mainid, url, program_genre
        FROM keshet_programs
        """
    ).fetchall()
    existing_ids = {row["id"] for row in rows}

    for program in category_programs.values():
        if program.id in existing_ids:
            continue
        _upsert_program(con, program)
        existing_ids.add(program.id)
        updated += 1

    for row in rows:
        matched_categories: list[str] = []
        seen_categories: set[str] = set()
        for key in (
            row["id"],
            row["mainid"],
            row["url"],
        ):
            category = categories_by_key.get(str(key or "").casefold())
            if category and category.casefold() not in seen_categories:
                seen_categories.add(category.casefold())
                matched_categories.append(category)

        if not matched_categories:
            continue

        genre = row["program_genre"]
        for category in matched_categories:
            genre = _merge_category_value(genre, category)

        if genre != row["program_genre"]:
            con.execute(
                """
                UPDATE keshet_programs
                SET program_genre = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (genre, row["id"]),
            )
            updated += 1

    if updated:
        con.commit()
    return updated


def _normalize_selected_categories(category: object) -> list[str]:
    values = category if isinstance(category, (list, tuple)) else [category]
    categories: list[str] = []
    seen = set()
    for value in values:
        for item in _split_program_categories(value):
            key = item.casefold()
            if key not in seen:
                seen.add(key)
                categories.append(item)
    return categories


def _row_to_dict(row: sqlite3.Row) -> dict:
    return dict(row)


def _program_to_dict(row: sqlite3.Row) -> dict:
    item = _row_to_dict(row)
    item["episodeCount"] = int(item.pop("episode_count", 0) or 0)
    item["seasonCount"] = int(item.pop("season_count", 0) or 0)
    item["streamCount"] = int(item.pop("stream_count", 0) or 0)
    item["latestKanEpisodeId"] = 0
    item["latestEpisodeAddedAt"] = item.pop("latest_episode_added_at", None)
    item.pop("latest_episode_source_sort_key", None)
    item.pop("latest_episode_date_sort_key", None)
    item.pop("latest_episode_sort_key", None)
    item.pop("latest_episode_timestamp", None)
    item["latestEpisodePublished"] = item.pop("latest_episode_published", None)
    return item


def _season_to_dict(row: sqlite3.Row) -> dict:
    return _row_to_dict(row)


def _episode_to_dict(row: sqlite3.Row, api_prefix: str = "") -> dict:
    item = _row_to_dict(row)
    item["streamUrl"] = item.get("stream_url") or ""
    item["playUrl"] = item.get("play_url") or item.get("url") or ""
    item["episodeName"] = item.get("title") or ""
    item["episodeOverview"] = item.get("description") or ""
    item["episodeImage"] = item.get("image") or ""
    item["streamEndpoint"] = f"{api_prefix}/keshet-vod/stream?episode_id={quote(item['id'])}"
    return item


def _extract_season_number(title: str, url: str = "") -> int | None:
    match = re.search(r"(?:עונה|season)\D*(\d+)", f"{title} {url}", re.I)
    return int(match.group(1)) if match else None


def _parse_seasons(program: KeshetProgram, data: dict) -> list[KeshetSeason]:
    seasons: list[KeshetSeason] = []
    for index, season in enumerate(data.get("seasons") or [], start=1):
        title = _clean_text(season.get("seasonTitle")) or f"עונה {index}"
        url = _normalize_url(season.get("pageUrl") or program.url)
        season_id = str(season.get("id") or season.get("seasonVcmId") or url or f"{program.id}:s{index}")
        seasons.append(
            KeshetSeason(
                program_id=program.id,
                season_id=season_id,
                title=title,
                url=url,
                season_number=_extract_season_number(title, url) or index,
            )
        )

    if not seasons:
        seasons.append(
            KeshetSeason(
                program_id=program.id,
                season_id=f"{program.id}:single",
                title="פרקים",
                url=program.url,
                season_number=None,
            )
        )

    return seasons


def _extract_program_page_url_from_playlist_url(playlist_url: str) -> str:
    return playlist_url


def _first_text(*values: object) -> str:
    for value in values:
        text = _clean_text(value)
        if text:
            return text
    return ""


def _dict_value(value: object) -> dict:
    return value if isinstance(value, dict) else {}


def _first_image_url(*values: object) -> str | None:
    for value in values:
        if isinstance(value, str):
            image = _normalize_image_url(value)
            if image:
                return image
            continue

        if isinstance(value, dict):
            image = _first_image_url(
                value.get("picUrl"),
                value.get("image"),
                value.get("url"),
                value.get("thumbnailUrl"),
            )
            if image:
                return image
            continue

        if isinstance(value, list):
            for item in value:
                image = _first_image_url(item)
                if image:
                    return image

    return None


def _episode_page_url_from_vod(vod: dict) -> str:
    domo_click = _dict_value(vod.get("domoClick"))
    page_url = _first_text(vod.get("pageUrl"), domo_click.get("clicked_item_url"))
    return _normalize_url(page_url) if page_url else ""


def _episode_metadata_from_page_data(data: dict | None) -> dict:
    if not isinstance(data, dict):
        return {}

    vod = _dict_value(data.get("vod"))
    hero = _dict_value(data.get("hero"))
    history = _dict_value(data.get("historyObject"))
    history_hero = _dict_value(history.get("hero"))
    seo = _dict_value(data.get("seo"))
    schema = _dict_value(seo.get("schema"))
    video = _dict_value(schema.get("video"))

    title = _first_text(
        vod.get("extraInfo"),
        history_hero.get("extraInfo"),
        hero.get("subtitle"),
        schema.get("name"),
        video.get("name"),
        vod.get("subtitle"),
        vod.get("title"),
    )
    description = _first_text(
        vod.get("description"),
        vod.get("shortDescription"),
        vod.get("brief"),
        history_hero.get("subtitle"),
        hero.get("description"),
        schema.get("description"),
        video.get("description"),
    )
    published = _first_text(
        vod.get("date"),
        vod.get("created"),
        vod.get("airDate"),
        vod.get("publishDate"),
        history_hero.get("extraInfo"),
        hero.get("subtitle"),
        schema.get("datePublished"),
        video.get("uploadDate"),
        schema.get("name"),
    )
    image = _first_image_url(
        history.get("picUrl"),
        schema.get("image"),
        video.get("thumbnailUrl"),
        seo.get("image"),
        hero.get("pics"),
        hero.get("mobilePics"),
        history_hero.get("picUrl"),
        vod.get("pics"),
    )
    page_url = _first_text(history.get("pageUrl"), vod.get("pageUrl"), seo.get("canonical"))

    metadata = {
        "id": _first_text(
            vod.get("itemVcmId"),
            _dict_value(history.get("domoClick")).get("clicked_item_id"),
            _dict_value(data.get("domoPageView")).get("item_id"),
        ),
        "title": title,
        "description": description,
        "published": published,
        "published_timestamp": (
            _parse_published_timestamp(published)
            or _parse_published_timestamp(video.get("uploadDate"))
            or _parse_published_timestamp(schema.get("uploadDate"))
        ),
        "image": image,
        "page_url": _normalize_url(page_url) if page_url else "",
    }
    return {key: value for key, value in metadata.items() if value}


def _fetch_episode_page_metadata(page_url: str) -> dict:
    return _episode_metadata_from_page_data(_fetch_program_page_data(page_url))


def _parse_episodes(program: KeshetProgram, season: KeshetSeason, data: dict) -> list[KeshetEpisode]:
    video_channel_id = data.get("channelId") or data.get("videoChannelId") or ""
    episodes: list[KeshetEpisode] = []
    source_items = []

    for menu in data.get("menu") or []:
        if not isinstance(menu, dict):
            continue
        for vod in menu.get("vods") or []:
            if vod.get("componentLayout") != "vod":
                continue
            source_items.append(vod)

    if not source_items and data.get("vod"):
        source_items = [data["vod"]]

    for display_order, vod in enumerate(source_items, start=1):
        vcmid = str(vod.get("itemVcmId") or vod.get("vcmid") or "")
        if not vcmid or not video_channel_id:
            continue

        page_url = _episode_page_url_from_vod(vod)
        source_title = _clean_text(vod.get("extraInfo") or vod.get("subtitle") or vod.get("title"))
        subtitle = _clean_text(vod.get("title") or vod.get("subtitle"))
        description = _clean_text(vod.get("description") or vod.get("shortDescription") or vod.get("brief"))
        published = _clean_text(vod.get("date") or vod.get("created") or vod.get("airDate") or vod.get("publishDate"))

        metadata = _episode_metadata_from_page_data(data)
        if metadata.get("id") != vcmid:
            metadata = {}
        if page_url and (not source_title or not description or not published):
            metadata = metadata or _fetch_episode_page_metadata(page_url)

        title = source_title or metadata.get("title") or f"פרק {vcmid}"
        if subtitle and subtitle != title and not description:
            description = subtitle
        description = description or metadata.get("description") or ""

        pics = vod.get("pics") or []
        image = None
        if pics and isinstance(pics[0], dict):
            image = _normalize_image_url(pics[0].get("picUrl"))
        image = metadata.get("image") or image or program.image

        published = published or metadata.get("published") or ""
        published_timestamp = (
            _parse_published_timestamp(published)
            or metadata.get("published_timestamp")
            or _parse_published_timestamp(title)
        )
        play_url = f"{MAKO_BASE_URL}/VodPlaylist?vcmid={quote(vcmid)}&videoChannelId={quote(str(video_channel_id))}"
        episodes.append(
            KeshetEpisode(
                id=vcmid,
                program_id=program.id,
                season_id=season.season_id,
                title=title,
                description=description,
                url=metadata.get("page_url") or page_url or _extract_program_page_url_from_playlist_url(play_url),
                image=image,
                play_url=play_url,
                published=published,
                published_timestamp=published_timestamp,
                display_order=display_order,
            )
        )

    return episodes


def _program_from_row(row: sqlite3.Row) -> KeshetProgram:
    return KeshetProgram(
        id=row["id"],
        mainid=row["mainid"] or "",
        title=row["title"] or "",
        description=row["description"] or "",
        url=row["url"] or "",
        image=row["image"],
        program_format=row["program_format"],
        program_genre=row["program_genre"],
    )


def _upsert_programs_from_api(con: sqlite3.Connection) -> None:
    for program in fetch_keshet_programs():
        _upsert_program(con, program)
    con.commit()


def refresh_keshet_vod_catalog(
    with_details: bool = False,
    limit_programs: int | None = None,
    with_streams: bool = False,
    incremental: bool = False,
    full_scan_interval_hours: int = 168,
    verbose: bool = False,
) -> dict:
    if verbose:
        print("Fetching Keshet VOD catalog...", flush=True)
    programs = _with_retries(fetch_keshet_programs)
    if verbose:
        print(f"Found {len(programs)} Keshet VOD programs", flush=True)
    con = _connect()
    scanned = 0
    errors: list[dict] = []
    try:
        if verbose:
            print("Saving Keshet VOD catalog...", flush=True)
        for program in programs:
            _upsert_program(con, program)
        con.commit()

        scan_summary = None
        if with_details:
            selected_programs, scan_summary = select_vod_programs_for_detail_scan(
                con,
                programs,
                program_table="keshet_programs",
                episode_table="keshet_episodes",
                program_id_getter=lambda program: program.id,
                incremental=incremental,
                limit_programs=limit_programs,
                full_scan_interval_hours=full_scan_interval_hours,
                with_streams=with_streams,
            )
            if verbose:
                print(f"Keshet scan summary: {scan_summary}", flush=True)
            for index, program in enumerate(selected_programs, start=1):
                if verbose:
                    print(
                        f"[{index}/{len(selected_programs)}] Keshet program: {program.title} ({program.id})",
                        flush=True,
                    )
                try:
                    _scan_program(con, program.id, with_streams=with_streams)
                    scanned += 1
                except Exception as ex:
                    if verbose:
                        print(f"  Failed: {ex}", flush=True)
                    errors.append({"programId": program.id, "title": program.title, "error": str(ex)})

        return {
            "db": KESHT_VOD_DB_PATH,
            "programs": len(programs),
            "scanned": scanned,
            "errors": errors,
            "scanSummary": scan_summary,
        }
    finally:
        con.close()


def scan_keshet_vod_programs_without_episodes(
    limit: int = 0,
    with_streams: bool = False,
    verbose: bool = False,
) -> dict:
    con = _connect()
    scanned = 0
    errors: list[dict] = []
    try:
        query = """
            SELECT p.id, p.title
            FROM keshet_programs p
            LEFT JOIN keshet_episodes e ON e.program_id = p.id
            GROUP BY p.id, p.title
            HAVING COUNT(e.id) = 0
            ORDER BY p.title
        """
        if limit:
            query += " LIMIT ?"
            rows = con.execute(query, (limit,)).fetchall()
        else:
            rows = con.execute(query).fetchall()

        if verbose:
            print(f"Keshet ensure episodes: {len(rows)} programs without episodes", flush=True)

        for index, row in enumerate(rows, start=1):
            if verbose:
                print(f"  [{index}/{len(rows)}] {row['title']} ({row['id']})", flush=True)
            try:
                _scan_program(con, row["id"], with_streams=with_streams)
                scanned += 1
            except Exception as ex:
                if verbose:
                    print(f"    Failed: {ex}", flush=True)
                errors.append({"programId": row["id"], "title": row["title"], "error": str(ex)})

        return {
            "missingPrograms": len(rows),
            "scannedPrograms": scanned,
            "errors": errors,
            "returnCode": 0 if not errors else 1,
        }
    finally:
        con.close()


def _scan_program(
    con: sqlite3.Connection,
    program_id: str,
    with_streams: bool = False,
    stream_limit: int = KESHT_VOD_STREAM_BATCH_SIZE,
) -> None:
    row = con.execute("SELECT * FROM keshet_programs WHERE id = ?", (program_id,)).fetchone()
    if not row:
        _upsert_programs_from_api(con)
        row = con.execute("SELECT * FROM keshet_programs WHERE id = ?", (program_id,)).fetchone()
    if not row:
        return

    program = _program_from_row(row)
    data = _fetch_program_page_data(program.url)
    if not data:
        return

    if data.get("seo"):
        seo = data["seo"]
        program.description = program.description or _clean_text(seo.get("description"))
        seo_image = _normalize_image_url(seo.get("image"))
        if not program.image or _is_generic_mako_vod_image(program.image):
            program.image = seo_image
        _upsert_program(con, program)

    resolved_streams = 0
    for season in _parse_seasons(program, data):
        _upsert_season(con, season)
        season_data = data
        if season.url and season.url != program.url:
            season_data = _fetch_program_page_data(season.url) or data

        for episode in _parse_episodes(program, season, season_data):
            if with_streams and resolved_streams < stream_limit:
                episode.stream_url = resolve_keshet_vod_stream(episode.play_url or "")
                resolved_streams += 1 if episode.stream_url else 0
            _upsert_episode(con, episode)

    mark_vod_program_detail_scan(con, "keshet_programs", program_id)
    con.commit()


def get_keshet_vod_series(
    refresh: bool = False,
    query: str = "",
    category: object = "",
    limit: int = 60,
    offset: int = 0,
) -> dict:
    con = _connect()
    error = None
    try:
        has_programs = con.execute("SELECT 1 FROM keshet_programs LIMIT 1").fetchone() is not None

        if refresh or not has_programs:
            try:
                _with_retries(lambda: _upsert_programs_from_api(con))
            except Exception as ex:
                error = str(ex)

        where_clauses = []
        params: list[object] = []
        normalized_query = (query or "").strip()
        selected_categories = _normalize_selected_categories(category)
        selected_category_keys = {item.casefold() for item in selected_categories}

        if normalized_query:
            like_query = f"%{normalized_query}%"
            where_clauses.append(
                """
                (
                    p.title LIKE ? COLLATE NOCASE
                    OR COALESCE(p.description, '') LIKE ? COLLATE NOCASE
                    OR COALESCE(p.program_genre, '') LIKE ? COLLATE NOCASE
                    OR COALESCE(p.program_format, '') LIKE ? COLLATE NOCASE
                )
                """
            )
            params.extend([like_query, like_query, like_query, like_query])

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
        limit = max(1, min(int(limit or 60), 120))
        offset = max(0, int(offset or 0))
        categories = _get_program_categories(con)
        if has_programs and len(categories) < len(MAKO_VOD_CATEGORY_FILTERS):
            try:
                _with_retries(lambda: _enrich_existing_program_categories(con))
                categories = _get_program_categories(con)
            except Exception as ex:
                error = error or str(ex)
        if has_programs:
            try:
                _backfill_missing_episode_timestamps(con)
            except Exception as ex:
                error = error or str(ex)

        all_rows = con.execute(
            f"""
            SELECT
                p.*,
                COUNT(DISTINCT s.season_id) AS season_count,
                COUNT(DISTINCT e.id) AS episode_count,
                COUNT(DISTINCT CASE WHEN e.stream_url IS NOT NULL AND e.stream_url != '' THEN e.id END) AS stream_count,
                MAX(ve.latest_episode_added_at) AS latest_episode_added_at,
                MAX(ve.latest_episode_source_sort_key) AS latest_episode_source_sort_key,
                MAX(ve.latest_episode_date_sort_key) AS latest_episode_date_sort_key,
                COALESCE(MAX(e.published_timestamp), 0) AS latest_episode_sort_key,
                MAX(e.published_timestamp) AS latest_episode_timestamp,
                MAX(NULLIF(e.published, '')) AS latest_episode_published
            FROM keshet_programs p
            LEFT JOIN keshet_seasons s ON s.program_id = p.id
            LEFT JOIN keshet_episodes e ON e.program_id = p.id
            LEFT JOIN ({vod_episode_activity_subquery("keshet")}) ve ON ve.program_id = p.id
            {where_sql}
            GROUP BY p.id
            HAVING COUNT(DISTINCT e.id) > 0
            ORDER BY
                latest_episode_added_at IS NULL,
                latest_episode_added_at DESC,
                latest_episode_source_sort_key IS NULL,
                COALESCE(latest_episode_source_sort_key, latest_episode_date_sort_key, latest_episode_sort_key, 0) DESC,
                latest_episode_sort_key DESC,
                latest_episode_published IS NULL,
                latest_episode_published DESC,
                p.title COLLATE NOCASE
            """,
            params,
        ).fetchall()

        filtered_rows = [
            row for row in all_rows
            if not selected_category_keys
            or any(
                item.casefold() in selected_category_keys
                for item in _split_program_categories(row["program_genre"], row["program_format"])
            )
        ]
        total = len(filtered_rows)
        rows = filtered_rows[offset:offset + limit]

        return {
            "db": KESHT_VOD_DB_PATH,
            "provider": "keshet",
            "count": len(rows),
            "total": total,
            "limit": limit,
            "offset": offset,
            "hasMore": offset + len(rows) < total,
            "query": normalized_query,
            "category": ",".join(selected_categories),
            "selectedCategories": selected_categories,
            "categories": categories,
            "categoryOptions": _get_program_category_options(con, categories),
            "series": [_program_to_dict(row) for row in rows],
            "error": error,
        }
    finally:
        con.close()


def get_keshet_vod_series_details(
    program_id: str,
    api_prefix: str = "",
    refresh: bool = False,
    with_streams: bool = False,
    stream_limit: int = KESHT_VOD_STREAM_BATCH_SIZE,
) -> dict | None:
    con = _connect()
    error = None
    try:
        if refresh:
            try:
                _with_retries(
                    lambda: _scan_program(
                        con,
                        program_id,
                        with_streams=with_streams,
                        stream_limit=stream_limit,
                    )
                )
            except Exception as ex:
                error = str(ex)

        program = con.execute(
            """
            SELECT
                p.*,
                COUNT(DISTINCT s.season_id) AS season_count,
                COUNT(DISTINCT e.id) AS episode_count,
                COUNT(DISTINCT CASE WHEN e.stream_url IS NOT NULL AND e.stream_url != '' THEN e.id END) AS stream_count
            FROM keshet_programs p
            LEFT JOIN keshet_seasons s ON s.program_id = p.id
            LEFT JOIN keshet_episodes e ON e.program_id = p.id
            WHERE p.id = ?
            GROUP BY p.id
            """,
            (program_id,),
        ).fetchone()

        if not program:
            return None

        if refresh or not int(program["episode_count"] or 0):
            try:
                _with_retries(lambda: _scan_program(con, program_id, with_streams=False))
            except Exception as ex:
                error = error or str(ex)

        try:
            _backfill_placeholder_episode_metadata(con, program_id)
        except Exception as ex:
            error = error or str(ex)

        program = con.execute(
            """
            SELECT
                p.*,
                COUNT(DISTINCT s.season_id) AS season_count,
                COUNT(DISTINCT e.id) AS episode_count,
                COUNT(DISTINCT CASE WHEN e.stream_url IS NOT NULL AND e.stream_url != '' THEN e.id END) AS stream_count
            FROM keshet_programs p
            LEFT JOIN keshet_seasons s ON s.program_id = p.id
            LEFT JOIN keshet_episodes e ON e.program_id = p.id
            WHERE p.id = ?
            GROUP BY p.id
            """,
            (program_id,),
        ).fetchone()
        if not program:
            return None

        seasons = con.execute(
            """
            SELECT *
            FROM keshet_seasons
            WHERE program_id = ?
            ORDER BY season_number IS NULL, season_number DESC, title DESC
            """,
            (program_id,),
        ).fetchall()
        episodes = con.execute(
            """
            SELECT *
            FROM keshet_episodes
            WHERE program_id = ?
            ORDER BY
                season_id DESC,
                display_order IS NULL,
                display_order ASC,
                title COLLATE NOCASE DESC
            """,
            (program_id,),
        ).fetchall()

        return {
            **_program_to_dict(program),
            "provider": "keshet",
            "seasons": [_season_to_dict(row) for row in seasons],
            "episodes": [_episode_to_dict(row, api_prefix=api_prefix) for row in episodes],
            "error": error,
        }
    finally:
        con.close()


def get_keshet_vod_next_episode(episode_id: str, api_prefix: str = "") -> dict | None:
    con = _connect()
    try:
        current = con.execute(
            "SELECT id, program_id FROM keshet_episodes WHERE id = ?",
            (episode_id,),
        ).fetchone()
        if not current:
            return None

        episodes = con.execute(
            """
            SELECT *
            FROM keshet_episodes
            WHERE program_id = ?
            ORDER BY
                season_id ASC,
                display_order IS NULL,
                display_order ASC,
                title COLLATE NOCASE DESC
            """,
            (current["program_id"],),
        ).fetchall()
        current_index = next((index for index, row in enumerate(episodes) if row["id"] == episode_id), -1)
        if current_index < 0 or current_index + 1 >= len(episodes):
            return None

        return {
            "programId": current["program_id"],
            "episode": _episode_to_dict(episodes[current_index + 1], api_prefix=api_prefix),
        }
    finally:
        con.close()


def get_keshet_vod_recent_episodes(limit: int = 10) -> list[dict]:
    con = _connect()
    try:
        episode_columns = _table_columns(con, "keshet_episodes")
        source_sort_expr = vod_episode_source_sort_key_expr(
            episode_columns,
            "e",
        )
        source_sort_kind_expr = vod_episode_source_sort_kind_expr(episode_columns, "e")
        rows = con.execute(
            f"""
            SELECT
                e.*,
                p.title AS program_title,
                p.description AS program_description,
                p.image AS program_image,
                s.title AS season_title,
                s.season_number AS season_number,
                {source_sort_expr} AS source_sort_key,
                {source_sort_kind_expr} AS source_sort_kind
            FROM keshet_episodes e
            JOIN keshet_programs p ON p.id = e.program_id
            LEFT JOIN keshet_seasons s ON s.season_id = e.season_id
            ORDER BY
                CASE WHEN source_sort_kind = 'id' THEN 0 ELSE 1 END,
                source_sort_key DESC,
                e.published_timestamp IS NULL,
                e.published_timestamp DESC,
                CASE WHEN e.published IS NULL OR e.published = '' THEN 1 ELSE 0 END,
                e.published DESC,
                e.updated_at DESC,
                e.display_order DESC
            LIMIT ?
            """,
            (max(1, int(limit or 10)),),
        ).fetchall()
        return [_row_to_dict(row) for row in rows]
    finally:
        con.close()


def _get_ticket(link: str) -> str | None:
    response = requests.get(link, headers=MAKO_HEADERS, timeout=30)
    response.raise_for_status()
    result = response.json()
    if result.get("caseId") != "1":
        return None
    tickets = result.get("tickets") or []
    if not tickets:
        return None
    from urllib.parse import unquote_plus

    return unquote_plus(tickets[0].get("ticket") or "")


def _get_media_playlist(vcmid: str, video_channel_id: str) -> list[dict]:
    url = (
        f"{MAKO_BASE_URL}/AjaxPage?jspName=playlist.jsp&vcmid={quote(vcmid)}"
        f"&videoChannelId={quote(video_channel_id)}&galleryChannelId={quote(vcmid)}"
        "&isGallery=false&consumer=web_html5&encryption=no"
    )
    data = _fetch_json(url)
    return data.get("media") or []


def _media_cdn_weight(item: dict) -> int:
    try:
        return int(float(str(item.get("cdnLB") or "0")))
    except (TypeError, ValueError):
        return 0


def _media_link_score(item: dict) -> tuple[int, int, int, int]:
    url = str(item.get("url") or "")
    cdn = str(item.get("cdn") or "").upper()
    format_name = str(item.get("format") or "").upper()
    normalized_url = url.split("?", 1)[0].lower()

    is_hls = normalized_url.endswith(".m3u8") or "HLS" in format_name
    is_master = normalized_url.endswith("/master.m3u8") or normalized_url.endswith("master.m3u8")

    return (
        _media_cdn_weight(item),
        1 if is_hls else 0,
        1 if is_master else 0,
        1 if cdn == "AKAMAI" else 0,
    )


def _pick_media_link(media: list[dict]) -> tuple[str, str] | None:
    sorted_media = sorted(
        (item for item in media if item.get("url")),
        key=_media_link_score,
        reverse=True,
    )
    if not sorted_media:
        return None

    item = sorted_media[0]
    return str(item["url"]), str(item.get("cdn") or "AWS").upper()


def _absolute_stream_url(value: object) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if text.startswith("//"):
        return f"https:{text}"
    if text.startswith(("http://", "https://")):
        return text
    return urljoin(MAKO_BASE_URL, text)


def _hls_attr_int(pattern: re.Pattern[str], value: str) -> int:
    match = pattern.search(value)
    if not match:
        return 0
    try:
        return int(match.group(1))
    except (TypeError, ValueError):
        return 0


def _hls_variant_score(attrs: str) -> tuple[int, int]:
    resolution = HLS_RESOLUTION_RE.search(attrs)
    pixels = 0
    if resolution:
        try:
            pixels = int(resolution.group(1)) * int(resolution.group(2))
        except (TypeError, ValueError):
            pixels = 0

    bandwidth = _hls_attr_int(HLS_AVERAGE_BANDWIDTH_RE, attrs) or _hls_attr_int(HLS_BANDWIDTH_RE, attrs)
    return pixels, bandwidth


def _hls_master_base_url(url: str) -> str:
    parsed = urlsplit(url)
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path.rsplit('/', 1)[0]}/"


def _best_hls_variant_from_manifest(master_url: str, manifest: str) -> str | None:
    variants = [
        (attrs, uri.strip())
        for attrs, uri in HLS_STREAM_INF_RE.findall(manifest or "")
        if uri.strip() and not uri.strip().startswith("#")
    ]
    if not variants:
        return None

    attrs, uri = max(variants, key=lambda item: _hls_variant_score(item[0]))
    variant_url = urljoin(_hls_master_base_url(master_url), uri)
    master_query = urlsplit(master_url).query
    if master_query and not urlsplit(variant_url).query:
        variant_url = f"{variant_url}?{master_query}"
    return variant_url


def _prefer_best_hls_variant(url: str) -> str:
    normalized_url = _absolute_stream_url(url)
    if not normalized_url:
        return ""

    if not urlsplit(normalized_url).path.lower().endswith(".m3u8"):
        return normalized_url

    try:
        response = requests.get(normalized_url, headers=MAKO_HEADERS, timeout=15)
        response.raise_for_status()
    except requests.RequestException:
        return normalized_url

    return _best_hls_variant_from_manifest(normalized_url, response.text) or normalized_url


def resolve_keshet_vod_stream(play_url: str) -> str | None:
    if not play_url:
        return None
    vcmid, video_channel_id = _playlist_identifiers(play_url)
    if not vcmid or not video_channel_id:
        return None
    try:
        media = _get_media_playlist(vcmid, video_channel_id)
        picked = _pick_media_link(media)
        if not picked:
            return None

        url, cdn = picked
        if url.startswith("//"):
            url = f"https:{url}"
        if cdn == "AKAMAI":
            url = url.split("?", 1)[0]

        ticket = _get_ticket(f"{MAKO_ENTITLEMENTS_URL}?et=gt&lp={quote(url, safe='/:?=&')}&rv={cdn}")
        if not ticket:
            return None

        separator = "&" if "?" in url else "?"
        return _prefer_best_hls_variant(f"{url}{separator}{ticket}")
    except Exception:
        return None


def get_keshet_vod_stream(episode_id: str) -> str | None:
    con = _connect()
    try:
        row = con.execute("SELECT * FROM keshet_episodes WHERE id = ?", (episode_id,)).fetchone()
        if not row:
            return None

        # Mako CloudFront tickets contain short-lived JWT signatures that expire.
        # Always resolve a fresh ticket so playback never fails with 403 Forbidden.
        target_url = row["play_url"] or row["url"]
        return _with_retries(lambda: resolve_keshet_vod_stream(target_url))
    finally:
        con.close()
