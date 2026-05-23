import os
import json
import time
import hashlib
import requests
from guessit import guessit
from urllib.parse import quote

VIDEO_EXTENSIONS = {".mp4", ".mkv", ".avi", ".mov", ".m4v", ".ts", ".webm", ".m3u8"}

LOCAL_VOD_TV_DIR = os.getenv("LOCAL_VOD_TV_DIR", "/media/tv")
BACKEND_CACHE_DIR = os.getenv("BACKEND_CACHE_DIR", "cache")

TMDB_API_KEY = os.getenv("TMDB_API_KEY", "")
TMDB_LANGUAGE = os.getenv("TMDB_LANGUAGE", "he-IL")
TMDB_CACHE_FILE = os.path.join(BACKEND_CACHE_DIR, "series_metadata.json")
TMDB_CACHE_TTL_SECONDS = 60 * 60 * 24


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

    # HLS: keep only the main playlist, not generated variants/segments.
    if lower.endswith(".m3u8"):
        return lower == "index.m3u8"

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


def scan_local_series(api_prefix: str = ""):
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
            parsed = guessit(filename)

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
                "filename": filename,
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
                "parsed": parsed,
            })

    series = list(series_map.values())

    for item in series:
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
