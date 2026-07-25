import os
import re
import sqlite3
import time
from dataclasses import dataclass
from html import unescape
from urllib.parse import quote, urlencode

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

C14_API_BASE_URL = "https://insight-api-shared.univtec.com/interface"
C14_CATALOG_URL = f"{C14_API_BASE_URL}/pages/66d85aaa6e9a9c00237dec06"
C14_SERIES_URL = f"{C14_API_BASE_URL}/pages/series/{{program_id}}"
C14_REFERER = "https://vod.c14.co.il/"
C14_TV_API_BASE_URL = "https://tv.c14.co.il/api"
C14_TV_REFERER = "https://tv.c14.co.il/"
C14_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
    "Origin": "https://vod.c14.co.il",
    "Referer": C14_REFERER,
    "platform": "web",
    "x-device-type": "web",
    "x-tenant-id": "channel14",
}
C14_TV_HEADERS = {
    "User-Agent": C14_HEADERS["User-Agent"],
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": C14_HEADERS["Accept-Language"],
    "Origin": "https://tv.c14.co.il",
    "Referer": C14_TV_REFERER,
}
CATEGORY_SPLIT_RE = re.compile(r"\s*(?:[,;|/•·،]+)\s*")
TITLE_NORMALIZE_RE = re.compile(r"[^\w\u0590-\u05ff]+", re.UNICODE)
C14_OFFICIAL_CATEGORY_PAGES = (
    ("programs", ("תוכניות", "מיוחדים")),
    ("movies", ("סרטים", "דוקו")),
    ("series", ("סדרות",)),
)
C14_OFFICIAL_CATEGORIES = {
    category for _, categories in C14_OFFICIAL_CATEGORY_PAGES for category in categories
}
C14_PROGRAM_CATEGORY_ORDER = (
    "תוכניות",
    "מיוחדים",
    "סרטים",
    "דוקו",
    "סדרות",
    "חדשות ואקטואליה",
    "אקטואליה",
    "חדשות",
    "הפטריוטים",
    "מגזין",
    "כלכלה",
    "תרבות",
    "בידור",
    "ספורט",
)
C14_PROGRAM_CATEGORY_ORDER_BY_KEY = {
    category.casefold(): index for index, category in enumerate(C14_PROGRAM_CATEGORY_ORDER)
}


@dataclass
class C14Program:
    id: str
    title: str
    description: str
    url: str
    image: str | None = None
    program_format: str | None = None
    program_genre: str | None = None


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
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    _add_column_if_missing(con, "c14_episodes", "published_timestamp", "REAL")
    _add_column_if_missing(con, "c14_episodes", "display_order", "INTEGER")
    con.executescript(
        """
        CREATE INDEX IF NOT EXISTS idx_c14_programs_title ON c14_programs(title);
        CREATE INDEX IF NOT EXISTS idx_c14_seasons_program_id ON c14_seasons(program_id);
        CREATE INDEX IF NOT EXISTS idx_c14_episodes_program_id ON c14_episodes(program_id);
        CREATE INDEX IF NOT EXISTS idx_c14_episodes_season_id ON c14_episodes(season_id);
        CREATE INDEX IF NOT EXISTS idx_c14_episodes_title ON c14_episodes(title);
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


def _fetch_json(url: str, timeout: int = 30) -> dict:
    response = requests.get(url, headers=C14_HEADERS, timeout=timeout)
    response.raise_for_status()
    return response.json()


def _fetch_c14_tv_json(url: str, timeout: int = 30) -> object:
    response = requests.get(url, headers=C14_TV_HEADERS, timeout=timeout)
    response.raise_for_status()
    return response.json()


def _normalize_unix_timestamp(value: object) -> float:
    try:
        timestamp = float(value or 0)
    except Exception:
        return 0.0
    if timestamp > 10_000_000_000:
        timestamp /= 1000
    return timestamp


def _timestamp_to_date(timestamp: float) -> str:
    if not timestamp:
        return ""
    return time.strftime("%d/%m/%Y", time.localtime(timestamp))


def _first_text(*values: object) -> str:
    for value in values:
        text = _clean_text(value)
        if text:
            return text
    return ""


def _first_image(*values: object) -> str | None:
    for value in values:
        text = _clean_text(value)
        if text:
            return text
    return None


def _absolute_media_url(value: object) -> str | None:
    url = _clean_text(value)
    if not url:
        return None
    if url.startswith("//"):
        return f"https:{url}"
    if url.startswith(("http://", "https://")):
        return url
    return None


def _resize_c14_image_url(url: str, width: int | None = None, height: int | None = None) -> str:
    if width:
        url = re.sub(r"dstw=(?:\d+|\{width:\d+\})", f"dstw={width}", url)
    if height:
        url = re.sub(r"dsth=(?:\d+|\{height:\d+\})", f"dsth={height}", url)
    return url


def _image_from_image_group(
    group: object,
    ratio: str = "16x9",
    width: int | None = None,
    height: int | None = None,
) -> str | None:
    if not isinstance(group, dict):
        return None
    values = group.get(ratio) or group.get("16x9") or group.get("3x4") or group.get("custom") or []
    if not isinstance(values, list):
        return None
    for image in values:
        if not isinstance(image, dict):
            continue
        template_url = _clean_text(image.get("templateUrl"))
        if template_url:
            template_url = _resize_c14_image_url(template_url, width=width, height=height)
            url = _absolute_media_url(template_url)
            if url:
                return url
        url = _absolute_media_url(image.get("url"))
        if url:
            return _resize_c14_image_url(url, width=width, height=height)
    return None


def _image_from_tv_item(item: dict) -> str | None:
    return (
        _image_from_image_group(item.get("images"), ratio="3x4", width=300, height=400)
        or _image_from_image_group(item.get("artworks"), ratio="3x4", width=300, height=400)
        or _image_from_image_group(item.get("artworks"))
        or _image_from_image_group(item.get("images"))
        or _image_from_image_group(item.get("titleTreatmentImages"), ratio="custom")
        or _first_image(item.get("image"), item.get("poster"))
    )


def _series_url(program_id: str) -> str:
    return C14_SERIES_URL.format(program_id=quote(program_id))


def _program_url(program_id: str) -> str:
    return f"{C14_REFERER.rstrip('/')}/series/{quote(program_id)}"


def _split_program_categories(*values: object) -> list[str]:
    categories: list[str] = []
    seen = set()
    for value in values:
        if not value:
            continue
        for part in CATEGORY_SPLIT_RE.split(str(value)):
            category = " ".join(_clean_text(part).split())
            key = category.casefold()
            if category and key not in seen:
                seen.add(key)
                categories.append(category)
    return categories


def _split_official_program_categories(*values: object) -> list[str]:
    return [
        category
        for category in _split_program_categories(*values)
        if category in C14_OFFICIAL_CATEGORIES
    ]


def _program_categories_from_item(item: dict) -> str | None:
    categories = _split_program_categories(
        item.get("mainCategory"),
        item.get("secondCategory"),
        item.get("featureCategory"),
        item.get("listClassification"),
        item.get("genre"),
    )
    return ", ".join(categories) if categories else None


def _category_sections_url(page_label: str) -> str:
    query = urlencode({"elementsLimit": 50, "platform": "BROWSER"})
    return f"{C14_TV_API_BASE_URL}/products/sections/{quote(page_label)}?{query}"


def _iter_section_items(section: dict):
    elements = section.get("elements") or section.get("items") or []
    if not isinstance(elements, list):
        return

    for element in elements:
        item = element.get("item") if isinstance(element, dict) else element
        if isinstance(item, dict):
            yield item


def _program_from_tv_item(item: dict, category: str) -> C14Program | None:
    if not isinstance(item, dict):
        return None
    item_type = _clean_text(item.get("type") or item.get("type_")).upper()
    if item_type not in {"PROGRAMME", "SERIAL", "VOD"}:
        return None
    program_id = _clean_text(item.get("id") or item.get("publicUid"))
    title = _clean_text(item.get("title") or item.get("name"))
    if not program_id or not title:
        return None
    return C14Program(
        id=program_id,
        title=title,
        description=_first_text(item.get("lead"), item.get("description"), item.get("longDescription")),
        url=_clean_text(item.get("webUrl")) or _program_url(program_id),
        image=_image_from_tv_item(item),
        program_format=None,
        program_genre=category,
    )


def _fetch_official_catalog_data() -> tuple[dict[str, list[str]], dict[str, list[str]], list[C14Program]]:
    categories_by_id: dict[str, list[str]] = {}
    categories_by_title: dict[str, list[str]] = {}
    programs_by_id: dict[str, C14Program] = {}

    def add_category(map_key: str, category: str, target: dict[str, list[str]]) -> None:
        if not map_key:
            return
        values = target.setdefault(map_key, [])
        if category not in values:
            values.append(category)

    for page_label, allowed_categories in C14_OFFICIAL_CATEGORY_PAGES:
        allowed = set(allowed_categories)
        data = _fetch_c14_tv_json(_category_sections_url(page_label))
        sections = data.get("sections") if isinstance(data, dict) else data
        if not isinstance(sections, list):
            continue

        for section in sections:
            if not isinstance(section, dict):
                continue
            category = _clean_text(section.get("title"))
            if category not in allowed:
                continue

            for item in _iter_section_items(section):
                title_key = _normalize_title_key(item.get("title") or item.get("name"))
                add_category(title_key, category, categories_by_title)

                for id_key in (item.get("id"), item.get("publicUid")):
                    add_category(_clean_text(id_key), category, categories_by_id)

                program = _program_from_tv_item(item, category)
                if not program:
                    continue
                existing = programs_by_id.get(program.id)
                if existing:
                    existing_categories = _split_program_categories(existing.program_genre)
                    if category not in existing_categories:
                        existing.program_genre = ", ".join([*existing_categories, category])
                    existing.description = existing.description or program.description
                    existing.image = existing.image or program.image
                    existing.url = existing.url or program.url
                else:
                    programs_by_id[program.id] = program

    return categories_by_id, categories_by_title, list(programs_by_id.values())


def _official_categories_for_program(
    program: C14Program,
    categories_by_id: dict[str, list[str]],
    categories_by_title: dict[str, list[str]],
) -> list[str]:
    categories = categories_by_id.get(program.id, [])
    if categories:
        return categories

    title_key = _normalize_title_key(program.title)
    categories = categories_by_title.get(title_key, [])
    if categories:
        return categories

    for official_title, official_categories in categories_by_title.items():
        if title_key and official_title and (title_key in official_title or official_title in title_key):
            return official_categories

    return []


def _is_similar_program_title(left: object, right: object) -> bool:
    left_key = _normalize_title_key(left)
    right_key = _normalize_title_key(right)
    if not left_key or not right_key:
        return False
    if left_key == right_key:
        return True
    shorter, longer = sorted((left_key, right_key), key=len)
    return len(shorter) >= 6 and shorter in longer


def _find_matching_program_by_title(
    programs_by_id: dict[str, C14Program],
    title: object,
) -> C14Program | None:
    for program in programs_by_id.values():
        if _is_similar_program_title(program.title, title):
            return program
    return None


def _merge_program_metadata(target: C14Program, source: C14Program) -> None:
    target_categories = _split_program_categories(target.program_genre)
    for category in _split_program_categories(source.program_genre):
        if category not in target_categories:
            target_categories.append(category)
    if target_categories:
        target.program_genre = ", ".join(target_categories)
    target.image = source.image or target.image
    target.description = target.description or source.description


def _program_from_item(item: dict) -> C14Program | None:
    if not isinstance(item, dict):
        return None
    program_id = _clean_text(item.get("id"))
    title = _clean_text(item.get("title"))
    if not program_id or not title:
        return None
    description = _first_text(item.get("description"), item.get("longDescription"))
    return C14Program(
        id=program_id,
        title=title,
        description=description,
        url=_program_url(program_id),
        image=_first_image(
            item.get("image"),
            item.get("poster"),
            item.get("optimizedImage"),
            item.get("optimizedPoster"),
        ),
        program_format=None,
        program_genre=None,
    )


def fetch_c14_programs() -> list[C14Program]:
    data = _fetch_json(C14_CATALOG_URL)
    try:
        categories_by_id, categories_by_title, official_programs = _fetch_official_catalog_data()
    except Exception:
        categories_by_id, categories_by_title, official_programs = {}, {}, []

    programs_by_id: dict[str, C14Program] = {}
    for section in data.get("sections") or []:
        if not isinstance(section, dict):
            continue
        for item in section.get("items") or []:
            program = _program_from_item(item)
            if program:
                official_categories = _official_categories_for_program(
                    program,
                    categories_by_id,
                    categories_by_title,
                )
                if official_categories:
                    program.program_genre = ", ".join(official_categories)
                programs_by_id[program.id] = program

    for official_program in official_programs:
        existing = (
            programs_by_id.get(official_program.id)
            or _find_matching_program_by_title(programs_by_id, official_program.title)
        )
        if existing:
            _merge_program_metadata(existing, official_program)
            continue
        programs_by_id[official_program.id] = official_program
    return list(programs_by_id.values())


def _upsert_program(con: sqlite3.Connection, program: C14Program) -> None:
    con.execute(
        """
        INSERT INTO c14_programs (
            id, title, description, url, image, program_format, program_genre, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
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
            program.title,
            program.description,
            program.url,
            program.image,
            program.program_format,
            program.program_genre,
        ),
    )


def _remove_stale_empty_duplicate_programs(con: sqlite3.Connection, programs: list[C14Program]) -> int:
    kept_programs = {program.id: program for program in programs}
    stale_rows = con.execute(
        """
        SELECT
            p.id,
            p.title,
            COUNT(e.id) AS episode_count
        FROM c14_programs p
        LEFT JOIN c14_episodes e ON e.program_id = p.id
        GROUP BY p.id
        HAVING COUNT(e.id) = 0
        """
    ).fetchall()
    removed = 0
    for row in stale_rows:
        stale_id = row["id"]
        if stale_id in kept_programs:
            continue
        if not any(_is_similar_program_title(row["title"], program.title) for program in kept_programs.values()):
            continue
        con.execute("DELETE FROM c14_seasons WHERE program_id = ?", (stale_id,))
        con.execute("DELETE FROM c14_episodes WHERE program_id = ?", (stale_id,))
        con.execute("DELETE FROM c14_programs WHERE id = ?", (stale_id,))
        removed += 1
    return removed


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
            stream_url, published, published_timestamp, display_order, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            program_id = excluded.program_id,
            season_id = excluded.season_id,
            title = excluded.title,
            description = excluded.description,
            url = excluded.url,
            image = excluded.image,
            play_url = excluded.play_url,
            stream_url = COALESCE(NULLIF(excluded.stream_url, ''), c14_episodes.stream_url),
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
            episode.published,
            episode.published_timestamp,
            episode.display_order,
        ),
    )


def _row_to_dict(row: sqlite3.Row) -> dict:
    return dict(row)


def _program_to_dict(row: sqlite3.Row) -> dict:
    item = _row_to_dict(row)
    item["program_genre"] = ", ".join(_split_official_program_categories(item.get("program_genre")))
    if item.get("program_format") == "כל התוכניות":
        item["program_format"] = ""
    item["mainid"] = item.get("id") or ""
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
    item["streamUrl"] = item.get("stream_url") or item.get("play_url") or ""
    item["playUrl"] = item.get("play_url") or item.get("url") or ""
    item["episodeName"] = item.get("title") or ""
    item["episodeOverview"] = item.get("description") or ""
    item["episodeImage"] = item.get("image") or ""
    item["streamEndpoint"] = f"{api_prefix}/c14-vod/stream?episode_id={quote(item['id'])}"
    return item


def _program_from_row(row: sqlite3.Row) -> C14Program:
    return C14Program(
        id=row["id"],
        title=row["title"] or "",
        description=row["description"] or "",
        url=row["url"] or "",
        image=row["image"],
        program_format=row["program_format"],
        program_genre=row["program_genre"],
    )


def _upsert_programs_from_api(con: sqlite3.Connection) -> None:
    programs = fetch_c14_programs()
    for program in programs:
        _upsert_program(con, program)
    _remove_stale_empty_duplicate_programs(con, programs)
    con.commit()


def _parse_seasons(program: C14Program, data: dict) -> list[C14Season]:
    source_seasons = data.get("seasons") or []
    seasons: list[C14Season] = []
    if isinstance(source_seasons, list):
        for index, season in enumerate(source_seasons, start=1):
            if not isinstance(season, dict):
                continue
            title = _clean_text(season.get("title")) or f"עונה {index}"
            season_id = f"{program.id}:s{index}"
            seasons.append(
                C14Season(
                    program_id=program.id,
                    season_id=season_id,
                    title=title,
                    url=_series_url(program.id),
                    season_number=index,
                )
            )

    if not seasons:
        seasons.append(
            C14Season(
                program_id=program.id,
                season_id=f"{program.id}:single",
                title="פרקים",
                url=_series_url(program.id),
                season_number=None,
            )
        )
    return seasons


def _parse_episodes(program: C14Program, season: C14Season, season_data: dict) -> list[C14Episode]:
    source_episodes = season_data.get("episodes") or []
    if not isinstance(source_episodes, list):
        return []

    episodes: list[C14Episode] = []
    for display_order, episode in enumerate(source_episodes, start=1):
        if not isinstance(episode, dict):
            continue
        episode_id = _clean_text(episode.get("id"))
        if not episode_id:
            continue
        timestamp = _normalize_unix_timestamp(episode.get("date") or episode.get("dateUpdate"))
        stream_url = _clean_text(episode.get("videoUrl"))
        title = _clean_text(episode.get("title")) or f"פרק {display_order}"
        description = _first_text(episode.get("description"), episode.get("keywords"))
        image = _first_image(
            episode.get("image"),
            episode.get("poster"),
            episode.get("optimizedImage"),
            episode.get("optimizedPoster"),
            program.image,
        )
        episodes.append(
            C14Episode(
                id=episode_id,
                program_id=program.id,
                season_id=season.season_id,
                title=title,
                description=description,
                url=stream_url or program.url,
                image=image,
                play_url=stream_url,
                stream_url=stream_url,
                published=_timestamp_to_date(timestamp),
                published_timestamp=timestamp or None,
                display_order=display_order,
            )
        )
    return episodes


def _scan_program(
    con: sqlite3.Connection,
    program_id: str,
    with_streams: bool = False,
    stream_limit: int = C14_VOD_STREAM_BATCH_SIZE,
) -> None:
    row = con.execute("SELECT * FROM c14_programs WHERE id = ?", (program_id,)).fetchone()
    if not row:
        _upsert_programs_from_api(con)
        row = con.execute("SELECT * FROM c14_programs WHERE id = ?", (program_id,)).fetchone()
    if not row:
        return

    program = _program_from_row(row)
    data = _fetch_json(_series_url(program.id))
    if not data:
        return

    program.description = program.description or _first_text(data.get("description"), data.get("longDescription"))
    program.image = program.image or _first_image(data.get("image"), data.get("poster"))
    _upsert_program(con, program)

    parsed_seasons = _parse_seasons(program, data)
    source_seasons = data.get("seasons") or []
    if not isinstance(source_seasons, list) or not source_seasons:
        source_seasons = [data]

    for season_data, season in zip(source_seasons, parsed_seasons, strict=False):
        _upsert_season(con, season)
        for episode in _parse_episodes(program, season, season_data):
            _upsert_episode(con, episode)

    con.execute(
        "UPDATE c14_programs SET last_full_scan_at = CURRENT_TIMESTAMP WHERE id = ?",
        (program_id,),
    )
    con.commit()


def refresh_c14_vod_catalog(
    with_details: bool = False,
    limit_programs: int | None = None,
    with_streams: bool = False,
    verbose: bool = False,
) -> dict:
    if verbose:
        print("Fetching C14 VOD catalog...", flush=True)
    programs = _with_retries(fetch_c14_programs)
    if verbose:
        print(f"Found {len(programs)} C14 VOD programs", flush=True)
    con = _connect()
    scanned = 0
    errors: list[dict] = []
    try:
        for program in programs:
            _upsert_program(con, program)
        _remove_stale_empty_duplicate_programs(con, programs)
        con.commit()

        if with_details:
            selected_programs = programs[:limit_programs] if limit_programs else programs
            for index, program in enumerate(selected_programs, start=1):
                if verbose:
                    print(f"[{index}/{len(selected_programs)}] C14 program: {program.title} ({program.id})", flush=True)
                try:
                    _scan_program(con, program.id, with_streams=with_streams)
                    scanned += 1
                except Exception as ex:
                    if verbose:
                        print(f"  Failed: {ex}", flush=True)
                    errors.append({"programId": program.id, "title": program.title, "error": str(ex)})

        return {
            "db": C14_VOD_DB_PATH,
            "programs": len(programs),
            "scanned": scanned,
            "errors": errors,
        }
    finally:
        con.close()


def scan_c14_vod_programs_without_episodes(
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
            FROM c14_programs p
            LEFT JOIN c14_episodes e ON e.program_id = p.id
            GROUP BY p.id, p.title
            HAVING COUNT(e.id) = 0
            ORDER BY p.title
        """
        rows = con.execute(query + (" LIMIT ?" if limit else ""), (limit,) if limit else ()).fetchall()

        if verbose:
            print(f"C14 ensure episodes: {len(rows)} programs without episodes", flush=True)

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


def _get_program_categories(con: sqlite3.Connection) -> list[str]:
    rows = con.execute(
        """
        SELECT program_genre
        FROM c14_programs
        WHERE TRIM(COALESCE(program_genre, '')) != ''
        """
    ).fetchall()
    categories_by_key: dict[str, str] = {}
    for row in rows:
        for category in _split_official_program_categories(row["program_genre"]):
            categories_by_key.setdefault(category.casefold(), category)
    return sorted(
        categories_by_key.values(),
        key=lambda category: (
            C14_PROGRAM_CATEGORY_ORDER_BY_KEY.get(category.casefold(), 999),
            category.casefold(),
        ),
    )


def _ensure_official_categories(con: sqlite3.Connection) -> list[str]:
    categories = _get_program_categories(con)
    if categories:
        return categories

    _with_retries(lambda: _upsert_programs_from_api(con))
    return _get_program_categories(con)


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


def get_c14_vod_series(
    refresh: bool = False,
    query: str = "",
    category: object = "",
    limit: int = 60,
    offset: int = 0,
) -> dict:
    con = _connect()
    error = None
    try:
        has_programs = con.execute("SELECT 1 FROM c14_programs LIMIT 1").fetchone() is not None
        refreshed_catalog = False
        if refresh or not has_programs:
            try:
                _with_retries(lambda: _upsert_programs_from_api(con))
                refreshed_catalog = True
            except Exception as ex:
                error = str(ex)

        try:
            categories = _get_program_categories(con) if refreshed_catalog else _ensure_official_categories(con)
        except Exception as ex:
            categories = []
            error = error or str(ex)

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
        all_rows = con.execute(
            f"""
            SELECT
                p.*,
                COUNT(DISTINCT s.season_id) AS season_count,
                COUNT(DISTINCT e.id) AS episode_count,
                COUNT(DISTINCT CASE WHEN e.stream_url IS NOT NULL AND e.stream_url != '' THEN e.id END) AS stream_count,
                MAX(e.published_timestamp) AS latest_episode_timestamp,
                MAX(NULLIF(e.published, '')) AS latest_episode_published
            FROM c14_programs p
            LEFT JOIN c14_seasons s ON s.program_id = p.id
            LEFT JOIN c14_episodes e ON e.program_id = p.id
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
                for item in _split_official_program_categories(row["program_genre"])
            )
        ]
        total = len(filtered_rows)
        rows = filtered_rows[offset:offset + limit]
        return {
            "db": C14_VOD_DB_PATH,
            "provider": "c14",
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


def get_c14_vod_series_details(
    program_id: str,
    api_prefix: str = "",
    refresh: bool = False,
    with_streams: bool = False,
    stream_limit: int = C14_VOD_STREAM_BATCH_SIZE,
) -> dict | None:
    con = _connect()
    error = None
    try:
        if refresh:
            try:
                _with_retries(lambda: _scan_program(con, program_id, with_streams=with_streams, stream_limit=stream_limit))
            except Exception as ex:
                error = str(ex)

        program = con.execute(
            """
            SELECT
                p.*,
                COUNT(DISTINCT s.season_id) AS season_count,
                COUNT(DISTINCT e.id) AS episode_count,
                COUNT(DISTINCT CASE WHEN e.stream_url IS NOT NULL AND e.stream_url != '' THEN e.id END) AS stream_count
            FROM c14_programs p
            LEFT JOIN c14_seasons s ON s.program_id = p.id
            LEFT JOIN c14_episodes e ON e.program_id = p.id
            WHERE p.id = ?
            GROUP BY p.id
            """,
            (program_id,),
        ).fetchone()
        if not program:
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
            FROM c14_programs p
            LEFT JOIN c14_seasons s ON s.program_id = p.id
            LEFT JOIN c14_episodes e ON e.program_id = p.id
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
            FROM c14_programs p
            LEFT JOIN c14_seasons s ON s.program_id = p.id
            LEFT JOIN c14_episodes e ON e.program_id = p.id
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
            FROM c14_seasons
            WHERE program_id = ?
            ORDER BY season_number IS NULL, season_number DESC, title DESC
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
                season_id DESC,
                display_order IS NULL,
                display_order ASC
            """,
            (program_id,),
        ).fetchall()
        return {
            **_program_to_dict(program),
            "provider": "c14",
            "seasons": [_season_to_dict(row) for row in seasons],
            "episodes": [_episode_to_dict(row, api_prefix=api_prefix) for row in episodes],
            "error": error,
        }
    finally:
        con.close()


def get_c14_vod_next_episode(episode_id: str, api_prefix: str = "") -> dict | None:
    con = _connect()
    try:
        current = con.execute(
            "SELECT id, program_id FROM c14_episodes WHERE id = ?",
            (episode_id,),
        ).fetchone()
        if not current:
            return None
        episodes = con.execute(
            """
            SELECT *
            FROM c14_episodes
            WHERE program_id = ?
            ORDER BY
                published_timestamp IS NULL,
                published_timestamp ASC,
                season_id ASC,
                display_order IS NULL,
                display_order ASC
            """,
            (current["program_id"],),
        ).fetchall()
        for index, episode in enumerate(episodes):
            if episode["id"] == current["id"] and index + 1 < len(episodes):
                return {
                    "programId": current["program_id"],
                    "episode": _episode_to_dict(episodes[index + 1], api_prefix=api_prefix),
                }
        return None
    finally:
        con.close()


def get_c14_vod_stream(episode_id: str) -> str | None:
    if episode_id.startswith("http://") or episode_id.startswith("https://"):
        return episode_id

    con = _connect()
    try:
        row = con.execute(
            "SELECT stream_url, play_url, url FROM c14_episodes WHERE id = ?",
            (episode_id,),
        ).fetchone()
        if row:
            return row["stream_url"] or row["play_url"] or row["url"]
    finally:
        con.close()

    return None


def get_c14_vod_recent_episodes(limit: int = 20) -> list[dict]:
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
            FROM c14_episodes e
            LEFT JOIN c14_programs p ON p.id = e.program_id
            LEFT JOIN c14_seasons s ON s.season_id = e.season_id
            ORDER BY
                e.published_timestamp IS NULL,
                e.published_timestamp DESC,
                e.updated_at DESC
            LIMIT ?
            """,
            (max(1, int(limit or 20)),),
        ).fetchall()
        return [_row_to_dict(row) for row in rows]
    finally:
        con.close()
