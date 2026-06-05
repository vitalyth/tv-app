import os
import re
import sqlite3
import time
from urllib.parse import quote

from scripts import kan_db_scanner


KAN_VOD_DB_PATH = os.getenv("KAN_VOD_DB_PATH", "db/kan_vod.db")
KAN_VOD_RETRIES = int(os.getenv("KAN_VOD_RETRIES", "3"))
KAN_VOD_RETRY_DELAY_SECONDS = float(os.getenv("KAN_VOD_RETRY_DELAY_SECONDS", "1"))
KAN_VOD_STREAM_BATCH_SIZE = int(os.getenv("KAN_VOD_STREAM_BATCH_SIZE", "20"))
CATEGORY_SPLIT_RE = re.compile(r"\s*(?:[,;|/•·،]+)\s*")


def _with_retries(action):
    last_error = None

    for attempt in range(1, KAN_VOD_RETRIES + 1):
        try:
            return action()
        except Exception as ex:
            last_error = ex
            if attempt == KAN_VOD_RETRIES:
                break
            time.sleep(KAN_VOD_RETRY_DELAY_SECONDS * attempt)

    if last_error:
        raise last_error

    raise RuntimeError("Kan VOD operation failed")


def _connect() -> sqlite3.Connection:
    kan_db_scanner.init_db(KAN_VOD_DB_PATH)
    con = kan_db_scanner.connect_db(KAN_VOD_DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def _row_to_dict(row: sqlite3.Row) -> dict:
    return dict(row)


def _program_to_dict(row: sqlite3.Row) -> dict:
    item = _row_to_dict(row)
    item["episodeCount"] = int(item.pop("episode_count", 0) or 0)
    item["seasonCount"] = int(item.pop("season_count", 0) or 0)
    item["streamCount"] = int(item.pop("stream_count", 0) or 0)
    item["latestKanEpisodeId"] = int(item.pop("latest_kan_episode_id", 0) or 0)
    item["latestEpisodePublished"] = item.pop("latest_episode_published", None)
    return item


def _split_program_categories(*values: object) -> list[str]:
    # Kan stores multiple labels in a single field, so normalize them into
    # stable single-category values for the UI and for filtering.
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
        FROM programs
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
    # FastAPI can pass repeated ?category= values as a list; callers may still
    # pass a comma-separated string, so handle both shapes in one place.
    if isinstance(category, (list, tuple)):
        values = category
    else:
        values = [category]

    categories: list[str] = []
    seen = set()
    for value in values:
        for item in _split_program_categories(value):
            key = item.casefold()
            if key not in seen:
                seen.add(key)
                categories.append(item)

    return categories


def _season_to_dict(row: sqlite3.Row) -> dict:
    return _row_to_dict(row)


def _episode_to_dict(row: sqlite3.Row, api_prefix: str = "") -> dict:
    item = _row_to_dict(row)
    item["streamUrl"] = item.get("stream_url") or ""
    item["playUrl"] = item.get("play_url") or item.get("url") or ""
    item["episodeName"] = item.get("title") or ""
    item["episodeOverview"] = item.get("description") or ""
    item["episodeImage"] = item.get("image") or ""
    item["streamEndpoint"] = f"{api_prefix}/kan-vod/stream?episode_id={quote(item['id'])}"
    return item


def _upsert_programs_from_api(con: sqlite3.Connection) -> None:
    for program in kan_db_scanner.fetch_all_programs():
        kan_db_scanner.upsert_program(con, program)
    con.commit()


def _scan_program(
    con: sqlite3.Connection,
    program_id: str,
    with_streams: bool = False,
    stream_limit: int = KAN_VOD_STREAM_BATCH_SIZE,
    update_existing: bool = True,
) -> None:
    row = con.execute("SELECT * FROM programs WHERE id = ?", (program_id,)).fetchone()
    program = None

    if row:
        program = kan_db_scanner.Program(
            id=row["id"],
            mainid=row["mainid"] or "",
            title=row["title"] or "",
            description=row["description"] or "",
            url=row["url"] or "",
            image=row["image"],
            program_format=row["program_format"],
            program_genre=row["program_genre"],
        )
    else:
        matches = [
            item for item in kan_db_scanner.fetch_all_programs()
            if item.id == program_id
        ]
        if matches:
            program = matches[0]
            kan_db_scanner.upsert_program(con, program)

    if not program:
        return

    existing_episode_ids = {
        row["id"]
        for row in con.execute(
            "SELECT id FROM episodes WHERE program_id = ?",
            (program_id,),
        ).fetchall()
    }

    seasons = kan_db_scanner.parse_seasons(program)

    resolved_streams = 0

    for season in seasons:
        kan_db_scanner.upsert_season(con, season)
        episodes = kan_db_scanner.parse_episodes_from_page(program, season)

        for display_order, episode in enumerate(episodes, start=1):
            episode.display_order = display_order
            episode_exists = episode.id in existing_episode_ids

            if episode_exists and not update_existing and not with_streams:
                continue

            if (
                with_streams
                and not episode.stream_url
                and not kan_db_scanner.episode_has_stream(con, episode.id)
                and resolved_streams < stream_limit
            ):
                episode.stream_url, episode.kaltura_entry_id = kan_db_scanner.resolve_episode_stream(
                    episode.play_url or episode.url,
                    raise_on_error=False,
                )
                resolved_streams += 1

            if episode_exists and not update_existing and not episode.stream_url:
                continue

            kan_db_scanner.upsert_episode(con, episode)
            existing_episode_ids.add(episode.id)

    con.commit()


def get_kan_vod_series(
    refresh: bool = False,
    query: str = "",
    category: object = "",
    limit: int = 60,
    offset: int = 0,
) -> dict:
    con = _connect()
    error = None
    try:
        if refresh:
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
                MAX(NULLIF(e.published, '')) AS latest_episode_published,
                MAX(CAST(e.id AS INTEGER)) AS latest_kan_episode_id
            FROM programs p
            LEFT JOIN seasons s ON s.program_id = p.id
            LEFT JOIN episodes e ON e.program_id = p.id
            {where_sql}
            GROUP BY p.id
            ORDER BY
                CASE WHEN COUNT(DISTINCT e.id) > 0 THEN 0 ELSE 1 END,
                latest_episode_published IS NULL,
                latest_episode_published DESC,
                COALESCE(latest_kan_episode_id, 0) DESC,
                p.title COLLATE NOCASE
            """,
            params,
        ).fetchall()
        # Category filtering is applied after the query because categories may
        # be packed into one DB field and need the same split rules as the UI.
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
            "db": KAN_VOD_DB_PATH,
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


def get_kan_vod_series_details(
    program_id: str,
    api_prefix: str = "",
    refresh: bool = False,
    with_streams: bool = False,
    stream_limit: int = KAN_VOD_STREAM_BATCH_SIZE,
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
                        update_existing=True,
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
            FROM programs p
            LEFT JOIN seasons s ON s.program_id = p.id
            LEFT JOIN episodes e ON e.program_id = p.id
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
            FROM seasons
            WHERE program_id = ?
            ORDER BY season_number IS NULL, season_number DESC, title DESC
            """,
            (program_id,),
        ).fetchall()

        episodes = con.execute(
            """
            SELECT *
            FROM episodes
            WHERE program_id = ?
            ORDER BY
                season_id DESC,
                display_order IS NULL,
                display_order ASC,
                CAST(id AS INTEGER) DESC,
                title COLLATE NOCASE DESC
            """,
            (program_id,),
        ).fetchall()

        return {
            **_program_to_dict(program),
            "seasons": [_season_to_dict(row) for row in seasons],
            "episodes": [_episode_to_dict(row, api_prefix=api_prefix) for row in episodes],
            "error": error,
        }
    finally:
        con.close()


def get_kan_vod_recent_episodes(limit: int = 10) -> list[dict]:
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
            FROM episodes e
            JOIN programs p ON p.id = e.program_id
            LEFT JOIN seasons s ON s.season_id = e.season_id
            ORDER BY
                CASE WHEN e.published IS NULL OR e.published = '' THEN 1 ELSE 0 END,
                e.published DESC,
                CAST(e.id AS INTEGER) DESC
            LIMIT ?
            """,
            (max(1, int(limit or 10)),),
        ).fetchall()

        return [_row_to_dict(row) for row in rows]
    finally:
        con.close()


def get_kan_vod_stream(episode_id: str) -> str | None:
    con = _connect()
    try:
        row = con.execute("SELECT * FROM episodes WHERE id = ?", (episode_id,)).fetchone()
        if not row:
            return None

        if row["stream_url"]:
            return row["stream_url"]

        try:
            stream_url, entry_id = _with_retries(
                lambda: kan_db_scanner.resolve_episode_stream(
                    row["play_url"] or row["url"],
                    raise_on_error=True,
                )
            )
        except Exception:
            return None

        if stream_url:
            episode = kan_db_scanner.Episode(
                id=row["id"],
                program_id=row["program_id"],
                season_id=row["season_id"],
                title=row["title"],
                description=row["description"] or "",
                url=row["url"],
                image=row["image"],
                play_url=row["play_url"],
                stream_url=stream_url,
                kaltura_entry_id=entry_id,
                published=row["published"],
            )
            episode.stream_url = stream_url
            episode.kaltura_entry_id = entry_id
            kan_db_scanner.upsert_episode(con, episode)
            con.commit()

        return stream_url
    finally:
        con.close()
