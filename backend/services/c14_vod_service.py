import os
import re
import sqlite3
import time
from dataclasses import dataclass
from datetime import datetime
from html import unescape
from urllib.parse import quote, urlencode, urljoin

import requests


C14_VOD_DB_PATH = os.getenv(
    "C14_VOD_DB_PATH",
    os.getenv("KAN_VOD_DB_PATH", "db/kan_vod.db"),
)
C14_VOD_RETRIES = int(os.getenv("C14_VOD_RETRIES", os.getenv("KAN_VOD_RETRIES", "3")))
C14_VOD_RETRY_DELAY_SECONDS = float(
    os.getenv("C14_VOD_RETRY_DELAY_SECONDS", os.getenv("KAN_VOD_RETRY_DELAY_SECONDS", "1"))
)
C14_VOD_STREAM_BATCH_SIZE = int(
    os.getenv("C14_VOD_STREAM_BATCH_SIZE", os.getenv("KAN_VOD_STREAM_BATCH_SIZE", "20"))
)

C14_TV_ORIGIN = "https://tv.c14.co.il"
C14_TV_API_BASE_URL = f"{C14_TV_ORIGIN}/api"
C14_CATCHUP_DASH_URL = "https://n-121-5.il.cdn-redge.media/livedash/oil/ch14/live/now14/live.livx"
REDGE_EPOCH_UNIX_MS = 978_307_200_000
C14_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
    "Origin": C14_TV_ORIGIN,
    "Referer": f"{C14_TV_ORIGIN}/",
}

C14_CATEGORY_PAGES = (
    ("programs", ("תוכניות", "מיוחדים")),
    ("movies", ("סרטים", "דוקו")),
    ("series", ("סדרות",)),
)
C14_CATEGORY_ORDER = ("תוכניות", "מיוחדים", "סרטים", "דוקו", "סדרות")
CATEGORY_ORDER_BY_KEY = {item.casefold(): index for index, item in enumerate(C14_CATEGORY_ORDER)}
C14_PROGRAM_TYPES = {"SERIAL", "VOD", "PROGRAMME"}
C14_ONE_OFF_TYPES = {"VOD", "PROGRAMME"}
C14_SECTION_TITLES = {"תוכניות", "סדרות", "דוקו"}
C14_SOURCE_VOD = "vod"
C14_SOURCE_CATCHUP = "catchup"
C14_DEFAULT_IMAGE = "/ch/14tv.png"
C14_TAHKIR_IMAGE = "https://r.il.cdn-redge.media/file/oil/now14/static/C14-placeholder.jpg"
TITLE_NORMALIZE_RE = re.compile(r"[^\w\u0590-\u05ff]+", re.UNICODE)
EPISODE_TITLE_RE = re.compile(r"(.+?)(?:\s*[:|–-]\s*)?פרק\s*\d+", re.IGNORECASE)


@dataclass
class C14Program:
    id: str
    title: str
    description: str
    url: str
    image: str | None = None
    program_format: str | None = None
    program_genre: str | None = None
    latest_item_published: str | None = None
    latest_item_timestamp: float | None = None


@dataclass
class C14Season:
    program_id: str
    season_id: str
    title: str
    url: str
    season_number: int | None = None


@dataclass
class C14Episode:
    id: str
    program_id: str
    season_id: str | None
    title: str
    description: str
    url: str
    image: str | None = None
    play_url: str | None = None
    stream_url: str | None = None
    published: str | None = None
    published_timestamp: float | None = None
    display_order: int | None = None
    source_type: str | None = None


@dataclass
class C14Catalog:
    programs: list[C14Program]
    grouped_episode_items: dict[str, list[tuple[dict, tuple[str, ...]]]]


def _with_retries(action):
    last_error = None
    for attempt in range(1, C14_VOD_RETRIES + 1):
        try:
            return action()
        except Exception as ex:
            last_error = ex
            if attempt < C14_VOD_RETRIES:
                time.sleep(C14_VOD_RETRY_DELAY_SECONDS * attempt)
    if last_error:
        raise last_error
    raise RuntimeError("C14 VOD operation failed")


def _connect() -> sqlite3.Connection:
    parent = os.path.dirname(C14_VOD_DB_PATH)
    if parent:
        os.makedirs(parent, exist_ok=True)
    con = sqlite3.connect(C14_VOD_DB_PATH)
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
        CREATE TABLE IF NOT EXISTS c14_programs (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            url TEXT NOT NULL,
            image TEXT,
            program_format TEXT,
            program_genre TEXT,
            latest_item_published TEXT,
            latest_item_timestamp REAL,
            last_full_scan_at TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS c14_seasons (
            season_id TEXT PRIMARY KEY,
            program_id TEXT NOT NULL,
            title TEXT,
            url TEXT NOT NULL,
            season_number INTEGER,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS c14_episodes (
            id TEXT PRIMARY KEY,
            program_id TEXT NOT NULL,
            season_id TEXT,
            title TEXT NOT NULL,
            description TEXT,
            url TEXT NOT NULL,
            image TEXT,
            play_url TEXT,
            stream_url TEXT,
            published TEXT,
            published_timestamp REAL,
            display_order INTEGER,
            source_type TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    _add_column_if_missing(con, "c14_programs", "latest_item_published", "TEXT")
    _add_column_if_missing(con, "c14_programs", "latest_item_timestamp", "REAL")
    _add_column_if_missing(con, "c14_episodes", "published_timestamp", "REAL")
    _add_column_if_missing(con, "c14_episodes", "display_order", "INTEGER")
    _add_column_if_missing(con, "c14_episodes", "source_type", "TEXT")
    con.executescript(
        """
        CREATE INDEX IF NOT EXISTS idx_c14_programs_title ON c14_programs(title);
        CREATE INDEX IF NOT EXISTS idx_c14_programs_latest ON c14_programs(latest_item_timestamp);
        CREATE INDEX IF NOT EXISTS idx_c14_seasons_program_id ON c14_seasons(program_id);
        CREATE INDEX IF NOT EXISTS idx_c14_episodes_program_id ON c14_episodes(program_id);
        CREATE INDEX IF NOT EXISTS idx_c14_episodes_season_id ON c14_episodes(season_id);
        CREATE INDEX IF NOT EXISTS idx_c14_episodes_published ON c14_episodes(published_timestamp);
        """
    )
    con.commit()


def _clean_text(value: object) -> str:
    if value is None:
        return ""
    text = re.sub(r"<[^>]+>", " ", str(value))
    return " ".join(unescape(text).replace("\u200b", "").split())


def _normalize_title_key(value: object) -> str:
    text = _clean_text(value).casefold()
    text = TITLE_NORMALIZE_RE.sub(" ", text)
    return " ".join(text.split())


def _item_type(item: dict) -> str:
    return _clean_text(item.get("type") or item.get("type_")).upper()


def _is_numeric_id(value: object) -> bool:
    text = str(value or "").strip()
    return bool(text) and text.isdigit()


def _fetch_json(url: str, timeout: int = 30) -> object:
    response = requests.get(url, headers=C14_HEADERS, timeout=timeout)
    response.raise_for_status()
    return response.json()


def _fetch_json_or_none(url: str, timeout: int = 30) -> object | None:
    try:
        return _fetch_json(url, timeout=timeout)
    except requests.RequestException:
        return None


def _first_text(*values: object) -> str:
    for value in values:
        text = _clean_text(value)
        if text:
            return text
    return ""


def _absolute_url(value: object) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    if text.startswith("//"):
        return f"https:{text}"
    if text.startswith(("http://", "https://")):
        return text
    return urljoin(f"{C14_TV_ORIGIN}/", text)


def _resize_image_url(url: str, width: int, height: int, quality: int = 80) -> str:
    result = url
    result = result.replace("{width:315}", str(width)).replace("{height:177}", str(height))
    result = result.replace("{width:560}", str(width)).replace("{height:746}", str(height))
    result = result.replace("{width}", str(width)).replace("{height}", str(height))
    result = re.sub(r"([?&])dstw=(?:\d+|\{[^}&]+\})", rf"\1dstw={width}", result)
    result = re.sub(r"([?&])dsth=(?:\d+|\{[^}&]+\})", rf"\1dsth={height}", result)
    result = re.sub(r"([?&])quality=\d+", rf"\1quality={quality}", result)
    if "scale/" in result and "dstw=" not in result:
        separator = "&" if "?" in result else "?"
        result = f"{result}{separator}{urlencode({'dsth': height, 'dstw': width, 'quality': quality})}"
    return result


def _image_from_group(group: object, width: int, height: int) -> str | None:
    if not isinstance(group, list):
        return None
    for image in group:
        if not isinstance(image, dict):
            continue
        url = _absolute_url(image.get("templateUrl") or image.get("url"))
        if url:
            return _resize_image_url(url, width, height)
    return None


def _image_from_item(item: dict, width: int, height: int, prefer: tuple[str, ...] = ("16x9", "3x4")) -> str | None:
    containers = []
    for key in ("images", "artworks", "titleTreatmentImages"):
        value = item.get(key)
        if isinstance(value, dict):
            containers.append(value)

    for container in containers:
        for ratio in prefer:
            image = _image_from_group(container.get(ratio), width, height)
            if image:
                return image
        for ratio in ("16x9", "3x4", "custom", "default"):
            image = _image_from_group(container.get(ratio), width, height)
            if image:
                return image
    return _absolute_url(item.get("image") or item.get("picture") or item.get("poster"))


def _program_image_from_item(item: dict) -> str | None:
    if str(item.get("id") or "").strip() == "989209" or _clean_text(item.get("title")) == "תחקיר":
        return C14_TAHKIR_IMAGE
    return _image_from_item(item, width=300, height=400, prefer=("3x4", "16x9"))


def _episode_image_from_item(item: dict, fallback: str | None = None) -> str | None:
    return _image_from_item(item, width=490, height=276, prefer=("16x9", "3x4")) or fallback or C14_DEFAULT_IMAGE


def _is_default_image(value: object) -> bool:
    return str(value or "").strip() in {"", C14_DEFAULT_IMAGE}


def _parse_timestamp(value: object) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        timestamp = float(value)
        return timestamp / 1000 if timestamp > 10_000_000_000 else timestamp
    text = str(value).strip()
    if not text:
        return 0.0
    try:
        return _parse_timestamp(float(text))
    except ValueError:
        pass
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


def _timestamp_to_date(timestamp: float) -> str:
    if not timestamp:
        return ""
    return datetime.fromtimestamp(timestamp).strftime("%d/%m/%Y")


def _month_key(timestamp: float) -> str:
    if not timestamp:
        return "catchup"
    return datetime.fromtimestamp(timestamp).strftime("%Y-%m")


def _redge_time(timestamp: float) -> int:
    if not timestamp:
        return 0
    return max(0, int(timestamp * 1000) - REDGE_EPOCH_UNIX_MS)


def _catchup_url(start_timestamp: float, stop_timestamp: float) -> str | None:
    start_time = _redge_time(start_timestamp)
    stop_time = _redge_time(stop_timestamp)
    if not start_time or not stop_time or stop_time <= start_time:
        return None
    query = urlencode({"indexMode": "", "startTime": start_time, "stopTime": stop_time})
    return f"{C14_CATCHUP_DASH_URL}?{query}".replace("indexMode=&", "indexMode&")


def _category_url(label: str) -> str:
    return f"{C14_TV_API_BASE_URL}/products/sections/{quote(label)}?{urlencode({'elementsLimit': 50, 'platform': 'BROWSER'})}"


def _product_url(product_id: str) -> str:
    return f"{C14_TV_API_BASE_URL}/products/vods/{quote(product_id)}?{urlencode({'platform': 'BROWSER'})}"


def _serial_product_url(program_id: str) -> str:
    return f"{C14_TV_API_BASE_URL}/products/vods/serials/{quote(program_id)}?{urlencode({'platform': 'BROWSER'})}"


def _programme_url(programme_id: str) -> str:
    return f"{C14_TV_API_BASE_URL}/products/lives/programmes/{quote(programme_id)}?{urlencode({'platform': 'BROWSER'})}"


def _seasons_url(program_id: str) -> str:
    return f"{C14_TV_API_BASE_URL}/products/vods/serials/{quote(program_id)}/seasons?{urlencode({'platform': 'BROWSER'})}"


def _episodes_url(program_id: str, season_id: str) -> str:
    return (
        f"{C14_TV_API_BASE_URL}/products/vods/serials/{quote(program_id)}"
        f"/seasons/{quote(season_id)}/episodes?{urlencode({'platform': 'BROWSER'})}"
    )


def _catchup_search_url(title: str, first_result: int = 0, max_results: int = 50) -> str:
    params = {
        "keyword": title,
        "platform": "BROWSER",
        "catchup": "true",
        "firstResult": first_result,
        "maxResults": max_results,
    }
    return f"{C14_TV_API_BASE_URL}/products/lives/programmes/search?{urlencode(params)}"


def _playlist_url(episode_id: str) -> str:
    params = {"tenantUid": "n14w", "lang": "HEB", "platform": "BROWSER", "videoType": "MOVIE"}
    return f"{C14_TV_API_BASE_URL}/products/{quote(episode_id)}/videos/playlist?{urlencode(params)}"


def _player_config_url(episode_id: str) -> str:
    params = {"tenantUid": "n14w", "lang": "HEB", "platform": "BROWSER", "videoType": "MOVIE"}
    return f"{C14_TV_API_BASE_URL}/products/{quote(episode_id)}/videos/player/configuration?{urlencode(params)}"


def _iter_items(value: object):
    if isinstance(value, list):
        for item in value:
            yield from _iter_items(item)
        return
    if not isinstance(value, dict):
        return

    item = value.get("item") if isinstance(value.get("item"), dict) else value
    if isinstance(item, dict) and _is_numeric_id(item.get("id")):
        yield item

    for child_key in ("elements", "items"):
        children = value.get(child_key)
        if isinstance(children, list):
            for child in children:
                yield from _iter_items(child)


def _categories_from_item(item: dict, fallback: tuple[str, ...]) -> list[str]:
    categories: list[str] = list(fallback)
    seen = set()
    result = []
    for category in categories:
        key = category.casefold()
        if key not in seen:
            seen.add(key)
            result.append(category)
    return result


def _program_from_item(item: dict, fallback_categories: tuple[str, ...]) -> C14Program | None:
    program_id = str(item.get("id") or "").strip()
    item_type = _item_type(item)
    title = _first_text(item.get("title"), item.get("name"))
    url = _absolute_url(item.get("webUrl"))

    if not _is_numeric_id(program_id) or item_type not in C14_PROGRAM_TYPES:
        return None
    if not title or title in C14_SECTION_TITLES or not url:
        return None

    categories = _categories_from_item(item, fallback_categories)
    timestamp = _parse_timestamp(item.get("since") or item.get("createdAt") or item.get("publishedAt"))
    return C14Program(
        id=program_id,
        title=title,
        description=_first_text(item.get("description"), item.get("lead")),
        url=url,
        image=_program_image_from_item(item) or C14_DEFAULT_IMAGE,
        program_format=item_type,
        program_genre=", ".join(categories) if categories else None,
        latest_item_published=_timestamp_to_date(timestamp),
        latest_item_timestamp=timestamp,
    )


def _raw_official_items() -> list[tuple[dict, tuple[str, ...]]]:
    all_items: list[tuple[dict, tuple[str, ...]]] = []
    for page_label, categories in C14_CATEGORY_PAGES:
        data = _fetch_json(_category_url(page_label))
        all_items.extend((item, categories) for item in _iter_items(data))
    return all_items


def _explicit_episode_base(title: str) -> str:
    match = EPISODE_TITLE_RE.search(title)
    if not match:
        return ""
    return _clean_text(match.group(1).rstrip(":-–| "))


def _dash_prefix(title: str) -> str:
    prefix = re.split(r"\s+-\s+", title, maxsplit=1)[0]
    if prefix == title:
        return ""
    return _clean_text(prefix)


def _parent_for_episode_group(
    base_title: str,
    grouped_items: list[tuple[dict, tuple[str, ...]]],
    existing_programs: dict[str, C14Program],
    title_to_program_id: dict[str, str],
) -> C14Program | None:
    base_key = _normalize_title_key(base_title)
    if not base_key:
        return None

    parent_id = title_to_program_id.get(base_key)
    if not parent_id:
        for key, candidate_id in title_to_program_id.items():
            if len(base_key) >= 4 and (key.startswith(base_key) or base_key.startswith(key)):
                parent_id = candidate_id
                break
    if parent_id and parent_id in existing_programs:
        return existing_programs[parent_id]

    sorted_items = sorted(
        grouped_items,
        key=lambda pair: _parse_timestamp(pair[0].get("since") or pair[0].get("createdAt") or pair[0].get("publishedAt")),
        reverse=True,
    )
    representative, categories = sorted_items[0]
    program = _program_from_item(representative, categories)
    if not program:
        return None
    program.title = base_title
    program.id = str(representative.get("id"))
    program.description = _first_text(representative.get("lead"), representative.get("description"), program.description)
    program.program_genre = _merge_categories(program.program_genre, ", ".join(categories))
    program.image = program.image or C14_DEFAULT_IMAGE
    return program


def _build_c14_catalog() -> C14Catalog:
    all_items = _raw_official_items()

    programs: dict[str, C14Program] = {}
    title_to_program_id: dict[str, str] = {}
    episode_group_candidates: dict[str, list[tuple[dict, tuple[str, ...]]]] = {}
    dash_prefix_candidates: dict[str, list[tuple[dict, tuple[str, ...]]]] = {}

    for item, categories in all_items:
        if _item_type(item) not in {"SERIAL", "VOD"}:
            continue
        program = _program_from_item(item, categories)
        if not program:
            continue
        if _item_type(item) == "VOD":
            base_title = _explicit_episode_base(program.title)
            if base_title:
                episode_group_candidates.setdefault(_normalize_title_key(base_title), []).append((item, categories))
                continue
            prefix = _dash_prefix(program.title)
            if prefix:
                dash_prefix_candidates.setdefault(_normalize_title_key(prefix), []).append((item, categories))
        _merge_program(programs, program)
        title_to_program_id[_normalize_title_key(program.title)] = program.id

    for base_key, items in dash_prefix_candidates.items():
        if len(items) < 3 or base_key in episode_group_candidates:
            continue
        base_title = _dash_prefix(_first_text(items[0][0].get("title"), items[0][0].get("name")))
        if base_title:
            episode_group_candidates[base_key] = items

    grouped_episode_ids = {
        str(item.get("id") or "").strip()
        for grouped_items in episode_group_candidates.values()
        for item, _ in grouped_items
    }
    grouped_episode_items: dict[str, list[tuple[dict, tuple[str, ...]]]] = {}
    for base_key, grouped_items in episode_group_candidates.items():
        base_title = _explicit_episode_base(_first_text(grouped_items[0][0].get("title"), grouped_items[0][0].get("name")))
        if not base_title:
            base_title = _dash_prefix(_first_text(grouped_items[0][0].get("title"), grouped_items[0][0].get("name")))
        parent = _parent_for_episode_group(base_title, grouped_items, programs, title_to_program_id)
        if not parent:
            continue
        _merge_program(programs, parent)
        title_to_program_id[_normalize_title_key(parent.title)] = parent.id
        grouped_episode_items.setdefault(parent.id, []).extend(grouped_items)

    for item, categories in all_items:
        if _item_type(item) != "PROGRAMME":
            continue
        program = _program_from_item(item, categories)
        if not program:
            continue
        if program.id in grouped_episode_ids:
            continue
        if _normalize_title_key(program.title) in title_to_program_id:
            continue
        _merge_program(programs, program)

    parent_ids = set(grouped_episode_items.keys())
    programs = {
        program_id: program
        for program_id, program in programs.items()
        if program_id not in grouped_episode_ids or program_id in parent_ids
    }
    return C14Catalog(list(programs.values()), grouped_episode_items)


def fetch_c14_programs() -> list[C14Program]:
    return _build_c14_catalog().programs


def _merge_program(programs: dict[str, C14Program], program: C14Program) -> None:
    existing = programs.get(program.id)
    if not existing:
        programs[program.id] = program
        return
    existing.description = existing.description or program.description
    existing.url = existing.url or program.url
    existing.image = existing.image or program.image
    existing.program_format = existing.program_format or program.program_format
    existing.program_genre = _merge_categories(existing.program_genre, program.program_genre)
    if (program.latest_item_timestamp or 0) > (existing.latest_item_timestamp or 0):
        existing.latest_item_timestamp = program.latest_item_timestamp
        existing.latest_item_published = program.latest_item_published


def _merge_categories(left: str | None, right: str | None) -> str | None:
    values = []
    seen = set()
    for value in (left or "", right or ""):
        for category in value.split(","):
            clean = _clean_text(category)
            key = clean.casefold()
            if clean and key not in seen:
                seen.add(key)
                values.append(clean)
    return ", ".join(values) if values else None


def _upsert_program(con: sqlite3.Connection, program: C14Program) -> None:
    con.execute(
        """
        INSERT INTO c14_programs (
            id, title, description, url, image, program_format, program_genre,
            latest_item_published, latest_item_timestamp, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            description = COALESCE(NULLIF(excluded.description, ''), c14_programs.description),
            url = excluded.url,
            image = CASE
                WHEN COALESCE(c14_programs.image, '') IN ('', '/ch/14tv.png')
                    THEN COALESCE(NULLIF(excluded.image, ''), c14_programs.image, '/ch/14tv.png')
                ELSE COALESCE(NULLIF(excluded.image, ''), c14_programs.image)
            END,
            program_format = COALESCE(NULLIF(excluded.program_format, ''), c14_programs.program_format),
            program_genre = COALESCE(NULLIF(excluded.program_genre, ''), c14_programs.program_genre),
            latest_item_published = COALESCE(NULLIF(excluded.latest_item_published, ''), c14_programs.latest_item_published),
            latest_item_timestamp = COALESCE(NULLIF(excluded.latest_item_timestamp, 0), c14_programs.latest_item_timestamp),
            updated_at = CURRENT_TIMESTAMP
        """,
        (
            program.id,
            program.title,
            program.description,
            program.url,
            program.image,
            program.program_format,
            program.program_genre,
            program.latest_item_published,
            program.latest_item_timestamp,
        ),
    )


def _upsert_season(con: sqlite3.Connection, season: C14Season) -> None:
    con.execute(
        """
        INSERT INTO c14_seasons (season_id, program_id, title, url, season_number, updated_at)
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


def _upsert_episode(con: sqlite3.Connection, episode: C14Episode) -> None:
    con.execute(
        """
        INSERT INTO c14_episodes (
            id, program_id, season_id, title, description, url, image, play_url,
            stream_url, published, published_timestamp, display_order, source_type, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            program_id = excluded.program_id,
            season_id = excluded.season_id,
            title = excluded.title,
            description = COALESCE(NULLIF(excluded.description, ''), c14_episodes.description),
            url = excluded.url,
            image = COALESCE(NULLIF(excluded.image, ''), c14_episodes.image),
            play_url = CASE
                WHEN c14_episodes.source_type = 'vod' AND excluded.source_type = 'catchup'
                    THEN c14_episodes.play_url
                ELSE COALESCE(NULLIF(excluded.play_url, ''), c14_episodes.play_url)
            END,
            stream_url = CASE
                WHEN excluded.source_type = 'vod'
                    THEN COALESCE(NULLIF(excluded.stream_url, ''), c14_episodes.stream_url)
                WHEN c14_episodes.source_type = 'vod' AND excluded.source_type = 'catchup'
                    THEN c14_episodes.stream_url
                ELSE COALESCE(NULLIF(excluded.stream_url, ''), c14_episodes.stream_url)
            END,
            published = COALESCE(NULLIF(excluded.published, ''), c14_episodes.published),
            published_timestamp = COALESCE(NULLIF(excluded.published_timestamp, 0), c14_episodes.published_timestamp),
            display_order = COALESCE(excluded.display_order, c14_episodes.display_order),
            source_type = CASE
                WHEN excluded.source_type = 'vod' THEN 'vod'
                WHEN c14_episodes.source_type = 'vod' AND excluded.source_type = 'catchup'
                    THEN c14_episodes.source_type
                ELSE COALESCE(NULLIF(excluded.source_type, ''), c14_episodes.source_type)
            END,
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
            episode.published,
            episode.published_timestamp,
            episode.display_order,
            episode.source_type,
        ),
    )


def _program_from_row(row: sqlite3.Row) -> C14Program:
    return C14Program(
        id=row["id"],
        title=row["title"] or "",
        description=row["description"] or "",
        url=row["url"] or "",
        image=row["image"],
        program_format=row["program_format"],
        program_genre=row["program_genre"],
        latest_item_published=row["latest_item_published"],
        latest_item_timestamp=row["latest_item_timestamp"],
    )


def _delete_program(con: sqlite3.Connection, program_id: str) -> None:
    con.execute("DELETE FROM c14_episodes WHERE program_id = ?", (program_id,))
    con.execute("DELETE FROM c14_seasons WHERE program_id = ?", (program_id,))
    con.execute("DELETE FROM c14_programs WHERE id = ?", (program_id,))


def _cleanup_invalid_rows(con: sqlite3.Connection) -> int:
    placeholders = ",".join("?" for _ in C14_SECTION_TITLES)
    rows = con.execute(
        f"""
        SELECT id
        FROM c14_programs
        WHERE id GLOB '*[^0-9]*'
           OR COALESCE(url, '') = ''
           OR title IN ({placeholders})
        """,
        tuple(C14_SECTION_TITLES),
    ).fetchall()
    for row in rows:
        _delete_program(con, row["id"])
    con.execute("DROP TABLE IF EXISTS c14_program_aliases")
    return len(rows)


def _cleanup_grouped_episode_program_rows(con: sqlite3.Connection, catalog: C14Catalog) -> int:
    episode_program_ids = {
        str(item.get("id") or "").strip()
        for grouped_items in catalog.grouped_episode_items.values()
        for item, _ in grouped_items
    }
    parent_ids = set(catalog.grouped_episode_items.keys())
    removable_ids = sorted(episode_program_ids - parent_ids)
    removed = 0
    for program_id in removable_ids:
        if con.execute("SELECT 1 FROM c14_programs WHERE id = ?", (program_id,)).fetchone():
            _delete_program(con, program_id)
            removed += 1
    return removed


def _cleanup_duplicate_program_rows(con: sqlite3.Connection, catalog: C14Catalog) -> int:
    catalog_ids = {program.id for program in catalog.programs}
    catalog_title_keys = {_normalize_title_key(program.title) for program in catalog.programs}
    rows = con.execute(
        """
        SELECT id, title
        FROM c14_programs
        WHERE id NOT GLOB '*[^0-9]*'
        """
    ).fetchall()
    removed = 0
    for row in rows:
        if row["id"] in catalog_ids:
            continue
        if _normalize_title_key(row["title"]) in catalog_title_keys:
            _delete_program(con, row["id"])
            removed += 1
    return removed


def _cleanup_bad_streams(con: sqlite3.Connection) -> int:
    cursor = con.execute(
        """
        UPDATE c14_episodes
        SET stream_url = NULL,
            play_url = NULL,
            source_type = CASE WHEN source_type = 'vod' THEN NULL ELSE source_type END,
            updated_at = CURRENT_TIMESTAMP
        WHERE COALESCE(stream_url, '') LIKE '%/livehls/oil/ch14/live/now14/live.livx/%'
           OR COALESCE(play_url, '') LIKE '%/livehls/oil/ch14/live/now14/live.livx/%'
        """
    )
    return cursor.rowcount or 0


def _product_for_program(program: C14Program) -> dict | None:
    if program.program_format == "PROGRAMME":
        data = _fetch_json_or_none(_programme_url(program.id))
        return data if isinstance(data, dict) else None
    if program.program_format == "SERIAL":
        data = _fetch_json_or_none(_serial_product_url(program.id))
        if isinstance(data, dict):
            return data
    data = _fetch_json_or_none(_product_url(program.id))
    return data if isinstance(data, dict) else None


def _update_program_from_product(program: C14Program, product: dict | None) -> C14Program:
    if not product:
        return program
    updated = _program_from_item(product, ())
    if not updated:
        return program
    updated.program_genre = program.program_genre
    updated.latest_item_timestamp = updated.latest_item_timestamp or program.latest_item_timestamp
    updated.latest_item_published = updated.latest_item_published or program.latest_item_published
    return updated


def _season_from_item(program: C14Program, item: dict, index: int) -> C14Season | None:
    season_id = str(item.get("id") or "").strip()
    if not _is_numeric_id(season_id):
        return None
    title = _first_text(item.get("title"), item.get("display"), f"עונה {index + 1}")
    return C14Season(
        program_id=program.id,
        season_id=season_id,
        title=title,
        url=_absolute_url(item.get("webUrl")) or program.url,
        season_number=int(item.get("number") or index + 1),
    )


def _fallback_season(program: C14Program, timestamp: float, source_type: str) -> C14Season:
    if source_type == C14_SOURCE_CATCHUP:
        key = _month_key(timestamp)
        title = key if key != "catchup" else "Catch-up"
    else:
        key = "episodes"
        title = "פרקים"
    return C14Season(
        program_id=program.id,
        season_id=f"{program.id}:{key}",
        title=title,
        url=program.url,
        season_number=None,
    )


def _episode_title(program: C14Program, item: dict, display_order: int | None = None) -> str:
    title = _first_text(item.get("title"), item.get("name"))
    if title and _normalize_title_key(title) != _normalize_title_key(program.title):
        return title
    if display_order:
        return f"{program.title}, פרק {display_order}"
    return title or program.title


def _episode_number_from_title(title: str) -> int | None:
    match = re.search(r"פרק\s*(\d+)", title or "", re.IGNORECASE)
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


def _episode_from_item(
    program: C14Program,
    item: dict,
    season_id: str | None,
    display_order: int | None = None,
) -> C14Episode | None:
    episode_id = str(item.get("id") or "").strip()
    if not _is_numeric_id(episode_id):
        return None

    item_type = _item_type(item)
    timestamp = _parse_timestamp(item.get("since") or item.get("createdAt") or item.get("publishedAt"))
    stop_timestamp = _parse_timestamp(item.get("till"))
    play_url = _catchup_url(timestamp, stop_timestamp) if item_type == "PROGRAMME" else None
    source_type = C14_SOURCE_CATCHUP if play_url else C14_SOURCE_VOD
    title = _episode_title(program, item, display_order)
    display_order = display_order or _episode_number_from_title(title)

    return C14Episode(
        id=episode_id,
        program_id=program.id,
        season_id=season_id,
        title=title,
        description=_first_text(item.get("description"), item.get("lead"), program.description),
        url=_absolute_url(item.get("webUrl")) or program.url,
        image=_episode_image_from_item(item, program.image),
        play_url=play_url,
        stream_url=None,
        published=_timestamp_to_date(timestamp),
        published_timestamp=timestamp,
        display_order=display_order,
        source_type=source_type,
    )


def _fetch_seasons(program: C14Program) -> list[C14Season]:
    if program.program_format != "SERIAL":
        return []
    data = _fetch_json_or_none(_seasons_url(program.id))
    if not isinstance(data, list):
        return []
    seasons = []
    for index, item in enumerate(data):
        if isinstance(item, dict):
            season = _season_from_item(program, item, index)
            if season:
                seasons.append(season)
    return seasons


def _fetch_regular_episodes(program: C14Program, seasons: list[C14Season]) -> list[C14Episode]:
    episodes = []
    for season in seasons:
        data = _fetch_json_or_none(_episodes_url(program.id, season.season_id))
        for index, item in enumerate(data if isinstance(data, list) else [], start=1):
            if isinstance(item, dict):
                episode = _episode_from_item(program, item, season.season_id, display_order=index)
                if episode:
                    episode.source_type = C14_SOURCE_VOD
                    episodes.append(episode)
    return _dedupe_episodes(episodes)


def _fetch_grouped_official_episodes(
    program: C14Program,
    grouped_items: list[tuple[dict, tuple[str, ...]]],
) -> tuple[list[C14Season], list[C14Episode]]:
    if not grouped_items:
        return [], []
    seasons: dict[str, C14Season] = {}
    episodes: list[C14Episode] = []
    for item, _ in grouped_items:
        timestamp = _parse_timestamp(item.get("since") or item.get("createdAt") or item.get("publishedAt"))
        season = _fallback_season(program, timestamp, C14_SOURCE_VOD)
        seasons[season.season_id] = season
        episode = _episode_from_item(program, item, season.season_id)
        if episode:
            episode.source_type = C14_SOURCE_VOD if _item_type(item) != "PROGRAMME" else C14_SOURCE_CATCHUP
            episodes.append(episode)
    return list(seasons.values()), _dedupe_episodes(episodes)


def _single_episode_from_product(program: C14Program, product: dict | None) -> tuple[C14Season | None, C14Episode | None]:
    if not product or _item_type(product) == "SERIAL":
        return None, None
    episode = _episode_from_item(program, product, None, display_order=1)
    if not episode:
        return None, None
    season = _fallback_season(program, episode.published_timestamp or 0, episode.source_type or C14_SOURCE_VOD)
    episode.season_id = season.season_id
    return season, episode


def _is_same_program_catchup(program: C14Program, item: dict) -> bool:
    program_key = _normalize_title_key(program.title)
    if not program_key:
        return False
    title_key = _normalize_title_key(item.get("title") or item.get("name"))
    if title_key == program_key:
        return True
    haystack = _normalize_title_key(
        " ".join(
            [
                _clean_text(item.get("title")),
                _clean_text(item.get("lead")),
                " ".join(
                    _clean_text(genre.get("name"))
                    for genre in item.get("genres") or []
                    if isinstance(genre, dict)
                ),
            ]
        )
    )
    return bool(haystack and program_key in haystack)


def _fetch_catchup_episodes(program: C14Program, max_pages: int = 4) -> tuple[list[C14Season], list[C14Episode]]:
    seasons: dict[str, C14Season] = {}
    episodes: list[C14Episode] = []
    first_result = 0
    max_results = 50

    for _ in range(max_pages):
        data = _fetch_json_or_none(_catchup_search_url(program.title, first_result, max_results))
        if not isinstance(data, dict):
            break
        items = data.get("items") if isinstance(data.get("items"), list) else []
        if not items:
            break

        for item in items:
            if not isinstance(item, dict) or not _is_same_program_catchup(program, item):
                continue
            timestamp = _parse_timestamp(item.get("since"))
            season = _fallback_season(program, timestamp, C14_SOURCE_CATCHUP)
            seasons[season.season_id] = season
            episode = _episode_from_item(program, item, season.season_id)
            if episode:
                episode.source_type = C14_SOURCE_CATCHUP
                episodes.append(episode)

        meta = data.get("meta") if isinstance(data.get("meta"), dict) else {}
        first_result += int(meta.get("maxResults") or len(items) or max_results)
        total_count = int(meta.get("totalCount") or 0)
        if len(items) < max_results or (total_count and first_result >= total_count):
            break

    return list(seasons.values()), _dedupe_episodes(episodes)


def _dedupe_episodes(episodes: list[C14Episode]) -> list[C14Episode]:
    deduped: dict[str, C14Episode] = {}
    for episode in episodes:
        existing = deduped.get(episode.id)
        if not existing:
            deduped[episode.id] = episode
            continue
        if existing.source_type == C14_SOURCE_CATCHUP and episode.source_type == C14_SOURCE_VOD:
            deduped[episode.id] = episode
        elif not existing.image and episode.image:
            existing.image = episode.image
    return list(deduped.values())


def _best_image_from_episodes(episodes: list[C14Episode]) -> str | None:
    for episode in episodes:
        if not _is_default_image(episode.image):
            return episode.image
    return None


def _scan_program(
    con: sqlite3.Connection,
    program_id: str,
    *,
    with_streams: bool = False,
    stream_limit: int = C14_VOD_STREAM_BATCH_SIZE,
    verbose: bool = False,
    catalog: C14Catalog | None = None,
) -> int:
    if not _is_numeric_id(program_id):
        return 0

    row = con.execute("SELECT * FROM c14_programs WHERE id = ?", (program_id,)).fetchone()
    if not row:
        refresh_c14_vod_catalog(with_details=False)
        row = con.execute("SELECT * FROM c14_programs WHERE id = ?", (program_id,)).fetchone()
    if not row:
        return 0

    program = _program_from_row(row)
    catalog = catalog or _build_c14_catalog()
    catalog_programs = {item.id: item for item in catalog.programs}
    if program.id in catalog_programs:
        program = catalog_programs[program.id]

    grouped_items = catalog.grouped_episode_items.get(program.id, [])
    product = _product_for_program(program)
    if not grouped_items or program.program_format == "SERIAL":
        program = _update_program_from_product(program, product)
    _upsert_program(con, program)

    seasons = _fetch_seasons(program)
    episodes = _fetch_regular_episodes(program, seasons)

    if not episodes:
        grouped_seasons, grouped_episodes = _fetch_grouped_official_episodes(program, grouped_items)
        seasons.extend(grouped_seasons)
        episodes.extend(grouped_episodes)

    single_season, single_episode = _single_episode_from_product(program, product)
    if not episodes and single_season and single_episode:
        seasons.append(single_season)
        episodes.append(single_episode)

    episodes = _dedupe_episodes(episodes)

    if not episodes:
        seasons, episodes = _fetch_catchup_episodes(program)

    if _is_default_image(program.image):
        program.image = _best_image_from_episodes(episodes) or C14_DEFAULT_IMAGE
        _upsert_program(con, program)

    seasons_by_id = {season.season_id: season for season in seasons}
    for season in seasons_by_id.values():
        _upsert_season(con, season)

    streams_scanned = 0
    for episode in episodes:
        if with_streams and streams_scanned < max(0, int(stream_limit or 0)):
            stream_url = resolve_c14_vod_stream(episode.id)
            if stream_url:
                episode.stream_url = stream_url
                episode.source_type = C14_SOURCE_VOD
            streams_scanned += 1
        _upsert_episode(con, episode)

    latest = max((episode.published_timestamp or 0 for episode in episodes), default=0)
    con.execute(
        """
        UPDATE c14_programs
        SET latest_item_timestamp = COALESCE(NULLIF(?, 0), latest_item_timestamp),
            latest_item_published = COALESCE(NULLIF(?, ''), latest_item_published),
            last_full_scan_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (latest, _timestamp_to_date(latest), program.id),
    )
    if verbose:
        print(f"Scanned C14 {program.title} ({program.id}): {len(episodes)} episodes")
    return len(episodes)


def refresh_c14_vod_catalog(
    *,
    with_details: bool = False,
    limit_programs: int | None = None,
    with_streams: bool = False,
    stream_limit: int = C14_VOD_STREAM_BATCH_SIZE,
    verbose: bool = False,
) -> dict:
    con = _connect()
    try:
        catalog = _with_retries(_build_c14_catalog)
        programs = catalog.programs
        removed_invalid = _cleanup_invalid_rows(con)
        removed_grouped = _cleanup_grouped_episode_program_rows(con, catalog)
        removed_duplicates = _cleanup_duplicate_program_rows(con, catalog)
        removed_bad_streams = _cleanup_bad_streams(con)
        for program in programs:
            _upsert_program(con, program)
        con.commit()

        scanned = 0
        if with_details:
            selected = programs[: max(0, int(limit_programs))] if limit_programs else programs
            for program in selected:
                scanned += _scan_program(
                    con,
                    program.id,
                    with_streams=with_streams,
                    stream_limit=stream_limit,
                    verbose=verbose,
                    catalog=catalog,
                )
                con.commit()

        return {
            "provider": "c14",
            "count": len(programs),
            "scannedEpisodes": scanned,
            "removedLegacyPrograms": removed_invalid + removed_grouped + removed_duplicates,
            "removedBadCatchupStreams": removed_bad_streams,
            "db": C14_VOD_DB_PATH,
        }
    finally:
        con.close()


def scan_c14_vod_programs_without_episodes(
    *,
    limit: int | None = None,
    with_streams: bool = False,
    verbose: bool = False,
) -> dict:
    con = _connect()
    try:
        catalog = _build_c14_catalog()
        _cleanup_grouped_episode_program_rows(con, catalog)
        placeholders = ",".join("?" for _ in C14_SECTION_TITLES)
        rows = con.execute(
            f"""
            SELECT p.id
            FROM c14_programs p
            LEFT JOIN c14_episodes e ON e.program_id = p.id
            WHERE p.id NOT GLOB '*[^0-9]*'
              AND p.title NOT IN ({placeholders})
            GROUP BY p.id
            HAVING COUNT(e.id) = 0
            ORDER BY p.latest_item_timestamp IS NULL, p.latest_item_timestamp DESC, p.title
            """,
            tuple(C14_SECTION_TITLES),
        ).fetchall()
        if limit:
            rows = rows[: max(0, int(limit))]
        scanned = 0
        for row in rows:
            scanned += _scan_program(
                con,
                row["id"],
                with_streams=with_streams,
                verbose=verbose,
                catalog=catalog,
            )
            con.commit()
        return {"provider": "c14", "count": len(rows), "scannedEpisodes": scanned, "returnCode": 0}
    finally:
        con.close()


def _row_to_dict(row: sqlite3.Row) -> dict:
    return {key: row[key] for key in row.keys()}


def _program_to_dict(row: sqlite3.Row) -> dict:
    item = _row_to_dict(row)
    item["episodeCount"] = int(item.pop("episode_count", 0) or 0)
    item["seasonCount"] = int(item.pop("season_count", 0) or 0)
    item["streamCount"] = int(item.pop("stream_count", 0) or 0)
    item["image"] = item.get("image") or C14_DEFAULT_IMAGE
    item["latestEpisodePublished"] = item.get("latest_item_published")
    item["provider"] = "c14"
    return item


def _season_to_dict(row: sqlite3.Row) -> dict:
    return _row_to_dict(row)


def _episode_to_dict(row: sqlite3.Row, api_prefix: str = "") -> dict:
    item = _row_to_dict(row)
    item["episodeName"] = item.get("title") or ""
    item["episodeOverview"] = item.get("description") or ""
    item["image"] = item.get("image") or C14_DEFAULT_IMAGE
    item["episodeImage"] = item["image"]
    item["streamUrl"] = item.get("stream_url") or ""
    item["playUrl"] = item.get("play_url") or ""
    item["streamEndpoint"] = f"{api_prefix}/c14-vod/stream?episode_id={quote(item['id'])}"
    item["sourceType"] = item.get("source_type") or ""
    item["isCatchup"] = item.get("source_type") == C14_SOURCE_CATCHUP
    item["provider"] = "c14"
    return item


def _category_filter_values(category: object) -> list[str]:
    if category is None:
        return []
    if isinstance(category, str):
        values = [category]
    else:
        values = [str(item) for item in category]
    return [_clean_text(item) for item in values if _clean_text(item)]


def _base_series_where(query: str, selected_categories: list[str]) -> tuple[list[str], list[object]]:
    where = ["p.id NOT GLOB '*[^0-9]*'"]
    params: list[object] = []
    if query:
        where.append("(p.title LIKE ? OR p.description LIKE ?)")
        params.extend([f"%{query}%", f"%{query}%"])
    for category in selected_categories:
        where.append("COALESCE(p.program_genre, '') LIKE ?")
        params.append(f"%{category}%")
    return where, params


def _categories(con: sqlite3.Connection) -> list[str]:
    placeholders = ",".join("?" for _ in C14_SECTION_TITLES)
    rows = con.execute(
        f"""
        SELECT p.program_genre
        FROM c14_programs p
        JOIN c14_episodes e ON e.program_id = p.id
        WHERE p.id NOT GLOB '*[^0-9]*'
          AND p.title NOT IN ({placeholders})
          AND COALESCE(p.program_genre, '') != ''
        GROUP BY p.id
        HAVING COUNT(DISTINCT e.id) > 0
        """,
        tuple(C14_SECTION_TITLES),
    ).fetchall()
    categories = set()
    for row in rows:
        for category in (row["program_genre"] or "").split(","):
            clean = _clean_text(category)
            if clean:
                categories.add(clean)
    return sorted(categories, key=lambda item: (CATEGORY_ORDER_BY_KEY.get(item.casefold(), 999), item))


def get_c14_vod_series(
    *,
    refresh: bool = False,
    query: str = "",
    category: object = None,
    limit: int = 60,
    offset: int = 0,
) -> dict:
    con = _connect()
    try:
        has_programs = con.execute("SELECT 1 FROM c14_programs WHERE id NOT GLOB '*[^0-9]*' LIMIT 1").fetchone()
        if refresh or not has_programs:
            refresh_c14_vod_catalog(with_details=False)

        query_text = _clean_text(query)
        selected_categories = _category_filter_values(category)
        where, params = _base_series_where(query_text, selected_categories)
        where_sql = " AND ".join(where)
        placeholders = ",".join("?" for _ in C14_SECTION_TITLES)

        total = con.execute(
            f"""
            SELECT COUNT(*) AS count
            FROM (
                SELECT p.id
                FROM c14_programs p
                JOIN c14_episodes e ON e.program_id = p.id
                WHERE {where_sql}
                  AND p.title NOT IN ({placeholders})
                GROUP BY p.id
                HAVING COUNT(DISTINCT e.id) > 0
            )
            """,
            [*params, *C14_SECTION_TITLES],
        ).fetchone()["count"]
        rows = con.execute(
            f"""
            SELECT
                p.*,
                COUNT(DISTINCT s.season_id) AS season_count,
                COUNT(DISTINCT e.id) AS episode_count,
                COUNT(DISTINCT CASE WHEN COALESCE(e.stream_url, '') != '' THEN e.id END) AS stream_count,
                MAX(e.published_timestamp) AS actual_latest_timestamp
            FROM c14_programs p
            LEFT JOIN c14_seasons s ON s.program_id = p.id
            JOIN c14_episodes e ON e.program_id = p.id
            WHERE {where_sql}
              AND p.title NOT IN ({placeholders})
            GROUP BY p.id
            HAVING COUNT(DISTINCT e.id) > 0
            ORDER BY
                COALESCE(actual_latest_timestamp, p.latest_item_timestamp) IS NULL,
                COALESCE(actual_latest_timestamp, p.latest_item_timestamp) DESC,
                p.title COLLATE NOCASE
            LIMIT ? OFFSET ?
            """,
            [*params, *C14_SECTION_TITLES, max(1, int(limit or 60)), max(0, int(offset or 0))],
        ).fetchall()
        return {
            "provider": "c14",
            "db": C14_VOD_DB_PATH,
            "count": len(rows),
            "total": int(total or 0),
            "limit": limit,
            "offset": offset,
            "hasMore": max(0, int(offset or 0)) + len(rows) < int(total or 0),
            "query": query_text,
            "selectedCategories": selected_categories,
            "categories": _categories(con),
            "series": [_program_to_dict(row) for row in rows],
        }
    finally:
        con.close()


def get_c14_vod_series_details(
    program_id: str,
    *,
    api_prefix: str = "",
    refresh: bool = False,
    with_streams: bool = False,
    stream_limit: int = C14_VOD_STREAM_BATCH_SIZE,
) -> dict | None:
    if not _is_numeric_id(program_id):
        return None
    con = _connect()
    try:
        row = _series_row(con, program_id)
        if refresh or not row or int(row["episode_count"] or 0) == 0:
            _scan_program(con, program_id, with_streams=with_streams, stream_limit=stream_limit)
            con.commit()
            row = _series_row(con, program_id)
        if not row or int(row["episode_count"] or 0) == 0:
            return None

        seasons = con.execute(
            """
            SELECT s.*, MAX(e.published_timestamp) AS latest_episode_timestamp, MAX(e.published) AS latest_episode_published
            FROM c14_seasons s
            LEFT JOIN c14_episodes e ON e.season_id = s.season_id
            WHERE s.program_id = ?
            GROUP BY s.season_id
            ORDER BY
                latest_episode_timestamp IS NULL,
                latest_episode_timestamp DESC,
                s.season_number IS NULL,
                s.season_number DESC
            """,
            (program_id,),
        ).fetchall()
        episodes = con.execute(
            """
            SELECT *
            FROM c14_episodes
            WHERE program_id = ?
            ORDER BY
                published_timestamp IS NULL,
                published_timestamp DESC,
                display_order IS NULL,
                display_order DESC,
                title
            """,
            (program_id,),
        ).fetchall()

        result = _program_to_dict(row)
        result["seasons"] = [_season_to_dict(season) for season in seasons]
        result["episodes"] = [_episode_to_dict(episode, api_prefix=api_prefix) for episode in episodes]
        return result
    finally:
        con.close()


def _series_row(con: sqlite3.Connection, program_id: str) -> sqlite3.Row | None:
    return con.execute(
        """
        SELECT
            p.*,
            COUNT(DISTINCT s.season_id) AS season_count,
            COUNT(DISTINCT e.id) AS episode_count,
            COUNT(DISTINCT CASE WHEN COALESCE(e.stream_url, '') != '' THEN e.id END) AS stream_count
        FROM c14_programs p
        LEFT JOIN c14_seasons s ON s.program_id = p.id
        LEFT JOIN c14_episodes e ON e.program_id = p.id
        WHERE p.id = ?
        GROUP BY p.id
        """,
        (program_id,),
    ).fetchone()


def _absolute_stream_url(value: object) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if text.startswith("//"):
        return f"https:{text}"
    if text.startswith(("http://", "https://")):
        return text
    return urljoin(C14_TV_API_BASE_URL, text)


def _is_playable_stream_url(url: str) -> bool:
    text = str(url or "").strip().lower()
    if not text or text.startswith("--"):
        return False
    return text.startswith(("http://", "https://")) and any(
        marker in text for marker in (".m3u8", ".mpd", ".mp4", "manifest", "playlist", "/livedash/")
    )


def _find_stream_url(value: object) -> str | None:
    if isinstance(value, str):
        url = _absolute_stream_url(value)
        return url if _is_playable_stream_url(url) else None
    if isinstance(value, list):
        for item in value:
            found = _find_stream_url(item)
            if found:
                return found
    if isinstance(value, dict):
        sources = value.get("sources")
        if isinstance(sources, dict):
            for source_type in ("HLS", "DASH"):
                found = _find_stream_url(sources.get(source_type))
                if found:
                    return found
        for key in ("src", "url", "manifestUrl", "hls", "hlsUrl", "dash", "dashUrl", "streamUrl", "playbackUrl", "file"):
            found = _find_stream_url(value.get(key))
            if found:
                return found
        for item in value.values():
            found = _find_stream_url(item)
            if found:
                return found
    return None


def resolve_c14_vod_stream(episode_id: str) -> str | None:
    playlist = _fetch_json_or_none(_playlist_url(episode_id))
    stream_url = _find_stream_url(playlist)
    if stream_url:
        return stream_url
    config = _fetch_json_or_none(_player_config_url(episode_id))
    return _find_stream_url(config)


def _resolve_catchup_stream(episode_id: str) -> str | None:
    item = _fetch_json_or_none(_programme_url(episode_id))
    if not isinstance(item, dict):
        return None
    return _catchup_url(_parse_timestamp(item.get("since")), _parse_timestamp(item.get("till")))


def get_c14_vod_stream(episode_id: str) -> str | None:
    if episode_id.startswith(("http://", "https://")):
        return episode_id if _is_playable_stream_url(episode_id) else None

    con = _connect()
    try:
        row = con.execute(
            "SELECT stream_url, play_url, source_type FROM c14_episodes WHERE id = ?",
            (episode_id,),
        ).fetchone()

        stream_url = _with_retries(lambda: resolve_c14_vod_stream(episode_id))
        if stream_url:
            con.execute(
                """
                UPDATE c14_episodes
                SET stream_url = ?, source_type = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (stream_url, C14_SOURCE_VOD, episode_id),
            )
            con.commit()
            return stream_url

        if row:
            cached = row["stream_url"] or row["play_url"] or ""
            if _is_playable_stream_url(cached):
                return cached

        stream_url = _with_retries(lambda: _resolve_catchup_stream(episode_id))
        if not stream_url:
            return None
        con.execute(
            """
            UPDATE c14_episodes
            SET stream_url = ?, source_type = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (stream_url, C14_SOURCE_CATCHUP, episode_id),
        )
        con.commit()
        return stream_url
    except requests.RequestException:
        return None
    finally:
        con.close()


def get_c14_vod_next_episode(episode_id: str, api_prefix: str = "") -> dict | None:
    con = _connect()
    try:
        row = con.execute(
            "SELECT program_id, published_timestamp FROM c14_episodes WHERE id = ?",
            (episode_id,),
        ).fetchone()
        if not row:
            return None
        next_row = con.execute(
            """
            SELECT *
            FROM c14_episodes
            WHERE program_id = ?
              AND published_timestamp < COALESCE(?, 99999999999)
            ORDER BY published_timestamp DESC
            LIMIT 1
            """,
            (row["program_id"], row["published_timestamp"]),
        ).fetchone()
        if not next_row:
            return None
        return {"programId": row["program_id"], "episode": _episode_to_dict(next_row, api_prefix=api_prefix)}
    finally:
        con.close()


def get_c14_vod_recent_episodes(limit: int = 20) -> list[dict]:
    con = _connect()
    try:
        placeholders = ",".join("?" for _ in C14_SECTION_TITLES)
        rows = con.execute(
            f"""
            SELECT
                e.*,
                p.title AS program_title,
                p.description AS program_description,
                p.image AS program_image,
                s.title AS season_title,
                s.season_number AS season_number
            FROM c14_episodes e
            LEFT JOIN c14_programs p ON p.id = e.program_id
            LEFT JOIN c14_seasons s ON s.season_id = e.season_id
            WHERE e.program_id NOT GLOB '*[^0-9]*'
              AND p.title NOT IN ({placeholders})
            ORDER BY
                e.published_timestamp IS NULL,
                e.published_timestamp DESC,
                e.updated_at DESC
            LIMIT ?
            """,
            (*C14_SECTION_TITLES, max(1, int(limit or 20))),
        ).fetchall()
        return [_row_to_dict(row) for row in rows]
    finally:
        con.close()
