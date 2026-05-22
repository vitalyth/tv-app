import os
import json
import time
import hashlib
import requests
from guessit import guessit
from urllib.parse import quote

VIDEO_EXTENSIONS = {".mp4", ".mkv", ".avi", ".mov", ".m4v", ".ts", ".webm"}

LOCAL_VOD_TV_DIR = os.getenv("LOCAL_VOD_TV_DIR", "/media/tv")
BACKEND_CACHE_DIR = os.getenv("BACKEND_CACHE_DIR", "cache")

TMDB_API_KEY = os.getenv("TMDB_API_KEY", "")
TMDB_LANGUAGE = os.getenv("TMDB_LANGUAGE", "he-IL")
TMDB_CACHE_FILE = os.path.join(BACKEND_CACHE_DIR, "series_metadata.json")
TMDB_CACHE_TTL_SECONDS = 60 * 60 * 24


def is_video_file(filename: str) -> bool:
    return os.path.splitext(filename.lower())[1] in VIDEO_EXTENSIONS


def make_id(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8")).hexdigest()


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

    cache = load_cache()
    cache_key = title.lower().strip()
    cached = cache.get(cache_key)

    if cached and time.time() - cached.get("savedAt", 0) < TMDB_CACHE_TTL_SECONDS:
        return cached.get("data")

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

        cache[cache_key] = {
            "savedAt": time.time(),
            "data": data,
        }
        save_cache(cache)

        return data

    except Exception as e:
        print(f"TMDB lookup failed for '{title}': {e}")
        return None


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

    for root, _, files in os.walk(LOCAL_VOD_TV_DIR):
        for filename in files:
            if not is_video_file(filename):
                continue

            full_path = os.path.join(root, filename)
            parsed = guessit(filename)

            # The series name is always the first folder under LOCAL_VOD_TV_DIR.
            # Season subfolders like s1/s2 are only organization folders, not series names.
            title = get_series_title_from_path(full_path, parsed)
            season = parsed.get("season")
            episode = parsed.get("episode")

            key = title.lower().strip()

            if key not in series_map:
                series_map[key] = {
                    "id": make_id(title),
                    "title": title,
                    "metadata": get_tmdb_details(title),
                    "episodes": [],
                }

            series_map[key]["episodes"].append({
                "id": make_id(full_path),
                "filename": filename,
                "path": full_path,
                "season": season,
                "episode": episode,
                "screenSize": parsed.get("screen_size"),
                "source": parsed.get("source"),
                "videoCodec": parsed.get("video_codec"),
                "audioCodec": parsed.get("audio_codec"),
                "container": parsed.get("container"),
                "mimetype": parsed.get("mimetype"),
                "streamUrl": f"{api_prefix}/local-series/stream?path={quote(full_path)}",
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