import json
import os
import re
import sqlite3
import time
from dataclasses import dataclass
from html import unescape
from urllib.parse import quote, urljoin

import requests


RESHET_VOD_DB_PATH = os.getenv(
    "RESHET_VOD_DB_PATH",
    os.getenv("KAN_VOD_DB_PATH", "db/kan_vod.db"),
)
RESHET_VOD_RETRIES = int(os.getenv("RESHET_VOD_RETRIES", os.getenv("KAN_VOD_RETRIES", "3")))
RESHET_VOD_RETRY_DELAY_SECONDS = float(
    os.getenv("RESHET_VOD_RETRY_DELAY_SECONDS", os.getenv("KAN_VOD_RETRY_DELAY_SECONDS", "1"))
)
RESHET_VOD_STREAM_BATCH_SIZE = int(
    os.getenv("RESHET_VOD_STREAM_BATCH_SIZE", os.getenv("KAN_VOD_STREAM_BATCH_SIZE", "20"))
)

RESHET_BASE_URL = "https://13tv.co.il"
RESHET_ALLSHOWS_URL = f"{RESHET_BASE_URL}/allshows/"
RESHET_ALLSHOWS_FALLBACK_URL = f"{RESHET_BASE_URL}/allshows/screen/1170108/"
RESHET_EXTRA_SERIES_IDS = tuple(
    item.strip()
    for item in os.getenv("RESHET_VOD_EXTRA_SERIES_IDS", "730").split(",")
    if item.strip()
)
RESHET_KALTURA_PARTNER_ID = 2748741
RESHET_USER_AGENT = "curl/8.7.1"
RESHET_HEADERS = {
    "User-Agent": RESHET_USER_AGENT,
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
    "Referer": f"{RESHET_BASE_URL}/",
}
CATEGORY_SPLIT_RE = re.compile(r"\s*(?:[,;|/•·،]+)\s*")


@dataclass
class ReshetProgram:
    id: str
    title: str
    description: str
    url: str
    image: str | None = None
    program_format: str | None = None
    program_genre: str | None = None


@dataclass
class ReshetSeason:
    program_id: str
    season_id: str
    title: str
    url: str
    season_number: int | None = None


@dataclass
class ReshetEpisode:
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
    for attempt in range(1, RESHET_VOD_RETRIES + 1):
        try:
            return action()
        except Exception as ex:
            last_error = ex
            if attempt < RESHET_VOD_RETRIES:
                time.sleep(RESHET_VOD_RETRY_DELAY_SECONDS * attempt)

    if last_error:
        raise last_error
    raise RuntimeError("Reshet VOD operation failed")


def _connect() -> sqlite3.Connection:
    parent = os.path.dirname(RESHET_VOD_DB_PATH)
    if parent:
        os.makedirs(parent, exist_ok=True)
    con = sqlite3.connect(RESHET_VOD_DB_PATH)
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
        CREATE TABLE IF NOT EXISTS reshet_programs (
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

        CREATE TABLE IF NOT EXISTS reshet_seasons (
            season_id TEXT PRIMARY KEY,
            program_id TEXT NOT NULL,
            title TEXT,
            url TEXT NOT NULL,
            season_number INTEGER,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS reshet_episodes (
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
    _add_column_if_missing(con, "reshet_episodes", "published_timestamp", "REAL")
    con.executescript(
        """
        CREATE INDEX IF NOT EXISTS idx_reshet_programs_title ON reshet_programs(title);
        CREATE INDEX IF NOT EXISTS idx_reshet_seasons_program_id ON reshet_seasons(program_id);
        CREATE INDEX IF NOT EXISTS idx_reshet_episodes_program_id ON reshet_episodes(program_id);
        CREATE INDEX IF NOT EXISTS idx_reshet_episodes_season_id ON reshet_episodes(season_id);
        CREATE INDEX IF NOT EXISTS idx_reshet_episodes_title ON reshet_episodes(title);
        CREATE INDEX IF NOT EXISTS idx_reshet_episodes_published ON reshet_episodes(published_timestamp);
        """
    )
    con.commit()


def _clean_text(value: object) -> str:
    if value is None:
        return ""
    return unescape(str(value)).replace("\u200b", "").strip()


def _normalize_url(url: str, base: str = RESHET_BASE_URL) -> str:
    if not url:
        return ""
    if url.startswith("//"):
        return f"https:{url}"
    return urljoin(base, url)


def _fetch_json(url: str, timeout: int = 30) -> dict:
    response = requests.get(url, headers=RESHET_HEADERS, timeout=timeout)
    response.raise_for_status()
    return response.json()


def _fetch_text(url: str, timeout: int = 30) -> str:
    response = requests.get(
        url,
        headers={
            **RESHET_HEADERS,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        timeout=timeout,
    )
    response.raise_for_status()
    return response.text


def _extract_next_data(html: str) -> dict | None:
    match = re.search(
        r'<script[^>]*id="__NEXT_DATA__"[^>]*type="application/json"[^>]*>(.*?)</script>',
        html,
        re.S,
    )
    if not match:
        return None
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError:
        return None


def _get_build_id(page_url: str = RESHET_ALLSHOWS_URL) -> str | None:
    html = _fetch_text(page_url)
    data = _extract_next_data(html)
    if isinstance(data, dict) and data.get("buildId"):
        return data["buildId"]
    match = re.search(r"/_next/static/([^/]+)/_buildManifest\.js", html)
    return match.group(1) if match else None


def _allshows_data_url(build_id: str, fallback: bool = False) -> str:
    if not fallback:
        return f"{RESHET_BASE_URL}/_next/data/{build_id}/he/allshows.json"
    return f"{RESHET_BASE_URL}/_next/data/{build_id}/he/allshows/screen/1170108.json?all=screen&all=1170108"


def _series_data_url(build_id: str, program_id: str) -> str:
    return (
        f"{RESHET_BASE_URL}/_next/data/{build_id}/he/allshows/series/{quote(program_id)}.json"
        f"?all=series&all={quote(program_id)}"
    )


def _season_data_url(build_id: str, program_id: str, season_number: int | str) -> str:
    season = quote(str(season_number))
    return (
        f"{RESHET_BASE_URL}/_next/data/{build_id}/he/allshows/series/{quote(program_id)}/season/{season}.json"
        f"?all=series&all={quote(program_id)}&all=season&all={season}"
    )


def _first_image(images: object) -> str | None:
    if not isinstance(images, list):
        return None
    for image in images:
        if not isinstance(image, dict):
            continue
        url = image.get("url") or image.get("picUrl") or image.get("src")
        if url:
            return _normalize_url(str(url))
    return None


def _meta_value(value: object) -> object:
    if isinstance(value, dict) and "value" in value:
        return value.get("value")
    return value


def _program_id_from_item(item: dict) -> str:
    metas = item.get("metas") if isinstance(item.get("metas"), dict) else {}
    for value in (
        _meta_value(metas.get("SeriesID")),
        item.get("seriesId"),
        item.get("SeriesID"),
        item.get("id"),
    ):
        program_id = _clean_text(value)
        if program_id and program_id != "0" and program_id.isdigit():
            return program_id

    for value in (item.get("url"), item.get("seriesHp")):
        match = re.search(r"/allshows/series/(\d+)(?:/|$)", str(value or ""))
        if match:
            return match.group(1)
    return ""


def _program_url_from_item(item: dict, program_id: str) -> str:
    for value in (item.get("url"), item.get("seriesHp")):
        url = _clean_text(value)
        if url and "/allshows/series/" in url:
            return _normalize_url(url)
    return _normalize_url(f"/allshows/series/{program_id}/")


def _program_title_from_item(item: dict) -> str:
    return (
        _clean_text(item.get("seriesName"))
        or _clean_text(item.get("name"))
        or _clean_text(item.get("title"))
    )


def _program_description_from_item(item: dict) -> str:
    metas = item.get("metas") if isinstance(item.get("metas"), dict) else {}
    return (
        _clean_text(item.get("description"))
        or _clean_text(_meta_value(metas.get("LongSummary")))
        or _clean_text(_meta_value(metas.get("ShortSummary")))
    )


def _program_from_catalog_item(item: dict) -> ReshetProgram | None:
    if not isinstance(item, dict):
        return None
    metas = item.get("metas") if isinstance(item.get("metas"), dict) else {}
    media_type = _clean_text(_meta_value(metas.get("MediaType"))).casefold()
    if media_type == "episode":
        return None
    if media_type and media_type != "series":
        return None
    if not media_type and item.get("seriesId") is None:
        return None
    program_id = _program_id_from_item(item)
    title = _program_title_from_item(item)
    if not program_id or not title:
        return None
    return ReshetProgram(
        id=program_id,
        title=title,
        description=_program_description_from_item(item),
        url=_program_url_from_item(item, program_id),
        image=_first_image(item.get("images")),
        program_format=_pick_first_labels(item, ("programFormat", "format", "contentType", "type")),
        program_genre=_pick_first_labels(item, ("programGenre", "genre", "genres", "category", "categories", "tags")),
    )


def _walk_dicts(value: object):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _walk_dicts(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk_dicts(child)


def _extract_catalog_programs(data: dict) -> list[ReshetProgram]:
    programs_by_id: dict[str, ReshetProgram] = {}
    page_props = (data or {}).get("pageProps") or (data or {}).get("props", {}).get("pageProps") or {}

    for item in _walk_dicts(page_props):
        program = _program_from_catalog_item(item)
        if not program:
            continue
        existing = programs_by_id.get(program.id)
        if existing and (
            existing.image
            and existing.description
            and "/allshows/series/" in existing.url
        ):
            continue
        programs_by_id[program.id] = program

    return list(programs_by_id.values())


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


def _flatten_label_values(value: object) -> list[str]:
    if not value:
        return []
    if isinstance(value, str):
        return [_clean_text(value)]
    if isinstance(value, dict):
        labels = []
        for key in ("name", "title", "label", "value", "text"):
            label = _clean_text(value.get(key))
            if label:
                labels.append(label)
        return labels
    if isinstance(value, list):
        labels = []
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


def fetch_reshet_programs() -> list[ReshetProgram]:
    build_id = _get_build_id(RESHET_ALLSHOWS_URL)
    if not build_id:
        build_id = _get_build_id(RESHET_ALLSHOWS_FALLBACK_URL)
    if not build_id:
        return []

    programs_by_id: dict[str, ReshetProgram] = {}

    for url in (
        _allshows_data_url(build_id),
        _allshows_data_url(build_id, fallback=True),
    ):
        try:
            data = _fetch_json(url)
        except Exception:
            continue
        for program in _extract_catalog_programs(data):
            programs_by_id.setdefault(program.id, program)

    for program_id in RESHET_EXTRA_SERIES_IDS:
        if program_id in programs_by_id:
            continue
        try:
            data = _fetch_json(_series_data_url(build_id, program_id))
        except Exception:
            continue
        source_program = _extract_program(data)
        program = _program_from_catalog_item(source_program)
        if program:
            programs_by_id[program.id] = program

    return list(programs_by_id.values())


def _upsert_program(con: sqlite3.Connection, program: ReshetProgram) -> None:
    con.execute(
        """
        INSERT INTO reshet_programs (
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


def _upsert_season(con: sqlite3.Connection, season: ReshetSeason) -> None:
    con.execute(
        """
        INSERT INTO reshet_seasons (season_id, program_id, title, url, season_number, updated_at)
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


def _upsert_episode(con: sqlite3.Connection, episode: ReshetEpisode) -> None:
    con.execute(
        """
        INSERT INTO reshet_episodes (
            id, program_id, season_id, title, description, url, image, play_url,
            stream_url, kaltura_entry_id, published, published_timestamp,
            display_order, updated_at
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
            stream_url = COALESCE(NULLIF(excluded.stream_url, ''), reshet_episodes.stream_url),
            kaltura_entry_id = COALESCE(NULLIF(excluded.kaltura_entry_id, ''), reshet_episodes.kaltura_entry_id),
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
        FROM reshet_programs
        WHERE TRIM(COALESCE(program_genre, '')) != ''
           OR TRIM(COALESCE(program_format, '')) != ''
        """
    ).fetchall()
    categories_by_key: dict[str, str] = {}
    for row in rows:
        for category in _split_program_categories(row["program_genre"], row["program_format"]):
            categories_by_key.setdefault(category.casefold(), category)
    return sorted(categories_by_key.values(), key=str.casefold)


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
    item["streamUrl"] = item.get("stream_url") or ""
    item["playUrl"] = item.get("play_url") or item.get("url") or ""
    item["episodeName"] = item.get("title") or ""
    item["episodeOverview"] = item.get("description") or ""
    item["episodeImage"] = item.get("image") or ""
    item["streamEndpoint"] = f"{api_prefix}/reshet-vod/stream?episode_id={quote(item['id'])}"
    return item


def _program_from_row(row: sqlite3.Row) -> ReshetProgram:
    return ReshetProgram(
        id=row["id"],
        title=row["title"] or "",
        description=row["description"] or "",
        url=row["url"] or "",
        image=row["image"],
        program_format=row["program_format"],
        program_genre=row["program_genre"],
    )


def _upsert_programs_from_api(con: sqlite3.Connection) -> None:
    for program in fetch_reshet_programs():
        _upsert_program(con, program)
    con.commit()


def _extract_program(data: dict) -> dict:
    program = (data or {}).get("pageProps", {}).get("program", {})
    return program if isinstance(program, dict) else {}


def _parse_seasons(program: ReshetProgram, data: dict, build_id: str) -> list[ReshetSeason]:
    source_seasons = data.get("seasonsList") or []
    seasons: list[ReshetSeason] = []
    if isinstance(source_seasons, list):
        for index, season in enumerate(source_seasons, start=1):
            if not isinstance(season, dict):
                continue
            position = season.get("position")
            if position is None:
                position = index
            title = _clean_text(season.get("name")) or f"עונה {position}"
            season_id = f"{program.id}:s{position}"
            seasons.append(
                ReshetSeason(
                    program_id=program.id,
                    season_id=season_id,
                    title=title,
                    url=_season_data_url(build_id, program.id, position),
                    season_number=int(position) if str(position).isdigit() else index,
                )
            )

    if not seasons:
        seasons.append(
            ReshetSeason(
                program_id=program.id,
                season_id=f"{program.id}:single",
                title="פרקים",
                url=_series_data_url(build_id, program.id),
                season_number=None,
            )
        )
    return seasons


def _parse_episodes(program: ReshetProgram, season: ReshetSeason, data: dict) -> list[ReshetEpisode]:
    source_episodes = data.get("episodes") or []
    if not isinstance(source_episodes, list):
        return []

    episodes: list[ReshetEpisode] = []
    for display_order, episode in enumerate(source_episodes, start=1):
        if not isinstance(episode, dict):
            continue
        entry_id = str(episode.get("entryId") or episode.get("id") or "")
        if not entry_id:
            continue
        created_at = _normalize_unix_timestamp(episode.get("createDate") or episode.get("published"))
        title = _clean_text(episode.get("name")) or f"פרק {display_order}"
        play_url = f"--kaltura--{entry_id}==="
        episodes.append(
            ReshetEpisode(
                id=entry_id,
                program_id=program.id,
                season_id=season.season_id,
                title=title,
                description=_clean_text(episode.get("description")),
                url=_normalize_url(episode.get("url") or season.url or program.url),
                image=_first_image(episode.get("images")) or program.image,
                play_url=play_url,
                kaltura_entry_id=entry_id,
                published=_timestamp_to_date(created_at),
                published_timestamp=created_at or None,
                display_order=display_order,
            )
        )
    return episodes


def _scan_program(
    con: sqlite3.Connection,
    program_id: str,
    with_streams: bool = False,
    stream_limit: int = RESHET_VOD_STREAM_BATCH_SIZE,
) -> None:
    row = con.execute("SELECT * FROM reshet_programs WHERE id = ?", (program_id,)).fetchone()
    if not row:
        _upsert_programs_from_api(con)
        row = con.execute("SELECT * FROM reshet_programs WHERE id = ?", (program_id,)).fetchone()
    if not row:
        return

    build_id = _get_build_id()
    if not build_id:
        return

    program = _program_from_row(row)
    data = _fetch_json(_series_data_url(build_id, program.id))
    source_program = _extract_program(data)
    if not source_program:
        return

    program.description = program.description or _clean_text(source_program.get("description"))
    program.image = program.image or _first_image(source_program.get("images"))
    _upsert_program(con, program)

    resolved_streams = 0
    for season in _parse_seasons(program, source_program, build_id):
        _upsert_season(con, season)
        season_program = source_program
        if season.season_number is not None:
            try:
                season_program = _extract_program(_fetch_json(season.url)) or source_program
            except Exception:
                season_program = source_program

        for episode in _parse_episodes(program, season, season_program):
            if with_streams and resolved_streams < stream_limit:
                episode.stream_url = resolve_reshet_vod_stream(episode.play_url or episode.kaltura_entry_id or "")
                resolved_streams += 1 if episode.stream_url else 0
            _upsert_episode(con, episode)

    con.execute(
        "UPDATE reshet_programs SET last_full_scan_at = CURRENT_TIMESTAMP WHERE id = ?",
        (program_id,),
    )
    con.commit()


def refresh_reshet_vod_catalog(
    with_details: bool = False,
    limit_programs: int | None = None,
    with_streams: bool = False,
    verbose: bool = False,
) -> dict:
    if verbose:
        print("Fetching Reshet VOD catalog...", flush=True)
    programs = _with_retries(fetch_reshet_programs)
    if verbose:
        print(f"Found {len(programs)} Reshet VOD programs", flush=True)
    con = _connect()
    scanned = 0
    errors: list[dict] = []
    try:
        for program in programs:
            _upsert_program(con, program)
        con.commit()

        if with_details:
            selected_programs = programs[:limit_programs] if limit_programs else programs
            for index, program in enumerate(selected_programs, start=1):
                if verbose:
                    print(f"[{index}/{len(selected_programs)}] Reshet program: {program.title} ({program.id})", flush=True)
                try:
                    _scan_program(con, program.id, with_streams=with_streams)
                    scanned += 1
                except Exception as ex:
                    if verbose:
                        print(f"  Failed: {ex}", flush=True)
                    errors.append({"programId": program.id, "title": program.title, "error": str(ex)})

        return {
            "db": RESHET_VOD_DB_PATH,
            "programs": len(programs),
            "scanned": scanned,
            "errors": errors,
        }
    finally:
        con.close()


def scan_reshet_vod_programs_without_episodes(
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
            FROM reshet_programs p
            LEFT JOIN reshet_episodes e ON e.program_id = p.id
            GROUP BY p.id, p.title
            HAVING COUNT(e.id) = 0
            ORDER BY p.title
        """
        rows = con.execute(query + (" LIMIT ?" if limit else ""), (limit,) if limit else ()).fetchall()

        if verbose:
            print(f"Reshet ensure episodes: {len(rows)} programs without episodes", flush=True)

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


def get_reshet_vod_series(
    refresh: bool = False,
    query: str = "",
    category: object = "",
    limit: int = 60,
    offset: int = 0,
) -> dict:
    con = _connect()
    error = None
    try:
        has_programs = con.execute("SELECT 1 FROM reshet_programs LIMIT 1").fetchone() is not None
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
        all_rows = con.execute(
            f"""
            SELECT
                p.*,
                COUNT(DISTINCT s.season_id) AS season_count,
                COUNT(DISTINCT e.id) AS episode_count,
                COUNT(DISTINCT CASE WHEN e.stream_url IS NOT NULL AND e.stream_url != '' THEN e.id END) AS stream_count,
                MAX(e.published_timestamp) AS latest_episode_timestamp,
                MAX(NULLIF(e.published, '')) AS latest_episode_published
            FROM reshet_programs p
            LEFT JOIN reshet_seasons s ON s.program_id = p.id
            LEFT JOIN reshet_episodes e ON e.program_id = p.id
            {where_sql}
            GROUP BY p.id
            ORDER BY
                CASE WHEN COUNT(DISTINCT e.id) > 0 THEN 0 ELSE 1 END,
                latest_episode_timestamp IS NULL,
                latest_episode_timestamp DESC,
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
            "db": RESHET_VOD_DB_PATH,
            "provider": "reshet",
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


def get_reshet_vod_series_details(
    program_id: str,
    api_prefix: str = "",
    refresh: bool = False,
    with_streams: bool = False,
    stream_limit: int = RESHET_VOD_STREAM_BATCH_SIZE,
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
            FROM reshet_programs p
            LEFT JOIN reshet_seasons s ON s.program_id = p.id
            LEFT JOIN reshet_episodes e ON e.program_id = p.id
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
                FROM reshet_programs p
                LEFT JOIN reshet_seasons s ON s.program_id = p.id
                LEFT JOIN reshet_episodes e ON e.program_id = p.id
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
            FROM reshet_programs p
            LEFT JOIN reshet_seasons s ON s.program_id = p.id
            LEFT JOIN reshet_episodes e ON e.program_id = p.id
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
            FROM reshet_seasons
            WHERE program_id = ?
            ORDER BY season_number IS NULL, season_number DESC, title DESC
            """,
            (program_id,),
        ).fetchall()
        episodes = con.execute(
            """
            SELECT *
            FROM reshet_episodes
            WHERE program_id = ?
            ORDER BY
                season_id DESC,
                display_order IS NULL,
                display_order ASC,
                published_timestamp DESC
            """,
            (program_id,),
        ).fetchall()
        return {
            **_program_to_dict(program),
            "provider": "reshet",
            "seasons": [_season_to_dict(row) for row in seasons],
            "episodes": [_episode_to_dict(row, api_prefix=api_prefix) for row in episodes],
            "error": error,
        }
    finally:
        con.close()


def get_reshet_vod_next_episode(episode_id: str, api_prefix: str = "") -> dict | None:
    con = _connect()
    try:
        current = con.execute(
            "SELECT id, program_id FROM reshet_episodes WHERE id = ?",
            (episode_id,),
        ).fetchone()
        if not current:
            return None
        episodes = con.execute(
            """
            SELECT *
            FROM reshet_episodes
            WHERE program_id = ?
            ORDER BY
                season_id ASC,
                display_order IS NULL,
                display_order ASC,
                published_timestamp ASC
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


def get_reshet_vod_recent_episodes(limit: int = 10) -> list[dict]:
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
            FROM reshet_episodes e
            JOIN reshet_programs p ON p.id = e.program_id
            LEFT JOIN reshet_seasons s ON s.season_id = e.season_id
            ORDER BY
                e.published_timestamp IS NULL,
                e.published_timestamp DESC,
                e.updated_at DESC,
                e.display_order DESC
            LIMIT ?
            """,
            (max(1, int(limit or 10)),),
        ).fetchall()
        return [_row_to_dict(row) for row in rows]
    finally:
        con.close()


def _entry_id_from_play_url(play_url: str) -> str:
    match = re.search(r"--kaltura--(.+?)===", play_url or "")
    return match.group(1) if match else play_url


def resolve_reshet_vod_stream(play_url: str) -> str | None:
    entry_id = _entry_id_from_play_url(play_url)
    if not entry_id:
        return None
    payload = {
        "1": {
            "service": "session",
            "action": "startWidgetSession",
            "widgetId": f"_{RESHET_KALTURA_PARTNER_ID}",
        },
        "2": {
            "service": "baseEntry",
            "action": "list",
            "ks": "{1:result:ks}",
            "filter": {
                "objectType": "KalturaBaseEntryFilter",
                "redirectFromEntryId": entry_id,
            },
        },
        "3": {
            "service": "baseEntry",
            "action": "getPlaybackContext",
            "entryId": "{2:result:objects:0:id}",
            "ks": "{1:result:ks}",
            "contextDataParams": {
                "objectType": "KalturaContextDataParams",
                "flavorTags": "all",
            },
        },
        "ks": "",
        "clientTag": "html5:v1",
        "apiVersion": "3.3.0",
        "format": 1,
        "ignoreNull": 1,
    }
    try:
        response = requests.post(
            "https://cdnapisec.kaltura.com/api_v3/service/multirequest",
            json=payload,
            params={"partnerId": RESHET_KALTURA_PARTNER_ID},
            headers={**RESHET_HEADERS, "Referer": RESHET_BASE_URL},
            timeout=30,
        )
        response.raise_for_status()
        result = response.json()
        sources = result[2].get("sources") if isinstance(result, list) and len(result) > 2 else []
        for source in sources or []:
            if source.get("format") == "applehttp" and source.get("url"):
                return source["url"]
    except Exception:
        return None
    return None


def get_reshet_vod_stream(episode_id: str) -> str | None:
    con = _connect()
    try:
        row = con.execute("SELECT * FROM reshet_episodes WHERE id = ?", (episode_id,)).fetchone()
        if not row:
            return None
        if row["stream_url"]:
            return row["stream_url"]

        stream_url = _with_retries(lambda: resolve_reshet_vod_stream(row["play_url"] or row["kaltura_entry_id"] or ""))
        if stream_url:
            con.execute(
                """
                UPDATE reshet_episodes
                SET stream_url = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (stream_url, episode_id),
            )
            con.commit()
        return stream_url
    finally:
        con.close()
