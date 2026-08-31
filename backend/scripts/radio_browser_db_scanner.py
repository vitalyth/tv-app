#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Build a local SQLite radio station database from Radio Browser and local stations.

The scanner keeps the original Radio Browser payload in raw_json, creates a
stable app-facing row for every station, and merges existing app stations by
UUID, stream URL, or name so the final DB does not contain obvious duplicates.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
import time
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
PROJECT_DIR = BACKEND_DIR.parent

DEFAULT_DB_PATH = BACKEND_DIR / "db" / "radio_stations.db"
DEFAULT_ANDROID_DB_PATH = (
    PROJECT_DIR
    / "android-tv-app"
    / "android"
    / "auto-radio"
    / "src"
    / "main"
    / "assets"
    / "databases"
    / "radio_channels.db"
)
DEFAULT_ANDROID_RADIO_JSON = (
    PROJECT_DIR / "android-tv-app" / "android" / "auto-radio" / "src" / "main" / "res" / "raw" / "radio_channels.json"
)
DEFAULT_CUSTOM_CHANNELS_JSON = BACKEND_DIR / "data" / "custom_channels.json"
RADIO_BROWSER_SERVERS_URL = "https://all.api.radio-browser.info/json/servers"
DEFAULT_USER_AGENT = "RadioHubScanner/1.0 (+https://tv.bestcams.net)"
DEFAULT_BATCH_SIZE = 500
REQUEST_TIMEOUT_SECONDS = 20

CURATED_LOGO_OVERRIDES = [
    (
        ("galeizahal", "galeyzahal", "glz"),
        "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/glz.jpg",
    ),
    (
        ("galgalatz", "galgalaz", "glglz"),
        "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/glglz.jpg",
    ),
    (
        ("kan88", "88fm"),
        "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/88fm.png",
    ),
    (
        ("kanbet", "kanb"),
        "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/bet.png",
    ),
    (
        ("kangimel", "kangimmel"),
        "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/gimel.png",
    ),
    (
        ("kantarbut", "kanculture"),
        "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/culture.png",
    ),
    (
        ("kanreka", "reka"),
        "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/reka.png",
    ),
    (
        ("radiotlv", "radiotelaviv", "102fm"),
        "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/102fm.jpg",
    ),
    (
        ("103fm", "radio103"),
        "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/103fm.png",
    ),
    (
        ("radius100fm", "100fm", "radios100fm"),
        "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/100fm.jpg",
    ),
    (
        ("eco99fm", "99fm"),
        "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/99fm.png",
    ),
    (
        ("radiolevhamedina", "levhamedina", "91fm"),
        "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/91fm.jpg",
    ),
    (
        ("kolhai", "kolhay", "93fm"),
        "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/kolhay.jpg",
    ),
    (
        ("galeyisrael", "galeiisrael"),
        "https://raw.githubusercontent.com/Fishenzon/repo/master/plugin.video.idanplus/images/gly.jpg",
    ),
]

HEBREW_TRANSLITERATION = {
    "א": "a",
    "ב": "b",
    "ג": "g",
    "ד": "d",
    "ה": "h",
    "ו": "v",
    "ז": "z",
    "ח": "h",
    "ט": "t",
    "י": "y",
    "כ": "k",
    "ך": "k",
    "ל": "l",
    "מ": "m",
    "ם": "m",
    "נ": "n",
    "ן": "n",
    "ס": "s",
    "ע": "a",
    "פ": "p",
    "ף": "p",
    "צ": "tz",
    "ץ": "tz",
    "ק": "k",
    "ר": "r",
    "ש": "sh",
    "ת": "t",
}


@dataclass
class ScanStats:
    fetched: int = 0
    inserted: int = 0
    updated: int = 0
    duplicate_uuid: int = 0
    duplicate_url: int = 0
    existing_matched: int = 0
    existing_inserted: int = 0
    url_duplicates_removed: int = 0


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).replace("\u200f", "").replace("\u200e", "").replace("\u200b", "").strip()


def is_ascii_text(value: str) -> bool:
    return bool(value) and all(ord(ch) < 128 for ch in value)


def english_name_for_search(name: str) -> str:
    name = clean_text(name)
    if not name:
        return ""
    if is_ascii_text(name):
        return normalize_spaces(name)

    transliterated = "".join(HEBREW_TRANSLITERATION.get(ch, ch) for ch in name)
    normalized = unicodedata.normalize("NFKD", transliterated)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_text = re.sub(r"[^A-Za-z0-9.+& -]+", " ", ascii_text)
    return normalize_spaces(ascii_text)


def normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", clean_text(value)).strip()


def normalized_search_text(value: str) -> str:
    value = unicodedata.normalize("NFKD", clean_text(value)).lower()
    value = "".join(HEBREW_TRANSLITERATION.get(ch, ch) for ch in value)
    value = value.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "", value)


def unique_clean_values(values: list[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for value in values:
        cleaned = normalize_spaces(value)
        key = cleaned.lower()
        if not cleaned or key in seen:
            continue
        seen.add(key)
        unique.append(cleaned)
    return unique


def normalize_url(value: str | None) -> str:
    value = clean_text(value)
    if not value:
        return ""

    for separator in ("|", "%7C", "%7c"):
        if separator in value:
            value = value.split(separator, 1)[0]

    parsed = urlsplit(value)
    scheme = parsed.scheme.lower()
    netloc = parsed.netloc.lower()
    path = re.sub(r"/+$", "", parsed.path or "/")
    query_pairs = [
        (key, val)
        for key, val in parse_qsl(parsed.query, keep_blank_values=True)
        if not key.lower().startswith(("utm_", "aw_", "fbclid"))
    ]
    query = urlencode(sorted(query_pairs), doseq=True)
    return urlunsplit((scheme, netloc, path, query, ""))


def stable_radio_browser_id(stationuuid: str, name: str, url: str) -> str:
    source = stationuuid or f"{name}:{url}"
    digest = hashlib.sha1(source.encode("utf-8")).hexdigest()[:24]
    return f"rb_{digest}"


def mime_type_from_codec(codec: str | None, hls: Any = None) -> str | None:
    codec = clean_text(codec).lower()
    if str(hls) == "1":
        return "application/x-mpegURL"
    if codec in {"aac", "aac+", "heaac"}:
        return "audio/aac"
    if codec in {"mp3", "mpeg"}:
        return "audio/mpeg"
    if codec == "ogg":
        return "audio/ogg"
    if codec == "opus":
        return "audio/opus"
    return None


def station_group(countrycode: str | None, state: str | None = None) -> str:
    code = clean_text(countrycode).upper()
    state_text = clean_text(state).lower()
    if code == "IL":
        return "israelis"
    if code == "US" and any(part in state_text for part in ("massachusetts", "boston", "cambridge")):
        return "local"
    return "world"


def init_db(con: sqlite3.Connection) -> None:
    con.executescript(
        """
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS radio_stations (
            id TEXT PRIMARY KEY,
            app_station_id TEXT,
            radio_browser_uuid TEXT,
            original_name TEXT NOT NULL,
            english_name TEXT NOT NULL,
            search_name TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'radio',
            group_name TEXT NOT NULL,
            logo TEXT,
            stream_url TEXT,
            normalized_stream_url TEXT,
            mime_type TEXT,
            homepage TEXT,
            favicon TEXT,
            tags TEXT,
            country TEXT,
            countrycode TEXT,
            iso_3166_2 TEXT,
            state TEXT,
            language TEXT,
            languagecodes TEXT,
            codec TEXT,
            bitrate INTEGER,
            hls INTEGER,
            votes INTEGER,
            clickcount INTEGER,
            clicktrend INTEGER,
            lastcheckok INTEGER,
            lastchangetime TEXT,
            lastchangetime_iso8601 TEXT,
            lastchecktime TEXT,
            lastchecktime_iso8601 TEXT,
            lastcheckoktime TEXT,
            lastcheckoktime_iso8601 TEXT,
            lastlocalchecktime TEXT,
            lastlocalchecktime_iso8601 TEXT,
            clicktimestamp TEXT,
            clicktimestamp_iso8601 TEXT,
            ssl_error INTEGER,
            geo_lat REAL,
            geo_long REAL,
            has_extended_info INTEGER,
            source TEXT NOT NULL,
            raw_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_radio_stations_radio_browser_uuid
            ON radio_stations(radio_browser_uuid)
            WHERE radio_browser_uuid IS NOT NULL AND radio_browser_uuid != '';
        CREATE INDEX IF NOT EXISTS idx_radio_stations_normalized_stream_url
            ON radio_stations(normalized_stream_url);
        CREATE INDEX IF NOT EXISTS idx_radio_stations_search_name
            ON radio_stations(search_name);
        CREATE INDEX IF NOT EXISTS idx_radio_stations_group_name
            ON radio_stations(group_name);

        CREATE TABLE IF NOT EXISTS scan_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at INTEGER NOT NULL,
            finished_at INTEGER,
            countries TEXT NOT NULL,
            fetched INTEGER NOT NULL DEFAULT 0,
            inserted INTEGER NOT NULL DEFAULT 0,
            updated INTEGER NOT NULL DEFAULT 0,
            duplicate_uuid INTEGER NOT NULL DEFAULT 0,
            duplicate_url INTEGER NOT NULL DEFAULT 0,
            url_duplicates_removed INTEGER NOT NULL DEFAULT 0,
            existing_matched INTEGER NOT NULL DEFAULT 0,
            existing_inserted INTEGER NOT NULL DEFAULT 0
        );
        """
    )


def configure_session(session: requests.Session) -> None:
    retry = Retry(
        total=3,
        connect=3,
        read=3,
        backoff_factor=0.6,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset(["GET"]),
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)


def discover_radio_browser_base_urls(session: requests.Session, explicit_server: str | None) -> list[str]:
    if explicit_server:
        return [explicit_server.rstrip("/")]

    response = session.get(RADIO_BROWSER_SERVERS_URL, timeout=REQUEST_TIMEOUT_SECONDS)
    response.raise_for_status()
    servers = response.json()
    names = [clean_text(item.get("name")) for item in servers if isinstance(item, dict)]
    if not names:
        raise RuntimeError("Radio Browser server discovery returned no servers")
    return [f"https://{name.rstrip('/')}" for name in names]


def fetch_json(session: requests.Session, base_url: str, path: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    response = session.get(f"{base_url}{path}", params=params, timeout=REQUEST_TIMEOUT_SECONDS)
    response.raise_for_status()
    data = response.json()
    return [item for item in data if isinstance(item, dict)]


def fetch_country_codes(session: requests.Session, base_url: str) -> list[str]:
    countries = fetch_json(session, base_url, "/json/countries", {})
    codes = sorted(
        {
            clean_text(country.get("iso_3166_1")).upper()
            for country in countries
            if clean_text(country.get("iso_3166_1"))
        }
    )
    if not codes:
        raise RuntimeError("Radio Browser returned no country codes")
    return codes


def fetch_country_stations(
    session: requests.Session,
    base_url: str,
    countrycode: str,
    batch_size: int,
    max_stations: int,
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    offset = 0
    while True:
        remaining = max_stations - len(results) if max_stations else batch_size
        limit = min(batch_size, remaining) if max_stations else batch_size
        if limit <= 0:
            break

        batch = fetch_json(
            session,
            base_url,
            "/json/stations/search",
            {
                "countrycode": countrycode.upper(),
                "hidebroken": "true",
                "order": "votes",
                "reverse": "true",
                "limit": limit,
                "offset": offset,
            },
        )
        results.extend(batch)
        if len(batch) < limit:
            break
        offset += len(batch)
        time.sleep(0.2)

    return results


def fetch_search_stations(
    session: requests.Session,
    base_url: str,
    params: dict[str, Any],
    batch_size: int,
    max_stations: int,
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    offset = 0
    while True:
        remaining = max_stations - len(results) if max_stations else batch_size
        limit = min(batch_size, remaining) if max_stations else batch_size
        if limit <= 0:
            break

        batch = fetch_json(
            session,
            base_url,
            "/json/stations/search",
            {
                **params,
                "hidebroken": "true",
                "limit": limit,
                "offset": offset,
            },
        )
        results.extend(batch)
        if len(batch) < limit:
            break
        offset += len(batch)
        time.sleep(0.2)

    return results


def radio_browser_row(station: dict[str, Any], app_station: dict[str, Any] | None = None) -> dict[str, Any]:
    stationuuid = clean_text(station.get("stationuuid"))
    rb_name = clean_text(station.get("name"))
    app_name = clean_text(app_station.get("name")) if app_station else ""
    original_name = app_name or rb_name
    stream_url = (
        clean_text(app_station.get("streamUrl")) if app_station else ""
    ) or clean_text(station.get("url_resolved")) or clean_text(station.get("url"))
    favicon = clean_text(station.get("favicon"))
    app_logo = (
        clean_text(app_station.get("logo")) or clean_text(app_station.get("image"))
        if app_station
        else ""
    )
    english_name = rb_name if is_ascii_text(rb_name) else english_name_for_search(original_name)
    search_name = " ".join(
        part
        for part in [
            original_name,
            english_name,
            rb_name if rb_name != original_name else "",
            clean_text(station.get("tags")),
            clean_text(station.get("language")),
            clean_text(station.get("state")),
        ]
        if part
    )
    group_name = clean_text(app_station.get("group")) if app_station else ""
    if not group_name:
        group_name = station_group(station.get("countrycode"), station.get("state"))

    return {
        "id": clean_text(app_station.get("id")) if app_station else stable_radio_browser_id(stationuuid, rb_name, stream_url),
        "app_station_id": clean_text(app_station.get("id")) if app_station else None,
        "radio_browser_uuid": stationuuid or None,
        "original_name": original_name or rb_name or "Unknown station",
        "english_name": english_name or original_name or rb_name or "Unknown station",
        "search_name": normalized_search_text(search_name),
        "type": "radio",
        "group_name": group_name,
        "logo": app_logo or favicon or None,
        "stream_url": stream_url or None,
        "normalized_stream_url": normalize_url(stream_url) or None,
        "mime_type": clean_text(app_station.get("mimeType")) if app_station else mime_type_from_codec(station.get("codec"), station.get("hls")),
        "homepage": clean_text(station.get("homepage")) or None,
        "favicon": favicon or None,
        "tags": clean_text(station.get("tags")) or None,
        "country": clean_text(station.get("country")) or None,
        "countrycode": clean_text(station.get("countrycode")).upper() or None,
        "iso_3166_2": clean_text(station.get("iso_3166_2")) or None,
        "state": clean_text(station.get("state")) or None,
        "language": clean_text(station.get("language")) or None,
        "languagecodes": clean_text(station.get("languagecodes")) or None,
        "codec": clean_text(station.get("codec")) or None,
        "bitrate": int(station.get("bitrate") or 0) or None,
        "hls": int(station.get("hls") or 0),
        "votes": int(station.get("votes") or 0),
        "clickcount": int(station.get("clickcount") or 0),
        "clicktrend": int(station.get("clicktrend") or 0),
        "lastcheckok": int(station.get("lastcheckok") or 0),
        "lastchangetime": clean_text(station.get("lastchangetime")) or None,
        "lastchangetime_iso8601": clean_text(station.get("lastchangetime_iso8601")) or None,
        "lastchecktime": clean_text(station.get("lastchecktime")) or None,
        "lastchecktime_iso8601": clean_text(station.get("lastchecktime_iso8601")) or None,
        "lastcheckoktime": clean_text(station.get("lastcheckoktime")) or None,
        "lastcheckoktime_iso8601": clean_text(station.get("lastcheckoktime_iso8601")) or None,
        "lastlocalchecktime": clean_text(station.get("lastlocalchecktime")) or None,
        "lastlocalchecktime_iso8601": clean_text(station.get("lastlocalchecktime_iso8601")) or None,
        "clicktimestamp": clean_text(station.get("clicktimestamp")) or None,
        "clicktimestamp_iso8601": clean_text(station.get("clicktimestamp_iso8601")) or None,
        "ssl_error": int(station.get("ssl_error") or 0),
        "geo_lat": float(station["geo_lat"]) if station.get("geo_lat") not in (None, "") else None,
        "geo_long": float(station["geo_long"]) if station.get("geo_long") not in (None, "") else None,
        "has_extended_info": int(station.get("has_extended_info") or 0),
        "source": "radio_browser",
        "raw_json": json.dumps(station, ensure_ascii=False, sort_keys=True),
        "updated_at": int(time.time()),
    }


def custom_row(app_station: dict[str, Any]) -> dict[str, Any]:
    name = clean_text(app_station.get("name"))
    stream_url = clean_text(app_station.get("streamUrl"))
    logo = clean_text(app_station.get("logo")) or clean_text(app_station.get("image"))
    return {
        "id": clean_text(app_station.get("id")),
        "app_station_id": clean_text(app_station.get("id")),
        "radio_browser_uuid": None,
        "original_name": name or "Unknown station",
        "english_name": english_name_for_search(name) or name or "Unknown station",
        "search_name": normalized_search_text(f"{name} {english_name_for_search(name)}"),
        "type": "radio",
        "group_name": clean_text(app_station.get("group")) or "israelis",
        "logo": logo or None,
        "stream_url": stream_url or None,
        "normalized_stream_url": normalize_url(stream_url) or None,
        "mime_type": clean_text(app_station.get("mimeType")) or None,
        "homepage": None,
        "favicon": None,
        "tags": None,
        "country": None,
        "countrycode": None,
        "iso_3166_2": None,
        "state": None,
        "language": None,
        "languagecodes": None,
        "codec": None,
        "bitrate": None,
        "hls": 0,
        "votes": 0,
        "clickcount": 0,
        "clicktrend": 0,
        "lastcheckok": 0,
        "lastchangetime": None,
        "lastchangetime_iso8601": None,
        "lastchecktime": None,
        "lastchecktime_iso8601": None,
        "lastcheckoktime": None,
        "lastcheckoktime_iso8601": None,
        "lastlocalchecktime": None,
        "lastlocalchecktime_iso8601": None,
        "clicktimestamp": None,
        "clicktimestamp_iso8601": None,
        "ssl_error": 0,
        "geo_lat": None,
        "geo_long": None,
        "has_extended_info": 0,
        "source": "local",
        "raw_json": json.dumps(app_station, ensure_ascii=False, sort_keys=True),
        "updated_at": int(time.time()),
    }


def upsert_station(con: sqlite3.Connection, row: dict[str, Any]) -> bool:
    columns = list(row.keys())
    placeholders = ", ".join("?" for _ in columns)
    assignments = ", ".join(f"{col} = excluded.{col}" for col in columns if col != "id")
    con.execute(
        f"""
        INSERT INTO radio_stations ({", ".join(columns)})
        VALUES ({placeholders})
        ON CONFLICT(id) DO UPDATE SET {assignments}
        """,
        [row[col] for col in columns],
    )
    return con.total_changes > 0


def load_existing_radio_stations(paths: list[Path]) -> list[dict[str, Any]]:
    stations: dict[str, dict[str, Any]] = {}
    for path in paths:
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data = data.get("radio_channels") or data.get("channels") or data.get("stations") or []
        for item in data:
            if not isinstance(item, dict):
                continue
            station_id = clean_text(item.get("id") or item.get("channelID"))
            if not station_id:
                continue
            if item.get("type") == "radio" or station_id.startswith("rd_"):
                stations[station_id] = item
    return list(stations.values())


def remove_duplicate_urls(con: sqlite3.Connection) -> int:
    duplicates = con.execute(
        """
        SELECT normalized_stream_url
        FROM radio_stations
        WHERE normalized_stream_url IS NOT NULL AND normalized_stream_url != ''
        GROUP BY normalized_stream_url
        HAVING COUNT(*) > 1
        """
    ).fetchall()
    removed = 0
    for duplicate in duplicates:
        rows = con.execute(
            """
            SELECT id, source, votes, app_station_id
            FROM radio_stations
            WHERE normalized_stream_url = ?
            """,
            (duplicate["normalized_stream_url"],),
        ).fetchall()
        keep = max(
            rows,
            key=lambda row: (
                3 if row["source"] == "merged" else 2 if row["source"] == "local" else 1,
                1 if row["app_station_id"] else 0,
                int(row["votes"] or 0),
            ),
        )
        for row in rows:
            if row["id"] == keep["id"]:
                continue
            con.execute("DELETE FROM radio_stations WHERE id = ?", (row["id"],))
            removed += 1
    return removed


def curated_logo_for_station(row: sqlite3.Row) -> str | None:
    search_blob = normalized_search_text(
        " ".join(
            clean_text(row[field])
            for field in ("original_name", "english_name", "tags")
            if field in row.keys()
        )
    )
    if not search_blob:
        return None
    for aliases, logo in CURATED_LOGO_OVERRIDES:
        if any(alias in search_blob for alias in aliases):
            return logo
    return None


def enrich_missing_logos(con: sqlite3.Connection) -> int:
    rows = con.execute(
        """
        SELECT id, original_name, english_name, tags, logo
        FROM radio_stations
        WHERE stream_url IS NOT NULL
          AND stream_url != ''
          AND (logo IS NULL OR logo = '')
        """
    ).fetchall()
    updated = 0
    for row in rows:
        logo = curated_logo_for_station(row)
        if not logo:
            continue
        con.execute(
            """
            UPDATE radio_stations
            SET logo = ?, updated_at = ?
            WHERE id = ?
            """,
            (logo, int(time.time()), row["id"]),
        )
        updated += 1
    return updated


def find_existing_match(
    con: sqlite3.Connection,
    session: requests.Session,
    base_url: str,
    app_station: dict[str, Any],
) -> dict[str, Any] | None:
    stream_url = clean_text(app_station.get("streamUrl"))
    normalized = normalize_url(stream_url)
    if normalized:
        row = con.execute(
            """
            SELECT raw_json FROM radio_stations
            WHERE normalized_stream_url = ? AND radio_browser_uuid IS NOT NULL
            ORDER BY votes DESC
            LIMIT 1
            """,
            (normalized,),
        ).fetchone()
        if row:
            return json.loads(row["raw_json"])

        try:
            for candidate in fetch_json(session, base_url, "/json/stations/byurl", {"url": stream_url}):
                if normalize_url(candidate.get("url")) == normalized or normalize_url(candidate.get("url_resolved")) == normalized:
                    return candidate
        except requests.RequestException:
            pass

    name = clean_text(app_station.get("name"))
    if not name:
        return None
    try:
        candidates = fetch_json(
            session,
            base_url,
            "/json/stations/search",
            {"name": name, "hidebroken": "true", "limit": 10, "order": "votes", "reverse": "true"},
        )
    except requests.RequestException:
        return None
    normalized_name = normalized_search_text(name)
    return max(
        candidates,
        key=lambda candidate: (
            normalized_search_text(candidate.get("name")) == normalized_name,
            int(candidate.get("votes") or 0),
        ),
        default=None,
    )


def insert_radio_browser_stations(
    con: sqlite3.Connection,
    stations: list[dict[str, Any]],
    stats: ScanStats,
    seen_uuids: set[str],
    seen_urls: set[str],
) -> None:
    stats.fetched += len(stations)
    for station in stations:
        stationuuid = clean_text(station.get("stationuuid"))
        normalized = normalize_url(station.get("url_resolved") or station.get("url"))
        if stationuuid and stationuuid in seen_uuids:
            stats.duplicate_uuid += 1
            continue
        if normalized and normalized in seen_urls:
            stats.duplicate_url += 1
            continue
        if stationuuid:
            seen_uuids.add(stationuuid)
        if normalized:
            seen_urls.add(normalized)
        row = radio_browser_row(station)
        if row["radio_browser_uuid"]:
            existing = con.execute(
                """
                SELECT id, app_station_id
                FROM radio_stations
                WHERE radio_browser_uuid = ? AND id != ?
                LIMIT 1
                """,
                (row["radio_browser_uuid"], row["id"]),
            ).fetchone()
            if existing and clean_text(existing["app_station_id"]):
                stats.duplicate_uuid += 1
                continue
            con.execute(
                """
                DELETE FROM radio_stations
                WHERE radio_browser_uuid = ? AND id != ? AND app_station_id IS NULL
                """,
                (row["radio_browser_uuid"], row["id"]),
            )
        upsert_station(con, row)
        stats.inserted += 1


def merge_existing_stations(
    con: sqlite3.Connection,
    session: requests.Session,
    base_url: str,
    existing_paths: list[Path],
    stats: ScanStats,
) -> None:
    existing_stations = load_existing_radio_stations(existing_paths)
    print(f"local: merging {len(existing_stations)} existing app stations", flush=True)
    for app_station in existing_stations:
        match = find_existing_match(con, session, base_url, app_station)
        if match:
            row = radio_browser_row(match, app_station=app_station)
            row["source"] = "merged"
            con.execute(
                """
                DELETE FROM radio_stations
                WHERE radio_browser_uuid = ? AND id != ?
                """,
                (row["radio_browser_uuid"], row["id"]),
            )
            stats.existing_matched += 1
        else:
            row = custom_row(app_station)
            stats.existing_inserted += 1
        upsert_station(con, row)


def fetch_from_first_available_server(
    base_urls: list[str],
    label: str,
    fetcher: Any,
) -> tuple[list[dict[str, Any]], str]:
    last_error: Exception | None = None
    for candidate_base_url in base_urls:
        try:
            return fetcher(candidate_base_url), candidate_base_url
        except requests.RequestException as error:
            last_error = error
            print(f"{label}: {candidate_base_url} failed: {error}", file=sys.stderr, flush=True)
    if last_error:
        raise last_error
    return [], base_urls[0]


def scan(args: argparse.Namespace) -> None:
    db_path = Path(args.db)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    configure_session(session)
    session.headers.update(
        {
            "User-Agent": args.user_agent,
            "Accept": "application/json",
        }
    )
    base_urls = discover_radio_browser_base_urls(session, args.server)
    base_url = base_urls[0]
    if args.all_countries:
        countries = fetch_country_codes(session, base_url)
    else:
        countries = [country.upper() for country in args.country_code]
    existing_paths = [Path(path) for path in args.existing_json]
    stats = ScanStats()

    with sqlite3.connect(db_path) as con:
        con.row_factory = sqlite3.Row
        init_db(con)
        run_id = con.execute(
            "INSERT INTO scan_runs (started_at, countries) VALUES (?, ?)",
            (int(time.time()), ",".join(countries)),
        ).lastrowid

        seen_uuids: set[str] = set()
        seen_urls: set[str] = set()

        for country in countries:
            stations = []
            last_error: Exception | None = None
            for candidate_base_url in base_urls:
                try:
                    stations = fetch_country_stations(
                        session,
                        candidate_base_url,
                        country,
                        args.batch_size,
                        args.limit_per_country,
                    )
                    base_url = candidate_base_url
                    break
                except requests.RequestException as error:
                    last_error = error
                    print(f"{country}: {candidate_base_url} failed: {error}", file=sys.stderr, flush=True)
            if not stations and last_error:
                raise last_error
            print(f"{country}: fetched {len(stations)} stations from {base_url}", flush=True)
            insert_radio_browser_stations(con, stations, stats, seen_uuids, seen_urls)

        if args.merge_existing:
            merge_existing_stations(con, session, base_url, existing_paths, stats)

        enriched_logos = enrich_missing_logos(con)
        stats.url_duplicates_removed = remove_duplicate_urls(con)

        con.execute(
            """
            UPDATE scan_runs
            SET finished_at = ?,
                fetched = ?,
                inserted = ?,
                updated = ?,
                duplicate_uuid = ?,
                duplicate_url = ?,
                url_duplicates_removed = ?,
                existing_matched = ?,
                existing_inserted = ?
            WHERE id = ?
            """,
            (
                int(time.time()),
                stats.fetched,
                stats.inserted,
                stats.updated,
                stats.duplicate_uuid,
                stats.duplicate_url,
                stats.url_duplicates_removed,
                stats.existing_matched,
                stats.existing_inserted,
                run_id,
            ),
        )
        con.commit()

    print(
        json.dumps(
            {
                "db": str(db_path),
                "fetched": stats.fetched,
                "inserted": stats.inserted,
                "duplicateUuid": stats.duplicate_uuid,
                "duplicateUrl": stats.duplicate_url,
                "urlDuplicatesRemoved": stats.url_duplicates_removed,
                "existingMatched": stats.existing_matched,
                "existingInserted": stats.existing_inserted,
                "logosEnriched": enriched_logos,
            },
            ensure_ascii=False,
            indent=2,
        ),
        flush=True,
    )


def scan_app_catalog(args: argparse.Namespace) -> None:
    db_path = Path(args.db)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    configure_session(session)
    session.headers.update(
        {
            "User-Agent": args.user_agent,
            "Accept": "application/json",
        }
    )
    base_urls = discover_radio_browser_base_urls(session, args.server)
    base_url = base_urls[0]
    stats = ScanStats()
    existing_paths = [Path(path) for path in args.existing_json]
    local_states = unique_clean_values(args.local_state)
    local_countries = unique_clean_values([country.upper() for country in args.local_country_code])
    run_label = (
        f"app-catalog:IL,"
        f"local={'+'.join(local_countries)}:{'|'.join(local_states)},"
        f"world_top={args.popular_world_limit}"
    )

    with sqlite3.connect(db_path) as con:
        con.row_factory = sqlite3.Row
        init_db(con)
        run_id = con.execute(
            "INSERT INTO scan_runs (started_at, countries) VALUES (?, ?)",
            (int(time.time()), run_label),
        ).lastrowid

        seen_uuids: set[str] = set()
        seen_urls: set[str] = set()

        israel_stations, base_url = fetch_from_first_available_server(
            base_urls,
            "IL",
            lambda server_url: fetch_country_stations(
                session,
                server_url,
                "IL",
                args.batch_size,
                args.israel_limit,
            ),
        )
        print(f"IL: fetched {len(israel_stations)} stations from {base_url}", flush=True)
        insert_radio_browser_stations(con, israel_stations, stats, seen_uuids, seen_urls)

        for country in local_countries:
            for state in local_states:
                label = f"local {country}/{state}"
                local_stations, base_url = fetch_from_first_available_server(
                    base_urls,
                    label,
                    lambda server_url, country=country, state=state: fetch_search_stations(
                        session,
                        server_url,
                        {
                            "countrycode": country,
                            "state": state,
                            "order": "votes",
                            "reverse": "true",
                        },
                        args.batch_size,
                        args.local_limit,
                    ),
                )
                print(f"{label}: fetched {len(local_stations)} stations from {base_url}", flush=True)
                insert_radio_browser_stations(con, local_stations, stats, seen_uuids, seen_urls)

        world_stations, base_url = fetch_from_first_available_server(
            base_urls,
            "world topvote",
            lambda server_url: fetch_json(
                session,
                server_url,
                f"/json/stations/topvote/{args.popular_world_limit}",
                {"hidebroken": "true"},
            ),
        )
        print(f"world topvote: fetched {len(world_stations)} stations from {base_url}", flush=True)
        insert_radio_browser_stations(con, world_stations, stats, seen_uuids, seen_urls)

        merge_existing_stations(con, session, base_url, existing_paths, stats)
        enriched_logos = enrich_missing_logos(con)
        stats.url_duplicates_removed = remove_duplicate_urls(con)

        con.execute(
            """
            UPDATE scan_runs
            SET finished_at = ?,
                fetched = ?,
                inserted = ?,
                updated = ?,
                duplicate_uuid = ?,
                duplicate_url = ?,
                url_duplicates_removed = ?,
                existing_matched = ?,
                existing_inserted = ?
            WHERE id = ?
            """,
            (
                int(time.time()),
                stats.fetched,
                stats.inserted,
                stats.updated,
                stats.duplicate_uuid,
                stats.duplicate_url,
                stats.url_duplicates_removed,
                stats.existing_matched,
                stats.existing_inserted,
                run_id,
            ),
        )
        con.commit()

    export_android(
        argparse.Namespace(
            db=str(db_path),
            output=args.output,
            existing_json=args.existing_json,
            local_state=local_states,
            popular_world_limit=args.popular_world_limit,
        )
    )

    print(
        json.dumps(
            {
                "db": str(db_path),
                "fetched": stats.fetched,
                "inserted": stats.inserted,
                "duplicateUuid": stats.duplicate_uuid,
                "duplicateUrl": stats.duplicate_url,
                "urlDuplicatesRemoved": stats.url_duplicates_removed,
                "existingMatched": stats.existing_matched,
                "existingInserted": stats.existing_inserted,
                "logosEnriched": enriched_logos,
            },
            ensure_ascii=False,
            indent=2,
        ),
        flush=True,
    )


def init_android_db(con: sqlite3.Connection) -> None:
    con.executescript(
        """
        PRAGMA user_version=1;
        CREATE TABLE radio_channels (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            type TEXT,
            logo TEXT,
            stream_url TEXT,
            mime_type TEXT,
            group_name TEXT
        );
        CREATE INDEX idx_radio_channels_group_name ON radio_channels(group_name);
        """
    )


def select_android_export_rows(
    con: sqlite3.Connection,
    existing_ids: set[str],
    local_state_terms: list[str],
    popular_world_limit: int,
) -> tuple[list[sqlite3.Row], int]:
    local_state_filter = ""
    params: list[Any] = []
    if local_state_terms:
        local_state_filter = " OR " + " OR ".join("LOWER(COALESCE(state, '')) LIKE ?" for _ in local_state_terms)
        params.extend(f"%{term.lower()}%" for term in local_state_terms)

    rows = con.execute(
        f"""
        SELECT *
        FROM radio_stations
        WHERE stream_url IS NOT NULL
          AND stream_url != ''
          AND (
                countrycode = 'IL'
                OR group_name = 'local'
                {local_state_filter}
                OR app_station_id IS NOT NULL
          )
        ORDER BY
            CASE
                WHEN app_station_id IS NOT NULL THEN 0
                WHEN countrycode = 'IL' THEN 1
                WHEN group_name = 'local' THEN 2
                ELSE 3
            END,
            votes DESC,
            original_name COLLATE NOCASE ASC
        """,
        params,
    ).fetchall()

    selected_by_id: dict[str, sqlite3.Row] = {}
    selected_urls: set[str] = set()
    selected_names: set[str] = set()
    skipped_duplicate_names = 0

    def add_row(row: sqlite3.Row) -> None:
        nonlocal skipped_duplicate_names
        row_id = clean_text(row["app_station_id"]) or clean_text(row["id"])
        normalized = clean_text(row["normalized_stream_url"])
        name_key = ":".join(
            (
                clean_text(row["group_name"]) or "world",
                normalized_search_text(row["original_name"]),
            )
        )
        if not row_id or row_id in selected_by_id:
            return
        if normalized and normalized in selected_urls:
            return
        if name_key in selected_names:
            skipped_duplicate_names += 1
            return
        selected_by_id[row_id] = row
        if normalized:
            selected_urls.add(normalized)
        selected_names.add(name_key)

    for row in rows:
        add_row(row)

    world_rows = con.execute(
        """
        SELECT *
        FROM radio_stations
        WHERE stream_url IS NOT NULL
          AND stream_url != ''
          AND group_name = 'world'
          AND countrycode != 'IL'
          AND app_station_id IS NULL
        ORDER BY votes DESC, clickcount DESC, original_name COLLATE NOCASE ASC
        LIMIT ?
        """,
        (popular_world_limit,),
    ).fetchall()
    for row in world_rows:
        add_row(row)

    # Make sure every existing app station is present even if its URL duplicates a
    # Radio Browser station that was selected earlier.
    if existing_ids:
        placeholders = ", ".join("?" for _ in existing_ids)
        existing_rows = con.execute(
            f"""
            SELECT *
            FROM radio_stations
            WHERE app_station_id IN ({placeholders})
            ORDER BY original_name COLLATE NOCASE ASC
            """,
            sorted(existing_ids),
        ).fetchall()
        for row in existing_rows:
            row_id = clean_text(row["app_station_id"]) or clean_text(row["id"])
            if row_id:
                add_row(row)

    return list(selected_by_id.values()), skipped_duplicate_names


def export_android(args: argparse.Namespace) -> None:
    source_db = Path(args.db)
    output_db = Path(args.output)
    existing_stations = load_existing_radio_stations([Path(path) for path in args.existing_json])
    existing_ids = {clean_text(station.get("id") or station.get("channelID")) for station in existing_stations}
    existing_ids.discard("")

    with sqlite3.connect(source_db) as source:
        source.row_factory = sqlite3.Row
        rows, skipped_duplicate_names = select_android_export_rows(
            source,
            existing_ids=existing_ids,
            local_state_terms=args.local_state,
            popular_world_limit=args.popular_world_limit,
        )

    output_db.parent.mkdir(parents=True, exist_ok=True)
    temp_db = output_db.with_suffix(output_db.suffix + ".tmp")
    if temp_db.exists():
        temp_db.unlink()

    with sqlite3.connect(temp_db) as target:
        init_android_db(target)
        target.executemany(
            """
            INSERT INTO radio_channels (id, name, type, logo, stream_url, mime_type, group_name)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    clean_text(row["app_station_id"]) or clean_text(row["id"]),
                    clean_text(row["original_name"]),
                    "radio",
                    clean_text(row["logo"]) or None,
                    clean_text(row["stream_url"]) or None,
                    clean_text(row["mime_type"]) or None,
                    clean_text(row["group_name"]) or "world",
                )
                for row in rows
            ],
        )
        target.commit()

    temp_db.replace(output_db)
    counts: dict[str, int] = {}
    for row in rows:
        group = clean_text(row["group_name"]) or "world"
        counts[group] = counts.get(group, 0) + 1

    print(
        json.dumps(
            {
                "sourceDb": str(source_db),
                "outputDb": str(output_db),
                "stations": len(rows),
                "existingStationsIncluded": len(existing_ids),
                "duplicateNamesSkipped": skipped_duplicate_names,
                "groups": counts,
            },
            ensure_ascii=False,
            indent=2,
        ),
        flush=True,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scan Radio Browser stations and export app-ready DBs.")
    subparsers = parser.add_subparsers(dest="command")

    scan_parser = subparsers.add_parser("scan", help="Scan Radio Browser into the server DB.")
    scan_parser.add_argument("--db", default=str(DEFAULT_DB_PATH), help="SQLite DB path to create/update.")
    scan_parser.add_argument(
        "--country-code",
        action="append",
        default=[],
        help="ISO 3166-1 alpha-2 country code to scan. Repeatable. Defaults to IL and US.",
    )
    scan_parser.add_argument(
        "--all-countries",
        action="store_true",
        help="Scan every country known to Radio Browser. This can create a large DB.",
    )
    scan_parser.add_argument("--limit-per-country", type=int, default=0, help="Max stations per country. 0 means all.")
    scan_parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help="Radio Browser page size.")
    scan_parser.add_argument("--server", help="Explicit Radio Browser server URL. Defaults to server discovery.")
    scan_parser.add_argument("--user-agent", default=DEFAULT_USER_AGENT, help="HTTP User-Agent sent to Radio Browser.")
    scan_parser.add_argument(
        "--existing-json",
        action="append",
        default=[],
        help="Existing app radio JSON to merge. Repeatable.",
    )
    scan_parser.add_argument(
        "--no-merge-existing",
        dest="merge_existing",
        action="store_false",
        help="Do not merge existing app stations.",
    )
    scan_parser.set_defaults(merge_existing=True)

    catalog_parser = subparsers.add_parser(
        "scan-app-catalog",
        help="Scan the recommended app catalog and export the Android DB.",
    )
    catalog_parser.add_argument("--db", default=str(DEFAULT_DB_PATH), help="Server radio SQLite DB.")
    catalog_parser.add_argument("--output", default=str(DEFAULT_ANDROID_DB_PATH), help="Android DB asset output path.")
    catalog_parser.add_argument("--server", help="Explicit Radio Browser server URL. Defaults to server discovery.")
    catalog_parser.add_argument("--user-agent", default=DEFAULT_USER_AGENT, help="HTTP User-Agent sent to Radio Browser.")
    catalog_parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help="Radio Browser page size.")
    catalog_parser.add_argument(
        "--israel-limit",
        type=int,
        default=0,
        help="Max Israel stations to scan. 0 means all Israel stations.",
    )
    catalog_parser.add_argument(
        "--local-country-code",
        action="append",
        default=[],
        help="Local country code to scan by state/city. Repeatable.",
    )
    catalog_parser.add_argument(
        "--local-state",
        action="append",
        default=[],
        help="Local state/city term to scan and export. Repeatable.",
    )
    catalog_parser.add_argument(
        "--local-limit",
        type=int,
        default=0,
        help="Max local stations per state/city term. 0 means all matches.",
    )
    catalog_parser.add_argument(
        "--popular-world-limit",
        type=int,
        default=500,
        help="Max popular world stations to scan/export.",
    )
    catalog_parser.add_argument(
        "--existing-json",
        action="append",
        default=[],
        help="Existing app radio JSON to always include. Repeatable.",
    )

    export_parser = subparsers.add_parser("export-android", help="Export a small Android Room asset DB.")
    export_parser.add_argument("--db", default=str(DEFAULT_DB_PATH), help="Source server radio SQLite DB.")
    export_parser.add_argument("--output", default=str(DEFAULT_ANDROID_DB_PATH), help="Android DB asset output path.")
    export_parser.add_argument(
        "--existing-json",
        action="append",
        default=[],
        help="Existing app radio JSON to always include. Repeatable.",
    )
    export_parser.add_argument(
        "--local-state",
        action="append",
        default=["Massachusetts", "Boston", "Cambridge"],
        help="State/city terms considered local. Repeatable.",
    )
    export_parser.add_argument(
        "--popular-world-limit",
        type=int,
        default=500,
        help="Max additional popular world stations to export.",
    )

    args = parser.parse_args()
    if args.command is None:
        args.command = "scan"
    if args.command == "scan" and not args.country_code:
        args.country_code = ["IL", "US"]
    if args.command == "scan-app-catalog":
        if not args.local_country_code:
            args.local_country_code = ["US"]
        if not args.local_state:
            args.local_state = ["Massachusetts", "Boston", "Cambridge"]
    if not args.existing_json:
        args.existing_json = [str(DEFAULT_ANDROID_RADIO_JSON), str(DEFAULT_CUSTOM_CHANNELS_JSON)]
    return args


if __name__ == "__main__":
    try:
        arguments = parse_args()
        if arguments.command == "scan-app-catalog":
            scan_app_catalog(arguments)
        elif arguments.command == "export-android":
            export_android(arguments)
        else:
            scan(arguments)
    except KeyboardInterrupt:
        print("Interrupted", file=sys.stderr)
        raise SystemExit(130)
