import os
import json
import time
import hashlib
import requests
import sqlite3
import threading
from contextlib import contextmanager
from guessit import guessit
from typing import Iterator
from urllib.parse import quote

VIDEO_EXTENSIONS = {".mp4", ".mkv", ".avi", ".mov", ".m4v", ".ts", ".webm", ".m3u8"}

LOCAL_VOD_TV_DIR = os.getenv("LOCAL_VOD_TV_DIR", "/media/tv")
BACKEND_CACHE_DIR = os.getenv("BACKEND_CACHE_DIR", "cache")

TMDB_API_KEY = os.getenv("TMDB_API_KEY", "")
TMDB_LANGUAGE = os.getenv("TMDB_LANGUAGE", "he-IL")
TMDB_CACHE_FILE = os.path.join(BACKEND_CACHE_DIR, "series_metadata.json")
TMDB_CACHE_TTL_SECONDS = 60 * 60 * 24
LOCAL_SERIES_SCAN_CACHE_FILE = os.path.join(BACKEND_CACHE_DIR, "local_series_scan.json")
LOCAL_SERIES_SCAN_CACHE_TTL_SECONDS = int(os.getenv("LOCAL_SERIES_SCAN_CACHE_TTL_SECONDS", "300"))
LOCAL_SERIES_DB_PATH = os.getenv(
    "LOCAL_SERIES_DB_PATH",
    os.path.join(BACKEND_CACHE_DIR, "local_series.db"),
)
LOCAL_SERIES_WATCH_INTERVAL_SECONDS = max(
    1,
    int(os.getenv("LOCAL_SERIES_WATCH_INTERVAL_SECONDS", "2")),
)

_scan_cache_lock = threading.Lock()
_scan_cache_memory: dict | None = None
_scan_cache_memory_saved_at = 0.0
_watcher_thread: threading.Thread | None = None
_watcher_stop_event = threading.Event()


def is_video_file(filename: str) -> bool:
    if not filename:
        return False

    if filename.startswith("."):
        return False

    lower = filename.lower()

    if lower in {
        "thumbs.db",
        "desktop.ini",
        ".ds_store",
    }:
        return False

    if (
        lower.endswith(".tmp")
        or lower.endswith(".part")
        or lower.endswith(".download")
        or lower.endswith(".crdownload")
        or ".faststart." in lower
        or ".transcoded." in lower
        or ".cast." in lower
    ):
        return False

    # HLS: keep only main playlists.
    # Single HLS: hls/s1e1/index.m3u8
    # Adaptive HLS: hls/s1e1/master.m3u8
    # Variant playlists like hls/s1e1/1080p/index.m3u8 are filtered later by path.
    if lower.endswith(".m3u8"):
        return lower in {"index.m3u8", "master.m3u8"}

    # HLS segments should not be shown as episodes.
    if lower.endswith(".ts") and lower.startswith("segment_"):
        return False

    return os.path.splitext(lower)[1] in VIDEO_EXTENSIONS


def make_id(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8")).hexdigest()


def first_int(value):
    if isinstance(value, list) and value:
        value = value[0]

    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def load_cache() -> dict:
    if not os.path.exists(TMDB_CACHE_FILE):
        return {}

    try:
        with open(TMDB_CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_cache(cache: dict) -> None:
    os.makedirs(BACKEND_CACHE_DIR, exist_ok=True)

    with open(TMDB_CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def load_scan_cache() -> dict | None:
    global _scan_cache_memory, _scan_cache_memory_saved_at

    now = time.time()
    if (
        _scan_cache_memory
        and now - _scan_cache_memory_saved_at < LOCAL_SERIES_SCAN_CACHE_TTL_SECONDS
    ):
        return _scan_cache_memory

    if not os.path.exists(LOCAL_SERIES_SCAN_CACHE_FILE):
        return None

    try:
        with open(LOCAL_SERIES_SCAN_CACHE_FILE, "r", encoding="utf-8") as f:
            cached = json.load(f)
    except Exception:
        return None

    if now - cached.get("savedAt", 0) >= LOCAL_SERIES_SCAN_CACHE_TTL_SECONDS:
        return None

    if cached.get("root") != LOCAL_VOD_TV_DIR:
        return None

    data = cached.get("data")
    if not isinstance(data, dict):
        return None

    _scan_cache_memory = data
    _scan_cache_memory_saved_at = cached.get("savedAt", now)
    return data


def save_scan_cache(data: dict) -> None:
    global _scan_cache_memory, _scan_cache_memory_saved_at

    saved_at = time.time()
    _scan_cache_memory = data
    _scan_cache_memory_saved_at = saved_at

    os.makedirs(BACKEND_CACHE_DIR, exist_ok=True)
    tmp_file = f"{LOCAL_SERIES_SCAN_CACHE_FILE}.tmp"
    payload = {
        "savedAt": saved_at,
        "root": LOCAL_VOD_TV_DIR,
        "data": data,
    }

    with open(tmp_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)

    os.replace(tmp_file, LOCAL_SERIES_SCAN_CACHE_FILE)


def tmdb_image(path: str | None, size: str = "w500") -> str | None:
    if not path:
        return None

    return f"https://image.tmdb.org/t/p/{size}{path}"


def get_cached(cache_key: str):
    cache = load_cache()
    cached = cache.get(cache_key)

    if cached and time.time() - cached.get("savedAt", 0) < TMDB_CACHE_TTL_SECONDS:
        return cached.get("data")

    return None


def set_cached(cache_key: str, data) -> None:
    cache = load_cache()
    cache[cache_key] = {
        "savedAt": time.time(),
        "data": data,
    }
    save_cache(cache)


def get_series_title_from_path(full_path: str, parsed: dict) -> str:
    """
    The first folder directly under LOCAL_VOD_TV_DIR is the series name.

    Examples:
    /media/tv/Fauda (2015)/s1/e1.mp4      -> Fauda (2015)
    /media/tv/Fauda (2015)/S01E01.mp4     -> Fauda (2015)
    /media/tv/Fauda.S01E01.mp4            -> Fauda
    """
    try:
        parent_dir = os.path.dirname(full_path)
        relative_dir = os.path.relpath(parent_dir, LOCAL_VOD_TV_DIR)

        if relative_dir and relative_dir != "." and not relative_dir.startswith(".."):
            return relative_dir.split(os.sep)[0].strip()
    except Exception:
        pass

    parsed_title = str(parsed.get("title") or "").strip()
    if parsed_title:
        return parsed_title

    return os.path.splitext(os.path.basename(full_path))[0].strip()


def is_hls_main_playlist(full_path: str) -> bool:
    """
    True only for main HLS playlists.

    Single HLS:
      Series/hls/s3e1/index.m3u8

    Adaptive HLS:
      Series/hls/s3e1/master.m3u8

    False for variant playlists:
      Series/hls/s3e1/1080p/index.m3u8
    """
    playlist_name = os.path.basename(full_path).lower()
    if playlist_name not in {"index.m3u8", "master.m3u8"}:
        return False

    playlist_dir = os.path.dirname(full_path)
    episode_dir = os.path.basename(playlist_dir).lower()
    hls_dir = os.path.basename(os.path.dirname(playlist_dir)).lower()

    return hls_dir == "hls" and episode_dir not in {
        "2160p",
        "1440p",
        "1080p",
        "720p",
        "480p",
        "360p",
        "audio",
        "subs",
        "subtitles",
    }


def is_hls_index_file(full_path: str) -> bool:
    return is_hls_main_playlist(full_path)


def get_parse_name_for_episode(full_path: str, filename: str) -> str:
    """
    Normal files:
      Series/file.mp4
      Series/season/file.mp4
      -> parse from filename

    HLS files:
      Series/hls/s3e1/index.m3u8
      Series/hls/s3e1/master.m3u8
      -> parse from HLS episode folder name: s3e1
    """
    if is_hls_main_playlist(full_path):
        return os.path.basename(os.path.dirname(full_path))

    return filename



def should_skip_hls_variant_playlist(full_path: str) -> bool:
    """
    Skip adaptive variant playlists, for example:
      hls/s1e1/1080p/index.m3u8

    Keep:
      hls/s1e1/master.m3u8
      hls/s1e1/index.m3u8
    """
    filename = os.path.basename(full_path).lower()
    if not filename.endswith(".m3u8"):
        return False

    return not is_hls_main_playlist(full_path)


def get_episode_dedupe_key(episode: dict) -> tuple:
    """
    Dedupe multiple files for the same logical episode.

    If both a regular file and an HLS index exist for the same series/season/episode,
    keep the HLS version.
    """
    season = episode.get("season") or 0
    episode_number = episode.get("episode") or 0

    if episode_number:
        return (season, episode_number)

    filename = str(episode.get("filename") or "").lower()
    return (season, filename)


def prefer_hls_episodes(episodes: list[dict]) -> list[dict]:
    by_key = {}

    for episode in episodes:
        key = get_episode_dedupe_key(episode)
        existing = by_key.get(key)

        if existing is None:
            by_key[key] = episode
            continue

        existing_is_hls = bool(existing.get("isHls"))
        current_is_hls = bool(episode.get("isHls"))

        if current_is_hls and not existing_is_hls:
            by_key[key] = episode
            continue

        if current_is_hls and existing_is_hls:
            existing_type = existing.get("hlsPlaylistType")
            current_type = episode.get("hlsPlaylistType")

            if current_type == "master" and existing_type != "master":
                by_key[key] = episode
                continue

            if current_type == existing_type:
                existing_path = str(existing.get("path") or "")
                current_path = str(episode.get("path") or "")
                if current_path and (not existing_path or len(current_path) < len(existing_path)):
                    by_key[key] = episode

            continue

        if current_is_hls == existing_is_hls:
            # Stable fallback: keep the one with the cleaner/shorter path.
            existing_path = str(existing.get("path") or "")
            current_path = str(episode.get("path") or "")
            if current_path and (not existing_path or len(current_path) < len(existing_path)):
                by_key[key] = episode

    return list(by_key.values())


@contextmanager
def connect_local_series_db() -> Iterator[sqlite3.Connection]:
    os.makedirs(os.path.dirname(os.path.abspath(LOCAL_SERIES_DB_PATH)), exist_ok=True)
    con = sqlite3.connect(LOCAL_SERIES_DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA busy_timeout=5000")
    try:
        with con:
            yield con
    finally:
        con.close()


def init_local_series_db() -> None:
    with connect_local_series_db() as con:
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS local_series_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS local_series_files (
                path TEXT PRIMARY KEY,
                root TEXT NOT NULL,
                size INTEGER NOT NULL,
                mtime_ns INTEGER NOT NULL,
                series_key TEXT NOT NULL,
                series_title TEXT NOT NULL,
                payload TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        con.execute("CREATE INDEX IF NOT EXISTS idx_local_series_files_root ON local_series_files(root)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_local_series_files_series_key ON local_series_files(series_key)")


def get_state(con: sqlite3.Connection, key: str) -> str | None:
    row = con.execute(
        "SELECT value FROM local_series_state WHERE key = ?",
        (key,),
    ).fetchone()
    return row["value"] if row else None


def set_state(con: sqlite3.Connection, key: str, value: str) -> None:
    con.execute(
        """
        INSERT INTO local_series_state (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (key, value),
    )


def iter_local_video_files() -> list[dict]:
    files: list[dict] = []
    if not os.path.isdir(LOCAL_VOD_TV_DIR):
        return files

    for root, dirs, filenames in os.walk(LOCAL_VOD_TV_DIR):
        dirs[:] = [
            d for d in dirs
            if not d.startswith(".")
            and d.lower() not in {
                "@eadir",
                "#recycle",
                "$recycle.bin",
                "system volume information",
                "__macosx",
                "cache",
                ".cache",
                "transcode",
                ".transcode",
                "transcoded",
                ".transcoded",
                "tmp",
                "temp",
            }
        ]

        for filename in filenames:
            if not is_video_file(filename):
                continue

            full_path = os.path.join(root, filename)
            if should_skip_hls_variant_playlist(full_path):
                continue

            try:
                stat = os.stat(full_path)
            except OSError:
                continue

            files.append({
                "path": full_path,
                "filename": filename,
                "size": stat.st_size,
                "mtime_ns": stat.st_mtime_ns,
            })

    return files


def get_directory_signature(files: list[dict] | None = None) -> dict:
    files = files if files is not None else iter_local_video_files()
    total_size = sum(int(item["size"]) for item in files)
    max_mtime_ns = max((int(item["mtime_ns"]) for item in files), default=0)
    relative_paths = []

    for item in files:
        path = str(item["path"])
        try:
            relative_paths.append(os.path.relpath(path, LOCAL_VOD_TV_DIR))
        except ValueError:
            relative_paths.append(path)

    paths_hash = hashlib.sha1(
        "\n".join(sorted(relative_paths)).encode("utf-8")
    ).hexdigest()

    return {
        "root": LOCAL_VOD_TV_DIR,
        "fileCount": len(files),
        "totalSize": total_size,
        "maxMtimeNs": max_mtime_ns,
        "pathsHash": paths_hash,
    }


def parse_local_episode_file(file_info: dict, season_cache: dict, series_metadata_cache: dict) -> dict:
    full_path = file_info["path"]
    filename = file_info["filename"]
    parse_name = get_parse_name_for_episode(full_path, filename)
    parsed = guessit(parse_name)
    title = get_series_title_from_path(full_path, parsed)
    season = first_int(parsed.get("season"))
    episode = first_int(parsed.get("episode"))
    series_key = title.lower().strip()

    if series_key not in series_metadata_cache:
        series_metadata_cache[series_key] = get_tmdb_details(title)

    episode_metadata = get_episode_metadata(
        series_metadata_cache.get(series_key),
        season,
        episode,
        season_cache,
    )

    payload = {
        "id": make_id(full_path),
        "filename": parse_name if is_hls_index_file(full_path) else filename,
        "path": full_path,
        "season": season,
        "episode": episode,
        "episodeName": episode_metadata.get("episodeName"),
        "episodeOverview": episode_metadata.get("episodeOverview"),
        "episodeImage": episode_metadata.get("episodeImage"),
        "airDate": episode_metadata.get("airDate"),
        "runtime": episode_metadata.get("runtime"),
        "episodeRating": episode_metadata.get("episodeRating"),
        "episodeVoteCount": episode_metadata.get("episodeVoteCount"),
        "tmdbEpisodeId": episode_metadata.get("tmdbEpisodeId"),
        "screenSize": parsed.get("screen_size"),
        "source": parsed.get("source"),
        "videoCodec": parsed.get("video_codec"),
        "audioCodec": parsed.get("audio_codec"),
        "container": parsed.get("container"),
        "mimetype": parsed.get("mimetype"),
        "streamUrl": f"/stream/local-series?path={quote(full_path)}",
        "isHls": is_hls_main_playlist(full_path),
        "manifestType": "hls" if is_hls_main_playlist(full_path) else None,
        "hlsPlaylistType": (
            "master"
            if os.path.basename(full_path).lower() == "master.m3u8"
            else "index"
            if is_hls_main_playlist(full_path)
            else None
        ),
        "parsed": parsed,
    }

    return {
        "series_key": series_key,
        "series_title": title,
        "payload": payload,
    }



def get_tmdb_details(title: str) -> dict | None:
    print("TMDB SEARCH:", title)

    if not TMDB_API_KEY or not title:
        return None

    cache_key = title.lower().strip()
    cached = get_cached(cache_key)

    if cached:
        return cached

    try:
        search_res = requests.get(
            "https://api.themoviedb.org/3/search/tv",
            params={
                "api_key": TMDB_API_KEY,
                "query": title,
                "language": TMDB_LANGUAGE,
                "include_adult": "false",
            },
            timeout=10,
        )
        search_res.raise_for_status()

        results = search_res.json().get("results", [])
        if not results:
            return None

        first = results[0]
        tmdb_id = first.get("id")

        details_res = requests.get(
            f"https://api.themoviedb.org/3/tv/{tmdb_id}",
            params={
                "api_key": TMDB_API_KEY,
                "language": TMDB_LANGUAGE,
                "append_to_response": "credits,images,videos,external_ids",
            },
            timeout=10,
        )
        details_res.raise_for_status()

        details = details_res.json()

        data = {
            "tmdbId": details.get("id"),
            "name": details.get("name"),
            "originalName": details.get("original_name"),
            "overview": details.get("overview"),
            "tagline": details.get("tagline"),
            "homepage": details.get("homepage"),
            "status": details.get("status"),
            "type": details.get("type"),
            "firstAirDate": details.get("first_air_date"),
            "lastAirDate": details.get("last_air_date"),
            "numberOfSeasons": details.get("number_of_seasons"),
            "numberOfEpisodes": details.get("number_of_episodes"),
            "episodeRunTime": details.get("episode_run_time"),
            "rating": details.get("vote_average"),
            "voteCount": details.get("vote_count"),
            "popularity": details.get("popularity"),
            "poster": tmdb_image(details.get("poster_path"), "w500"),
            "backdrop": tmdb_image(details.get("backdrop_path"), "w1280"),
            "genres": [g.get("name") for g in details.get("genres", [])],
            "networks": [
                {
                    "id": n.get("id"),
                    "name": n.get("name"),
                    "logo": tmdb_image(n.get("logo_path"), "w300"),
                    "country": n.get("origin_country"),
                }
                for n in details.get("networks", [])
            ],
            "seasons": [
                {
                    "id": s.get("id"),
                    "seasonNumber": s.get("season_number"),
                    "name": s.get("name"),
                    "overview": s.get("overview"),
                    "airDate": s.get("air_date"),
                    "episodeCount": s.get("episode_count"),
                    "poster": tmdb_image(s.get("poster_path"), "w500"),
                    "rating": s.get("vote_average"),
                }
                for s in details.get("seasons", [])
            ],
            "cast": [
                {
                    "id": c.get("id"),
                    "name": c.get("name"),
                    "character": c.get("character"),
                    "profile": tmdb_image(c.get("profile_path"), "w185"),
                }
                for c in details.get("credits", {}).get("cast", [])[:10]
            ],
            "externalIds": details.get("external_ids", {}),
            "videos": [
                {
                    "name": v.get("name"),
                    "site": v.get("site"),
                    "type": v.get("type"),
                    "key": v.get("key"),
                    "url": f"https://www.youtube.com/watch?v={v.get('key')}"
                    if v.get("site") == "YouTube" and v.get("key")
                    else None,
                }
                for v in details.get("videos", {}).get("results", [])
            ],
        }

        set_cached(cache_key, data)

        return data

    except Exception as e:
        print(f"TMDB lookup failed for '{title}': {e}")
        return None


def get_tmdb_season_details(tmdb_id: int | str | None, season_number: int | None) -> dict | None:
    if not TMDB_API_KEY or not tmdb_id or season_number is None:
        return None

    cache_key = f"season:{tmdb_id}:{season_number}:{TMDB_LANGUAGE}"
    cached = get_cached(cache_key)

    if cached:
        return cached

    try:
        season_res = requests.get(
            f"https://api.themoviedb.org/3/tv/{tmdb_id}/season/{season_number}",
            params={
                "api_key": TMDB_API_KEY,
                "language": TMDB_LANGUAGE,
            },
            timeout=10,
        )
        season_res.raise_for_status()
        season = season_res.json()

        episodes_by_number = {}
        for episode in season.get("episodes", []) or []:
            episode_number = episode.get("episode_number")
            if episode_number is None:
                continue

            episodes_by_number[str(episode_number)] = {
                "tmdbEpisodeId": episode.get("id"),
                "episodeName": episode.get("name"),
                "episodeOverview": episode.get("overview"),
                "episodeImage": tmdb_image(episode.get("still_path"), "w500"),
                "airDate": episode.get("air_date"),
                "runtime": episode.get("runtime"),
                "episodeRating": episode.get("vote_average"),
                "episodeVoteCount": episode.get("vote_count"),
            }

        data = {
            "id": season.get("id"),
            "seasonNumber": season.get("season_number"),
            "name": season.get("name"),
            "overview": season.get("overview"),
            "poster": tmdb_image(season.get("poster_path"), "w500"),
            "airDate": season.get("air_date"),
            "episodesByNumber": episodes_by_number,
        }

        set_cached(cache_key, data)
        return data

    except Exception as e:
        print(f"TMDB season lookup failed for tmdb_id={tmdb_id} season={season_number}: {e}")
        return None


def get_episode_metadata(series_metadata: dict | None, season, episode, season_cache: dict) -> dict:
    if not series_metadata:
        return {}

    tmdb_id = series_metadata.get("tmdbId")
    season_number = first_int(season)
    episode_number = first_int(episode)

    if not tmdb_id or season_number is None or episode_number is None:
        return {}

    season_key = f"{tmdb_id}:{season_number}"
    season_details = season_cache.get(season_key)

    if season_details is None:
        season_details = get_tmdb_season_details(tmdb_id, season_number)
        season_cache[season_key] = season_details

    if not season_details:
        return {}

    episode_data = (season_details.get("episodesByNumber") or {}).get(str(episode_number))
    return episode_data or {}


def build_local_series_scan(api_prefix: str = "") -> dict:
    api_prefix = (api_prefix or "").rstrip("/")
    if not os.path.isdir(LOCAL_VOD_TV_DIR):
        return {
            "root": LOCAL_VOD_TV_DIR,
            "count": 0,
            "series": [],
            "error": f"Directory not found: {LOCAL_VOD_TV_DIR}",
        }

    series_map = {}
    season_cache = {}

    for root, dirs, files in os.walk(LOCAL_VOD_TV_DIR):
        dirs[:] = [
            d for d in dirs
            if not d.startswith(".")
            and d.lower() not in {
                "@eadir",
                "#recycle",
                "$recycle.bin",
                "system volume information",
                "__macosx",
                "cache",
                ".cache",
                "transcode",
                ".transcode",
                "transcoded",
                ".transcoded",
                "tmp",
                "temp",
            }
        ]
        for filename in files:
            if not is_video_file(filename):
                continue

            full_path = os.path.join(root, filename)

            if should_skip_hls_variant_playlist(full_path):
                continue

            parse_name = get_parse_name_for_episode(full_path, filename)
            parsed = guessit(parse_name)

            # The series name is always the first folder under LOCAL_VOD_TV_DIR.
            # Season subfolders like s1/s2 are only organization folders, not series names.
            title = get_series_title_from_path(full_path, parsed)
            season = first_int(parsed.get("season"))
            episode = first_int(parsed.get("episode"))

            key = title.lower().strip()

            if key not in series_map:
                metadata = get_tmdb_details(title)
                series_map[key] = {
                    "id": make_id(title),
                    "title": title,
                    "metadata": metadata,
                    "episodes": [],
                }

            episode_metadata = get_episode_metadata(
                series_map[key].get("metadata"),
                season,
                episode,
                season_cache,
            )

            series_map[key]["episodes"].append({
                "id": make_id(full_path),
                "filename": parse_name if is_hls_index_file(full_path) else filename,
                "path": full_path,
                "season": season,
                "episode": episode,
                "episodeName": episode_metadata.get("episodeName"),
                "episodeOverview": episode_metadata.get("episodeOverview"),
                "episodeImage": episode_metadata.get("episodeImage"),
                "airDate": episode_metadata.get("airDate"),
                "runtime": episode_metadata.get("runtime"),
                "episodeRating": episode_metadata.get("episodeRating"),
                "episodeVoteCount": episode_metadata.get("episodeVoteCount"),
                "tmdbEpisodeId": episode_metadata.get("tmdbEpisodeId"),
                "screenSize": parsed.get("screen_size"),
                "source": parsed.get("source"),
                "videoCodec": parsed.get("video_codec"),
                "audioCodec": parsed.get("audio_codec"),
                "container": parsed.get("container"),
                "mimetype": parsed.get("mimetype"),
                "streamUrl": f"/stream/local-series?path={quote(full_path)}",
                "isHls": is_hls_main_playlist(full_path),
                "manifestType": "hls" if is_hls_main_playlist(full_path) else None,
                "hlsPlaylistType": (
                    "master"
                    if os.path.basename(full_path).lower() == "master.m3u8"
                    else "index"
                    if is_hls_main_playlist(full_path)
                    else None
                ),
                "parsed": parsed,
            })

    series = list(series_map.values())

    for item in series:
        item["episodes"] = prefer_hls_episodes(item["episodes"])
        item["episodes"].sort(
            key=lambda ep: (
                ep.get("season") or 0,
                ep.get("episode") or 0,
                ep.get("filename") or "",
            )
        )

    series.sort(key=lambda item: item["title"].lower())

    data = {
        "root": LOCAL_VOD_TV_DIR,
        "count": len(series),
        "series": series,
    }

    return data


def build_local_series_from_db(api_prefix: str = "") -> dict | None:
    api_prefix = (api_prefix or "").rstrip("/")
    init_local_series_db()

    with connect_local_series_db() as con:
        rows = con.execute(
            """
            SELECT series_key, series_title, payload
            FROM local_series_files
            WHERE root = ?
            ORDER BY series_title COLLATE NOCASE, path COLLATE NOCASE
            """,
            (LOCAL_VOD_TV_DIR,),
        ).fetchall()

    if not rows:
        return None

    series_map: dict[str, dict] = {}
    metadata_cache: dict[str, dict | None] = {}

    for row in rows:
        series_key = row["series_key"]
        title = row["series_title"]

        if series_key not in series_map:
            metadata_cache[series_key] = get_tmdb_details(title)
            series_map[series_key] = {
                "id": make_id(title),
                "title": title,
                "metadata": metadata_cache[series_key],
                "episodes": [],
            }

        episode = json.loads(row["payload"])
        if api_prefix and episode.get("streamUrl", "").startswith("/stream/"):
            episode["streamUrl"] = f"{api_prefix}{episode['streamUrl']}"
        series_map[series_key]["episodes"].append(episode)

    series = list(series_map.values())

    for item in series:
        item["episodes"] = prefer_hls_episodes(item["episodes"])
        item["episodes"].sort(
            key=lambda ep: (
                ep.get("season") or 0,
                ep.get("episode") or 0,
                ep.get("filename") or "",
            )
        )

    series.sort(key=lambda item: item["title"].lower())

    return {
        "root": LOCAL_VOD_TV_DIR,
        "count": len(series),
        "series": series,
    }


def filter_local_series(series: list[dict], query: str) -> list[dict]:
    normalized_query = (query or "").strip().lower()
    if not normalized_query:
        return series

    return [
        item for item in series
        if normalized_query in str(item.get("title") or "").lower()
        or normalized_query in str((item.get("metadata") or {}).get("name") or "").lower()
        or normalized_query in str((item.get("metadata") or {}).get("originalName") or "").lower()
        or normalized_query in str((item.get("metadata") or {}).get("overview") or "").lower()
    ]


def page_local_series(data: dict, query: str = "", limit: int = 60, offset: int = 0) -> dict:
    limit = max(1, min(int(limit or 60), 120))
    offset = max(0, int(offset or 0))
    normalized_query = (query or "").strip()
    filtered_series = filter_local_series(data.get("series") or [], normalized_query)
    total = len(filtered_series)
    page = filtered_series[offset:offset + limit]

    return {
        **data,
        "count": len(page),
        "total": total,
        "limit": limit,
        "offset": offset,
        "hasMore": offset + len(page) < total,
        "query": normalized_query,
        "series": page,
    }


def update_local_series_db(api_prefix: str = "", force_refresh: bool = False) -> dict:
    init_local_series_db()

    if not os.path.isdir(LOCAL_VOD_TV_DIR):
        return {
            "root": LOCAL_VOD_TV_DIR,
            "count": 0,
            "series": [],
            "error": f"Directory not found: {LOCAL_VOD_TV_DIR}",
        }

    files = iter_local_video_files()
    signature = get_directory_signature(files)
    signature_json = json.dumps(signature, sort_keys=True)

    with _scan_cache_lock:
        with connect_local_series_db() as con:
            previous_signature = get_state(con, "directory_signature")
            if not force_refresh and previous_signature == signature_json:
                data = build_local_series_from_db(api_prefix=api_prefix)
                if data is not None:
                    return data

            existing_rows = con.execute(
                """
                SELECT path, size, mtime_ns
                FROM local_series_files
                WHERE root = ?
                """,
                (LOCAL_VOD_TV_DIR,),
            ).fetchall()
            existing = {
                row["path"]: {
                    "size": int(row["size"]),
                    "mtime_ns": int(row["mtime_ns"]),
                }
                for row in existing_rows
            }

            current_paths = {item["path"] for item in files}
            removed_paths = [path for path in existing if path not in current_paths]
            changed_files = [
                item for item in files
                if force_refresh
                or item["path"] not in existing
                or int(item["size"]) != existing[item["path"]]["size"]
                or int(item["mtime_ns"]) != existing[item["path"]]["mtime_ns"]
            ]

            if removed_paths:
                con.executemany(
                    "DELETE FROM local_series_files WHERE path = ?",
                    [(path,) for path in removed_paths],
                )

            season_cache: dict = {}
            series_metadata_cache: dict = {}
            for item in changed_files:
                parsed_file = parse_local_episode_file(item, season_cache, series_metadata_cache)
                con.execute(
                    """
                    INSERT INTO local_series_files (
                        path, root, size, mtime_ns, series_key, series_title, payload, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(path) DO UPDATE SET
                        root = excluded.root,
                        size = excluded.size,
                        mtime_ns = excluded.mtime_ns,
                        series_key = excluded.series_key,
                        series_title = excluded.series_title,
                        payload = excluded.payload,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    (
                        item["path"],
                        LOCAL_VOD_TV_DIR,
                        int(item["size"]),
                        int(item["mtime_ns"]),
                        parsed_file["series_key"],
                        parsed_file["series_title"],
                        json.dumps(parsed_file["payload"], ensure_ascii=False),
                    ),
                )

            set_state(con, "directory_signature", signature_json)
            con.commit()

            print(
                "Local series DB updated: "
                f"{len(files)} files, {len(changed_files)} changed/new, {len(removed_paths)} removed",
                flush=True,
            )

        data = build_local_series_from_db(api_prefix=api_prefix) or {
            "root": LOCAL_VOD_TV_DIR,
            "count": 0,
            "series": [],
        }
        if "error" not in data:
            save_scan_cache(data)
        return data


def scan_local_series(
    api_prefix: str = "",
    force_refresh: bool = False,
    query: str = "",
    limit: int = 60,
    offset: int = 0,
):
    if force_refresh:
        data = update_local_series_db(api_prefix=api_prefix, force_refresh=True)
        return page_local_series(data, query=query, limit=limit, offset=offset)

    data = build_local_series_from_db(api_prefix=api_prefix)
    if data and data.get("count", 0) > 0:
        return page_local_series(data, query=query, limit=limit, offset=offset)

    data = update_local_series_db(api_prefix=api_prefix, force_refresh=True)
    return page_local_series(data, query=query, limit=limit, offset=offset)


def local_series_watcher_loop() -> None:
    print(
        f"Local series watcher started: root={LOCAL_VOD_TV_DIR}, interval={LOCAL_SERIES_WATCH_INTERVAL_SECONDS}s",
        flush=True,
    )
    update_local_series_db(force_refresh=False)

    while not _watcher_stop_event.wait(LOCAL_SERIES_WATCH_INTERVAL_SECONDS):
        try:
            files = iter_local_video_files()
            signature = get_directory_signature(files)
            signature_json = json.dumps(signature, sort_keys=True)

            with connect_local_series_db() as con:
                previous_signature = get_state(con, "directory_signature")

            if previous_signature != signature_json:
                update_local_series_db(force_refresh=False)
        except Exception as exc:
            print(f"Local series watcher failed: {exc}", flush=True)


def start_local_series_watcher() -> None:
    global _watcher_thread

    if _watcher_thread and _watcher_thread.is_alive():
        return

    _watcher_stop_event.clear()
    _watcher_thread = threading.Thread(
        target=local_series_watcher_loop,
        name="local-series-watcher",
        daemon=True,
    )
    _watcher_thread.start()


def stop_local_series_watcher() -> None:
    _watcher_stop_event.set()
