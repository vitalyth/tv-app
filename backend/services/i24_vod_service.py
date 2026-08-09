import os
import sqlite3
import time
import uuid
from datetime import datetime
from urllib.parse import quote

import requests


I24_VOD_DB_PATH = os.getenv("I24_VOD_DB_PATH", os.getenv("KAN_VOD_DB_PATH", "db/kan_vod.db"))
I24_VOD_RETRIES = int(os.getenv("I24_VOD_RETRIES", os.getenv("KAN_VOD_RETRIES", "3")))
I24_VOD_RETRY_DELAY_SECONDS = float(
    os.getenv("I24_VOD_RETRY_DELAY_SECONDS", os.getenv("KAN_VOD_RETRY_DELAY_SECONDS", "1"))
)
I24_VOD_VIDEO_LIMIT = int(os.getenv("I24_VOD_VIDEO_LIMIT", "200"))
I24_VOD_SCAN_LOCALES = tuple(
    item.strip().lower()
    for item in os.getenv("I24_VOD_SCAN_LOCALES", "en,fr,ar,he").split(",")
    if item.strip()
)

I24_API_BASE = "https://api.i24news.tv/v2"
I24_SITE_BASE = "https://www.i24news.tv"
I24_INSIGHT_BASE = "https://insight-api-shared.univtec.com"
I24_PAGE_IDS_BY_LOCALE = {
    "he": (
        "69f9ca198e30f6eed684bc60",
        "6a1576616b920109d9fa25c4",
    ),
}
I24_SECTION_MAX_PAGES = int(os.getenv("I24_SECTION_MAX_PAGES", "8"))
I24_SECTION_PAGE_LIMIT = int(os.getenv("I24_SECTION_PAGE_LIMIT", "25"))
I24_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    ),
    "Referer": f"{I24_SITE_BASE}/",
}
I24_LOCALE_LABELS = {
    "en": "i24NEWS English",
    "fr": "i24NEWS Français",
    "ar": "i24NEWS العربية",
    "he": "i24NEWS עברית",
}
I24_LOCALE_PATHS = {
    "en": "/en/i24news-plus",
    "fr": "/fr/i24news-plus",
    "ar": "/ar/بلس-i24news",
    "he": "/he",
}


def _with_retries(action):
    last_error = None
    for attempt in range(1, I24_VOD_RETRIES + 1):
        try:
            return action()
        except Exception as ex:
            last_error = ex
            if attempt < I24_VOD_RETRIES:
                time.sleep(I24_VOD_RETRY_DELAY_SECONDS * attempt)

    if last_error:
        raise last_error
    raise RuntimeError("i24 VOD operation failed")


def _connect() -> sqlite3.Connection:
    parent = os.path.dirname(I24_VOD_DB_PATH)
    if parent:
        os.makedirs(parent, exist_ok=True)
    con = sqlite3.connect(I24_VOD_DB_PATH)
    con.row_factory = sqlite3.Row
    _init_db(con)
    return con


def _init_db(con: sqlite3.Connection) -> None:
    con.executescript(
        """
        CREATE TABLE IF NOT EXISTS i24_programs (
            id TEXT PRIMARY KEY,
            locale TEXT NOT NULL,
            source_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            url TEXT NOT NULL,
            image TEXT,
            program_format TEXT,
            program_genre TEXT,
            latest_episode_published TEXT,
            latest_episode_timestamp REAL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS i24_seasons (
            season_id TEXT PRIMARY KEY,
            program_id TEXT NOT NULL,
            title TEXT,
            url TEXT,
            season_number INTEGER,
            latest_episode_published TEXT,
            latest_episode_timestamp REAL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS i24_episodes (
            id TEXT PRIMARY KEY,
            source_id TEXT NOT NULL,
            program_id TEXT NOT NULL,
            season_id TEXT,
            title TEXT NOT NULL,
            description TEXT,
            url TEXT,
            image TEXT,
            play_url TEXT,
            stream_url TEXT,
            published TEXT,
            published_timestamp REAL,
            display_order INTEGER,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_i24_programs_locale ON i24_programs(locale);
        CREATE INDEX IF NOT EXISTS idx_i24_programs_latest ON i24_programs(latest_episode_timestamp);
        CREATE INDEX IF NOT EXISTS idx_i24_episodes_program ON i24_episodes(program_id);
        CREATE INDEX IF NOT EXISTS idx_i24_episodes_season ON i24_episodes(season_id);
        CREATE INDEX IF NOT EXISTS idx_i24_episodes_latest ON i24_episodes(published_timestamp);
        """
    )
    con.commit()


def _clean_text(value) -> str:
    if value is None:
        return ""
    return " ".join(str(value).replace("\u200f", "").replace("\u200e", "").split())


def _absolute_i24_url(path: str | None, locale: str = "en") -> str:
    if not path:
        return I24_SITE_BASE + I24_LOCALE_PATHS.get(locale, "/")
    if path.startswith("//"):
        return "https:" + path
    if path.startswith("http://") or path.startswith("https://"):
        return path
    if path.startswith("/"):
        return I24_SITE_BASE + path
    return I24_SITE_BASE + "/" + path


def _image_from(value) -> str:
    if not value:
        return ""
    if isinstance(value, str):
        return _absolute_i24_url(value) if value.startswith(("/", "http", "//")) else value
    if isinstance(value, dict):
        for key in ("href", "url", "src", "posterUrl", "imageUrl", "thumbnailUrl"):
            image = _image_from(value.get(key))
            if image:
                return image
        for key in ("image", "thumbnail", "cover", "picture", "mainImage"):
            image = _image_from(value.get(key))
            if image:
                return image
    return ""


def _published_from_video(video: dict) -> tuple[str, float | None]:
    for key in ("publishedAt", "publicationDate", "published", "createdAt", "updatedAt"):
        value = video.get(key)
        if not value:
            continue
        text = _clean_text(value)
        timestamp = _parse_timestamp(text)
        return text, timestamp
    return "", None


def _parse_timestamp(value: str | None) -> float | None:
    if not value:
        return None
    text = value.strip()
    if text.isdigit():
        number = float(text)
        return number / 1000 if number > 9999999999 else number
    for candidate in (text, text.replace("Z", "+00:00")):
        try:
            return datetime.fromisoformat(candidate).timestamp()
        except ValueError:
            pass
    return None


def _insight_headers(locale: str, *, page_request: bool = False, verbose_items: bool = False) -> dict:
    region_code = {"en": "english", "fr": "french", "ar": "arabic", "he": "hebrew"}.get(locale, "english")
    profile_id = str(uuid.uuid4())
    headers = {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "he-IL,he;q=0.9,en;q=0.8" if locale == "he" else "en-US,en;q=0.9",
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
        ),
        "Referer": "https://video.i24news.tv/",
        "Origin": "https://video.i24news.tv",
        "platform": "web",
        "x-tenant-id": "i24israel",
        "x-device-type": "web",
        "x-device": f"{profile_id};MacIntel;10_15_7;1.0.0;Google Chrome",
        "x-profile-id": profile_id,
        "regioncode": region_code,
    }
    if page_request:
        headers["x-no-items"] = "1"
    if verbose_items:
        headers["x-no-verbose-items"] = "ok"
    return headers


def _fetch_json(url: str):
    def action():
        response = requests.get(url, headers=I24_HEADERS, timeout=30)
        if response.status_code == 204:
            return []
        response.raise_for_status()
        return response.json()

    return _with_retries(action)


def _fetch_insight_json(locale: str, path: str, *, page_request: bool = False, verbose_items: bool = False):
    def action():
        response = requests.get(
            f"{I24_INSIGHT_BASE}/{path.lstrip('/')}",
            headers=_insight_headers(locale, page_request=page_request, verbose_items=verbose_items),
            timeout=30,
        )
        if response.status_code == 204:
            return []
        response.raise_for_status()
        return response.json()

    return _with_retries(action)


def _fetch_i24_shows(locale: str) -> list[dict]:
    data = _fetch_json(f"{I24_API_BASE}/{locale}/tv-shows?isI24NewsPlus=1")
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get("items") or data.get("data") or data.get("results") or []
    return []


def _fetch_i24_videos(locale: str, show_id: str, limit: int | None = None) -> list[dict]:
    video_limit = limit or I24_VOD_VIDEO_LIMIT
    data = _fetch_json(f"{I24_API_BASE}/{locale}/tv-shows/{show_id}/videos?limit={video_limit}")
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get("items") or data.get("data") or data.get("results") or []
    return []


def _fetch_i24_page(locale: str, page_id: str) -> dict:
    data = _fetch_insight_json(locale, f"interface/pages/{page_id}", page_request=True)
    if isinstance(data, dict):
        return data
    return {}


def _fetch_i24_section_items(locale: str, section_id: str, *, max_pages: int = I24_SECTION_MAX_PAGES, page_limit: int = I24_SECTION_PAGE_LIMIT) -> list[dict]:
    items: list[dict] = []
    for page in range(1, max_pages + 1):
        data = _fetch_insight_json(
            locale,
            f"interface/pages/section/{section_id}?page={page}&limit={page_limit}",
            verbose_items=True,
        )
        if not isinstance(data, dict):
            break

        page_items = data.get("items") or []
        if not page_items:
            break

        items.extend(page_items)
        if len(page_items) < page_limit:
            break

    return items


def _fetch_i24_section(locale: str, section_id: str) -> dict:
    items = _fetch_i24_section_items(locale, section_id)
    return {"sectionId": section_id, "items": items}


def _build_programs_from_page_sections(locale: str, page_id: str, page_payload: dict, section_payloads: list[dict]) -> list[dict]:
    programs: list[dict] = []
    page_url = f"https://video.i24news.tv/r/hebrew/page/{page_id}" if locale == "he" else f"https://video.i24news.tv/r/{locale}/page/{page_id}"
    sections = page_payload.get("sections") or []
    if not sections and section_payloads:
        sections = [{"title": payload.get("title"), "sectionId": payload.get("sectionId")} for payload in section_payloads]

    for index, section in enumerate(sections):
        section_id = str(section.get("sectionId") or "").strip()
        if not section_id:
            continue

        section_payload = next(
            (payload for payload in section_payloads if str(payload.get("sectionId") or "").strip() == section_id),
            None,
        )
        if section_payload is None:
            section_payload = {"sectionId": section_id, "items": []}

        title = _clean_text(section.get("title")) or f"Program {index + 1}"
        program = {
            "id": f"{locale}:{section_id}",
            "locale": locale,
            "source_id": section_id,
            "title": title,
            "description": _clean_text(section.get("description") or section.get("title")),
            "url": page_url,
            "image": "",
            "program_format": "VOD",
            "program_genre": I24_LOCALE_LABELS.get(locale, "i24NEWS"),
            "episodes": [],
        }

        for episode_index, item in enumerate(section_payload.get("items") or []):
            episode = _episode_from_page_item(locale, program["id"], section_id, item, episode_index)
            if episode["source_id"]:
                if not program["image"]:
                    program["image"] = episode.get("image", "")
                program["episodes"].append(episode)

        programs.append(program)

    return programs


def _episode_from_page_item(locale: str, program_id: str, season_id: str, item: dict, index: int) -> dict:
    source_id = str(item.get("id") or item.get("guid") or item.get("sourceId") or "").strip()
    if not source_id:
        source_id = f"{program_id}:{index}"
    title = _clean_text(item.get("title")) or f"פרק {index + 1}"
    description = _clean_text(item.get("description") or item.get("body"))
    image = _image_from(item.get("optimizedPoster")) or _image_from(item.get("optimizedImage")) or _image_from(item.get("image")) or _image_from(item.get("poster"))
    play_url = item.get("videoUrl") or item.get("sourceUrl") or item.get("streamUrl") or item.get("playUrl") or item.get("url")
    stream_url = play_url
    published = ""
    published_timestamp = None
    if item.get("published"):
        published, published_timestamp = _published_from_video(item)
    elif item.get("date"):
        published = str(item.get("date"))
        published_timestamp = _parse_timestamp(published)
    if not published_timestamp:
        published_timestamp = float(2_000_000_000 - index)

    return {
        "id": f"{locale}:{source_id}",
        "source_id": source_id,
        "program_id": program_id,
        "season_id": season_id,
        "title": title,
        "description": description,
        "url": _absolute_i24_url(item.get("link") or item.get("url"), locale),
        "image": image,
        "play_url": play_url,
        "stream_url": stream_url,
        "published": published,
        "published_timestamp": published_timestamp,
        "display_order": index,
    }


def _fetch_i24_page_programs(locale: str) -> list[dict]:
    page_ids = I24_PAGE_IDS_BY_LOCALE.get(locale, ())
    if not page_ids:
        return []

    programs: list[dict] = []
    for page_id in page_ids:
        page_payload = _fetch_i24_page(locale, page_id)
        sections = page_payload.get("sections") or []
        section_payloads = []
        for section in sections:
            section_id = str(section.get("sectionId") or "").strip()
            if not section_id:
                continue
            try:
                section_payload = _fetch_i24_section(locale, section_id)
            except Exception:
                section_payload = {"sectionId": section_id, "items": []}
            section_payloads.append(section_payload)

        programs.extend(_build_programs_from_page_sections(locale, page_id, page_payload, section_payloads))

    return programs


def _program_from_show(locale: str, show: dict) -> dict:
    source_id = str(show.get("id") or "").strip()
    title = _clean_text(show.get("title")) or I24_LOCALE_LABELS.get(locale, "i24NEWS Plus")
    description = _clean_text(show.get("body") or show.get("description"))
    image = _image_from(show.get("image")) or _image_from(show.get("thumbnail"))
    program_id = f"{locale}:{source_id}"
    return {
        "id": program_id,
        "locale": locale,
        "source_id": source_id,
        "title": title if title != "i24NEWS Plus" else I24_LOCALE_LABELS.get(locale, title),
        "description": description,
        "url": _absolute_i24_url(show.get("link"), locale),
        "image": image,
        "program_format": "VOD",
        "program_genre": I24_LOCALE_LABELS.get(locale, "i24NEWS"),
    }


def _episode_from_video(locale: str, program_id: str, season_id: str, video: dict, index: int) -> dict:
    source_id = str(video.get("id") or "").strip()
    title = _clean_text(video.get("title")) or f"פרק {index + 1}"
    description = _clean_text(video.get("description") or video.get("body"))
    image = _image_from(video.get("posterUrl")) or _image_from(video.get("image"))
    stream_url = _absolute_i24_url(video.get("sourceUrl") or "")
    published, published_timestamp = _published_from_video(video)
    if published_timestamp is None:
        published_timestamp = float(2_000_000_000 - index)

    return {
        "id": f"{locale}:{source_id}",
        "source_id": source_id,
        "program_id": program_id,
        "season_id": season_id,
        "title": title,
        "description": description,
        "url": _absolute_i24_url(video.get("link") or video.get("url"), locale),
        "image": image,
        "play_url": stream_url,
        "stream_url": stream_url,
        "published": published,
        "published_timestamp": published_timestamp,
        "display_order": index,
    }


def _season_info_for_episode(locale: str, program_id: str, episode: dict, index: int) -> dict:
    published = _clean_text(
        episode.get("published")
        or episode.get("publishedAt")
        or episode.get("publicationDate")
        or episode.get("date")
        or episode.get("createdAt")
        or episode.get("updatedAt")
        or ""
    )
    published_timestamp = episode.get("published_timestamp")
    if published_timestamp is None:
        published_timestamp = episode.get("publishedTimestamp")
    if published_timestamp is None:
        published_timestamp = _parse_timestamp(published)
    if published_timestamp is None and episode.get("publishDate"):
        published_timestamp = _parse_timestamp(str(episode.get("publishDate")))
    if published_timestamp is None:
        published_timestamp = float(2_000_000_000 - index)

    dt = None
    if published_timestamp is not None:
        try:
            dt = datetime.utcfromtimestamp(float(published_timestamp))
        except (TypeError, ValueError):
            dt = None

    if dt is None:
        month_key = f"unknown-{index}"
        title = "פרקים"
        season_number = 1
    else:
        month_key = f"{dt.year:04d}-{dt.month:02d}"
        season_number = dt.month
        if locale == "he":
            months = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"]
            title = f"{months[dt.month - 1]} {dt.year}"
        else:
            title = dt.strftime("%B %Y")

    season_id = f"{program_id}:{month_key}"
    return {
        "season_id": season_id,
        "title": title,
        "season_number": season_number,
        "url": "",
    }


def _upsert_program(con: sqlite3.Connection, program: dict) -> None:
    con.execute(
        """
        INSERT INTO i24_programs (
            id, locale, source_id, title, description, url, image,
            program_format, program_genre, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            locale=excluded.locale,
            source_id=excluded.source_id,
            title=excluded.title,
            description=excluded.description,
            url=excluded.url,
            image=excluded.image,
            program_format=excluded.program_format,
            program_genre=excluded.program_genre,
            updated_at=CURRENT_TIMESTAMP
        """,
        (
            program["id"],
            program["locale"],
            program["source_id"],
            program["title"],
            program["description"],
            program["url"],
            program["image"],
            program["program_format"],
            program["program_genre"],
        ),
    )


def _upsert_season(con: sqlite3.Connection, season: dict) -> None:
    con.execute(
        """
        INSERT INTO i24_seasons (
            season_id, program_id, title, url, season_number, updated_at
        )
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(season_id) DO UPDATE SET
            program_id=excluded.program_id,
            title=excluded.title,
            url=excluded.url,
            season_number=excluded.season_number,
            updated_at=CURRENT_TIMESTAMP
        """,
        (
            season["season_id"],
            season["program_id"],
            season["title"],
            season["url"],
            season["season_number"],
        ),
    )


def _upsert_episode(con: sqlite3.Connection, episode: dict) -> None:
    con.execute(
        """
        INSERT INTO i24_episodes (
            id, source_id, program_id, season_id, title, description, url, image,
            play_url, stream_url, published, published_timestamp, display_order, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            source_id=excluded.source_id,
            program_id=excluded.program_id,
            season_id=excluded.season_id,
            title=excluded.title,
            description=excluded.description,
            url=excluded.url,
            image=excluded.image,
            play_url=excluded.play_url,
            stream_url=excluded.stream_url,
            published=excluded.published,
            published_timestamp=excluded.published_timestamp,
            display_order=excluded.display_order,
            updated_at=CURRENT_TIMESTAMP
        """,
        (
            episode["id"],
            episode["source_id"],
            episode["program_id"],
            episode["season_id"],
            episode["title"],
            episode["description"],
            episode["url"],
            episode["image"],
            episode["play_url"],
            episode["stream_url"],
            episode["published"],
            episode["published_timestamp"],
            episode["display_order"],
        ),
    )


def _update_latest(con: sqlite3.Connection, program_id: str, season_id: str) -> None:
    program_latest = con.execute(
        """
        SELECT published, published_timestamp
        FROM i24_episodes
        WHERE program_id = ?
        ORDER BY COALESCE(published_timestamp, 0) DESC, display_order ASC
        LIMIT 1
        """,
        (program_id,),
    ).fetchone()
    season_latest = con.execute(
        """
        SELECT published, published_timestamp
        FROM i24_episodes
        WHERE program_id = ? AND season_id = ?
        ORDER BY COALESCE(published_timestamp, 0) DESC, display_order ASC
        LIMIT 1
        """,
        (program_id, season_id),
    ).fetchone()
    if not program_latest and not season_latest:
        return

    if program_latest:
        con.execute(
            """
            UPDATE i24_programs
            SET latest_episode_published = ?, latest_episode_timestamp = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (program_latest["published"], program_latest["published_timestamp"], program_id),
        )
    if season_latest:
        con.execute(
            """
            UPDATE i24_seasons
            SET latest_episode_published = ?, latest_episode_timestamp = ?, updated_at = CURRENT_TIMESTAMP
            WHERE season_id = ?
            """,
            (season_latest["published"], season_latest["published_timestamp"], season_id),
        )


def refresh_i24_vod_catalog(
    with_details: bool = True,
    limit_programs: int | None = None,
    with_streams: bool = False,
    verbose: bool = False,
) -> dict:
    programs_scanned = 0
    episodes_scanned = 0
    errors: list[str] = []

    with _connect() as con:
        for locale in I24_VOD_SCAN_LOCALES:
            page_programs: list[dict] = []
            if locale in I24_PAGE_IDS_BY_LOCALE:
                try:
                    page_programs = _fetch_i24_page_programs(locale)
                except Exception as ex:
                    errors.append(f"{locale}: page source {ex}")
                    page_programs = []

            shows: list[dict] = []
            if not page_programs:
                try:
                    shows = _fetch_i24_shows(locale)
                except Exception as ex:
                    errors.append(f"{locale}: {ex}")
                    shows = []

            items = page_programs if page_programs else shows

            if limit_programs:
                remaining = max(limit_programs - programs_scanned, 0)
                if remaining <= 0:
                    break
                items = items[:remaining]

            for item in items:
                if page_programs and "episodes" in item:
                    program = {
                        "id": item["id"],
                        "locale": locale,
                        "source_id": item["source_id"],
                        "title": item["title"],
                        "description": item["description"],
                        "url": item["url"],
                        "image": item["image"],
                        "program_format": item.get("program_format", "VOD"),
                        "program_genre": item.get("program_genre", I24_LOCALE_LABELS.get(locale, "i24NEWS")),
                    }
                    _upsert_program(con, program)
                    con.execute("DELETE FROM i24_seasons WHERE program_id = ?", (program["id"],))
                    programs_scanned += 1

                    if verbose:
                        print(f"i24 program: {program['title']} ({program['id']})", flush=True)

                    if not with_details:
                        continue

                    seen_episode_ids: set[str] = set()
                    seasons_by_id: dict[str, dict] = {}
                    for index, episode_data in enumerate(item.get("episodes", [])):
                        episode_id = episode_data.get("id") or f"{locale}:{item['source_id']}:{index}"
                        if episode_id in seen_episode_ids:
                            continue
                        seen_episode_ids.add(episode_id)

                        season_info = _season_info_for_episode(locale, program["id"], episode_data, index)
                        seasons_by_id.setdefault(season_info["season_id"], season_info)

                        episode = {
                            **episode_data,
                            "program_id": program["id"],
                            "season_id": season_info["season_id"],
                        }
                        _upsert_episode(con, episode)
                        episodes_scanned += 1

                    for season_info in seasons_by_id.values():
                        season = {
                            "season_id": season_info["season_id"],
                            "program_id": program["id"],
                            "title": season_info["title"],
                            "url": program["url"],
                            "season_number": season_info["season_number"],
                        }
                        _upsert_season(con, season)
                        _update_latest(con, program["id"], season_info["season_id"])
                    continue

                source_id = str(item.get("id") or "").strip()
                if not source_id:
                    continue

                program = _program_from_show(locale, item)
                _upsert_program(con, program)
                con.execute("DELETE FROM i24_seasons WHERE program_id = ?", (program["id"],))
                programs_scanned += 1

                if verbose:
                    print(f"i24 program: {program['title']} ({program['id']})", flush=True)

                if not with_details:
                    continue

                try:
                    videos = _fetch_i24_videos(locale, source_id)
                except Exception as ex:
                    errors.append(f"{program['id']}: {ex}")
                    continue

                seen_episode_ids: set[str] = set()
                seasons_by_id: dict[str, dict] = {}
                for index, video in enumerate(videos):
                    episode_source_id = str(video.get("id") or "").strip()
                    if not episode_source_id:
                        continue
                    episode_id = f"{locale}:{episode_source_id}"
                    if episode_id in seen_episode_ids:
                        continue
                    seen_episode_ids.add(episode_id)

                    season_info = _season_info_for_episode(locale, program["id"], video, index)
                    seasons_by_id.setdefault(season_info["season_id"], season_info)

                    episode = _episode_from_video(locale, program["id"], season_info["season_id"], video, index)
                    episode["season_id"] = season_info["season_id"]
                    _upsert_episode(con, episode)
                    episodes_scanned += 1

                for season_info in seasons_by_id.values():
                    season = {
                        "season_id": season_info["season_id"],
                        "program_id": program["id"],
                        "title": season_info["title"],
                        "url": program["url"],
                        "season_number": season_info["season_number"],
                    }
                    _upsert_season(con, season)
                    _update_latest(con, program["id"], season_info["season_id"])

        con.commit()

    return {
        "programsScanned": programs_scanned,
        "episodesScanned": episodes_scanned,
        "errors": errors,
        "returnCode": 0 if not errors else 1,
    }


def scan_i24_vod_programs_without_episodes(
    limit: int = 0,
    with_streams: bool = False,
    verbose: bool = False,
) -> dict:
    missing: list[dict] = []
    with _connect() as con:
        rows = con.execute(
            """
            SELECT p.id, p.locale, p.source_id, p.title
            FROM i24_programs p
            LEFT JOIN i24_episodes e ON e.program_id = p.id
            GROUP BY p.id, p.locale, p.source_id, p.title
            HAVING COUNT(e.id) = 0
            ORDER BY p.title
            """
        ).fetchall()
        missing = [dict(row) for row in rows[:limit or None]]

    if not missing:
        return {"missingPrograms": 0, "scannedPrograms": 0, "episodesScanned": 0, "returnCode": 0}

    episodes_scanned = 0
    errors: list[str] = []
    with _connect() as con:
        for program in missing:
            if verbose:
                print(f"i24 ensure episodes: {program['title']} ({program['id']})", flush=True)
            try:
                videos = _fetch_i24_videos(program["locale"], program["source_id"])
            except Exception as ex:
                errors.append(f"{program['id']}: {ex}")
                continue

            con.execute("DELETE FROM i24_seasons WHERE program_id = ?", (program["id"],))

            seasons_by_id: dict[str, dict] = {}
            for index, video in enumerate(videos):
                season_info = _season_info_for_episode(program["locale"], program["id"], video, index)
                seasons_by_id.setdefault(season_info["season_id"], season_info)

                episode = _episode_from_video(program["locale"], program["id"], season_info["season_id"], video, index)
                episode["season_id"] = season_info["season_id"]
                _upsert_episode(con, episode)
                episodes_scanned += 1

            for season_info in seasons_by_id.values():
                season = {
                    "season_id": season_info["season_id"],
                    "program_id": program["id"],
                    "title": season_info["title"],
                    "url": "",
                    "season_number": season_info["season_number"],
                }
                _upsert_season(con, season)
                _update_latest(con, program["id"], season_info["season_id"])
        con.commit()

    return {
        "missingPrograms": len(missing),
        "scannedPrograms": len(missing) - len(errors),
        "episodesScanned": episodes_scanned,
        "errors": errors,
        "returnCode": 0 if not errors else 1,
    }


def _category_filter_sql(categories: list[str]) -> tuple[str, list[str]]:
    selected = [item.strip() for item in categories if item.strip()]
    if not selected:
        return "", []

    clauses = []
    params = []
    for category in selected:
        clauses.append("(p.program_genre = ? OR p.locale = ?)")
        params.extend([category, category])
    return " AND (" + " OR ".join(clauses) + ")", params


def get_i24_vod_series(
    refresh: bool = False,
    query: str = "",
    category: list[str] | None = None,
    limit: int = 60,
    offset: int = 0,
) -> dict:
    if refresh:
        refresh_i24_vod_catalog(with_details=True)

    categories = category or []
    where = ["episodeCount > 0"]
    params: list = []
    category_sql, category_params = _category_filter_sql(categories)
    search = _clean_text(query)
    if search:
        where.append("(p.title LIKE ? OR p.description LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])

    sql_where = "WHERE " + " AND ".join(where) + category_sql
    params.extend(category_params)

    with _connect() as con:
        all_categories = [
            row[0]
            for row in con.execute(
                """
                SELECT DISTINCT program_genre
                FROM i24_programs
                WHERE program_genre IS NOT NULL AND TRIM(program_genre) != ''
                ORDER BY program_genre
                """
            ).fetchall()
        ]

        base_query = """
            SELECT p.*, COUNT(DISTINCT e.id) AS episodeCount, COUNT(DISTINCT s.season_id) AS seasonCount,
                   COUNT(DISTINCT CASE WHEN e.stream_url IS NOT NULL AND TRIM(e.stream_url) != '' THEN e.id END) AS streamCount
            FROM i24_programs p
            LEFT JOIN i24_seasons s ON s.program_id = p.id
            LEFT JOIN i24_episodes e ON e.program_id = p.id
            GROUP BY p.id
        """
        total = con.execute(
            f"SELECT COUNT(*) FROM ({base_query}) p {sql_where}",
            params,
        ).fetchone()[0]

        rows = con.execute(
            f"""
            SELECT *
            FROM ({base_query}) p
            {sql_where}
            ORDER BY COALESCE(latest_episode_timestamp, 0) DESC, title COLLATE NOCASE
            LIMIT ? OFFSET ?
            """,
            [*params, limit, offset],
        ).fetchall()

    series = [_row_to_program(row) for row in rows]
    return {
        "db": I24_VOD_DB_PATH,
        "provider": "i24",
        "count": len(series),
        "total": total,
        "limit": limit,
        "offset": offset,
        "hasMore": offset + len(series) < total,
        "query": query,
        "category": ",".join(categories),
        "selectedCategories": categories,
        "categories": all_categories,
        "series": series,
    }


def _row_to_program(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "mainid": row["source_id"],
        "title": row["title"],
        "description": row["description"] or "",
        "url": row["url"] or "",
        "image": row["image"],
        "program_format": row["program_format"],
        "program_genre": row["program_genre"],
        "episodeCount": int(row["episodeCount"] or 0),
        "seasonCount": int(row["seasonCount"] or 0),
        "streamCount": int(row["streamCount"] or 0),
        "latestEpisodePublished": row["latest_episode_published"],
        "provider": "i24",
    }


def _row_to_season(row: sqlite3.Row) -> dict:
    return {
        "season_id": row["season_id"],
        "program_id": row["program_id"],
        "title": row["title"] or "פרקים",
        "url": row["url"] or "",
        "season_number": row["season_number"],
        "latest_episode_timestamp": row["latest_episode_timestamp"],
        "latest_episode_published": row["latest_episode_published"],
    }


def _row_to_episode(row: sqlite3.Row, api_prefix: str = "") -> dict:
    item = {
        "id": row["id"],
        "program_id": row["program_id"],
        "season_id": row["season_id"],
        "title": row["title"],
        "description": row["description"] or "",
        "url": row["url"] or "",
        "image": row["image"],
        "play_url": row["play_url"] or "",
        "stream_url": row["stream_url"] or "",
        "streamUrl": row["stream_url"] or "",
        "playUrl": row["play_url"] or "",
        "episodeName": row["title"],
        "episodeOverview": row["description"] or "",
        "episodeImage": row["image"] or "",
        "published": row["published"],
        "sourceType": "vod",
        "isCatchup": False,
    }
    item["streamEndpoint"] = f"{api_prefix}/i24-vod/stream?episode_id={quote(item['id'])}"
    return item


def get_i24_vod_series_details(
    program_id: str,
    api_prefix: str = "",
    refresh: bool = False,
    with_streams: bool = False,
    stream_limit: int = 20,
) -> dict | None:
    if refresh:
        refresh_i24_vod_catalog(with_details=True)

    with _connect() as con:
        program = con.execute(
            """
            SELECT p.*, COUNT(DISTINCT e.id) AS episodeCount, COUNT(DISTINCT s.season_id) AS seasonCount,
                   COUNT(DISTINCT CASE WHEN e.stream_url IS NOT NULL AND TRIM(e.stream_url) != '' THEN e.id END) AS streamCount
            FROM i24_programs p
            LEFT JOIN i24_seasons s ON s.program_id = p.id
            LEFT JOIN i24_episodes e ON e.program_id = p.id
            WHERE p.id = ?
            GROUP BY p.id
            """,
            (program_id,),
        ).fetchone()
        if not program:
            return None

        seasons = [
            _row_to_season(row)
            for row in con.execute(
                """
                SELECT *
                FROM i24_seasons
                WHERE program_id = ?
                ORDER BY COALESCE(latest_episode_timestamp, 0) DESC, season_number DESC
                """,
                (program_id,),
            ).fetchall()
        ]
        episodes = [
            _row_to_episode(row, api_prefix=api_prefix)
            for row in con.execute(
                """
                SELECT *
                FROM i24_episodes
                WHERE program_id = ?
                ORDER BY COALESCE(published_timestamp, 0) DESC, display_order ASC
                """,
                (program_id,),
            ).fetchall()
        ]

    details = _row_to_program(program)
    details["seasons"] = seasons
    details["episodes"] = episodes
    return details


def get_i24_vod_stream(episode_id: str) -> str | None:
    with _connect() as con:
        row = con.execute(
            "SELECT stream_url, play_url FROM i24_episodes WHERE id = ?",
            (episode_id,),
        ).fetchone()
    if not row:
        return None
    return row["stream_url"] or row["play_url"] or None


def get_i24_vod_next_episode(episode_id: str, api_prefix: str = "") -> dict | None:
    with _connect() as con:
        current = con.execute(
            "SELECT program_id, published_timestamp, display_order FROM i24_episodes WHERE id = ?",
            (episode_id,),
        ).fetchone()
        if not current:
            return None
        row = con.execute(
            """
            SELECT *
            FROM i24_episodes
            WHERE program_id = ?
              AND (
                COALESCE(published_timestamp, 0) < COALESCE(?, 0)
                OR (
                    COALESCE(published_timestamp, 0) = COALESCE(?, 0)
                    AND COALESCE(display_order, 0) > COALESCE(?, 0)
                )
              )
            ORDER BY COALESCE(published_timestamp, 0) DESC, display_order ASC
            LIMIT 1
            """,
            (
                current["program_id"],
                current["published_timestamp"],
                current["published_timestamp"],
                current["display_order"],
            ),
        ).fetchone()
    if not row:
        return None
    return {
        "programId": row["program_id"],
        "episode": _row_to_episode(row, api_prefix=api_prefix),
    }


def get_i24_vod_recent_episodes(limit: int = 10) -> list[dict]:
    with _connect() as con:
        return [
            dict(row)
            for row in con.execute(
                """
                SELECT e.*, p.title AS program_title, p.description AS program_description,
                       p.image AS program_image, s.title AS season_title
                FROM i24_episodes e
                JOIN i24_programs p ON p.id = e.program_id
                LEFT JOIN i24_seasons s ON s.season_id = e.season_id
                ORDER BY COALESCE(e.published_timestamp, 0) DESC, e.display_order ASC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        ]
