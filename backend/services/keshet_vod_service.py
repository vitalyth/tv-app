import json
import os
import re
import sqlite3
import time
from dataclasses import dataclass
from datetime import datetime
from html import unescape
from urllib.parse import quote, urljoin

import requests


KESHT_VOD_DB_PATH = os.getenv(
    "KESHET_VOD_DB_PATH",
    os.getenv("KESHT_VOD_DB_PATH", os.getenv("KAN_VOD_DB_PATH", "db/kan_vod.db")),
)
KESHT_VOD_RETRIES = int(os.getenv(
    "KESHET_VOD_RETRIES",
    os.getenv("KESHT_VOD_RETRIES", os.getenv("KAN_VOD_RETRIES", "3")),
))
KESHT_VOD_RETRY_DELAY_SECONDS = float(
    os.getenv(
        "KESHET_VOD_RETRY_DELAY_SECONDS",
        os.getenv("KESHT_VOD_RETRY_DELAY_SECONDS", os.getenv("KAN_VOD_RETRY_DELAY_SECONDS", "1")),
    )
)
KESHT_VOD_STREAM_BATCH_SIZE = int(
    os.getenv(
        "KESHET_VOD_STREAM_BATCH_SIZE",
        os.getenv("KESHT_VOD_STREAM_BATCH_SIZE", os.getenv("KAN_VOD_STREAM_BATCH_SIZE", "20")),
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
    parent = os.path.dirname(KESHT_VOD_DB_PATH)
    if parent:
        os.makedirs(parent, exist_ok=True)
    con = sqlite3.connect(KESHT_VOD_DB_PATH)
    con.row_factory = sqlite3.Row
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
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    _add_column_if_missing(con, "keshet_episodes", "display_order", "INTEGER")
    _add_column_if_missing(con, "keshet_episodes", "published_timestamp", "REAL")
    con.executescript(
        """
        CREATE INDEX IF NOT EXISTS idx_keshet_programs_title ON keshet_programs(title);
        CREATE INDEX IF NOT EXISTS idx_keshet_seasons_program_id ON keshet_seasons(program_id);
        CREATE INDEX IF NOT EXISTS idx_keshet_episodes_program_id ON keshet_episodes(program_id);
        CREATE INDEX IF NOT EXISTS idx_keshet_episodes_season_id ON keshet_episodes(season_id);
        CREATE INDEX IF NOT EXISTS idx_keshet_episodes_title ON keshet_episodes(title);
        CREATE INDEX IF NOT EXISTS idx_keshet_episodes_published ON keshet_episodes(published_timestamp);
        """
    )
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
    for fmt in (
        "%d.%m.%Y",
        "%d/%m/%Y",
        "%Y-%m-%d",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S%z",
    ):
        try:
            return datetime.strptime(normalized, fmt).timestamp()
        except ValueError:
            pass

    try:
        return datetime.fromisoformat(normalized).timestamp()
    except ValueError:
        return None


def _normalize_url(url: str, base: str = MAKO_BASE_URL) -> str:
    if not url:
        return ""
    if url.startswith("//"):
        return f"https:{url}"
    return urljoin(base, url)


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
    next_data_url = _program_next_data_url(page_url)
    if next_data_url:
        try:
            data = _fetch_json(next_data_url)
            page_data = data.get("pageProps", {}).get("data")
            if isinstance(page_data, dict):
                return page_data
        except Exception:
            pass

    try:
        data = _fetch_json(f"{page_url}{'&' if '?' in page_url else '?'}platform=responsive")
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
        image=_normalize_url(item.get("pic") or "") or None,
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
            image = excluded.image,
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
            stream_url, kaltura_entry_id, published, published_timestamp, display_order, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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

        title = _clean_text(vod.get("extraInfo") or vod.get("subtitle") or vod.get("title")) or f"פרק {vcmid}"
        subtitle = _clean_text(vod.get("title") or vod.get("subtitle"))
        description = _clean_text(vod.get("description") or vod.get("shortDescription") or vod.get("brief"))
        if subtitle and subtitle != title and not description:
            description = subtitle

        pics = vod.get("pics") or []
        image = None
        if pics and isinstance(pics[0], dict):
            image = _normalize_url(pics[0].get("picUrl") or "") or None
        image = image or program.image

        published = _clean_text(vod.get("date") or vod.get("created") or vod.get("airDate") or vod.get("publishDate"))
        play_url = f"{MAKO_BASE_URL}/VodPlaylist?vcmid={quote(vcmid)}&videoChannelId={quote(str(video_channel_id))}"
        episodes.append(
            KeshetEpisode(
                id=vcmid,
                program_id=program.id,
                season_id=season.season_id,
                title=title,
                description=description,
                url=_extract_program_page_url_from_playlist_url(play_url),
                image=image,
                play_url=play_url,
                published=published,
                published_timestamp=_parse_published_timestamp(published),
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

        if with_details:
            selected_programs = programs[:limit_programs] if limit_programs else programs
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
        program.image = program.image or (_normalize_url(seo.get("image") or "") or None)
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

    con.execute(
        "UPDATE keshet_programs SET last_full_scan_at = CURRENT_TIMESTAMP WHERE id = ?",
        (program_id,),
    )
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

        all_rows = con.execute(
            f"""
            SELECT
                p.*,
                COUNT(DISTINCT s.season_id) AS season_count,
                COUNT(DISTINCT e.id) AS episode_count,
                COUNT(DISTINCT CASE WHEN e.stream_url IS NOT NULL AND e.stream_url != '' THEN e.id END) AS stream_count,
                MAX(e.published_timestamp) AS latest_episode_timestamp,
                MAX(NULLIF(e.published, '')) AS latest_episode_published
            FROM keshet_programs p
            LEFT JOIN keshet_seasons s ON s.program_id = p.id
            LEFT JOIN keshet_episodes e ON e.program_id = p.id
            {where_sql}
            GROUP BY p.id
            ORDER BY
                CASE WHEN COUNT(DISTINCT e.id) > 0 THEN 0 ELSE 1 END,
                latest_episode_timestamp IS NULL,
                latest_episode_timestamp DESC,
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
        rows = con.execute(
            """
            SELECT
                e.*,
                p.title AS program_title,
                p.description AS program_description,
                p.image AS program_image,
                s.title AS season_title,
                s.season_number AS season_number
            FROM keshet_episodes e
            JOIN keshet_programs p ON p.id = e.program_id
            LEFT JOIN keshet_seasons s ON s.season_id = e.season_id
            ORDER BY
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


def _pick_media_link(media: list[dict], cdn_order: tuple[str, ...] = ("AWS", "AKAMAI")) -> tuple[str, str] | None:
    sorted_media = sorted(media, key=lambda item: int(item.get("cdnLB") or 0), reverse=True)
    for wanted_cdn in cdn_order:
        for item in sorted_media:
            if str(item.get("cdn") or "").upper() == wanted_cdn and item.get("url"):
                return str(item["url"]), wanted_cdn
    for item in sorted_media:
        if item.get("url"):
            return str(item["url"]), str(item.get("cdn") or "AWS").upper()
    return None


def resolve_keshet_vod_stream(play_url: str) -> str | None:
    if not play_url:
        return None
    match = re.search(r"vcmid=([^&]+)&videoChannelId=([^&]+)", play_url)
    if not match:
        return None
    from urllib.parse import unquote

    vcmid = unquote(match.group(1))
    video_channel_id = unquote(match.group(2))
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
        return f"{url}{separator}{ticket}"
    except Exception:
        return None


def get_keshet_vod_stream(episode_id: str) -> str | None:
    con = _connect()
    try:
        row = con.execute("SELECT * FROM keshet_episodes WHERE id = ?", (episode_id,)).fetchone()
        if not row:
            return None
        if row["stream_url"]:
            return row["stream_url"]

        stream_url = _with_retries(lambda: resolve_keshet_vod_stream(row["play_url"] or row["url"]))
        if stream_url:
            con.execute(
                """
                UPDATE keshet_episodes
                SET stream_url = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (stream_url, episode_id),
            )
            con.commit()
        return stream_url
    finally:
        con.close()
