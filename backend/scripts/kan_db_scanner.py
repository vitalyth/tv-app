#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Kan 11 VOD scanner.

Features:
- Fetch all Kan 11 programs from mobapi.
- Scan one/all programs into SQLite.
- Filter scan by program title, program id, or mainid.
- Parse seasons and episodes from Kan program pages using cloudscraper.
- Resolve stream_url from episode/program pages using data-hls-url/data-dash-url or Kaltura.
- Incremental SQLite upsert: adds/updates existing rows without deleting old data.
- Read-only commands:
  list-programs, count-seasons, list-episodes, stream-url, search, get-episode.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
import subprocess
import shutil
import time
import select
import tempfile
import threading
import signal
import atexit
import traceback
from dataclasses import asdict, dataclass
from html import unescape
from collections import deque
from typing import Any, Optional
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit

import requests
from bs4 import BeautifulSoup

try:
    import cloudscraper
except ImportError:
    cloudscraper = None

try:
    from curl_cffi import requests as curl_requests
except ImportError:
    curl_requests = None


API_URL = "https://mobapi.kan.org.il/api/mobile/subClass"
DEFAULT_SUBCLASS_IDS = ["4444"]
KAN_BASE_URL = "https://www.kan.org.il"
KALTURA_PARTNER_ID = 2717431

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/121.0.0.0 Safari/537.36"
    ),
    "Referer": "https://www.kan.org.il/",
    "Accept": "*/*",
}

ENRICH_MISSING_METADATA = False


@dataclass
class Program:
    id: str
    mainid: str
    title: str
    description: str
    url: str
    image: Optional[str] = None
    program_format: Optional[str] = None
    program_genre: Optional[str] = None


@dataclass
class Season:
    program_id: str
    season_id: str
    title: str
    url: str
    season_number: Optional[int] = None


@dataclass
class Episode:
    id: str
    program_id: str
    season_id: Optional[str]
    title: str
    description: str
    url: str
    image: Optional[str] = None
    play_url: Optional[str] = None
    stream_url: Optional[str] = None
    kaltura_entry_id: Optional[str] = None
    published: Optional[str] = None


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    return unescape(str(value)).replace("\u200b", "").strip()


def is_bad_episode_title(title: str) -> bool:
    title = clean_text(title)
    if not title:
        return True

    bad_exact = {
        "לצפייה",
        "צפייה",
        "לצפיה",
        "נגן",
        "play",
    }

    bad_contains = [
        "לצפייה בפרק",
        "לצפיה בפרק",
        "לצפייה בסרט",
        "לצפיה בסרט",
        "לצפייה בתוכנית",
        "לצפיה בתוכנית",
        "צפייה בפרק",
        "צפיה בפרק",
    ]

    if title.lower() in bad_exact:
        return True

    return any(x in title for x in bad_contains)


def clean_url(url: str) -> str:
    url = (url or "").strip()
    url = url.replace("?app=true", "")
    url = url.replace("&app=true", "")
    return url


def normalize_url(url: str, base: str = KAN_BASE_URL) -> str:
    if not url:
        return ""
    return clean_url(urljoin(base, url))


def is_junk_url(url: str) -> bool:
    if not url:
        return True

    lower = url.lower()

    junk_parts = [
        "#navigation",
        "/authentication/",
        "/login",
        "/logout",
        "/registration",
        "personal-area",
        "javascript:",
        "mailto:",
        "tel:",
    ]

    return any(part in lower for part in junk_parts)


def extract_program_id_from_url(url: str) -> Optional[str]:
    m = re.search(r"/p-(\d+)/?", url)
    return m.group(1) if m else None


def extract_episode_id_from_url(url: str) -> Optional[str]:
    """
    Episode URLs can look like:
    /content/kan/kan-11/p-1033206/s1/1033208/
    /content/kan/kan-11/p-11332/עונה-1/158925/
    or for single movies:
    /content/kan/kan-11/p-1043786/1043787/
    """
    patterns = [
        r"/s\d+/(\d+)/?",
        r"/עונה-\d+/(\d+)/?",
        r"/episodes?/(\d+)/?",
        r"/p-\d+/(\d+)/?$",
    ]
    for pattern in patterns:
        m = re.search(pattern, url)
        if m:
            return m.group(1)
    return None


def extract_season_number(url: str, title: str = "") -> Optional[int]:
    m = re.search(r"/s(\d+)/?", url)
    if m:
        return int(m.group(1))
    m = re.search(r"/עונה-(\d+)/?", url)
    if m:
        return int(m.group(1))
    m = re.search(r"עונה\s*(\d+)", title)
    if m:
        return int(m.group(1))
    return None


def is_episode_url(url: str, program_id: Optional[str] = None) -> bool:
    if is_junk_url(url):
        return False

    if program_id and f"/p-{program_id}/" not in url:
        return False

    episode_id = extract_episode_id_from_url(url)
    if not episode_id:
        return False

    # Ignore the program page itself, only accept a child item/episode.
    if program_id and episode_id == str(program_id):
        return False

    return True


def is_season_url(url: str, program_id: Optional[str] = None) -> bool:
    if is_junk_url(url):
        return False

    if program_id and f"/p-{program_id}/" not in url:
        return False

    if extract_episode_id_from_url(url):
        return False

    return re.search(r"/(?:s\d+|עונה-\d+)/?$", url) is not None


def season_page_has_episodes(program: Program, season_url: str) -> bool:
    try:
        html = fetch_cf_text(season_url)
        soup = BeautifulSoup(html, "html.parser")
    except Exception:
        return False

    episode_root = soup.select_one(".seasons") or soup
    for a in episode_root.select("a[href]"):
        url = normalize_url(a.get("href") or "", season_url)
        if is_episode_url(url, program.id):
            return True

    return False


def pick_image(item: dict) -> Optional[str]:
    media_groups = item.get("media_group") or []
    if not media_groups:
        return None

    media_items = media_groups[0].get("media_item") or []

    for key in ("image_base_2x3", "image_base_16x9", "image_base", "image_base_1x1"):
        for media in media_items:
            if media.get("key") == key and media.get("src"):
                return str(media["src"]).split("?")[0]

    for media in reversed(media_items):
        if media.get("src"):
            return str(media["src"]).split("?")[0]

    return None


def pick_program_genre(item: dict, analytics: dict) -> Optional[str]:
    ext = item.get("extensions") or {}
    candidates = [
        analytics.get("program_genre"),
        analytics.get("genre"),
        analytics.get("category"),
        ext.get("program_genre"),
        ext.get("genre"),
        item.get("category"),
        item.get("genre"),
    ]

    for value in candidates:
        if isinstance(value, list):
            value = ", ".join(clean_text(item) for item in value if clean_text(item))

        text = clean_text(value)
        if text:
            return text

    return None


def make_scraper():
    if cloudscraper is None:
        raise RuntimeError(
            "cloudscraper is not installed. Run: python -m pip install cloudscraper"
        )
    return cloudscraper.create_scraper(interpreter="native")


def fetch_cf_text(url: str, retries: int = 3, timeout: int = 30) -> str:
    """
    Fetch Kan pages behind Cloudflare.

    Docker/Linux can be blocked by Cloudflare even when cloudscraper works on macOS.
    Try curl_cffi first because it can impersonate a real Chrome TLS/browser
    fingerprint. Fall back to cloudscraper for local environments where it works.
    """
    last_error: Optional[Exception] = None

    for attempt in range(1, retries + 1):
        try:
            if curl_requests is not None:
                try:
                    response = curl_requests.get(
                        url,
                        headers=HEADERS,
                        timeout=timeout,
                        impersonate="chrome124",
                    )

                    if response.status_code != 403:
                        response.raise_for_status()
                        return response.text

                    last_error = RuntimeError(f"403 Forbidden with curl_cffi: {url}")
                except KeyboardInterrupt:
                    raise
                except Exception as ex:
                    last_error = ex

            scraper = make_scraper()
            response = scraper.get(url, headers=HEADERS, timeout=timeout)

            if response.status_code == 403:
                last_error = RuntimeError(f"403 Forbidden with cloudscraper: {url}")
                time.sleep(1)
                continue

            response.raise_for_status()
            return response.text

        except KeyboardInterrupt:
            raise
        except Exception as ex:
            last_error = ex
            time.sleep(1)

    raise RuntimeError(f"Failed to fetch {url}: {last_error}")

def kan_api_get(params: dict[str, Any], retries: int = 3, timeout: int = 30) -> dict[str, Any]:
    """
    Fetch Kan mobile API with a browser-like TLS fingerprint when possible.

    The regular requests library may get 403 from mobapi.kan.org.il even when
    the endpoint works in a browser. curl_cffi can impersonate Chrome and is
    already used elsewhere in this scanner for Kan/Cloudflare pages.
    """
    last_error: Optional[Exception] = None

    for attempt in range(1, retries + 1):
        try:
            if curl_requests is not None:
                response = curl_requests.get(
                    API_URL,
                    params=params,
                    headers=HEADERS,
                    timeout=timeout,
                    impersonate="chrome124",
                )

                if response.status_code != 403:
                    response.raise_for_status()
                    return response.json()

                last_error = RuntimeError(
                    f"403 Forbidden with curl_cffi: {response.url}"
                )
            else:
                response = requests.get(
                    API_URL,
                    params=params,
                    headers=HEADERS,
                    timeout=timeout,
                )
                response.raise_for_status()
                return response.json()

        except KeyboardInterrupt:
            raise
        except Exception as ex:
            last_error = ex

        if attempt < retries:
            time.sleep(1)

    raise RuntimeError(f"Failed to fetch Kan API {params}: {last_error}")


def fetch_all_programs(subclass_ids: Optional[list[str]] = None) -> list[Program]:
    programs: list[Program] = []
    seen: set[str] = set()
    source_ids = [str(item).strip() for item in (subclass_ids or DEFAULT_SUBCLASS_IDS) if str(item).strip()]

    for subclass_id in source_ids:
        start = 1

        while True:
            try:
                data = kan_api_get({"from": start, "id": subclass_id})
            except Exception as ex:
                print(
                    f"Failed to fetch Kan programs "
                    f"(subclass={subclass_id}, from={start}): {ex}",
                    file=sys.stderr,
                )
                break

            entries = data.get("entry") or []

            if not entries:
                break

            for item in entries:
                link = ((item.get("link") or {}).get("href") or "")
                link = normalize_url(link)

                if not link or link in seen:
                    continue

                seen.add(link)

                ext = item.get("extensions") or {}
                analytics = ext.get("analyticsCustomProperties") or {}

                programs.append(
                    Program(
                        id=str(item.get("id") or ""),
                        mainid=str(ext.get("mainid") or analytics.get("cq_id") or ""),
                        title=clean_text(item.get("title")),
                        description=clean_text(item.get("description") or item.get("summary")),
                        url=link,
                        image=pick_image(item),
                        program_format=analytics.get("program_format"),
                        program_genre=pick_program_genre(item, analytics),
                    )
                )

            if len(entries) < 200:
                break

            start += 200

    return programs


def filter_programs(
    programs: list[Program],
    titles: Optional[list[str]] = None,
    ids: Optional[list[str]] = None,
    mainids: Optional[list[str]] = None,
) -> list[Program]:
    filtered = programs

    if titles:
        wanted = [t.strip() for t in titles if t.strip()]
        filtered = [
            p for p in filtered
            if any(w in p.title or p.title == w for w in wanted)
        ]

    if ids:
        wanted_ids = {str(x) for x in ids}
        filtered = [p for p in filtered if str(p.id) in wanted_ids]

    if mainids:
        wanted_mainids = {str(x) for x in mainids}
        filtered = [p for p in filtered if str(p.mainid) in wanted_mainids]

    return filtered


def parse_seasons(program: Program) -> list[Season]:
    html = fetch_cf_text(program.url)
    soup = BeautifulSoup(html, "html.parser")

    seasons: list[Season] = []
    seen: set[str] = set()

    # Prefer links that are clearly season URLs for the same program.
    for a in soup.select("a[href]"):
        href = a.get("href") or ""
        url = normalize_url(href, program.url)

        if not is_season_url(url, program.id):
            continue

        if url in seen:
            continue

        seen.add(url)
        title = clean_text(a.get_text(" ", strip=True)) or f"Season {extract_season_number(url) or ''}".strip()
        season_number = extract_season_number(url, title)
        season_id = f"{program.id}:s{season_number}" if season_number else url

        seasons.append(
            Season(
                program_id=program.id,
                season_id=season_id,
                title=title,
                url=url,
                season_number=season_number,
            )
        )

    # If no explicit season pages, use program page as one virtual season.
    if seasons:
        existing_numbers = {season.season_number for season in seasons if season.season_number}
        max_season_number = max(existing_numbers or {0})

        for season_number in range(1, max_season_number):
            if season_number in existing_numbers:
                continue

            url = normalize_url(f"s{season_number}/", program.url)
            if url in seen or not season_page_has_episodes(program, url):
                continue

            seen.add(url)
            seasons.append(
                Season(
                    program_id=program.id,
                    season_id=f"{program.id}:s{season_number}",
                    title=f"עונה {season_number}",
                    url=url,
                    season_number=season_number,
                )
            )

    # If no explicit or inferred season pages, use program page as one virtual season.
    if not seasons:
        seasons.append(
            Season(
                program_id=program.id,
                season_id=f"{program.id}:single",
                title="ללא עונה",
                url=program.url,
                season_number=None,
            )
        )

    seasons.sort(key=lambda s: (s.season_number is None, s.season_number or 9999, s.title))
    return seasons


def card_title(card: Any) -> str:
    for selector in [".card-title", ".title", "h2", "h3", "h4"]:
        el = card.select_one(selector)
        if el:
            text = clean_text(el.get_text(" ", strip=True))
            if text:
                return text
    return clean_text(card.get_text(" ", strip=True))


def card_description(card: Any) -> str:
    for selector in [".card-text", ".description", ".info-description", "p"]:
        el = card.select_one(selector)
        if el:
            text = clean_text(el.get_text(" ", strip=True))
            if text:
                return text
    return ""


def split_aria_label_details(label: str) -> tuple[str, str]:
    """
    Kan cards often put useful episode details in aria-label:
    "פרק 1 - הצוואה-שלושת האחים לבית ברקאי..."
    or sometimes:
    "שם הפרק-תיאור הפרק"

    Return (title, description) when possible.
    """
    label = clean_text(label)
    if not label:
        return "", ""

    # Normalize common separators.
    label = label.replace("–", "-").replace("—", "-")

    # Prefer the second hyphen as separator when title itself contains "פרק X - ..."
    parts = [clean_text(p) for p in label.split("-") if clean_text(p)]

    if len(parts) >= 3 and re.search(r"^פרק\s*\d+", parts[0]):
        title = f"{parts[0]} - {parts[1]}"
        desc = " - ".join(parts[2:])
        return title, desc

    if len(parts) >= 2:
        return parts[0], " - ".join(parts[1:])

    return label, ""


def card_aria_details(anchor: Any) -> tuple[str, str]:
    label = anchor.get("aria-label") or ""
    return split_aria_label_details(label)


def find_best_episode_card(anchor: Any) -> Any:
    """
    Find the smallest useful card/container around an episode link.
    Kan markup changes between pages, so use several common containers.
    """
    selectors = [
        "li",
        "article",
        ".card",
        ".card-row",
        ".card-item",
        ".block-media",
        ".media-wrap",
        ".vod-item",
        ".program-item",
        ".item",
    ]

    best = anchor
    for selector in selectors:
        parent = anchor.find_parent(selector)
        if parent:
            best = parent
            break

    return best


def first_image_src(node: Any, base_url: str) -> Optional[str]:
    # Regular img tag
    img = node.select_one("img[src]")
    if img and img.get("src"):
        return normalize_url(img.get("src"), base_url)

    # Lazy-loaded images
    for attr in ["data-src", "data-original", "data-lazy", "data-bg"]:
        img = node.select_one(f"img[{attr}]")
        if img and img.get(attr):
            return normalize_url(img.get(attr), base_url)

    # CSS background-image: url(...)
    html = str(node)
    m = re.search(r"background-image\s*:\s*url\(['\"]?([^'\")]+)", html, re.I)
    if m:
        return normalize_url(m.group(1), base_url)

    m = re.search(r"url\(['\"]?([^'\")]+)", html, re.I)
    if m:
        return normalize_url(m.group(1), base_url)

    return None


def page_meta_details(page_url: str) -> tuple[str, str, Optional[str]]:
    """
    Fallback: fetch the episode page and extract title/description/image from meta tags.
    Used when list-card markup has no description/image.
    """
    try:
        html = fetch_cf_text(page_url)
        soup = BeautifulSoup(html, "html.parser")

        title = ""
        desc = ""
        image = None

        title_tag = soup.select_one("meta[property='og:title']") or soup.select_one("title")
        if title_tag:
            title = clean_text(title_tag.get("content") if title_tag.name == "meta" else title_tag.get_text(" ", strip=True))

        desc_tag = soup.select_one("meta[property='og:description']") or soup.select_one("meta[name='description']")
        if desc_tag:
            desc = clean_text(desc_tag.get("content"))

        image_tag = soup.select_one("meta[property='og:image']") or soup.select_one("meta[name='twitter:image']")
        if image_tag and image_tag.get("content"):
            image = normalize_url(image_tag.get("content"), page_url)

        return title, desc, image
    except Exception:
        return "", "", None


def find_primary_play_link(soup: BeautifulSoup, program: Program, base_url: str) -> Optional[str]:
    """
    Some Kan program pages are single movies. The program page itself has no player,
    only a CTA like "לצפייה בסרט" that links to /p-<program>/<item>/.
    """
    selectors = [
        "a.info-link[href]",
        "a.btn-gradient[href]",
        "a[aria-label*='לצפייה'][href]",
        "a[href*='/p-'][href]",
    ]

    for selector in selectors:
        for a in soup.select(selector):
            href = a.get("href") or ""
            url = normalize_url(href, base_url)

            if is_episode_url(url, program.id):
                return url

    return None


def parse_episodes_from_page(program: Program, season: Season) -> list[Episode]:
    html = fetch_cf_text(season.url)
    soup = BeautifulSoup(html, "html.parser")

    episodes: list[Episode] = []
    seen: set[str] = set()

    # Find all links that point to an episode of the same program.
    # Important: Kan pages may have a top CTA like "לצפייה בפרק הראשון"
    # before the real episode grid. That CTA has the same URL as episode 1
    # but no title/description/image. Prefer the .seasons grid first.
    episode_root = soup.select_one(".seasons") or soup
    episode_urls = {
        normalize_url(a.get("href") or "", season.url)
        for a in episode_root.select("a[href]")
    }
    episode_urls = {
        url
        for url in episode_urls
        if is_episode_url(url, program.id)
    }

    for a in episode_root.select("a[href]"):
        href = a.get("href") or ""
        url = normalize_url(href, season.url)

        if not is_episode_url(url, program.id):
            continue

        episode_id = extract_episode_id_from_url(url)
        if not episode_id or url in seen:
            continue

        seen.add(url)

        # Single movie/item pages often have a CTA from the program page to a
        # playable child URL such as /p-1043786/1043787/.
        # That child page is only for playback, so keep all metadata from the
        # program page and store the child URL only as play_url.
        is_single_movie_play_url = (
            len(episode_urls) == 1
            and re.search(rf"/p-{re.escape(program.id)}/\d+/?$", url) is not None
        )

        if is_single_movie_play_url and season.url == program.url:
            stream_url, entry_id = resolve_episode_stream(url, raise_on_error=False)
            episodes.append(
                Episode(
                    id=episode_id,
                    program_id=program.id,
                    season_id=season.season_id,
                    title=program.title,
                    description=program.description,
                    url=program.url,
                    image=program.image,
                    play_url=url,
                    stream_url=stream_url,
                    kaltura_entry_id=entry_id,
                )
            )
            continue

        # Best parent card.
        card = find_best_episode_card(a)

        image = first_image_src(card, season.url) or first_image_src(a, season.url)

        title = card_title(card)
        description = card_description(card)

        # Fallback from aria-label is fast and works well for Kan cards that
        # do not include a visible .card-text, for example "כאן ספיישלים".
        aria_title, aria_desc = card_aria_details(a)
        if (is_bad_episode_title(title) or not title) and aria_title:
            title = aria_title
        if not description and aria_desc:
            description = aria_desc

        # Some first/featured episodes have partial markup in the listing.
        # Do NOT fetch each episode page by default because it is very slow for large programs.
        # Use --enrich-metadata when you explicitly want fallback og:title/og:image/og:description.
        if ENRICH_MISSING_METADATA and (is_bad_episode_title(title) or not description or not image):
            meta_title, meta_desc, meta_image = page_meta_details(url)
            if (is_bad_episode_title(title) or not title) and meta_title:
                title = meta_title
            if not description and meta_desc:
                description = meta_desc
            if not image and meta_image:
                image = meta_image

        if is_bad_episode_title(title):
            title = f"Episode {episode_id}"

        episodes.append(
            Episode(
                id=episode_id,
                program_id=program.id,
                season_id=season.season_id,
                title=title,
                description=description,
                url=url,
                image=image,
                play_url=url,
            )
        )

    # Handle single movie / playable program page with no episode links.
    # Many Kan movie pages do not contain a player on the program page.
    # They contain a CTA like "לצפייה בסרט" pointing to:
    # /content/kan/kan-11/p-1043786/1043787/
    if not episodes and season.url == program.url:
        play_url = find_primary_play_link(soup, program, season.url) or program.url
        episode_id = extract_episode_id_from_url(play_url) or program.id

        stream_url, entry_id = resolve_episode_stream(play_url, raise_on_error=False)
        episodes.append(
            Episode(
                id=episode_id,
                program_id=program.id,
                season_id=season.season_id,
                title=program.title,
                description=program.description,
                url=program.url,
                image=program.image,
                play_url=play_url,
                stream_url=stream_url,
                kaltura_entry_id=entry_id,
            )
        )

    return episodes


def normalize_master_url(url: str) -> str:
    if url.startswith("//"):
        url = "https:" + url
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, parts.query, ""))


def extract_direct_stream_from_html(html: str) -> Optional[str]:
    patterns = [
        r'data-hls-url="([^"]+)"',
        r"data-hls-url='([^']+)'",
        r'data-dash-url="([^"]+)"',
        r"data-dash-url='([^']+)'",
        r'hls:\s*["\']([^"\']+)["\']',
        r'"hlsStreamUrl"\s*:\s*"([^"]+)"',
        r'bynetURL:\s*"([^"]+)"',
        r'"UrlRedirector"\s*:\s*"([^"]+)"',
        r'UrlRedirector\\?":\\?"([^"\\]+)',
    ]

    for pattern in patterns:
        m = re.search(pattern, html, re.I | re.S)
        if m:
            value = (
                m.group(1)
                .replace("\\u0026", "&")
                .replace("\\/", "/")
                .replace("&amp;", "&")
            )
            if value.startswith("https://api.bynetcdn.com/Redirector"):
                value = value.replace("https://", "http://", 1)
            return normalize_master_url(value)

    return None


def normalize_youtube_url(value: str) -> Optional[str]:
    value = (value or "").strip()
    if not value:
        return None

    value = (
        value.replace("\\u0026", "&")
        .replace("\\/", "/")
        .replace("&amp;", "&")
    )

    if value.startswith("//"):
        value = "https:" + value

    embed_match = re.search(r"(?:youtube(?:-nocookie)?\.com/embed/)([A-Za-z0-9_-]{6,})", value, re.I)
    if embed_match:
        return f"https://www.youtube.com/watch?v={embed_match.group(1)}"

    short_match = re.search(r"(?:youtu\.be/)([A-Za-z0-9_-]{6,})", value, re.I)
    if short_match:
        return f"https://www.youtube.com/watch?v={short_match.group(1)}"

    watch_match = re.search(r"(?:youtube(?:-nocookie)?\.com/watch\?[^\"'<> ]*v=)([A-Za-z0-9_-]{6,})", value, re.I)
    if watch_match:
        return f"https://www.youtube.com/watch?v={watch_match.group(1)}"

    return None


def extract_youtube_url_from_html(html: str) -> Optional[str]:
    """
    Fallback for older Kan pages where the player is an embedded YouTube video
    instead of Kan/Kaltura HLS.

    Returns a canonical YouTube watch URL that yt-dlp can download.
    """
    patterns = [
        r'https?:\\?/\\?/(?:www\.)?youtube(?:-nocookie)?\.com/watch\?[^"\'<> ]*v=[A-Za-z0-9_-]+',
        r'https?:\\?/\\?/youtu\.be/[A-Za-z0-9_-]+',
        r'https?:\\?/\\?/(?:www\.)?youtube(?:-nocookie)?\.com/embed/[A-Za-z0-9_-]+',
        r'//(?:www\.)?youtube(?:-nocookie)?\.com/embed/[A-Za-z0-9_-]+',
        r'src=["\']([^"\']*youtube(?:-nocookie)?\.com/embed/[^"\']+)["\']',
        r'data-src=["\']([^"\']*youtube(?:-nocookie)?\.com/embed/[^"\']+)["\']',
        r'"(?:youtube|youtubeUrl|youtube_url|videoUrl|video_url|embedUrl|embed_url)"\s*:\s*"([^"]*(?:youtube|youtu\.be)[^"]*)"',
    ]

    for pattern in patterns:
        for match in re.finditer(pattern, html, re.I | re.S):
            candidate = match.group(1) if match.lastindex else match.group(0)
            normalized = normalize_youtube_url(candidate)
            if normalized:
                return normalized

    id_patterns = [
        r'"youtubeId"\s*:\s*"([A-Za-z0-9_-]{6,})"',
        r'"youtube_id"\s*:\s*"([A-Za-z0-9_-]{6,})"',
        r'"videoId"\s*:\s*"([A-Za-z0-9_-]{6,})"',
    ]
    for pattern in id_patterns:
        m = re.search(pattern, html, re.I)
        if m:
            return f"https://www.youtube.com/watch?v={m.group(1)}"

    return None

def extract_kaltura_entry_id(html: str) -> Optional[str]:
    patterns = [
        r'data-entryId="([^"]+)"',
        r'data-entryid="([^"]+)"',
        r'data-entry-id="([^"]+)"',
        r"data-entryId='([^']+)'",
        r"data-entryid='([^']+)'",
        r"data-entry-id='([^']+)'",
        r'entry_id=([^"&\'\s]+)',
        r'/entry_id/([^/?&"\']+)',
        r'entry_id%2F([^%/?&"\']+)',
        r'"entry_id"\s*:\s*"([^"]+)"',
        r'"entryId"\s*:\s*"([^"]+)"',
        r"entryId\s*:\s*['\"]([^'\"]+)['\"]",
        r'kaltura.*?entry[_-]?id["\']?\s*[:=]\s*["\']([^"\']+)["\']',
    ]

    for pattern in patterns:
        m = re.search(pattern, html, re.I | re.S)
        if m:
            return m.group(1).replace("&amp;", "&")

    return None


def get_kaltura_stream(entry_id: str) -> Optional[str]:
    payload = {
        "1": {
            "service": "session",
            "action": "startWidgetSession",
            "widgetId": f"_{KALTURA_PARTNER_ID}",
        },
        "2": {
            "service": "baseEntry",
            "action": "list",
            "ks": "{1:result:ks}",
            "filter": {"redirectFromEntryId": entry_id},
            "responseProfile": {
                "type": 1,
                "fields": (
                    "id,referenceId,name,description,thumbnailUrl,dataUrl,duration,"
                    "msDuration,flavorParamsIds,mediaType,type,tags,dvrStatus,"
                    "externalSourceType,status"
                ),
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
        "apiVersion": "3.3.0",
        "format": 1,
        "ks": "",
        "clientTag": "html5:v0.56.1",
        "partnerId": KALTURA_PARTNER_ID,
    }

    response = requests.post(
        "https://cdnapisec.kaltura.com/api_v3/service/multirequest",
        json=payload,
        headers={
            "User-Agent": HEADERS["User-Agent"],
            "Content-Type": "application/json",
            "Referer": "https://www.kan.org.il/",
        },
        timeout=30,
    )
    response.raise_for_status()

    data = response.json()

    try:
        sources = data[2].get("sources") or []
    except Exception:
        return None

    for source in sources:
        if source.get("format") == "applehttp" and source.get("url"):
            return normalize_master_url(source["url"])

    for source in sources:
        if source.get("url"):
            return normalize_master_url(source["url"])

    return None


def resolve_episode_stream(
    episode_url: str,
    raise_on_error: bool = True,
) -> tuple[Optional[str], Optional[str]]:
    try:
        html = fetch_cf_text(episode_url)

        direct = extract_direct_stream_from_html(html)
        if direct:
            return direct, None

        youtube_url = extract_youtube_url_from_html(html)
        if youtube_url:
            return youtube_url, "youtube"

        entry_id = extract_kaltura_entry_id(html)
        if not entry_id:
            return None, None

        stream = get_kaltura_stream(entry_id)
        return stream, entry_id

    except KeyboardInterrupt:
        raise
    except Exception:
        if raise_on_error:
            raise
        return None, None


def connect_db(db_path: str) -> sqlite3.Connection:
    parent = os.path.dirname(db_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    return con


def table_columns(con: sqlite3.Connection, table_name: str) -> set[str]:
    rows = con.execute(f"PRAGMA table_info({table_name})").fetchall()
    return {row[1] for row in rows}


def table_exists(con: sqlite3.Connection, table_name: str) -> bool:
    row = con.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table_name,),
    ).fetchone()
    return row is not None


def rename_broken_table(con: sqlite3.Connection, table_name: str, reason: str) -> None:
    if not table_exists(con, table_name):
        return

    backup_name = f"{table_name}_backup_{int(time.time())}"
    print(f"Existing table '{table_name}' is incompatible ({reason}). Renaming to '{backup_name}'.")
    con.execute(f"ALTER TABLE {table_name} RENAME TO {backup_name}")


def ensure_compatible_schema(con: sqlite3.Connection) -> None:
    """
    Old debug versions created tables with different column names.
    SQLite cannot add a PRIMARY KEY column with ALTER TABLE, so if a required
    key column is missing, the safest path is to rename the old table and
    create a new correct one.
    """
    required = {
        "programs": {"id", "title", "url"},
        "seasons": {"season_id", "program_id", "url"},
        "episodes": {"id", "program_id", "title", "url"},
    }

    for table_name, required_columns in required.items():
        if not table_exists(con, table_name):
            continue

        existing = table_columns(con, table_name)
        missing = required_columns - existing

        if missing:
            rename_broken_table(
                con,
                table_name,
                f"missing required column(s): {', '.join(sorted(missing))}",
            )


def add_column_if_missing(
    con: sqlite3.Connection,
    table_name: str,
    column_name: str,
    column_def: str,
) -> None:
    if column_name not in table_columns(con, table_name):
        con.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_def}")


def init_db(db_path: str) -> None:
    con = connect_db(db_path)
    try:
        ensure_compatible_schema(con)

        # Create correct tables. If old incompatible tables existed, they were
        # renamed above, so these CREATE statements build clean tables.
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS programs (
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

            CREATE TABLE IF NOT EXISTS seasons (
                season_id TEXT PRIMARY KEY,
                program_id TEXT NOT NULL,
                title TEXT,
                url TEXT NOT NULL,
                season_number INTEGER,
                last_scanned_at TEXT,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS episodes (
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
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS scanner_state (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            """
        )

        # Safe migrations for compatible old tables that only miss optional columns.
        add_column_if_missing(con, "programs", "mainid", "TEXT")
        add_column_if_missing(con, "programs", "description", "TEXT")
        add_column_if_missing(con, "programs", "url", "TEXT")
        add_column_if_missing(con, "programs", "image", "TEXT")
        add_column_if_missing(con, "programs", "program_format", "TEXT")
        add_column_if_missing(con, "programs", "program_genre", "TEXT")
        add_column_if_missing(con, "programs", "last_full_scan_at", "TEXT")
        add_column_if_missing(con, "programs", "last_incremental_scan_at", "TEXT")
        add_column_if_missing(con, "programs", "updated_at", "TEXT DEFAULT CURRENT_TIMESTAMP")

        add_column_if_missing(con, "seasons", "program_id", "TEXT")
        add_column_if_missing(con, "seasons", "title", "TEXT")
        add_column_if_missing(con, "seasons", "url", "TEXT")
        add_column_if_missing(con, "seasons", "season_number", "INTEGER")
        add_column_if_missing(con, "seasons", "last_scanned_at", "TEXT")
        add_column_if_missing(con, "seasons", "updated_at", "TEXT DEFAULT CURRENT_TIMESTAMP")

        add_column_if_missing(con, "episodes", "program_id", "TEXT")
        add_column_if_missing(con, "episodes", "season_id", "TEXT")
        add_column_if_missing(con, "episodes", "title", "TEXT")
        add_column_if_missing(con, "episodes", "description", "TEXT")
        add_column_if_missing(con, "episodes", "url", "TEXT")
        add_column_if_missing(con, "episodes", "image", "TEXT")
        add_column_if_missing(con, "episodes", "play_url", "TEXT")
        add_column_if_missing(con, "episodes", "stream_url", "TEXT")
        add_column_if_missing(con, "episodes", "kaltura_entry_id", "TEXT")
        add_column_if_missing(con, "episodes", "published", "TEXT")
        add_column_if_missing(con, "episodes", "updated_at", "TEXT DEFAULT CURRENT_TIMESTAMP")

        # Indexes after migrations, so columns definitely exist.
        con.executescript(
            """
            CREATE INDEX IF NOT EXISTS idx_programs_mainid ON programs(mainid);
            CREATE INDEX IF NOT EXISTS idx_programs_title ON programs(title);
            CREATE INDEX IF NOT EXISTS idx_seasons_program_id ON seasons(program_id);
            CREATE INDEX IF NOT EXISTS idx_episodes_program_id ON episodes(program_id);
            CREATE INDEX IF NOT EXISTS idx_episodes_season_id ON episodes(season_id);
            CREATE INDEX IF NOT EXISTS idx_episodes_title ON episodes(title);
            """
        )

        con.commit()
    finally:
        con.close()


def get_scanner_state(con: sqlite3.Connection, key: str) -> str | None:
    row = con.execute(
        "SELECT value FROM scanner_state WHERE key = ?",
        (key,),
    ).fetchone()
    return row["value"] if row else None


def set_scanner_state(con: sqlite3.Connection, key: str, value: str) -> None:
    con.execute(
        """
        INSERT INTO scanner_state (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = CURRENT_TIMESTAMP
        """,
        (key, value),
    )


def program_catalog_signature(programs: list[Program]) -> str:
    payload = [
        {
            "id": program.id,
            "mainid": program.mainid,
            "title": program.title,
            "url": program.url,
            "image": program.image,
            "program_format": program.program_format,
            "program_genre": program.program_genre,
        }
        for program in sorted(programs, key=lambda item: item.id)
    ]
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha1(encoded.encode("utf-8")).hexdigest()


def episode_catalog_signature(episodes: list[Episode]) -> str:
    payload = [
        {
            "id": episode.id,
            "program_id": episode.program_id,
            "season_id": episode.season_id,
            "title": episode.title,
            "description": episode.description,
            "url": episode.url,
            "image": episode.image,
            "play_url": episode.play_url,
            "published": episode.published,
        }
        for episode in sorted(episodes, key=lambda item: item.id)
    ]
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha1(encoded.encode("utf-8")).hexdigest()


def season_signature_key(season_id: str) -> str:
    return f"season_episode_signature:{season_id}"

def upsert_program(con: sqlite3.Connection, program: Program) -> None:
    con.execute(
        """
        INSERT INTO programs (
            id, mainid, title, description, url, image, program_format, program_genre, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            mainid=excluded.mainid,
            title=excluded.title,
            description=COALESCE(NULLIF(excluded.description, ''), programs.description),
            url=excluded.url,
            image=COALESCE(NULLIF(excluded.image, ''), programs.image),
            program_format=excluded.program_format,
            program_genre=excluded.program_genre,
            updated_at=CURRENT_TIMESTAMP
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


def upsert_season(con: sqlite3.Connection, season: Season) -> None:
    con.execute(
        """
        INSERT INTO seasons (
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
            season.season_id,
            season.program_id,
            season.title,
            season.url,
            season.season_number,
        ),
    )


def upsert_episode(con: sqlite3.Connection, episode: Episode) -> None:
    if not episode.id:
        return

    con.execute(
        """
        INSERT INTO episodes (
            id, program_id, season_id, title, description, url, image,
            play_url, stream_url, kaltura_entry_id, published, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            program_id=excluded.program_id,
            season_id=excluded.season_id,
            title=excluded.title,
            description=excluded.description,
            url=excluded.url,
            image=excluded.image,
            play_url=COALESCE(excluded.play_url, episodes.play_url),
            stream_url=COALESCE(excluded.stream_url, episodes.stream_url),
            kaltura_entry_id=COALESCE(excluded.kaltura_entry_id, episodes.kaltura_entry_id),
            published=excluded.published,
            updated_at=CURRENT_TIMESTAMP
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
        ),
    )


def command_list_programs(args: argparse.Namespace) -> None:
    programs = fetch_all_programs(args.subclass_id)
    programs = filter_programs(
        programs,
        titles=args.program_title,
        ids=args.program_id,
        mainids=args.program_mainid,
    )

    if args.json:
        print(json.dumps([asdict(p) for p in programs], ensure_ascii=False, indent=2))
        return

    for p in programs:
        print(f"{p.id} | mainid={p.mainid} | {p.title}")


def command_count_seasons(args: argparse.Namespace) -> None:
    programs = filter_programs(
        fetch_all_programs(args.subclass_id),
        titles=args.program_title,
        ids=args.program_id,
        mainids=args.program_mainid,
    )

    for program in programs:
        seasons = parse_seasons(program)
        print(f"{program.title} ({program.id}, mainid={program.mainid}): {len(seasons)} season(s)")
        if args.show_urls:
            for season in seasons:
                print(f"  - {season.title} -> {season.url}")


def command_list_episodes(args: argparse.Namespace) -> None:
    global ENRICH_MISSING_METADATA
    ENRICH_MISSING_METADATA = bool(getattr(args, "enrich_metadata", False))

    programs = filter_programs(
        fetch_all_programs(args.subclass_id),
        titles=args.program_title,
        ids=args.program_id,
        mainids=args.program_mainid,
    )

    output: list[dict[str, Any]] = []

    try:
        for program in programs:
            print(f"Program: {program.title} ({program.id}, mainid={program.mainid})", file=sys.stderr)
            seasons = parse_seasons(program)
            print(f"  Seasons: {len(seasons)}", file=sys.stderr)

            for season in seasons:
                print(f"  Season: {season.title} -> {season.url}", file=sys.stderr)
                episodes = parse_episodes_from_page(program, season)
                print(f"  Episodes: {len(episodes)}", file=sys.stderr)

                if args.limit_episodes:
                    episodes = episodes[: args.limit_episodes]

                for episode in episodes:
                    if args.with_streams and not episode.stream_url:
                        episode.stream_url, episode.kaltura_entry_id = resolve_episode_stream(
                            episode.play_url or episode.url,
                            raise_on_error=False,
                        )

                    output.append(
                        {
                            "program_id": program.id,
                            "program_mainid": program.mainid,
                            "program_title": program.title,
                            "season": season.title,
                            **asdict(episode),
                        }
                    )
    except KeyboardInterrupt:
        print("\nStopped by user.", file=sys.stderr)

    if args.json:
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return

    for row in output:
        print(f"{row['id']} | {row['program_title']} | {row['season']} | {row['title']}")
        if args.show_urls:
            print(f"  page: {row['url']}")
            if row.get("stream_url"):
                print(f"  stream: {row['stream_url']}")


def command_stream_url(args: argparse.Namespace) -> None:
    stream_url, entry_id = resolve_episode_stream(args.episode_url, raise_on_error=True)

    if args.json:
        print(
            json.dumps(
                {
                    "episode_url": args.episode_url,
                    "stream_url": stream_url,
                    "kaltura_entry_id": entry_id,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    print(stream_url or "")
    if args.show_entry_id:
        print(f"kaltura_entry_id: {entry_id or ''}")


def command_debug_stream(args: argparse.Namespace) -> None:
    html = fetch_cf_text(args.episode_url)
    direct = extract_direct_stream_from_html(html)
    youtube_url = extract_youtube_url_from_html(html)
    entry_id = extract_kaltura_entry_id(html)

    print(f"page length: {len(html)}")
    print(f"direct stream: {direct or ''}")
    print(f"youtube url: {youtube_url or ''}")
    print(f"kaltura entry id: {entry_id or ''}")

    if args.save_html:
        Path(args.save_html).write_text(html, encoding="utf-8")
        print(f"saved html: {args.save_html}")

    hints = []
    for pattern in ["data-hls-url", "data-dash-url", "entry_id", "entryId", "kaltura", "UrlRedirector", "bynetURL", "youtube", "youtu.be", "youtube.com/embed"]:
        if pattern in html:
            hints.append(pattern)

    print("found hints:", ", ".join(hints) if hints else "none")


def get_existing_episode(con: sqlite3.Connection, episode_id: str) -> Optional[sqlite3.Row]:
    return con.execute(
        """
        SELECT id, title, description, image, stream_url, kaltura_entry_id
        FROM episodes
        WHERE id = ?
        """,
        (episode_id,),
    ).fetchone()


def episode_has_stream(con: sqlite3.Connection, episode_id: str) -> bool:
    row = get_existing_episode(con, episode_id)
    return bool(row and row["stream_url"])


def episode_is_complete(con: sqlite3.Connection, episode: Episode) -> bool:
    row = get_existing_episode(con, episode.id)
    if not row:
        return False

    return bool(
        (row["title"] or episode.title)
        and (row["description"] or episode.description)
        and (row["image"] or episode.image)
        and row["stream_url"]
    )


def program_episode_count(con: sqlite3.Connection, program_id: str) -> int:
    row = con.execute(
        "SELECT COUNT(*) AS count FROM episodes WHERE program_id = ?",
        (program_id,),
    ).fetchone()
    return int(row["count"] if row else 0)


def program_has_any_episode(con: sqlite3.Connection, program_id: str) -> bool:
    return program_episode_count(con, program_id) > 0


def program_stream_count(con: sqlite3.Connection, program_id: str) -> int:
    row = con.execute(
        """
        SELECT COUNT(*) AS count
        FROM episodes
        WHERE program_id = ?
          AND stream_url IS NOT NULL
          AND stream_url != ''
        """,
        (program_id,),
    ).fetchone()
    return int(row["count"] if row else 0)


def program_all_existing_episodes_have_streams(
    con: sqlite3.Connection,
    program_id: str,
) -> bool:
    total = program_episode_count(con, program_id)
    if total == 0:
        return False
    with_streams = program_stream_count(con, program_id)
    return total == with_streams


def existing_season_ids(con: sqlite3.Connection, program_id: str) -> set[str]:
    rows = con.execute(
        "SELECT season_id FROM seasons WHERE program_id = ?",
        (program_id,),
    ).fetchall()
    return {str(row["season_id"]) for row in rows}


def latest_season(seasons: list[Season]) -> Optional[Season]:
    numbered = [season for season in seasons if season.season_number is not None]
    if numbered:
        return max(numbered, key=lambda season: season.season_number or 0)
    return seasons[-1] if seasons else None


def parse_sqlite_timestamp(value: Any) -> Optional[float]:
    text = clean_text(value)
    if not text:
        return None

    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return time.mktime(time.strptime(text[:19], fmt))
        except ValueError:
            continue

    return None


def program_full_scan_due(
    con: sqlite3.Connection,
    program_id: str,
    interval_hours: int,
) -> bool:
    if interval_hours <= 0:
        return False

    row = con.execute(
        "SELECT last_full_scan_at FROM programs WHERE id = ?",
        (program_id,),
    ).fetchone()
    if not row:
        return True

    last_scan = parse_sqlite_timestamp(row["last_full_scan_at"])
    if last_scan is None:
        return True

    return time.time() - last_scan >= interval_hours * 60 * 60


def mark_program_scan(
    con: sqlite3.Connection,
    program_id: str,
    full_scan: bool,
) -> None:
    if full_scan:
        con.execute(
            """
            UPDATE programs
            SET last_full_scan_at = CURRENT_TIMESTAMP,
                last_incremental_scan_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (program_id,),
        )
        return

    con.execute(
        """
        UPDATE programs
        SET last_incremental_scan_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (program_id,),
    )


def mark_season_scanned(con: sqlite3.Connection, season_id: str) -> None:
    con.execute(
        """
        UPDATE seasons
        SET last_scanned_at = CURRENT_TIMESTAMP
        WHERE season_id = ?
        """,
        (season_id,),
    )


def choose_seasons_to_scan(
    con: sqlite3.Connection,
    program: Program,
    seasons: list[Season],
    args: argparse.Namespace,
) -> tuple[list[Season], bool, str]:
    if not getattr(args, "incremental", False):
        return seasons, True, "full"

    if not program_has_any_episode(con, program.id):
        return seasons, True, "new-program"

    if program_full_scan_due(con, program.id, args.full_scan_interval_hours):
        return seasons, True, "scheduled-full"

    known_season_ids = existing_season_ids(con, program.id)
    selected: list[Season] = [
        season for season in seasons
        if season.season_id not in known_season_ids
    ]

    recent = latest_season(seasons)
    if recent and all(season.season_id != recent.season_id for season in selected):
        selected.append(recent)

    return selected, False, "incremental"


def command_scan(args: argparse.Namespace) -> None:
    global ENRICH_MISSING_METADATA
    ENRICH_MISSING_METADATA = bool(getattr(args, "enrich_metadata", False))

    init_db(args.db)
    con = connect_db(args.db)

    try:
        programs = fetch_all_programs(args.subclass_id)
        programs = filter_programs(
            programs,
            titles=args.program_title,
            ids=args.program_id,
            mainids=args.program_mainid,
        )

        if args.limit_programs:
            programs = programs[: args.limit_programs]

        current_program_signature = program_catalog_signature(programs)
        can_skip_unchanged_seasons = (
            args.incremental
            and not args.with_streams
            and not args.limit_episodes
            and not getattr(args, "enrich_metadata", False)
        )

        print(f"Found {len(programs)} programs")

        for index, program in enumerate(programs, start=1):
            print(f"\n[{index}/{len(programs)}] Program: {program.title} ({program.id}, mainid={program.mainid})")
            upsert_program(con, program)
            con.commit()

            if args.skip_existing_programs and program_has_any_episode(con, program.id):
                print(f"  skip program exists: {program.title} ({program_episode_count(con, program.id)} episodes)")
                continue

            if args.skip_programs_with_streams:
                total_eps = program_episode_count(con, program.id)
                stream_eps = program_stream_count(con, program.id)

                if total_eps > 0 and total_eps == stream_eps:
                    print(f"  skip program all streams exist: {program.title} ({stream_eps}/{total_eps})")
                    continue

                if total_eps > 0:
                    print(f"  program incomplete streams: {program.title} ({stream_eps}/{total_eps})")

            try:
                seasons = parse_seasons(program)
            except Exception as ex:
                print(f"  Failed to parse seasons: {ex}")
                continue

            print(f"  Seasons: {len(seasons)}")

            seasons_to_scan, full_scan, scan_reason = choose_seasons_to_scan(
                con,
                program,
                seasons,
                args,
            )
            skipped_seasons = len(seasons) - len(seasons_to_scan)
            if args.incremental:
                print(
                    f"  Scan mode: {scan_reason}; scanning {len(seasons_to_scan)}/{len(seasons)} seasons"
                )

            total_program_episodes = 0

            for season in seasons:
                upsert_season(con, season)
                con.commit()

            for season in seasons_to_scan:
                print(f"    Season: {season.title} -> {season.url}")

                try:
                    episodes = parse_episodes_from_page(program, season)
                except Exception as ex:
                    print(f"    Failed to parse episodes: {ex}")
                    continue

                if args.limit_episodes:
                    episodes = episodes[: args.limit_episodes]

                print(f"    Episodes: {len(episodes)}")

                current_season_signature = episode_catalog_signature(episodes)
                previous_season_signature = get_scanner_state(
                    con,
                    season_signature_key(season.season_id),
                )

                if (
                    can_skip_unchanged_seasons
                    and previous_season_signature == current_season_signature
                ):
                    print("    unchanged episode catalog; skipping season")
                    mark_season_scanned(con, season.season_id)
                    con.commit()
                    continue

                for idx, episode in enumerate(episodes, start=1):
                    if args.verbose:
                        print(f"      [{idx}/{len(episodes)}] {episode.title}")

                    if args.skip_complete_episodes and episode_is_complete(con, episode):
                        print(f"      skip complete: {episode.title} ({episode.id})")
                        total_program_episodes += 1
                        continue

                    if args.with_streams and not episode.stream_url:
                        if episode_has_stream(con, episode.id):
                            print(f"      skip stream exists: {episode.title} ({episode.id})")
                        else:
                            if args.verbose:
                                print("        Resolving stream...")
                            episode.stream_url, episode.kaltura_entry_id = resolve_episode_stream(
                                episode.play_url or episode.url,
                                raise_on_error=False,
                            )

                    upsert_episode(con, episode)
                    total_program_episodes += 1

                set_scanner_state(
                    con,
                    season_signature_key(season.season_id),
                    current_season_signature,
                )
                mark_season_scanned(con, season.season_id)
                con.commit()

            mark_program_scan(con, program.id, full_scan=full_scan)
            con.commit()

            if skipped_seasons > 0:
                print(f"  Skipped seasons: {skipped_seasons}")
            print(f"  Saved episodes: {total_program_episodes}")

        set_scanner_state(con, "program_catalog_signature", current_program_signature)
        set_scanner_state(con, "program_catalog_checked_at", str(int(time.time())))
        con.commit()

    except KeyboardInterrupt:
        print("\nStopped by user. Already saved rows remain in the DB.")
    finally:
        con.close()


def command_missing_descriptions(args: argparse.Namespace) -> None:
    con = connect_db(args.db)
    try:
        rows = con.execute(
            """
            SELECT e.id, p.title AS program_title, e.title, e.url
            FROM episodes e
            JOIN programs p ON p.id = e.program_id
            WHERE e.description IS NULL OR e.description = ''
            ORDER BY p.title, e.title
            LIMIT ?
            """,
            (args.limit,),
        ).fetchall()

        for row in rows:
            print(f"{row['id']} | {row['program_title']} | {row['title']} | {row['url']}")
    finally:
        con.close()


def command_stream_status(args: argparse.Namespace) -> None:
    con = connect_db(args.db)
    try:
        rows = con.execute(
            """
            SELECT
                p.id,
                p.mainid,
                p.title,
                COUNT(e.id) AS episodes,
                SUM(CASE WHEN e.stream_url IS NOT NULL AND e.stream_url != '' THEN 1 ELSE 0 END) AS streams
            FROM programs p
            LEFT JOIN episodes e ON e.program_id = p.id
            GROUP BY p.id, p.mainid, p.title
            HAVING episodes > 0
            ORDER BY p.title
            """
        ).fetchall()

        for row in rows:
            episodes = int(row["episodes"] or 0)
            streams = int(row["streams"] or 0)

            if args.only_missing and episodes == streams:
                continue

            status = "OK" if episodes == streams else "MISSING"
            print(f"{status} | {row['id']} | mainid={row['mainid']} | {streams}/{episodes} | {row['title']}")
    finally:
        con.close()


def command_search(args: argparse.Namespace) -> None:
    con = connect_db(args.db)
    try:
        like = f"%{args.query}%"
        rows = con.execute(
            """
            SELECT e.id, p.title AS program_title, e.title AS episode_title, e.stream_url
            FROM episodes e
            JOIN programs p ON p.id = e.program_id
            WHERE p.title LIKE ? OR e.title LIKE ? OR e.description LIKE ?
            ORDER BY p.title, e.title
            LIMIT ?
            """,
            (like, like, like, args.limit),
        ).fetchall()

        for row in rows:
            print(
                f"{row['id']} | {row['program_title']} | {row['episode_title']} | "
                f"{'stream' if row['stream_url'] else 'no-stream'}"
            )
    finally:
        con.close()


def command_get_episode(args: argparse.Namespace) -> None:
    con = connect_db(args.db)
    try:
        row = con.execute(
            """
            SELECT e.*, p.title AS program_title
            FROM episodes e
            JOIN programs p ON p.id = e.program_id
            WHERE e.id = ?
            """,
            (args.episode_id,),
        ).fetchone()

        if not row:
            print("Episode not found")
            return

        item = dict(row)

        if args.resolve and not item.get("stream_url"):
            stream_url, entry_id = resolve_episode_stream(item.get("play_url") or item["url"], raise_on_error=False)
            item["stream_url"] = stream_url
            item["kaltura_entry_id"] = entry_id

            con.execute(
                """
                UPDATE episodes
                SET stream_url = ?, kaltura_entry_id = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (stream_url, entry_id, args.episode_id),
            )
            con.commit()

        print(json.dumps(item, ensure_ascii=False, indent=2))
    finally:
        con.close()


def command_resolve_missing_streams(args: argparse.Namespace) -> None:
    con = connect_db(args.db)
    try:
        rows = con.execute(
            """
            SELECT id, url, play_url
            FROM episodes
            WHERE stream_url IS NULL OR stream_url = ''
            LIMIT ?
            """,
            (args.limit,),
        ).fetchall()

        print(f"Resolving {len(rows)} missing streams")

        for row in rows:
            target_url = row["play_url"] or row["url"]
            print(f"Resolving {row['id']} -> {target_url}")
            stream_url, entry_id = resolve_episode_stream(target_url, raise_on_error=False)
            con.execute(
                """
                UPDATE episodes
                SET stream_url = ?, kaltura_entry_id = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (stream_url, entry_id, row["id"]),
            )
            con.commit()

    except KeyboardInterrupt:
        print("\nStopped by user. Already resolved streams remain in the DB.")
    finally:
        con.close()








# -----------------------------
# Special / promo episode handling
# -----------------------------

DEFAULT_SPECIAL_KEYWORDS = [
    "פרומו",
    "promo",
    "טריילר",
    "trailer",
    "teaser",
    "בקרוב",
    "הצצה",
    "טעימה",
    "ריקאפ",
    "recap",
    "מאחורי הקלעים",
    "על הסט",
    "ריכולים על הסט",
    "לקראת העונה",
    "בונוס",
    "bonus",
]


def normalize_special_text(value: str) -> str:
    return clean_text(value).lower().replace("־", "-").replace("–", "-").replace("—", "-")


def special_keywords_from_args(args: argparse.Namespace) -> list[str]:
    raw_keywords = list(DEFAULT_SPECIAL_KEYWORDS)

    for item in getattr(args, "special_keyword", []) or []:
        raw_keywords.extend(part.strip() for part in str(item).split(",") if part.strip())

    return [normalize_special_text(item) for item in raw_keywords if normalize_special_text(item)]


def is_special_episode(
    episode: Episode,
    season: Optional[Season] = None,
    extra_keywords: Optional[list[str]] = None,
) -> tuple[bool, str]:
    """
    Detect promo/trailer/special items that should not be counted as real season episodes.

    Returns (is_special, reason).
    """
    text = " ".join(
        [
            episode.title or "",
            episode.description or "",
            episode.url or "",
            episode.play_url or "",
            season.title if season else "",
        ]
    )
    normalized = normalize_special_text(text)

    keywords = list(extra_keywords or [])
    if not keywords:
        keywords = [normalize_special_text(item) for item in DEFAULT_SPECIAL_KEYWORDS]

    for keyword in keywords:
        if keyword and keyword in normalized:
            return True, keyword

    return False, ""


def extract_episode_number_from_title(title: str) -> Optional[int]:
    """
    Extract explicit regular episode number from the page title.

    Returns a number only when the title clearly says "פרק X" / "Episode X".
    This is intentionally strict so promos/teasers without a real episode
    number do not become regular episodes.
    """
    text = normalize_special_text(title)

    patterns = [
        r"(?:^|[\s|:,-])פרק\s*(\d{1,3})(?:\D|$)",
        r"(?:^|[\s|:,-])episode\s*(\d{1,3})(?:\D|$)",
        r"(?:^|[\s|:,-])ep\.?\s*(\d{1,3})(?:\D|$)",
    ]

    for pattern in patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            try:
                return int(m.group(1))
            except Exception:
                return None

    return None


def regular_episode_numbers_in_page(episodes: list[Episode]) -> set[int]:
    numbers: set[int] = set()
    for episode in episodes:
        number = extract_episode_number_from_title(episode.title)
        if number is not None:
            numbers.add(number)
    return numbers


def classify_episode_as_special(
    episode: Episode,
    season: Season,
    source_index: int,
    episodes: list[Episode],
    args: argparse.Namespace,
) -> tuple[bool, str]:
    """
    Classify using the actual Kan page metadata, not a fixed season length.

    Important rule:
    If the title clearly contains "פרק X" / "Episode X", it is a regular episode
    even if the title contains broad words like "עונה" or "אחרון לעונה".

    Special:
    - unnumbered item with promo/trailer/teaser/behind-the-scenes keywords
    - OR when the season page has numbered episodes, an unnumbered item is special
    """
    if bool(getattr(args, "disable_special_detection", False)):
        return False, ""

    explicit_num = extract_episode_number_from_title(episode.title)
    if explicit_num is not None:
        return False, ""

    keywords = special_keywords_from_args(args)
    keyword_special, keyword_reason = is_special_episode(
        episode,
        season=season,
        extra_keywords=keywords,
    )
    if keyword_special:
        return True, keyword_reason

    numbered_episodes = regular_episode_numbers_in_page(episodes)
    if numbered_episodes:
        return True, "no-explicit-episode-number"

    # If this season/page has no numbered episodes at all, keep items regular.
    # This avoids breaking documentaries/movies/single-item pages that do not
    # use "פרק X" naming.
    return False, ""

def season_folder_name(season_num: int) -> str:
    return f"s{season_num}"


def build_episode_plan(
    episodes: list[Episode],
    season: Season,
    real_season_num: int,
    output_root: str,
    extension: str,
    args: argparse.Namespace,
    special_counter_start: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    """
    Build download/NFO numbering for a season.

    Regular items keep SxxExx numbering inside their real season folder.
    Promo/trailer/special items go to s00/S00E.. so Plex does not count them as
    real episodes of that season.

    Detection is based on the actual Kan page:
    - items titled like "פרק X" are regular episodes
    - promo/trailer/teaser/behind-the-scenes items are specials
    - when a season page has numbered episodes, unnumbered items are specials
    """
    planned: list[dict[str, Any]] = []
    regular_counter = 0
    special_counter = special_counter_start

    for source_index, episode in enumerate(episodes, start=1):
        special, reason = classify_episode_as_special(
            episode=episode,
            season=season,
            source_index=source_index,
            episodes=episodes,
            args=args,
        )

        if special:
            special_counter += 1
            target_season_num = 0
            target_episode_num = special_counter
            target_folder = os.path.join(output_root, season_folder_name(0))
            target_title = f"S{real_season_num:02d} special: {episode.title}"
            detail = f"special/{reason} · original S{real_season_num:02d}"
        else:
            regular_counter += 1
            explicit_episode_num = extract_episode_number_from_title(episode.title)
            target_season_num = real_season_num
            target_episode_num = explicit_episode_num or regular_counter
            target_folder = os.path.join(output_root, season_folder_name(real_season_num))
            target_title = episode.title
            detail = episode.title

        key = f"S{target_season_num:02d}E{target_episode_num:02d}.{extension}"

        planned.append(
            {
                "episode": episode,
                "source_index": source_index,
                "source_season_num": real_season_num,
                "source_season_title": season.title,
                "target_season_num": target_season_num,
                "target_episode_num": target_episode_num,
                "target_folder": target_folder,
                "target_title": target_title,
                "is_special": special,
                "special_reason": reason,
                "key": key,
                "detail": detail,
                "explicit_episode_number": extract_episode_number_from_title(episode.title),
            }
        )

    return planned, special_counter


def print_episode_plan_summary(planned: list[dict[str, Any]]) -> None:
    real_count = sum(1 for item in planned if not item["is_special"])
    special_count = sum(1 for item in planned if item["is_special"])
    print(f"    Episode plan: {real_count} regular, {special_count} special" + (" -> s00" if special_count else ""))

    for item in planned:
        marker = "SPECIAL" if item["is_special"] else "REGULAR"
        reason = f" reason={item['special_reason']}" if item["is_special"] else ""
        explicit = item.get("explicit_episode_number")
        explicit_text = f" explicit_ep={explicit}" if explicit is not None else ""
        print(
            f"      {marker}: {item['key']} | source item {item['source_index']}"
            f"{explicit_text}{reason} | {item['episode'].title}"
        )



# -----------------------------
# Progress colors
# -----------------------------

class ProgressColors:
    RESET="\033[0m"
    BOLD="\033[1m"
    RED="\033[31m"
    GREEN="\033[32m"
    YELLOW="\033[33m"
    BLUE="\033[34m"
    MAGENTA="\033[35m"
    CYAN="\033[36m"

def stage_color(stage: str) -> str:
    return {
        "WAIT": ProgressColors.CYAN,
        "QUEUE": ProgressColors.CYAN,
        "RESOLVE": ProgressColors.CYAN,
        "CHECK": ProgressColors.CYAN,
        "VIDEO-DL": ProgressColors.BLUE,
        "AUDIO-DL": ProgressColors.CYAN,
        "MERGE": ProgressColors.MAGENTA,
        "DOWNLOADED": ProgressColors.MAGENTA,
        "POST": ProgressColors.MAGENTA,
        "COPY": ProgressColors.YELLOW,
        "COPY-WAIT": ProgressColors.YELLOW,
        "DONE": ProgressColors.GREEN,
        "SKIPPED": ProgressColors.GREEN,
        "FAILED": ProgressColors.RED,
        "RETRY": ProgressColors.RED,
    }.get(stage, "")

# -----------------------------
# Parallel download progress UI / shutdown state
# -----------------------------

_PROGRESS_LOCK = threading.Lock()
_PROGRESS_STATE: dict[str, dict[str, Any]] = {}
_PROGRESS_ENABLED = False
_PROGRESS_RENDERED_LINES = 0
_PROGRESS_LAST_RENDER = 0.0
_PROGRESS_MODE = "table"
_PROGRESS_LAST_SNAPSHOT = 0.0
_PROGRESS_ACTIVE_DOWNLOADS = 0
_PROGRESS_ACTIVE_COPIES = 0
_PROGRESS_COPY_WAIT = 0
_PROGRESS_DISPLAY_SEQUENCE = 0
_STOP_EVENT = threading.Event()
_SHUTDOWN_STARTED = False
_ACTIVE_PROCESSES: set[subprocess.Popen] = set()
_FORCE_EXIT_ON_INTERRUPT = False

PROGRESS_BAR_WIDTH = 28
PROGRESS_BAR_FILLED = "■"
PROGRESS_BAR_EMPTY = "·"


def parallel_progress_enabled() -> bool:
    return bool(_PROGRESS_ENABLED)


def set_parallel_progress_enabled(enabled: bool) -> None:
    global _PROGRESS_ENABLED
    _PROGRESS_ENABLED = bool(enabled)


def progress_line_key(output_file: str) -> str:
    return Path(output_file).name


def short_stage(stage: str) -> str:
    return {
        "waiting": "WAIT",
        "queued": "QUEUE",
        "resolving": "RESOLVE",
        "checking": "CHECK",
        # Generic yt-dlp download progress is the video stream by default.
        # This avoids showing DOWNLOAD and then VIDEO-DL for the same episode.
        "downloading": "VIDEO-DL",
        "video": "VIDEO-DL",
        "audio": "AUDIO-DL",
        "downloaded": "DOWNLOADED",
        "postprocess": "POST",
        "merging": "MERGE",
        "ready_copy": "COPY-WAIT",
        "copy_wait": "COPY-WAIT",
        "copying": "COPY",
        "retry": "RETRY",
        "skipped": "SKIPPED",
        "done": "DONE",
        "failed": "FAILED",
    }.get(stage, stage.upper())

def progress_stage_is_active_or_pending(stage: str) -> bool:
    return stage in {
        "WAIT", "QUEUE", "RESOLVE", "CHECK", "VIDEO-DL", "AUDIO-DL", "DOWNLOAD", "VIDEO", "AUDIO", "MERGE",
        "DOWNLOADED", "POST", "READY-COPY", "COPY-WAIT", "COPY", "RETRY",
        "waiting", "queued", "resolving", "checking", "downloading", "video", "audio",
        "merging", "downloaded", "postprocess", "ready_copy", "copy_wait", "copying", "retry",
    }


def progress_stage_is_done(stage: str) -> bool:
    return stage in {"DONE", "SKIPPED", "done", "skipped"}


def progress_stage_is_failed(stage: str) -> bool:
    return stage in {"FAILED", "failed"}


def update_parallel_progress(
    key: str,
    stage: str,
    percent: Optional[float] = None,
    detail: str = "",
    order: Optional[int] = None,
    force: bool = False,
) -> None:
    if not parallel_progress_enabled():
        return

    global _PROGRESS_DISPLAY_SEQUENCE

    with _PROGRESS_LOCK:
        current = _PROGRESS_STATE.get(key, {})
        new_stage = short_stage(stage)
        current["stage"] = new_stage

        # Sort the table by when a row first becomes visible/active.
        # New files therefore appear at the bottom instead of jumping into
        # season/episode order.
        if "display_order" not in current and progress_stage_should_show(new_stage):
            _PROGRESS_DISPLAY_SEQUENCE += 1
            current["display_order"] = _PROGRESS_DISPLAY_SEQUENCE

        if percent is not None:
            current["percent"] = max(0.0, min(100.0, float(percent)))
        if detail:
            current["detail"] = detail
        elif "detail" not in current:
            current["detail"] = ""
        if order is not None:
            current["order"] = order
        _PROGRESS_STATE[key] = current
        render_parallel_progress_locked(force=force)

def remove_parallel_progress_row(key: str, force: bool = True) -> None:
    """
    Remove a completed successful/skipped item from the live table.

    The final result is still kept in the results list for the summary report,
    but the progress table stays focused only on active/retry/failed work.
    """
    if not parallel_progress_enabled():
        return

    with _PROGRESS_LOCK:
        _PROGRESS_STATE.pop(key, None)
        render_parallel_progress_locked(force=force)

def progress_stage_should_show(stage: str) -> bool:
    """
    Show only items that already started or reached a final state.
    Hide WAIT/QUEUE rows so the table stays focused on active work.
    """
    return stage not in {"WAIT", "QUEUE", "waiting", "queued", ""}


def render_parallel_progress_locked(force: bool = False) -> None:
    """
    Stable progress renderer.

    Always redraws a clean table in table mode:
    - clears the screen before each table render
    - shows only active/final rows, not WAIT items that did not start yet
    - keeps a compact one-line mode for logs/non-interactive terminals
    """
    global _PROGRESS_RENDERED_LINES, _PROGRESS_LAST_RENDER, _PROGRESS_LAST_SNAPSHOT

    now = time.monotonic()

    # Keep UI responsive but do not redraw for every yt-dlp line.
    if not force and (now - _PROGRESS_LAST_RENDER) < 0.50:
        return

    _PROGRESS_LAST_RENDER = now
    width = PROGRESS_BAR_WIDTH

    states = list(_PROGRESS_STATE.values())

    downloading_count = sum(
        1
        for state in states
        if state.get("stage") in {"RESOLVE", "CHECK", "VIDEO-DL", "AUDIO-DL", "DOWNLOAD", "VIDEO", "AUDIO"}
    )
    post_count = sum(
        1
        for state in states
        if state.get("stage") in {"DOWNLOADED", "POST", "MERGE"}
    )
    copy_active_count = sum(
        1
        for state in states
        if state.get("stage") == "COPY"
    )
    copy_wait_count = sum(
        1
        for state in states
        if state.get("stage") in {"COPY-WAIT", "READY-COPY"}
    )
    done_count = sum(
        1
        for state in states
        if state.get("stage") in {"DONE", "SKIPPED"}
    )
    failed_count = sum(
        1
        for state in states
        if state.get("stage") == "FAILED"
    )
    total_count = len(states)
    visible_count = sum(1 for state in states if progress_stage_should_show(state.get("stage", "")))

    lines = [
        f"Progress: dl={downloading_count} post/merge={post_count} "
        f"copy={copy_active_count} copy_wait={copy_wait_count} "
        f"done={done_count} failed={failed_count} active/visible={visible_count} total={total_count}",
        "",
    ]

    def sort_key(item: tuple[str, dict[str, Any]]) -> tuple[int, str]:
        key, state = item
        try:
            return int(state.get("display_order", state.get("order", 999999))), key
        except Exception:
            return 999999, key

    for key, state in sorted(_PROGRESS_STATE.items(), key=sort_key):
        stage = state.get("stage", "")
        if not progress_stage_should_show(stage):
            continue

        percent = float(state.get("percent", 0.0))
        filled = int(width * percent / 100.0)
        bar = PROGRESS_BAR_FILLED * filled + PROGRESS_BAR_EMPTY * (width - filled)

        detail = state.get("detail", "")
        if len(detail) > 62:
            detail = detail[:59] + "..."

        color = stage_color(stage)
        plain_line = f"  {key:<14} {bar} {percent:6.2f}% {stage:<12} {detail}"

        # Color the whole row according to the status, and bold only the status word.
        if color:
            stage_plain = f"{stage:<12}"
            stage_bold = f"{ProgressColors.BOLD}{stage_plain}{ProgressColors.RESET}{color}"
            colored_line = plain_line.replace(stage_plain, stage_bold, 1)
            lines.append(f"{color}{colored_line}{ProgressColors.RESET}")
        else:
            lines.append(plain_line)

    mode = globals().get("_PROGRESS_MODE", "table")

    if mode == "off":
        return

    if mode == "compact":
        line = lines[0]
        print("\r\033[2K" + line, end="", flush=True)
        return

    # Table mode: always clear the screen and redraw.
    # Use both alternate clear commands for better behavior in VS Code/macOS terminals.
    output = "\033[2J\033[H\033[3J" + "\n".join(lines)
    print(output, end="\n", flush=True)
    _PROGRESS_RENDERED_LINES = len(lines)

def finish_parallel_progress() -> None:
    global _PROGRESS_RENDERED_LINES
    if _PROGRESS_RENDERED_LINES:
        print()
        _PROGRESS_RENDERED_LINES = 0

def quiet_print(message: str = "") -> None:
    if not parallel_progress_enabled():
        print(message)


def register_process(process: subprocess.Popen) -> None:
    with _PROGRESS_LOCK:
        _ACTIVE_PROCESSES.add(process)


def unregister_process(process: subprocess.Popen) -> None:
    with _PROGRESS_LOCK:
        _ACTIVE_PROCESSES.discard(process)


def stop_active_processes() -> None:
    _STOP_EVENT.set()

    with _PROGRESS_LOCK:
        processes = list(_ACTIVE_PROCESSES)

    for process in processes:
        try:
            if process.poll() is None:
                process.terminate()
        except Exception:
            pass

    deadline = time.monotonic() + 2.0
    for process in processes:
        try:
            while process.poll() is None and time.monotonic() < deadline:
                time.sleep(0.05)
            if process.poll() is None:
                process.kill()
        except Exception:
            pass

    with _PROGRESS_LOCK:
        _ACTIVE_PROCESSES.clear()


def raise_if_stopping() -> None:
    if _STOP_EVENT.is_set():
        raise KeyboardInterrupt


def request_shutdown(signum: Optional[int] = None, frame: Any = None) -> None:
    """
    Ctrl+C handler.

    First Ctrl+C requests stop and terminates child processes.
    Second Ctrl+C exits immediately without waiting for ThreadPoolExecutor atexit.
    """
    global _SHUTDOWN_STARTED, _FORCE_EXIT_ON_INTERRUPT

    if not _SHUTDOWN_STARTED:
        _SHUTDOWN_STARTED = True
        _STOP_EVENT.set()
        stop_active_processes()
        return

    _FORCE_EXIT_ON_INTERRUPT = True
    stop_active_processes()
    try:
        finish_parallel_progress()
        print("\nForce stopped by user.")
        sys.stdout.flush()
        sys.stderr.flush()
    finally:
        os._exit(130)


def install_signal_handlers() -> None:
    try:
        signal.signal(signal.SIGINT, request_shutdown)
        signal.signal(signal.SIGTERM, request_shutdown)
    except Exception:
        pass


def force_exit_if_requested() -> None:
    if _FORCE_EXIT_ON_INTERRUPT:
        os._exit(130)


def compact_traceback() -> str:
    return traceback.format_exc().strip()


def episode_debug_context(
    episode: Episode,
    output_file: Optional[str] = None,
    season_folder: Optional[str] = None,
    season_num: Optional[int] = None,
    episode_num: Optional[int] = None,
    stream_url: Optional[str] = None,
) -> dict[str, Any]:
    return {
        "episode_id": getattr(episode, "id", None),
        "title": getattr(episode, "title", None),
        "program_id": getattr(episode, "program_id", None),
        "season_id": getattr(episode, "season_id", None),
        "season_num": season_num,
        "episode_num": episode_num,
        "folder": season_folder,
        "output_file": output_file,
        "url": getattr(episode, "url", None),
        "play_url": getattr(episode, "play_url", None),
        "stream_url": stream_url or getattr(episode, "stream_url", None),
        "kaltura_entry_id": getattr(episode, "kaltura_entry_id", None),
    }


def format_debug_context(context: dict[str, Any]) -> str:
    return " | ".join(f"{key}={value!r}" for key, value in context.items())


def make_failure_result(
    key: str,
    status: str,
    message: str,
    context: Optional[dict[str, Any]] = None,
    trace: str = "",
) -> dict[str, Any]:
    return {
        "ok": False,
        "status": status,
        "key": key,
        "message": message,
        "context": context or {},
        "traceback": trace,
    }

def download_one_episode_job(
    episode: Episode,
    season_folder: str,
    season_num: int,
    episode_num: int,
    extension: str,
    args: argparse.Namespace,
) -> dict[str, Any]:
    output_file = os.path.join(
        season_folder,
        f"S{season_num:02d}E{episode_num:02d}.{extension}",
    )
    key = progress_line_key(output_file)
    stream_url = episode.stream_url

    try:
        raise_if_stopping()
        update_parallel_progress(key, "resolving", 0.0, episode.title, order=episode_num)

        if not stream_url:
            source_url = episode.play_url or episode.url
            if not source_url:
                context = episode_debug_context(
                    episode,
                    output_file=output_file,
                    season_folder=season_folder,
                    season_num=season_num,
                    episode_num=episode_num,
                    stream_url=stream_url,
                )
                raise RuntimeError(f"missing episode URL/play_url; {format_debug_context(context)}")

            stream_url, _ = resolve_episode_stream(source_url, raise_on_error=True)

        if not stream_url:
            context = episode_debug_context(
                episode,
                output_file=output_file,
                season_folder=season_folder,
                season_num=season_num,
                episode_num=episode_num,
                stream_url=stream_url,
            )
            raise RuntimeError(f"could not resolve stream URL; {format_debug_context(context)}")

        raise_if_stopping()

        existing_file = episode_file_exists(
            folder=season_folder,
            season_num=season_num,
            episode_num=episode_num,
            extension=extension,
        )

        if existing_file:
            update_parallel_progress(key, "checking", 2.0, "existing file", order=episode_num)
            is_complete, file_duration, source_duration = is_existing_file_complete(
                existing_file,
                stream_url,
                min_ratio=getattr(args, "min_duration_ratio", 0.95),
                quality=getattr(args, "quality", "best"),
                min_quality_ratio=getattr(args, "min_quality_ratio", 0.95),
                check_quality=not getattr(args, "skip_quality_check", False),
            )

            if is_complete:
                update_parallel_progress(
                    key,
                    "skipped",
                    100.0,
                    f"{format_time(file_duration)} / {format_time(source_duration)}",
                    order=episode_num,
                    force=True,
                )
                return {
                    "ok": True,
                    "status": "skipped",
                    "key": key,
                    "episode": episode,
                    "episode_num": episode_num,
                    "message": f"skipped existing complete: {existing_file}",
                }

        raise_if_stopping()

        update_parallel_progress(key, "downloading", 3.0, "starting", order=episode_num, force=True)

        copy_info = download_stream(
            stream_url=stream_url,
            output_file=output_file,
            quality=args.quality,
            downloader=args.downloader,
            stall_timeout=args.stall_timeout,
            retries=args.retries,
            local_temp_root=args.local_temp,
            progress_key=key,
            defer_copy=True,
        )

        if copy_info is not None:
            update_parallel_progress(key, "copy_wait", 100.0, "waiting for SMB copy", order=episode_num, force=True)
            return {
                "ok": True,
                "status": "ready_copy",
                "key": key,
                "episode": episode,
                "episode_num": episode_num,
                "copy_info": copy_info,
                "message": f"downloaded locally, waiting copy: {output_file}",
            }

        update_parallel_progress(key, "done", 100.0, "downloaded", order=episode_num, force=True)
        return {
            "ok": True,
            "status": "done",
            "key": key,
            "episode": episode,
            "episode_num": episode_num,
            "message": f"downloaded: {output_file}",
        }

    except KeyboardInterrupt:
        update_parallel_progress(key, "failed", 100.0, "stopped by user", order=episode_num, force=True)
        context = episode_debug_context(
            episode,
            output_file=output_file,
            season_folder=season_folder,
            season_num=season_num,
            episode_num=episode_num,
            stream_url=stream_url,
        )
        return make_failure_result(
            key=key,
            status="stopped",
            message=f"download stopped: {episode.title}",
            context=context,
            trace=compact_traceback(),
        )

    except Exception as ex:
        trace = compact_traceback()
        context = episode_debug_context(
            episode,
            output_file=output_file,
            season_folder=season_folder,
            season_num=season_num,
            episode_num=episode_num,
            stream_url=stream_url,
        )
        message = f"download failed: {episode.title} | {ex}"
        update_parallel_progress(key, "failed", 100.0, message[:120], order=episode_num, force=True)
        return make_failure_result(
            key=key,
            status="download_failed",
            message=message,
            context=context,
            trace=trace,
        )

def copy_one_episode_job(
    key: str,
    copy_info: tuple[Path, Path, Path],
    episode_num: int,
) -> dict[str, Any]:
    local_file = destination_path = work_dir = None

    try:
        local_file, destination_path, work_dir = copy_info

        if local_file is None or destination_path is None or work_dir is None:
            raise RuntimeError(
                f"invalid copy_info: local_file={local_file!r}, "
                f"destination_path={destination_path!r}, work_dir={work_dir!r}"
            )

        raise_if_stopping()
        update_parallel_progress(key, "copying", 0.0, "copying to SMB", order=episode_num, force=True)
        move_completed_file_to_destination(local_file, destination_path, progress_key=key)
        cleanup_local_work_dir(work_dir)
        update_parallel_progress(key, "done", 100.0, "copied", order=episode_num, force=True)
        return {"ok": True, "status": "done", "key": key, "message": f"copied: {destination_path}"}

    except KeyboardInterrupt:
        update_parallel_progress(key, "failed", 100.0, "stopped by user", order=episode_num, force=True)
        context = {
            "local_file": str(local_file) if local_file is not None else None,
            "destination_path": str(destination_path) if destination_path is not None else None,
            "work_dir": str(work_dir) if work_dir is not None else None,
            "episode_num": episode_num,
        }
        return make_failure_result(
            key=key,
            status="stopped",
            message=f"copy stopped: {destination_path}",
            context=context,
            trace=compact_traceback(),
        )

    except Exception as ex:
        trace = compact_traceback()
        context = {
            "local_file": str(local_file) if local_file is not None else None,
            "destination_path": str(destination_path) if destination_path is not None else None,
            "work_dir": str(work_dir) if work_dir is not None else None,
            "episode_num": episode_num,
            "copy_info_type": type(copy_info).__name__,
        }
        message = f"copy failed: {destination_path}: {ex}"
        update_parallel_progress(key, "failed", 100.0, message[:120], order=episode_num, force=True)
        return make_failure_result(
            key=key,
            status="copy_failed",
            message=message,
            context=context,
            trace=trace,
        )

def episode_file_exists(
    folder: str,
    season_num: int,
    episode_num: int,
    extension: str,
) -> Optional[str]:
    """
    Case-insensitive and zero-padding-insensitive check.

    Treat these as the same episode:
    - S01E01.mp4
    - S1E01.mp4
    - s1e01.mp4
    - s1e1.mp4
    """
    if not os.path.isdir(folder):
        return None

    ext = extension.lower().lstrip(".")
    episode_pattern = re.compile(
        rf"^s0*{season_num}e0*{episode_num}\.{re.escape(ext)}$",
        re.IGNORECASE,
    )

    for name in os.listdir(folder):
        full_path = os.path.join(folder, name)

        if not os.path.isfile(full_path):
            continue

        if ".part" in name.lower():
            continue

        if episode_pattern.match(name):
            return full_path

    return None


def run_json_command(cmd: list[str], timeout: int = 45) -> Optional[dict[str, Any]]:
    try:
        result = subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return json.loads(result.stdout or "{}")
    except Exception:
        return None


def get_duration_seconds(path_or_url: str, timeout: int = 45) -> Optional[float]:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return None

    data = run_json_command(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            path_or_url,
        ],
        timeout=timeout,
    )

    if not data:
        return None

    try:
        value = data.get("format", {}).get("duration")
        duration = float(value)
        return duration if duration > 0 else None
    except Exception:
        return None


def quality_value(value: Any) -> int:
    try:
        return int(float(value or 0))
    except Exception:
        return 0


def video_quality_summary(info: dict[str, Any]) -> str:
    width = info.get("width")
    height = info.get("height")
    bitrate = info.get("total_bitrate") or info.get("video_bitrate")
    video_codec = info.get("video_codec") or info.get("vcodec") or ""
    audio_codec = info.get("audio_codec") or info.get("acodec") or ""

    resolution = f"{width}x{height}" if width and height else "unknown resolution"
    bitrate_text = f"{int(float(bitrate)) / 1000:.0f} kb/s" if bitrate else "unknown bitrate"
    audio_text = "audio" if info.get("has_audio") or audio_codec else "no audio"
    codecs = ", ".join(x for x in [video_codec, audio_codec or audio_text] if x)
    return f"{resolution}, {bitrate_text}" + (f", {codecs}" if codecs else "")


def get_expected_quality_info(stream_url: str, quality: str = "best") -> dict[str, Any]:
    """
    Best-effort expected quality for the requested source.

    For yt-dlp downloads, prefer yt-dlp format inspection because it sees the
    same video/audio formats the downloader will choose. If that fails, fall
    back to ffprobe-based HLS program selection.
    """
    ytdlp = shutil.which("yt-dlp")
    if ytdlp:
        try:
            _, selected = choose_ytdlp_format(ytdlp, stream_url, quality)
            if selected:
                return {
                    "width": quality_value(selected.get("width")),
                    "height": quality_value(selected.get("height")),
                    "total_bitrate": int((float(selected.get("tbr") or 0)) * 1000) or None,
                    "video_codec": str(selected.get("vcodec") or "").lower(),
                    "audio_codec": str(selected.get("acodec") or "").lower(),
                    "has_video": bool(selected.get("height") or selected.get("width")),
                    "has_audio": bool(selected.get("audio_id") or selected.get("acodec")),
                }
        except Exception:
            pass

    try:
        _, info, _ = select_program_by_quality(stream_url, quality)
        if info:
            return info
    except Exception:
        pass

    return get_stream_info(stream_url)


def existing_quality_is_good_enough(
    existing_info: dict[str, Any],
    expected_info: dict[str, Any],
    min_quality_ratio: float = 0.95,
    require_audio: bool = True,
) -> tuple[bool, str]:
    """
    Compare existing file quality against expected source quality.

    Checks:
    - video exists
    - audio exists when the source/selected format has audio
    - resolution is not lower than min_quality_ratio
    - bitrate is not much lower when both bitrates are known
    """
    if not existing_info:
        return False, "cannot read existing file quality"

    if not existing_info.get("has_video", True):
        return False, "existing file has no video stream"

    source_has_audio = bool(expected_info.get("has_audio") or expected_info.get("audio_codec"))
    if require_audio and source_has_audio and not existing_info.get("has_audio"):
        return False, "existing file has no audio stream"

    existing_height = quality_value(existing_info.get("height"))
    expected_height = quality_value(expected_info.get("height"))
    if expected_height and existing_height:
        if existing_height < int(expected_height * min_quality_ratio):
            return False, f"existing height {existing_height} < expected {expected_height}"

    existing_width = quality_value(existing_info.get("width"))
    expected_width = quality_value(expected_info.get("width"))
    if expected_width and existing_width:
        if existing_width < int(expected_width * min_quality_ratio):
            return False, f"existing width {existing_width} < expected {expected_width}"

    existing_bitrate = quality_value(existing_info.get("total_bitrate") or existing_info.get("video_bitrate"))
    expected_bitrate = quality_value(expected_info.get("total_bitrate") or expected_info.get("video_bitrate"))
    if expected_bitrate and existing_bitrate:
        if existing_bitrate < int(expected_bitrate * min_quality_ratio):
            return False, f"existing bitrate {existing_bitrate} < expected {expected_bitrate}"

    return True, "quality ok"

def is_existing_file_complete(
    existing_file: str,
    stream_url: str,
    min_ratio: float = 0.95,
    quality: str = "best",
    min_quality_ratio: float = 0.95,
    check_quality: bool = True,
) -> tuple[bool, Optional[float], Optional[float]]:
    """
    Returns (is_complete, file_duration, source_duration).

    A file is considered complete only when:
    - it exists and is non-empty
    - duration is close enough to source duration
    - when enabled, video quality is not lower than the requested source quality
      and audio exists when the source has audio
    """
    if not existing_file or not os.path.isfile(existing_file):
        return False, None, None

    if os.path.getsize(existing_file) <= 0:
        return False, None, None

    source_duration = get_duration_seconds(stream_url)
    file_duration = get_duration_seconds(existing_file)

    duration_ok = True
    if source_duration is not None:
        if file_duration is None:
            return False, file_duration, source_duration
        duration_ok = file_duration >= (source_duration * min_ratio)

    if not duration_ok:
        return False, file_duration, source_duration

    if check_quality:
        existing_info = get_stream_info(existing_file)
        expected_info = get_expected_quality_info(stream_url, quality)
        quality_ok, reason = existing_quality_is_good_enough(
            existing_info,
            expected_info,
            min_quality_ratio=min_quality_ratio,
            require_audio=True,
        )

        if not quality_ok:
            print(f"    Existing file quality too low, re-downloading: {reason}")
            print(f"      existing: {video_quality_summary(existing_info)}")
            print(f"      expected: {video_quality_summary(expected_info)}")
            return False, file_duration, source_duration

    return True, file_duration, source_duration

def format_time(seconds: Optional[float]) -> str:
    if seconds is None:
        return "--:--"

    seconds = max(0, int(seconds))
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60

    if hours:
        return f"{hours:d}:{minutes:02d}:{secs:02d}"

    return f"{minutes:02d}:{secs:02d}"


def format_size_kb(kb: Optional[int]) -> str:
    if kb is None:
        return "--"

    if kb >= 1024 * 1024:
        return f"{kb / (1024 * 1024):.2f}GiB"

    if kb >= 1024:
        return f"{kb / 1024:.1f}MiB"

    return f"{kb}KiB"


def print_progress_bar(
    current_seconds: float,
    total_seconds: Optional[float],
    speed: str = "",
    size_kb: Optional[int] = None,
) -> None:
    width = 32

    if total_seconds and total_seconds > 0:
        ratio = min(max(current_seconds / total_seconds, 0.0), 1.0)
        filled = int(width * ratio)
        bar = PROGRESS_BAR_FILLED * filled + PROGRESS_BAR_EMPTY * (width - filled)
        percent = f"{ratio * 100:6.2f}%"
        total_text = format_time(total_seconds)
    else:
        bar = "█" * ((int(current_seconds) // 2) % width)
        bar = bar.ljust(width, "░")
        percent = "  ---%"
        total_text = "--:--"

    line = (
        f"\r      [{bar}] {percent} "
        f"{format_time(current_seconds)}/{total_text} "
        f"size={format_size_kb(size_kb)} "
        f"speed={speed or '--'}"
    )

    print(line, end="", flush=True)



def parse_ytdlp_progress_line(line: str) -> Optional[dict[str, Any]]:
    """
    Parse yt-dlp progress lines, for example:
    [download]  42.3% of ~ 633.66MiB at  2.12MiB/s ETA 03:15 (frag 120/958)

    Returns percent/speed/eta/text when this is a progress line.
    """
    if "[download]" not in line or "%" not in line:
        return None

    percent_match = re.search(r"\[download\]\s+([0-9]+(?:\.[0-9]+)?)%", line)
    if not percent_match:
        return None

    # HLS often says: at 2.12MiB/s ETA 03:15 (frag 120/958)
    # YouTube often says: of 123.45MiB at 6.34MiB/s ETA 00:48
    speed_match = re.search(r"\bat\s+([^\s]+(?:/s)?)", line)
    eta_match = re.search(r"\bETA\s+([^\s]+)", line)
    frag_match = re.search(r"\(frag\s+([^)]+)\)", line)
    total_match = re.search(r"\bof\s+~?\s*([^\s]+)", line)

    try:
        percent = float(percent_match.group(1))
    except ValueError:
        return None

    return {
        "percent": percent,
        "speed": speed_match.group(1) if speed_match else "",
        "eta": eta_match.group(1) if eta_match else "",
        "frag": frag_match.group(1) if frag_match else "",
        "total": total_match.group(1) if total_match else "",
        "raw": line,
    }


def print_ytdlp_progress_bar(
    percent: float,
    speed: str = "",
    eta: str = "",
    frag: str = "",
    total: str = "",
    progress_key: Optional[str] = None,
    defer_copy: bool = False,
) -> Optional[tuple[Path, Path, Path]]:
    if progress_key:
        extra = []
        if speed:
            extra.append(f"speed={speed}")
        if eta:
            extra.append(f"ETA={eta}")
        if frag:
            extra.append(f"frag={frag}")
        elif total:
            extra.append(f"of={total}")

        with _PROGRESS_LOCK:
            current_stage = (_PROGRESS_STATE.get(progress_key, {}) or {}).get("stage", "")

        if current_stage in {"VIDEO", "AUDIO", "VIDEO-DL", "AUDIO-DL"}:
            stage = "video" if current_stage in {"VIDEO", "VIDEO-DL"} else "audio" if current_stage in {"AUDIO", "AUDIO-DL"} else current_stage.lower()
        elif current_stage in {"DOWNLOADED", "MERGE", "POST", "COPY-WAIT", "COPY", "DONE"}:
            stage = current_stage.lower()
        else:
            stage = "downloading"

        update_parallel_progress(progress_key, stage, percent, " ".join(extra), force=False)
        return

    width = 32
    ratio = min(max(percent / 100.0, 0.0), 1.0)
    filled = int(width * ratio)
    bar = PROGRESS_BAR_FILLED * filled + PROGRESS_BAR_EMPTY * (width - filled)

    extra = []
    if speed:
        extra.append(f"speed={speed}")
    if eta:
        extra.append(f"ETA={eta}")
    if frag:
        extra.append(f"frag={frag}")
    elif total:
        extra.append(f"of={total}")

    suffix = " ".join(extra)
    print(f"\r      [{bar}] {percent:6.2f}% {suffix}", end="", flush=True)

def stream_info_from_streams(
    streams: list[dict[str, Any]],
    fmt: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    video = next((s for s in streams if s.get("codec_type") == "video"), {})
    audio = next((s for s in streams if s.get("codec_type") == "audio"), {})
    fmt = fmt or {}

    def to_int(value: Any) -> Optional[int]:
        try:
            return int(float(value))
        except Exception:
            return None

    def clean_codec(value: Any) -> str:
        return str(value or "").strip().lower()

    return {
        "width": to_int(video.get("width")),
        "height": to_int(video.get("height")),
        "video_bitrate": to_int(video.get("bit_rate")),
        "audio_bitrate": to_int(audio.get("bit_rate")),
        "total_bitrate": to_int(fmt.get("bit_rate")),
        "video_codec": clean_codec(video.get("codec_name")),
        "audio_codec": clean_codec(audio.get("codec_name")),
        "audio_channels": to_int(audio.get("channels")) or 0,
        "has_video": bool(video),
        "has_audio": bool(audio),
    }

def get_stream_info(stream_url: str) -> dict[str, Any]:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return {}

    data = run_json_command(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            (
                "stream=index,codec_type,codec_name,width,height,bit_rate,"
                "channels,avg_frame_rate:format=bit_rate,duration"
            ),
            "-of",
            "json",
            stream_url,
        ],
        timeout=45,
    )

    if not data:
        return {}

    info = stream_info_from_streams(data.get("streams") or [], data.get("format") or {})
    try:
        duration = float((data.get("format") or {}).get("duration") or 0)
        info["duration"] = duration if duration > 0 else None
    except Exception:
        info["duration"] = None
    return info

def normalize_program_info(program: dict[str, Any]) -> dict[str, Any]:
    info = stream_info_from_streams(program.get("streams") or [], program)

    def to_int(value: Any) -> Optional[int]:
        try:
            return int(value)
        except Exception:
            return None

    info["program_id"] = program.get("program_id")
    info["program_num"] = program.get("program_num")
    info["total_bitrate"] = info.get("total_bitrate") or to_int(program.get("bit_rate"))
    return info


def select_program_by_quality(stream_url: str, mode: str) -> tuple[Optional[str], dict[str, Any], str]:
    """
    Select an HLS program for ffmpeg.

    best: highest height, width, bitrate.
    worst: lowest height, width, bitrate.
    720p/1080p: closest source at or below requested height if possible.
    """
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return None, {}, f"{mode}/default"

    data = run_json_command(
        [
            ffprobe,
            "-v",
            "error",
            "-show_programs",
            "-show_streams",
            "-of",
            "json",
            stream_url,
        ],
        timeout=45,
    )

    if not data:
        return None, get_stream_info(stream_url), f"{mode}/default"

    programs = data.get("programs") or []
    candidates: list[tuple[tuple[int, int, int], str, dict[str, Any]]] = []

    for idx, program in enumerate(programs):
        info = normalize_program_info(program)
        width = info.get("width") or 0
        height = info.get("height") or 0
        bitrate = info.get("total_bitrate") or info.get("video_bitrate") or 0

        if width <= 0 or height <= 0:
            continue

        candidates.append(((height, width, bitrate), f"p:{idx}", info))

    if not candidates:
        fallback = get_stream_info(stream_url)
        return None, fallback, f"{mode}/default"

    if mode == "worst":
        candidates.sort(key=lambda item: item[0])
        _, selector, info = candidates[0]
        return selector, info, "worst"

    if mode in {"720p", "1080p"}:
        target = int(mode.replace("p", ""))
        at_or_below = [c for c in candidates if c[0][0] <= target]
        pool = at_or_below or candidates
        pool.sort(key=lambda item: (item[0][0], item[0][1], item[0][2]), reverse=True)
        _, selector, info = pool[0]
        return selector, info, f"{mode} source"

    candidates.sort(key=lambda item: item[0], reverse=True)
    _, selector, info = candidates[0]
    return selector, info, "best"


def print_quality_info(label: str, info: dict[str, Any]) -> None:
    width = info.get("width")
    height = info.get("height")
    bitrate = info.get("total_bitrate") or info.get("video_bitrate")

    resolution = f"{width}x{height}" if width and height else "unknown resolution"
    bitrate_text = f"{int(bitrate) / 1000:.0f} kb/s" if bitrate else "unknown bitrate"

    print(f"      Selected quality ({label}): {resolution}, {bitrate_text}")


def build_ffmpeg_command(
    ffmpeg: str,
    stream_url: str,
    temp_file: Path,
    quality: str,
    output_format: str,
    map_selector: Optional[str],
) -> list[str]:
    cmd = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-nostats",
        "-loglevel",
        "error",
        "-progress",
        "pipe:1",
        "-fflags",
        "+genpts+discardcorrupt",
        "-err_detect",
        "ignore_err",
        "-i",
        stream_url,
    ]

    if map_selector:
        cmd += ["-map", map_selector, "-sn", "-dn"]
    else:
        cmd += ["-map", "0:v:0?", "-map", "0:a:0?", "-sn", "-dn"]

    if quality in {"best", "worst"}:
        cmd += ["-c", "copy"]

        if output_format == "mp4":
            cmd += [
                "-bsf:a",
                "aac_adtstoasc",
                "-movflags",
                "+faststart",
                "-f",
                "mp4",
            ]

        cmd.append(str(temp_file))
        return cmd

    if quality in {"720p", "1080p"}:
        height = quality.replace("p", "")
        cmd += [
            "-vf",
            f"scale=-2:{height}",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "22",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
        ]

        if output_format == "mp4":
            cmd += ["-movflags", "+faststart", "-f", "mp4"]

        cmd.append(str(temp_file))
        return cmd

    raise ValueError(f"Unsupported quality: {quality}")


def download_stream_ffmpeg(stream_url: str, output_file: str, quality: str = "best") -> None:
    ffmpeg = shutil.which("ffmpeg")

    if not ffmpeg:
        raise RuntimeError("ffmpeg not found. Install it with: brew install ffmpeg")

    output_path = Path(output_file)
    output_format = output_path.suffix.lower().lstrip(".") or "mp4"

    # Keep real extension last.
    temp_file = output_path.with_name(f"{output_path.stem}.part{output_path.suffix}")

    total_seconds = get_duration_seconds(stream_url)
    map_selector, quality_info, quality_label = select_program_by_quality(stream_url, quality)
    print_quality_info(quality_label, quality_info)

    cmd = build_ffmpeg_command(
        ffmpeg=ffmpeg,
        stream_url=stream_url,
        temp_file=temp_file,
        quality=quality,
        output_format=output_format,
        map_selector=map_selector,
    )

    current_seconds = 0.0
    current_speed = ""
    current_size_kb: Optional[int] = None

    try:
        print("      Starting ffmpeg download...")
        raise_if_stopping()
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        register_process(process)

        assert process.stdout is not None

        try:
            for line in process.stdout:
                line = line.strip()

                if not line or "=" not in line:
                    continue

                key, value = line.split("=", 1)

                if key == "out_time_ms":
                    try:
                        current_seconds = int(value) / 1_000_000
                    except ValueError:
                        pass

                elif key == "out_time":
                    parts = value.split(":")
                    try:
                        if len(parts) == 3:
                            current_seconds = (
                                int(parts[0]) * 3600
                                + int(parts[1]) * 60
                                + float(parts[2])
                            )
                    except ValueError:
                        pass

                elif key == "speed":
                    current_speed = value

                elif key == "total_size":
                    try:
                        current_size_kb = int(value) // 1024
                    except ValueError:
                        pass

                elif key == "progress":
                    print_progress_bar(
                        current_seconds=current_seconds,
                        total_seconds=total_seconds,
                        speed=current_speed,
                        size_kb=current_size_kb,
                    )

            return_code = process.wait()
            unregister_process(process)

        except KeyboardInterrupt:
            print("\n      Stopping ffmpeg...")
            process.terminate()

            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()

            if temp_file.exists():
                temp_file.unlink(missing_ok=True)

            raise

        print()

        if return_code != 0:
            stderr = ""
            if process.stderr is not None:
                stderr = process.stderr.read().strip()

            raise subprocess.CalledProcessError(return_code, cmd, stderr=stderr)

        if not temp_file.exists() or temp_file.stat().st_size == 0:
            raise RuntimeError("ffmpeg finished but output file is empty")

        temp_file.replace(output_path)

    except KeyboardInterrupt:
        raise
    except Exception:
        if temp_file.exists():
            temp_file.unlink(missing_ok=True)
        raise



def run_ytdlp_json(ytdlp: str, stream_url: str) -> Optional[dict[str, Any]]:
    """
    Ask yt-dlp for all available formats.

    This lets us choose the real best HLS variant instead of relying on
    yt-dlp's generic default selection or ffprobe's default stream.
    """
    try:
        result = subprocess.run(
            [
                ytdlp,
                "--dump-single-json",
                "--no-warnings",
                "--no-playlist",
                stream_url,
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=60,
        )
        return json.loads(result.stdout or "{}")
    except Exception:
        return None


def format_number(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        return float(value)
    except Exception:
        return None


def is_youtube_stream_url(stream_url: str) -> bool:
    value = (stream_url or "").lower()
    return "youtube.com/watch" in value or "youtu.be/" in value or "youtube.com/embed/" in value or "youtube-nocookie.com" in value


def ytdlp_youtube_selector(quality: str) -> str:
    """
    YouTube usually exposes best video and best audio as separate DASH formats.
    Using plain "best" can select the best pre-merged file, which is often only 720p.
    """
    if quality == "worst":
        return "worstvideo*+worstaudio/worst"

    if quality == "720p":
        return "bestvideo*[height<=720]+bestaudio/best[height<=720]/best"

    if quality == "1080p":
        return "bestvideo*[height<=1080]+bestaudio/best[height<=1080]/best"

    return "bestvideo*+bestaudio/best"


def selected_youtube_info_from_formats(
    formats: list[dict[str, Any]],
    selector: str,
    quality: str,
) -> dict[str, Any]:
    videos: list[tuple[int, int, float, str, dict[str, Any]]] = []
    audios: list[tuple[float, float, str, dict[str, Any]]] = []

    for fmt in formats:
        format_id = str(fmt.get("format_id") or "")
        if not format_id:
            continue

        vcodec = str(fmt.get("vcodec") or "")
        acodec = str(fmt.get("acodec") or "")

        has_video = bool(vcodec and vcodec != "none")
        has_audio = bool(acodec and acodec != "none")

        height = int(format_number(fmt.get("height")) or 0)
        width = int(format_number(fmt.get("width")) or 0)
        tbr = format_number(fmt.get("tbr")) or format_number(fmt.get("vbr")) or 0
        abr = format_number(fmt.get("abr")) or 0

        if has_video:
            videos.append((height, width, tbr, format_id, fmt))

        if has_audio and not has_video:
            audios.append((abr, tbr, format_id, fmt))

    target_height: Optional[int] = None
    if quality in {"720p", "1080p"}:
        target_height = int(quality.replace("p", ""))

    if quality == "worst":
        video_pool = videos
        video_pool.sort(key=lambda item: (item[0], item[1], item[2]))
    else:
        video_pool = [item for item in videos if not target_height or item[0] <= target_height] or videos
        video_pool.sort(key=lambda item: (item[0], item[1], item[2]), reverse=True)

    audios.sort(key=lambda item: (item[0], item[1]), reverse=True)

    selected_video = video_pool[0] if video_pool else (0, 0, 0, "", {})
    selected_audio = audios[0] if audios else (0, 0, "", {})

    height, width, tbr, video_id, video_fmt = selected_video
    _, _, audio_id, audio_fmt = selected_audio

    return {
        "format_selector": selector,
        "video_id": video_id or "bestvideo",
        "audio_id": audio_id or "bestaudio",
        "width": width or video_fmt.get("width"),
        "height": height or video_fmt.get("height"),
        "tbr": tbr or video_fmt.get("tbr"),
        "vcodec": video_fmt.get("vcodec"),
        "acodec": audio_fmt.get("acodec") or "bestaudio",
        "source": "youtube",
    }

def choose_ytdlp_format(
    ytdlp: str,
    stream_url: str,
    quality: str,
) -> tuple[list[str], dict[str, Any]]:
    """
    Select real best VIDEO + AUDIO format for yt-dlp.

    Kan HLS pages work best with explicit format IDs chosen from inspection.
    YouTube is different: plain "best" often means the best already-merged file,
    which can be lower quality. For YouTube, force bestvideo+bestaudio.
    """
    data = run_ytdlp_json(ytdlp, stream_url)
    formats = (data or {}).get("formats") or []

    if is_youtube_stream_url(stream_url):
        selector = ytdlp_youtube_selector(quality)
        selected_info = selected_youtube_info_from_formats(formats, selector, quality)
        if not selected_info:
            selected_info = {
                "format_selector": selector,
                "video_id": "bestvideo",
                "audio_id": "bestaudio",
                "source": "youtube",
            }

        # -S helps yt-dlp prefer higher resolution/fps/bitrate among matching
        # YouTube DASH formats.
        return ["-f", selector, "-S", "res,fps,br"], selected_info

    if not data:
        return ytdlp_quality_args(quality), {}

    videos = []
    audios = []

    for fmt in formats:
        format_id = str(fmt.get("format_id") or "")
        if not format_id:
            continue

        vcodec = fmt.get("vcodec")
        acodec = fmt.get("acodec")
        ext = str(fmt.get("ext") or "").lower()
        resolution = str(fmt.get("resolution") or "").lower()
        note = str(fmt.get("format_note") or "").lower()

        has_video = bool(vcodec and vcodec != "none")
        has_audio = bool(acodec and acodec != "none")
        looks_audio = (
            has_audio
            or "aac" in format_id.lower()
            or "audio" in format_id.lower()
            or "audio" in resolution
            or "audio" in note
            or ext in {"m4a", "aac"}
        )

        height = int(format_number(fmt.get("height")) or 0)
        width = int(format_number(fmt.get("width")) or 0)
        tbr = format_number(fmt.get("tbr")) or format_number(fmt.get("vbr")) or 0
        abr = format_number(fmt.get("abr")) or 0

        if has_video:
            videos.append((height, width, tbr, format_id, fmt, has_audio))

        if looks_audio and not has_video:
            audios.append((abr, tbr, format_id, fmt))

    if not videos:
        return ytdlp_quality_args(quality), {}

    if quality == "worst":
        videos.sort(key=lambda item: (item[0], item[1], item[2]))
        selected_video = videos[0]
    elif quality in {"720p", "1080p"}:
        target = int(quality.replace("p", ""))
        pool = [item for item in videos if item[0] <= target] or videos
        pool.sort(key=lambda item: (item[0], item[1], item[2]), reverse=True)
        selected_video = pool[0]
    else:
        videos.sort(key=lambda item: (item[0], item[1], item[2]), reverse=True)
        selected_video = videos[0]

    height, width, tbr, video_id, video_fmt, video_has_audio = selected_video

    audio_id = ""
    audio_fmt: dict[str, Any] = {}

    if not video_has_audio:
        if audios:
            preferred = [item for item in audios if "heb" in item[2].lower() or "aac" in item[2].lower()]
            pool = preferred or audios
            pool.sort(key=lambda item: (item[0], item[1]), reverse=True)
            _, _, audio_id, audio_fmt = pool[0]
        else:
            audio_id = "bestaudio"

    selector = f"{video_id}+{audio_id}" if audio_id else video_id

    selected_info = {
        "format_selector": selector,
        "video_id": video_id,
        "audio_id": audio_id,
        "width": width or video_fmt.get("width"),
        "height": height or video_fmt.get("height"),
        "tbr": tbr or video_fmt.get("tbr"),
        "vcodec": video_fmt.get("vcodec"),
        "acodec": audio_fmt.get("acodec") or video_fmt.get("acodec") or ("audio" if audio_id else ""),
    }

    return ["-f", selector], selected_info

def print_ytdlp_selected_format(info: dict[str, Any]) -> None:
    if not info:
        print("      Selected quality: yt-dlp automatic")
        return

    width = info.get("width")
    height = info.get("height")
    tbr = info.get("tbr")
    selector = info.get("format_selector") or ""
    audio_id = info.get("audio_id") or ""

    resolution = f"{width}x{height}" if width and height else "unknown resolution"
    bitrate = f"{float(tbr):.0f} kb/s" if tbr else "unknown bitrate"
    audio_text = f", audio={audio_id}" if audio_id else ", audio=included/unknown"
    source_text = f", source={info.get('source')}" if info.get("source") else ""

    print(f"      Selected quality: {resolution}, {bitrate}, format={selector}{audio_text}{source_text}")

def ytdlp_quality_args(quality: str) -> list[str]:
    """
    Fallback format args.

    Normally choose_ytdlp_format() selects an explicit best format id.
    If format inspection fails, do not force "-f best" because Kan direct HLS
    can fail with "Requested format is not available".
    """
    if quality == "best":
        return []

    if quality == "worst":
        return ["-f", "worst/best"]

    if quality == "720p":
        return ["-f", "best[height<=720]/best"]

    if quality == "1080p":
        return ["-f", "best[height<=1080]/best"]

    return []


def is_network_volume_path(path: str) -> bool:
    """Treat macOS /Volumes paths as SMB/NAS/external output."""
    try:
        resolved = str(Path(path).expanduser())
    except Exception:
        resolved = path
    return resolved.startswith("/Volumes/")


def build_local_download_path(
    output_file: str,
    local_temp_root: Optional[str] = None,
) -> tuple[Path, Path]:
    """
    Build local output path for yt-dlp.

    Example:
    final: /Volumes/Data/tv/show/s1/S01E03.mkv
    temp:  /tmp/kan_downloads/S01E03/S01E03.mkv
    """
    final_path = Path(output_file)
    base_root = Path(local_temp_root or tempfile.gettempdir()).expanduser()
    safe_stem = re.sub(r"[^A-Za-z0-9._-]+", "_", final_path.stem).strip("_") or "download"
    work_dir = base_root / "kan_downloads" / safe_stem
    work_dir.mkdir(parents=True, exist_ok=True)
    return work_dir / final_path.name, work_dir



def format_bytes(value: int) -> str:
    if value >= 1024 * 1024 * 1024:
        return f"{value / (1024 * 1024 * 1024):.2f}GiB"
    if value >= 1024 * 1024:
        return f"{value / (1024 * 1024):.1f}MiB"
    if value >= 1024:
        return f"{value / 1024:.1f}KiB"
    return f"{value}B"


def print_copy_progress(copied: int, total: int, progress_key: Optional[str] = None) -> None:
    width = 32
    ratio = min(max(copied / total, 0.0), 1.0) if total > 0 else 0.0

    if progress_key:
        update_parallel_progress(
            progress_key,
            "copying",
            ratio * 100,
            f"{format_bytes(copied)}/{format_bytes(total)}",
        )
        return

    filled = int(width * ratio)
    bar = PROGRESS_BAR_FILLED * filled + PROGRESS_BAR_EMPTY * (width - filled)
    print(
        f"\r      Copying to SMB: [{bar}] {ratio * 100:6.2f}% "
        f"{format_bytes(copied)}/{format_bytes(total)}",
        end="",
        flush=True,
    )

def local_temp_file_is_ready(path: Path) -> bool:
    """
    True when a final local temp media file already exists from a previous run.

    Do not treat yt-dlp partial files as ready. This is intentionally simple:
    a non-empty final .mkv/.mp4/.ts in the local temp folder means we can skip
    yt-dlp and copy it to the destination.
    """
    if not path.exists() or not path.is_file():
        return False

    if path.stat().st_size <= 0:
        return False

    lower = path.name.lower()
    if ".part" in lower or lower.endswith(".ytdl"):
        return False

    return path.suffix.lower() in {".mkv", ".mp4", ".ts"}

def move_completed_file_to_destination(
    local_file: Path,
    destination_file: Path,
    progress_key: Optional[str] = None,
) -> None:
    """
    Copy completed local file to SMB destination.

    Important:
    - Do NOT use macOS built-in rsync with --info=progress2. The built-in rsync
      is often old and exits immediately with an unsupported-option error.
    - Use an external cp process instead. Python polls the temporary file size
      to update progress.
    - Copy to a unique *.copying.<pid>.<thread>.tmp file first, then replace
      the final file only after a full successful copy.
    """
    destination_file.parent.mkdir(parents=True, exist_ok=True)

    unique_id = f"{os.getpid()}.{threading.get_ident()}.{int(time.time() * 1000)}"
    temp_destination = destination_file.with_name(
        f"{destination_file.stem}.copying.{unique_id}{destination_file.suffix}"
    )

    total_size = local_file.stat().st_size
    copied = 0

    if progress_key:
        update_parallel_progress(
            progress_key,
            "copying",
            0.0,
            f"copy {format_bytes(total_size)}",
            force=True,
        )
    else:
        print(f"      Copying completed file to SMB destination ({format_bytes(total_size)})...")

    cp = shutil.which("cp") or "/bin/cp"
    cmd = [cp, str(local_file), str(temp_destination)]

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    register_process(process)

    stderr_text = ""

    try:
        last_stat_time = 0.0

        while True:
            raise_if_stopping()

            now = time.monotonic()
            if now - last_stat_time > 0.5:
                last_stat_time = now

                if temp_destination.exists():
                    copied = temp_destination.stat().st_size
                    percent = min(100.0, (copied / total_size) * 100.0) if total_size else 0.0

                    if progress_key:
                        update_parallel_progress(
                            progress_key,
                            "copying",
                            percent,
                            f"{format_bytes(copied)}/{format_bytes(total_size)}",
                        )

            if process.poll() is not None:
                break

            time.sleep(0.1)

        _, stderr_text = process.communicate(timeout=2)
        unregister_process(process)

        if process.returncode != 0:
            error = (stderr_text or "").strip()
            if error:
                raise RuntimeError(f"SMB copy failed with exit code {process.returncode}: {error}")
            raise RuntimeError(f"SMB copy failed with exit code {process.returncode}")

        if not temp_destination.exists():
            raise RuntimeError("SMB copy finished but temp copy file is missing")

        copied_size = temp_destination.stat().st_size
        if copied_size != total_size:
            raise RuntimeError(
                f"SMB copy size mismatch: copied {copied_size}, expected {total_size}"
            )

        # Replace final only after complete copy. This is atomic enough for the SMB mount
        # and prevents partial files from looking complete.
        temp_destination.replace(destination_file)

        if progress_key:
            update_parallel_progress(progress_key, "done", 100.0, "copied", force=True)
        else:
            print(f"      Copy complete: {destination_file}")

    except KeyboardInterrupt:
        try:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
        except Exception:
            pass

        unregister_process(process)

        try:
            temp_destination.unlink(missing_ok=True)
        except Exception:
            pass

        raise

    except Exception:
        try:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
        except Exception:
            pass

        unregister_process(process)

        try:
            temp_destination.unlink(missing_ok=True)
        except Exception:
            pass

        raise

def cleanup_local_work_dir(work_dir: Path) -> None:
    """Clean local temp folder only after successful copy to destination."""
    try:
        shutil.rmtree(work_dir, ignore_errors=True)
    except Exception:
        pass

def download_stream_ytdlp(
    stream_url: str,
    output_file: str,
    quality: str = "best",
    stall_timeout: int = 180,
    retries: int = 3,
    local_temp_root: Optional[str] = None,
    progress_key: Optional[str] = None,
    defer_copy: bool = False,
) -> Optional[tuple[Path, Path, Path]]:
    """
    Download HLS with resume/retry and VIDEO + AUDIO selection.

    When defer_copy=True and the destination is /Volumes/...:
    - download + merge to local temp only
    - return (local_file, destination_file, work_dir)
    - caller schedules SMB copy separately, so copy does not block download slots
    """
    ytdlp = shutil.which("yt-dlp")

    if not ytdlp:
        quiet_print("      yt-dlp not found, falling back to ffmpeg.")
        download_stream_ffmpeg(stream_url, output_file, quality)
        return None

    destination_path = Path(output_file)
    use_local_work_dir = is_network_volume_path(str(destination_path))

    if use_local_work_dir:
        output_path, work_dir = build_local_download_path(
            str(destination_path),
            local_temp_root=local_temp_root,
        )
        if progress_key:
            update_parallel_progress(
                progress_key,
                "resolving",
                0.0,
                f"temp={work_dir.name} → {destination_path.parent.name}",
                force=True,
            )
        else:
            print(f"      Temp download folder: {work_dir}")
            print(f"      Final destination: {destination_path}")
    else:
        output_path = destination_path
        work_dir = output_path.parent
        if progress_key:
            update_parallel_progress(
                progress_key,
                "resolving",
                0.0,
                f"direct={output_path.parent}",
                force=True,
            )

    output_format = destination_path.suffix.lower().lstrip(".") or "mkv"

    if local_temp_file_is_ready(output_path):
        if progress_key:
            update_parallel_progress(progress_key, "ready_copy" if use_local_work_dir else "done", 100.0, "existing temp file", force=True)
        else:
            print(f"      Found completed local temp file, skipping download: {output_path}")
            final_info = get_stream_info(str(output_path))
            print_quality_info("existing local temp file", final_info)

        if use_local_work_dir:
            if defer_copy:
                return output_path, destination_path, work_dir
            move_completed_file_to_destination(output_path, destination_path, progress_key=progress_key)
            cleanup_local_work_dir(work_dir)
        return None

    format_args, selected_info = choose_ytdlp_format(ytdlp, stream_url, quality)

    if progress_key:
        res = ""
        if selected_info.get("width") and selected_info.get("height"):
            res = f"{selected_info.get('width')}x{selected_info.get('height')}"
        selector = selected_info.get("format_selector") or ""
        update_parallel_progress(progress_key, "downloading", 0.0, f"{res} {selector}".strip(), force=True)
    else:
        print_ytdlp_selected_format(selected_info)

    temp_output_template = str(output_path.with_suffix("")) + ".%(ext)s"

    cmd = [
        ytdlp,
        "--continue",
        "--newline",
        "--progress",
        "--no-warnings",
        "--no-playlist",
        "--hls-use-mpegts",
        "--concurrent-fragments",
        "6",
        "--socket-timeout",
        str(max(30, stall_timeout)),
        "--retries",
        str(max(1, retries)),
        "--fragment-retries",
        str(max(1, retries)),
        "--ffmpeg-location",
        shutil.which("ffmpeg") or "ffmpeg",
        "--merge-output-format",
        output_format,
        "-o",
        temp_output_template,
    ]

    cmd += format_args
    cmd.append(stream_url)

    last_error: Optional[Exception] = None

    for attempt in range(1, retries + 2):
        raise_if_stopping()

        if attempt > 1:
            if progress_key:
                update_parallel_progress(progress_key, "retry", None, f"download retry {attempt - 1}/{retries}", force=True)
            else:
                print(f"\n      Retry {attempt - 1}/{retries}; resuming partial download...")

        if progress_key:
            update_parallel_progress(progress_key, "downloading", None, "starting", force=True)
        else:
            print("      Starting yt-dlp download/resume...")

        raise_if_stopping()
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        register_process(process)

        last_output_time = time.monotonic()
        last_progress_time = time.monotonic()
        last_percent = -1.0
        last_frag = ""
        reached_100_time: Optional[float] = None
        media_phase = "video"
        completed_media_parts = 0

        try:
            assert process.stdout is not None

            while True:
                raise_if_stopping()
                ready, _, _ = select.select([process.stdout], [], [], 1.0)

                if ready:
                    line = process.stdout.readline()

                    if line == "":
                        return_code = process.poll()
                        if return_code is None:
                            try:
                                return_code = process.wait(timeout=1)
                            except subprocess.TimeoutExpired:
                                continue
                        break

                    line = line.rstrip()
                    last_output_time = time.monotonic()
                    progress = parse_ytdlp_progress_line(line)

                    if progress:
                        percent = float(progress["percent"])
                        frag = progress.get("frag") or ""

                        if percent >= 100.0:
                            reached_100_time = time.monotonic()
                            if last_percent < 100.0:
                                completed_media_parts += 1

                            if progress_key:
                                if media_phase == "video":
                                    update_parallel_progress(progress_key, "video", 100.0, "video downloaded", force=True)
                                elif media_phase == "audio":
                                    update_parallel_progress(progress_key, "audio", 100.0, "audio downloaded", force=True)
                                else:
                                    update_parallel_progress(progress_key, "downloaded", 100.0, "media downloaded", force=True)
                            else:
                                print("\n      Media stream complete. Waiting for next stream or post-processing...")

                        if percent > last_percent or (frag and frag != last_frag):
                            last_progress_time = time.monotonic()
                            last_percent = max(last_percent, percent)
                            last_frag = frag

                        print_ytdlp_progress_bar(
                            percent=percent,
                            speed=progress.get("speed") or "",
                            eta=progress.get("eta") or "",
                            frag=frag,
                            total=progress.get("total") or "",
                            progress_key=progress_key,
                        )
                    else:
                        lower = line.lower()

                        if "[merger]" in lower or "merging formats" in lower:
                            media_phase = "merge"
                            if progress_key:
                                update_parallel_progress(progress_key, "merging", 100.0, "merge video+audio", force=True)
                            else:
                                print(f"\n      {line}")
                            last_progress_time = time.monotonic()

                        elif "[ffmpeg]" in lower or "[fixup" in lower or "[metadata]" in lower or "post-process" in lower or "postprocessing" in lower:
                            media_phase = "postprocess"
                            if progress_key:
                                update_parallel_progress(progress_key, "postprocess", 100.0, "post-processing", force=True)
                            elif "warning:" not in lower:
                                print(f"\n      {line}")
                            last_progress_time = time.monotonic()

                        elif "[download]" in lower and ("destination:" in lower or "has already been downloaded" in lower):
                            if completed_media_parts >= 1 or ".aac" in lower or ".facc" in lower or "audio" in lower:
                                media_phase = "audio"
                                label = "audio stream"
                            else:
                                media_phase = "video"
                                label = "video stream"

                            last_percent = -1.0
                            last_frag = ""

                            if progress_key:
                                update_parallel_progress(progress_key, media_phase, 0.0, f"starting {label}", force=True)
                            else:
                                print(f"\n      {line}")

                        elif "error:" in lower or line.startswith("ERROR"):
                            if progress_key:
                                update_parallel_progress(progress_key, "failed", 100.0, line[:100], force=True)
                            else:
                                print(f"\n      {line}")

                        elif not progress_key and "warning:" in lower and "live hls streams are not supported" not in lower:
                            print(f"\n      {line}")

                    continue

                return_code = process.poll()
                if return_code is not None:
                    break

                now = time.monotonic()
                effective_timeout = max(stall_timeout, 600) if reached_100_time else stall_timeout

                if (now - last_output_time > effective_timeout) or (now - last_progress_time > effective_timeout):
                    if progress_key:
                        update_parallel_progress(progress_key, "retry", None, f"stalled {effective_timeout}s", force=True)
                    else:
                        print(
                            f"\n      No real yt-dlp progress for {effective_timeout}s. "
                            "Stopping and retrying with resume..."
                        )
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()
                    unregister_process(process)
                    raise TimeoutError(f"yt-dlp stalled for {effective_timeout} seconds")

            if not progress_key:
                print()

            unregister_process(process)

            if return_code == 0:
                break

            last_error = subprocess.CalledProcessError(return_code, cmd)

        except KeyboardInterrupt:
            if not progress_key:
                print("\n      Stopping yt-dlp. Local partial file is kept; next run will resume from it.")
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            unregister_process(process)
            raise

        except Exception as ex:
            unregister_process(process)
            last_error = ex
            if attempt <= retries:
                continue
            raise RuntimeError(f"yt-dlp failed after {attempt} attempt(s): {last_error}") from last_error

    else:
        raise RuntimeError(f"yt-dlp failed: {last_error}")

    if not output_path.exists():
        stem = output_path.with_suffix("")
        candidates = list(stem.parent.glob(stem.name + ".*"))
        candidates = [
            p for p in candidates
            if p.is_file()
            and ".part" not in p.name.lower()
            and p.suffix.lower() in {".mp4", ".mkv", ".ts"}
        ]

        if candidates:
            requested = [p for p in candidates if p.suffix.lower() == output_path.suffix.lower()]
            chosen = requested[0] if requested else max(candidates, key=lambda p: p.stat().st_size)
            if chosen != output_path:
                chosen.replace(output_path)

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise RuntimeError("yt-dlp finished but output file is missing or empty")

    if progress_key:
        update_parallel_progress(progress_key, "ready_copy" if use_local_work_dir else "checking", 100.0, "download complete", force=True)
    else:
        final_info = get_stream_info(str(output_path))
        print_quality_info("final file", final_info)

    if use_local_work_dir:
        if defer_copy:
            return output_path, destination_path, work_dir
        move_completed_file_to_destination(output_path, destination_path, progress_key=progress_key)
        cleanup_local_work_dir(work_dir)
        if not progress_key:
            print("      Copied to destination and cleaned local temp files.")

    return None
def download_stream(
    stream_url: str,
    output_file: str,
    quality: str = "best",
    downloader: str = "yt-dlp",
    stall_timeout: int = 180,
    retries: int = 3,
    local_temp_root: Optional[str] = None,
    progress_key: Optional[str] = None,
    defer_copy: bool = False,
) -> Optional[tuple[Path, Path, Path]]:
    if downloader == "yt-dlp":
        return download_stream_ytdlp(
            stream_url,
            output_file,
            quality,
            stall_timeout=stall_timeout,
            retries=retries,
            local_temp_root=local_temp_root,
            progress_key=progress_key,
            defer_copy=defer_copy,
        )

    if downloader == "ffmpeg":
        download_stream_ffmpeg(stream_url, output_file, quality)
        return None

    raise ValueError(f"Unsupported downloader: {downloader}")

def print_download_summary_report(program_title: str, results: list[dict[str, Any]], total_count: int) -> None:
    ok_results = [r for r in results if r.get("ok")]
    failed_results = [r for r in results if not r.get("ok")]

    downloaded = sum(1 for r in ok_results if r.get("status") == "done")
    skipped = sum(1 for r in ok_results if r.get("status") == "skipped")
    other_ok = len(ok_results) - downloaded - skipped

    print()
    print("Download summary")
    print(f"  Program: {program_title}")
    print(f"  Total planned: {total_count}")
    print(f"  Downloaded/copied: {downloaded}")
    print(f"  Skipped existing complete: {skipped}")
    if other_ok:
        print(f"  Other OK: {other_ok}")
    print(f"  Failed after retries: {len(failed_results)}")

    if failed_results:
        print()
        print("Failed items:")
        for result in failed_results:
            key = result.get("key") or "unknown"
            message = result.get("message") or "failed"
            print(f"  - {key}: {message}")

            context = result.get("context") or {}
            if context:
                print("    Context:")
                for ctx_key, ctx_value in context.items():
                    print(f"      {ctx_key}: {ctx_value!r}")

            trace = result.get("traceback") or ""
            if trace:
                print("    Traceback:")
                for line in trace.splitlines():
                    print(f"      {line}")

def command_download_program(args: argparse.Namespace) -> None:
    install_signal_handlers()

    global _SHUTDOWN_STARTED, _FORCE_EXIT_ON_INTERRUPT, _PROGRESS_MODE, _PROGRESS_DISPLAY_SEQUENCE
    _SHUTDOWN_STARTED = False
    _FORCE_EXIT_ON_INTERRUPT = False

    _PROGRESS_MODE = getattr(args, "progress_mode", "table")
    _STOP_EVENT.clear()

    programs = filter_programs(
        fetch_all_programs(args.subclass_id),
        titles=args.program_title,
        ids=args.program_id,
        mainids=args.program_mainid,
    )

    if not programs:
        print("No matching program found")
        return

    extension = args.format.lower().lstrip(".")
    parallel_count = max(1, int(getattr(args, "parallel_downloads", 1) or 1))
    copy_count = max(1, int(getattr(args, "parallel_copies", 1) or 1))
    max_job_retries = max(0, int(getattr(args, "job_retries", 2) or 0))

    try:
        for program in programs:
            raise_if_stopping()
            print(f"Program: {program.title} ({program.id}, mainid={program.mainid})")

            seasons = parse_seasons(program)
            special_episode_counter = 0
            planned_episodes: list[dict[str, Any]] = []

            # Build one queue for the whole series first.
            # This is important: downloads should not wait for a whole season to finish.
            # If parallel-downloads=4 and season 1 has only 3 episodes, the 4th slot
            # should immediately start the first episode of season 2.
            for season in seasons:
                raise_if_stopping()
                real_season_num = season.season_number or 1

                print(f"  Season: s{real_season_num} -> {season.url}")
                episodes = parse_episodes_from_page(program, season)

                if args.limit_episodes:
                    episodes = episodes[: args.limit_episodes]

                season_plan, special_episode_counter = build_episode_plan(
                    episodes=episodes,
                    season=season,
                    real_season_num=real_season_num,
                    output_root=args.output,
                    extension=extension,
                    args=args,
                    special_counter_start=special_episode_counter,
                )

                print_episode_plan_summary(season_plan)
                planned_episodes.extend(season_plan)

            if not planned_episodes:
                print("  No episodes found.")
                continue

            for order, item in enumerate(planned_episodes, start=1):
                item["global_order"] = order
                os.makedirs(item["target_folder"], exist_ok=True)

            print(f"  Total queued episodes across all seasons: {len(planned_episodes)}")

            if getattr(args, "dry_run", False):
                continue

            if parallel_count <= 1:
                set_parallel_progress_enabled(False)

                for item in planned_episodes:
                    episode = item["episode"]
                    target_season_num = item["target_season_num"]
                    target_episode_num = item["target_episode_num"]
                    target_folder = item["target_folder"]
                    output_file = os.path.join(target_folder, item["key"])

                    raise_if_stopping()

                    if item["is_special"]:
                        print(
                            f"    Resolving special: {Path(output_file).name} | "
                            f"{episode.title} (from s{item['source_season_num']}, reason={item['special_reason']})"
                        )
                    else:
                        print(f"    Resolving stream: {Path(output_file).name} | {episode.title}")

                    try:
                        stream_url = episode.stream_url
                        if not stream_url:
                            stream_url, _ = resolve_episode_stream(
                                episode.play_url or episode.url,
                                raise_on_error=True,
                            )

                        existing_file = episode_file_exists(
                            folder=target_folder,
                            season_num=target_season_num,
                            episode_num=target_episode_num,
                            extension=extension,
                        )

                        if existing_file:
                            print(f"    Checking existing file duration: {existing_file}")
                            is_complete, file_duration, source_duration = is_existing_file_complete(
                                existing_file,
                                stream_url,
                                min_ratio=getattr(args, "min_duration_ratio", 0.95),
                                quality=getattr(args, "quality", "best"),
                                min_quality_ratio=getattr(args, "min_quality_ratio", 0.95),
                                check_quality=not getattr(args, "skip_quality_check", False),
                            )

                            if is_complete:
                                print(
                                    f"    Exists and complete, skipping: "
                                    f"{format_time(file_duration)} / {format_time(source_duration)}"
                                )
                                continue

                        print(f"    Downloading: {output_file} using {args.downloader}")
                        download_stream(
                            stream_url=stream_url,
                            output_file=output_file,
                            quality=args.quality,
                            downloader=args.downloader,
                            stall_timeout=args.stall_timeout,
                            retries=args.retries,
                            local_temp_root=args.local_temp,
                        )

                    except KeyboardInterrupt:
                        raise
                    except Exception as ex:
                        print(f"    Failed: {episode.title} -> {ex}")

                continue

            set_parallel_progress_enabled(True)
            _PROGRESS_STATE.clear()
            _PROGRESS_DISPLAY_SEQUENCE = 0

            print(f"  Parallel downloads: {parallel_count}; SMB copies: {copy_count}")
            print("  Queue mode: whole series, not season-by-season")

            pending = deque((item, 0) for item in planned_episodes)
            retry_queue = deque()
            active_downloads: dict[Any, tuple[dict[str, Any], int]] = {}
            active_copies: dict[Any, tuple[dict[str, Any], int]] = {}
            copy_queue = deque()
            results: list[dict[str, Any]] = []

            order_map = {id(item): idx for idx, item in enumerate(planned_episodes, start=1)}

            with _PROGRESS_LOCK:
                for order, item in enumerate(planned_episodes, start=1):
                    detail = item["detail"]
                    if item["is_special"]:
                        detail = f"SPECIAL → s00 ({item['special_reason']}) | {item['episode'].title}"

                    _PROGRESS_STATE[item["key"]] = {
                        "stage": "WAIT",
                        "percent": 0.0,
                        "detail": detail,
                        "order": order,
                    }
                render_parallel_progress_locked(force=True)

            download_executor = ThreadPoolExecutor(max_workers=parallel_count, thread_name_prefix="kan-download")
            copy_executor = ThreadPoolExecutor(max_workers=copy_count, thread_name_prefix="kan-copy")

            def plan_order(item: dict[str, Any]) -> int:
                return order_map.get(id(item), 999999)

            def submit_downloads() -> None:
                while (
                    not _STOP_EVENT.is_set()
                    and (pending or retry_queue)
                    and len(active_downloads) < parallel_count
                ):
                    # New episodes go first. Failed episodes are retried after the
                    # current series queue has been walked through once.
                    if pending:
                        item, attempt = pending.popleft()
                    else:
                        item, attempt = retry_queue.popleft()

                    key = item["key"]
                    order = plan_order(item)
                    detail = "starting" if attempt == 0 else f"retry {attempt}/{max_job_retries}"
                    if item["is_special"]:
                        detail = f"{detail}; SPECIAL from S{item['source_season_num']:02d}"

                    update_parallel_progress(
                        key,
                        "queued" if attempt == 0 else "retry",
                        0.0,
                        detail,
                        order=order,
                        force=True,
                    )
                    future = download_executor.submit(
                        download_one_episode_job,
                        item["episode"],
                        item["target_folder"],
                        item["target_season_num"],
                        item["target_episode_num"],
                        extension,
                        args,
                    )
                    active_downloads[future] = (item, attempt)

            def submit_copies() -> None:
                while (
                    not _STOP_EVENT.is_set()
                    and copy_queue
                    and len(active_copies) < copy_count
                ):
                    result = copy_queue.popleft()
                    item = result["plan_item"]
                    key = result["key"]
                    order = plan_order(item)
                    update_parallel_progress(
                        key,
                        "copying",
                        0.0,
                        "copying to SMB",
                        order=order,
                        force=True,
                    )
                    future = copy_executor.submit(
                        copy_one_episode_job,
                        key,
                        result["copy_info"],
                        item["target_episode_num"],
                    )
                    active_copies[future] = (item, result.get("attempt", 0))

            def retry_or_fail(
                item: dict[str, Any],
                attempt: int,
                failure: Any,
            ) -> None:
                key = item["key"]
                order = plan_order(item)

                if isinstance(failure, dict):
                    message = str(failure.get("message") or "failed")
                else:
                    message = str(failure or "failed")

                if attempt < max_job_retries and not _STOP_EVENT.is_set():
                    next_attempt = attempt + 1
                    update_parallel_progress(
                        key,
                        "retry",
                        0.0,
                        f"queued for retry at end {next_attempt}/{max_job_retries}: {message[:55]}",
                        order=order,
                        force=True,
                    )
                    item["last_failure"] = failure
                    retry_queue.append((item, next_attempt))
                else:
                    update_parallel_progress(
                        key,
                        "failed",
                        100.0,
                        message[:120],
                        order=order,
                        force=True,
                    )

                    if isinstance(failure, dict):
                        failure_result = dict(failure)
                        failure_result["ok"] = False
                        failure_result["status"] = "failed"
                        failure_result["key"] = key
                        failure_result["attempts"] = attempt + 1
                    else:
                        failure_result = {
                            "ok": False,
                            "status": "failed",
                            "key": key,
                            "message": message,
                            "attempts": attempt + 1,
                        }

                    results.append(failure_result)

            try:
                submit_downloads()

                while pending or retry_queue or active_downloads or copy_queue or active_copies:
                    raise_if_stopping()

                    all_futures = list(active_downloads.keys()) + list(active_copies.keys())
                    if not all_futures:
                        submit_downloads()
                        submit_copies()
                        time.sleep(0.1)
                        continue

                    done, _ = wait(all_futures, timeout=0.5, return_when=FIRST_COMPLETED)

                    for future in done:
                        if future in active_downloads:
                            item, attempt = active_downloads.pop(future)
                            result = future.result()
                            result["plan_item"] = item

                            if result.get("ok") and result.get("status") == "ready_copy":
                                result["attempt"] = attempt
                                copy_queue.append(result)
                                order = plan_order(item)
                                update_parallel_progress(
                                    result["key"],
                                    "copy_wait",
                                    100.0,
                                    "waiting for SMB copy",
                                    order=order,
                                    force=True,
                                )
                            elif result.get("ok"):
                                results.append(result)
                                remove_parallel_progress_row(result.get("key", item["key"]), force=True)
                            else:
                                retry_or_fail(item, attempt, result)

                        elif future in active_copies:
                            item, attempt = active_copies.pop(future)
                            result = future.result()

                            if result.get("ok"):
                                results.append(result)
                                remove_parallel_progress_row(result.get("key", item["key"]), force=True)
                            else:
                                retry_or_fail(item, attempt, result)

                    # Important: download slots are filled from the entire series queue.
                    # A new episode can start even if the previous one is copying, and
                    # even if the previous season still has copy-wait items.
                    submit_downloads()
                    submit_copies()

            except KeyboardInterrupt:
                _STOP_EVENT.set()
                stop_active_processes()

                for future in list(active_downloads) + list(active_copies):
                    future.cancel()

                with _PROGRESS_LOCK:
                    for key, state in _PROGRESS_STATE.items():
                        if progress_stage_is_active_or_pending(state.get("stage", "")):
                            state["stage"] = "FAILED"
                            state["percent"] = 100.0
                            state["detail"] = "stopped by user"
                    render_parallel_progress_locked(force=True)
                raise

            finally:
                if _STOP_EVENT.is_set():
                    stop_active_processes()

                # Normal completion: wait for executors to close cleanly, then continue to next program.
                # Ctrl+C / stop: do not wait forever for blocked SMB threads.
                should_wait = not _STOP_EVENT.is_set()

                try:
                    download_executor.shutdown(wait=should_wait, cancel_futures=True)
                except TypeError:
                    download_executor.shutdown(wait=should_wait)

                try:
                    copy_executor.shutdown(wait=should_wait, cancel_futures=True)
                except TypeError:
                    copy_executor.shutdown(wait=should_wait)

                with _PROGRESS_LOCK:
                    render_parallel_progress_locked(force=True)
                finish_parallel_progress()
                set_parallel_progress_enabled(False)

            if _STOP_EVENT.is_set():
                raise KeyboardInterrupt

            print_download_summary_report(program.title, results, len(planned_episodes))

    except KeyboardInterrupt:
        _STOP_EVENT.set()
        stop_active_processes()
        finish_parallel_progress()
        set_parallel_progress_enabled(False)
        print("\nStopped by user. Active downloads/copies were stopped. Partial local temp files are kept and can resume next run.")
        sys.stdout.flush()
        sys.stderr.flush()
        # Important: ThreadPoolExecutor can otherwise hang in threading._shutdown
        # if a worker is blocked inside SMB I/O.
        os._exit(130)

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Kan 11 VOD scanner")
    sub = parser.add_subparsers(dest="command", required=True)

    def add_program_filters(p: argparse.ArgumentParser) -> None:
        p.add_argument(
            "--subclass-id",
            action="append",
            help="Kan mobile subClass id to load programs from. Can be repeated. Default: 4444",
        )
        p.add_argument("--program-title", action="append", help="Filter by program title substring")
        p.add_argument("--program-id", action="append", help="Filter by program id")
        p.add_argument("--program-mainid", action="append", help="Filter by program mainid")

    scan = sub.add_parser("scan", help="Scan programs/seasons/episodes into SQLite")
    scan.add_argument("--db", default="kan_vod.db")
    add_program_filters(scan)
    scan.add_argument("--limit-programs", type=int)
    scan.add_argument("--limit-episodes", type=int)
    scan.add_argument("--with-streams", action="store_true")
    scan.add_argument(
        "--incremental",
        action="store_true",
        help="For existing programs, scan new seasons and the latest season instead of every season.",
    )
    scan.add_argument(
        "--full-scan-interval-hours",
        type=int,
        default=168,
        help="When --incremental is set, force a full program scan after this many hours. Default: 168.",
    )
    scan.add_argument(
        "--skip-complete-episodes",
        action="store_true",
        help="Skip upserting episodes that already have title, description, image and stream_url in DB",
    )
    scan.add_argument(
        "--skip-existing-programs",
        action="store_true",
        help="Skip a whole program if it already has at least one episode in DB",
    )
    scan.add_argument(
        "--skip-programs-with-streams",
        action="store_true",
        help="Skip a whole program only if all existing DB episodes for it already have stream_url",
    )
    scan.add_argument("--verbose", action="store_true", help="Show detailed progress output")
    scan.add_argument(
        "--enrich-metadata",
        action="store_true",
        help="Fetch each episode page when title/description/image are missing. Slower.",
    )
    scan.set_defaults(func=command_scan)

    list_programs = sub.add_parser("list-programs", help="Print program names")
    add_program_filters(list_programs)
    list_programs.add_argument("--json", action="store_true")
    list_programs.set_defaults(func=command_list_programs)

    count_seasons = sub.add_parser("count-seasons", help="Print number of seasons for programs")
    add_program_filters(count_seasons)
    count_seasons.add_argument("--show-urls", action="store_true")
    count_seasons.set_defaults(func=command_count_seasons)

    list_episodes = sub.add_parser("list-episodes", help="Print episode names for a program")
    add_program_filters(list_episodes)
    list_episodes.add_argument("--limit-episodes", type=int)
    list_episodes.add_argument("--with-streams", action="store_true")
    list_episodes.add_argument(
        "--enrich-metadata",
        action="store_true",
        help="Fetch each episode page when title/description/image are missing. Slower.",
    )
    list_episodes.add_argument("--show-urls", action="store_true")
    list_episodes.add_argument("--json", action="store_true")
    list_episodes.set_defaults(func=command_list_episodes)

    stream = sub.add_parser("stream-url", help="Resolve stream_url for an episode page URL")
    stream.add_argument("--episode-url", required=True)
    stream.add_argument("--show-entry-id", action="store_true")
    stream.add_argument("--json", action="store_true")
    stream.set_defaults(func=command_stream_url)

    debug_stream = sub.add_parser("debug-stream", help="Debug stream extraction for a page URL")
    debug_stream.add_argument("--episode-url", required=True)
    debug_stream.add_argument("--save-html")
    debug_stream.set_defaults(func=command_debug_stream)

    missing_desc = sub.add_parser("missing-descriptions", help="Show episodes missing description")
    missing_desc.add_argument("--db", default="kan_vod.db")
    missing_desc.add_argument("--limit", type=int, default=100)
    missing_desc.set_defaults(func=command_missing_descriptions)

    status = sub.add_parser("stream-status", help="Show stream completion status by program")
    status.add_argument("--db", default="kan_vod.db")
    status.add_argument("--only-missing", action="store_true")
    status.set_defaults(func=command_stream_status)

    search = sub.add_parser("search", help="Search inside SQLite DB")
    search.add_argument("--db", default="kan_vod.db")
    search.add_argument("--query", required=True)
    search.add_argument("--limit", type=int, default=50)
    search.set_defaults(func=command_search)

    get_episode = sub.add_parser("get-episode", help="Get one episode from SQLite DB")
    get_episode.add_argument("--db", default="kan_vod.db")
    get_episode.add_argument("--episode-id", required=True)
    get_episode.add_argument("--resolve", action="store_true")
    get_episode.set_defaults(func=command_get_episode)

    resolve_missing = sub.add_parser("resolve-missing-streams", help="Resolve missing streams in DB")
    resolve_missing.add_argument("--db", default="kan_vod.db")
    resolve_missing.add_argument("--limit", type=int, default=50)
    resolve_missing.set_defaults(func=command_resolve_missing_streams)


    download = sub.add_parser("download-program", help="Download all episodes from a program")
    add_program_filters(download)
    download.add_argument("--output", required=True, help="Destination folder")
    download.add_argument("--format", default="mkv", choices=["mp4", "mkv", "ts"], help="Output container format")
    download.add_argument("--quality", default="best", choices=["best", "worst", "720p", "1080p"], help="Download/transcode quality")
    download.add_argument("--downloader", default="yt-dlp", choices=["yt-dlp", "ffmpeg"], help="Downloader backend. yt-dlp supports resume and retry; ffmpeg gives cleaner progress but restarts from zero.")
    download.add_argument("--season", type=int, help="Download only one season number")
    download.add_argument("--limit-episodes", type=int, help="Limit episodes per season")
    download.add_argument("--verify-ratio", type=float, default=0.95, help="Existing file is complete if duration is at least this ratio of source duration")
    download.add_argument("--stall-timeout", type=int, default=180, help="Retry the same episode if yt-dlp has no progress output for this many seconds")
    download.add_argument("--retries", type=int, default=3, help="How many times to retry the same episode after stalls or download errors")
    download.add_argument("--local-temp", default=None, help="Local temp root before copying final file to SMB/NAS. Default: system temp folder.")
    download.add_argument("--parallel-downloads", type=int, default=1, help="Download multiple episodes from the same season in parallel. Default: 1.")
    download.add_argument("--progress-mode", choices=["table", "compact", "off"], default="table", help="Progress display mode. table=clear/redraw table, compact=single line, off=no live progress. Default: table.")
    download.add_argument("--dry-run", action="store_true", help="Only show episode plan. Do not resolve streams, download, or copy files.")
    download.add_argument("--parallel-copies", type=int, default=1, help="How many SMB copies may run at once. Default: 1 to avoid SMB stalls.")
    download.add_argument("--job-retries", type=int, default=2, help="Retry a failed episode by returning it to the end of the queue. Default: 2.")
    download.add_argument("--min-duration-ratio", type=float, default=0.95, help="Existing file is considered complete if duration is at least this ratio of source duration. Default: 0.95.")
    download.add_argument("--min-quality-ratio", type=float, default=0.95, help="Existing file quality is considered good if resolution/bitrate are at least this ratio of requested source quality. Default: 0.95.")
    download.add_argument("--skip-quality-check", action="store_true", help="Only check existing file duration; do not compare resolution/bitrate/audio quality.")
    download.add_argument("--disable-special-detection", action="store_true", help="Do not move promo/trailer/special items to s00. Default: detect and move to s00.")
    download.add_argument("--special-keyword", action="append", default=[], help="Extra keyword for detecting specials/promos. Can be repeated or comma-separated.")
    download.set_defaults(func=command_download_program)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    try:
        args.func(args)
    except KeyboardInterrupt:
        print("\nStopped by user.")
        return


if __name__ == "__main__":
    main()
