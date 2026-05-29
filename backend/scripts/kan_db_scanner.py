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
import json
import os
import re
import sqlite3
import sys
import subprocess
import shutil
import time
import select
from dataclasses import asdict, dataclass
from html import unescape
from typing import Any, Optional
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit

import requests
from bs4 import BeautifulSoup

try:
    import cloudscraper
except ImportError:
    cloudscraper = None


API_URL = "https://mobapi.kan.org.il/api/mobile/subClass"
KAN11_ID = "4444"
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
    last_error: Optional[Exception] = None

    for attempt in range(1, retries + 1):
        try:
            scraper = make_scraper()
            response = scraper.get(url, headers=HEADERS, timeout=timeout)

            if response.status_code == 403:
                last_error = RuntimeError(f"403 Forbidden: {url}")
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


def fetch_all_programs() -> list[Program]:
    programs: list[Program] = []
    seen: set[str] = set()
    start = 1

    while True:
        response = requests.get(
            API_URL,
            params={"from": start, "id": KAN11_ID},
            headers=HEADERS,
            timeout=30,
        )
        response.raise_for_status()

        entries = response.json().get("entry") or []

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
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS seasons (
                season_id TEXT PRIMARY KEY,
                program_id TEXT NOT NULL,
                title TEXT,
                url TEXT NOT NULL,
                season_number INTEGER,
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
            """
        )

        # Safe migrations for compatible old tables that only miss optional columns.
        add_column_if_missing(con, "programs", "mainid", "TEXT")
        add_column_if_missing(con, "programs", "description", "TEXT")
        add_column_if_missing(con, "programs", "url", "TEXT")
        add_column_if_missing(con, "programs", "image", "TEXT")
        add_column_if_missing(con, "programs", "program_format", "TEXT")
        add_column_if_missing(con, "programs", "program_genre", "TEXT")
        add_column_if_missing(con, "programs", "updated_at", "TEXT DEFAULT CURRENT_TIMESTAMP")

        add_column_if_missing(con, "seasons", "program_id", "TEXT")
        add_column_if_missing(con, "seasons", "title", "TEXT")
        add_column_if_missing(con, "seasons", "url", "TEXT")
        add_column_if_missing(con, "seasons", "season_number", "INTEGER")
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
    programs = fetch_all_programs()
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
        fetch_all_programs(),
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
        fetch_all_programs(),
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
    entry_id = extract_kaltura_entry_id(html)

    print(f"page length: {len(html)}")
    print(f"direct stream: {direct or ''}")
    print(f"kaltura entry id: {entry_id or ''}")

    if args.save_html:
        Path(args.save_html).write_text(html, encoding="utf-8")
        print(f"saved html: {args.save_html}")

    hints = []
    for pattern in ["data-hls-url", "data-dash-url", "entry_id", "entryId", "kaltura", "UrlRedirector", "bynetURL"]:
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


def command_scan(args: argparse.Namespace) -> None:
    global ENRICH_MISSING_METADATA
    ENRICH_MISSING_METADATA = bool(getattr(args, "enrich_metadata", False))

    init_db(args.db)
    con = connect_db(args.db)

    try:
        programs = fetch_all_programs()
        programs = filter_programs(
            programs,
            titles=args.program_title,
            ids=args.program_id,
            mainids=args.program_mainid,
        )

        if args.limit_programs:
            programs = programs[: args.limit_programs]

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

            total_program_episodes = 0

            for season in seasons:
                upsert_season(con, season)
                con.commit()

                print(f"    Season: {season.title} -> {season.url}")

                try:
                    episodes = parse_episodes_from_page(program, season)
                except Exception as ex:
                    print(f"    Failed to parse episodes: {ex}")
                    continue

                if args.limit_episodes:
                    episodes = episodes[: args.limit_episodes]

                print(f"    Episodes: {len(episodes)}")

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

                con.commit()

            print(f"  Saved episodes: {total_program_episodes}")

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


def is_existing_file_complete(
    existing_file: str,
    stream_url: str,
    min_ratio: float = 0.95,
) -> tuple[bool, Optional[float], Optional[float]]:
    """
    Returns (is_complete, file_duration, source_duration).
    """
    if not existing_file or not os.path.isfile(existing_file):
        return False, None, None

    if os.path.getsize(existing_file) <= 0:
        return False, None, None

    source_duration = get_duration_seconds(stream_url)
    file_duration = get_duration_seconds(existing_file)

    if source_duration is None:
        # If source duration cannot be detected, do not force a re-download of a non-empty file.
        return True, file_duration, source_duration

    if file_duration is None:
        return False, file_duration, source_duration

    return file_duration >= (source_duration * min_ratio), file_duration, source_duration


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
        bar = "█" * filled + "░" * (width - filled)
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

    speed_match = re.search(r"\bat\s+([^\s]+(?:/s)?)", line)
    eta_match = re.search(r"\bETA\s+([^\s]+)", line)
    frag_match = re.search(r"\(frag\s+([^)]+)\)", line)

    try:
        percent = float(percent_match.group(1))
    except ValueError:
        return None

    return {
        "percent": percent,
        "speed": speed_match.group(1) if speed_match else "",
        "eta": eta_match.group(1) if eta_match else "",
        "frag": frag_match.group(1) if frag_match else "",
        "raw": line,
    }


def print_ytdlp_progress_bar(
    percent: float,
    speed: str = "",
    eta: str = "",
    frag: str = "",
) -> None:
    width = 32
    ratio = min(max(percent / 100.0, 0.0), 1.0)
    filled = int(width * ratio)
    bar = "█" * filled + "░" * (width - filled)

    extra = []
    if speed:
        extra.append(f"speed={speed}")
    if eta:
        extra.append(f"ETA={eta}")
    if frag:
        extra.append(f"frag={frag}")

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
            return int(value)
        except Exception:
            return None

    return {
        "width": to_int(video.get("width")),
        "height": to_int(video.get("height")),
        "video_bitrate": to_int(video.get("bit_rate")),
        "audio_bitrate": to_int(audio.get("bit_rate")),
        "total_bitrate": to_int(fmt.get("bit_rate")),
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
            "stream=index,codec_type,width,height,bit_rate,avg_frame_rate:format=bit_rate,duration",
            "-of",
            "json",
            stream_url,
        ],
        timeout=45,
    )

    if not data:
        return {}

    return stream_info_from_streams(data.get("streams") or [], data.get("format") or {})


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
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )

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


def choose_ytdlp_format(
    ytdlp: str,
    stream_url: str,
    quality: str,
) -> tuple[list[str], dict[str, Any]]:
    """
    Return (yt-dlp -f args, selected_info).

    For Kan HLS, forcing "-f best" can fail. Instead, we inspect formats and
    select the highest video format id explicitly, usually something like:
    5500+acc-HEB-aac
    """
    data = run_ytdlp_json(ytdlp, stream_url)
    if not data:
        return ytdlp_quality_args(quality), {}

    formats = data.get("formats") or []

    videos = []
    audios = []

    for fmt in formats:
        format_id = str(fmt.get("format_id") or "")
        if not format_id:
            continue

        vcodec = fmt.get("vcodec")
        acodec = fmt.get("acodec")

        has_video = vcodec and vcodec != "none"
        has_audio = acodec and acodec != "none"

        height = int(format_number(fmt.get("height")) or 0)
        width = int(format_number(fmt.get("width")) or 0)
        tbr = format_number(fmt.get("tbr")) or format_number(fmt.get("vbr")) or 0
        abr = format_number(fmt.get("abr")) or 0

        if has_video:
            videos.append((height, width, tbr, format_id, fmt, has_audio))

        if has_audio and not has_video:
            audios.append((abr, tbr, format_id, fmt))

    if not videos:
        return ytdlp_quality_args(quality), {}

    if quality == "worst":
        videos.sort(key=lambda item: (item[0], item[1], item[2]))
        selected_video = videos[0]
    elif quality in {"720p", "1080p"}:
        target = int(quality.replace("p", ""))
        at_or_below = [item for item in videos if item[0] <= target]
        pool = at_or_below or videos
        pool.sort(key=lambda item: (item[0], item[1], item[2]), reverse=True)
        selected_video = pool[0]
    else:
        videos.sort(key=lambda item: (item[0], item[1], item[2]), reverse=True)
        selected_video = videos[0]

    height, width, tbr, video_id, video_fmt, video_has_audio = selected_video

    audio_id = ""
    audio_fmt: dict[str, Any] = {}

    if not video_has_audio and audios:
        audios.sort(key=lambda item: (item[0], item[1]), reverse=True)
        _, _, audio_id, audio_fmt = audios[0]

    selector = f"{video_id}+{audio_id}" if audio_id else video_id

    selected_info = {
        "format_selector": selector,
        "video_id": video_id,
        "audio_id": audio_id,
        "width": width or video_fmt.get("width"),
        "height": height or video_fmt.get("height"),
        "tbr": tbr or video_fmt.get("tbr"),
        "vcodec": video_fmt.get("vcodec"),
        "acodec": audio_fmt.get("acodec") or video_fmt.get("acodec"),
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

    resolution = f"{width}x{height}" if width and height else "unknown resolution"
    bitrate = f"{float(tbr):.0f} kb/s" if tbr else "unknown bitrate"

    print(f"      Selected quality: {resolution}, {bitrate}, format={selector}")

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

def download_stream_ytdlp(
    stream_url: str,
    output_file: str,
    quality: str = "best",
    stall_timeout: int = 180,
    retries: int = 3,
) -> None:
    """
    Download HLS with real resume support using yt-dlp.

    - Chooses the real best format by inspecting yt-dlp formats.
    - Keeps partial files so retry/resume continues from the previous point.
    - Shows a clean single-line progress bar.
    - Suppresses noisy generic/redirect/info lines.
    """
    ytdlp = shutil.which("yt-dlp")

    if not ytdlp:
        print("      yt-dlp not found, falling back to ffmpeg.")
        return download_stream_ffmpeg(stream_url, output_file, quality)

    output_path = Path(output_file)
    output_format = output_path.suffix.lower().lstrip(".") or "mkv"

    format_args, selected_info = choose_ytdlp_format(ytdlp, stream_url, quality)
    print_ytdlp_selected_format(selected_info)

    # Use a base output template. yt-dlp may create temporary files like:
    # S01E03.mp4.part / S01E03.f5500.mp4.part.
    # After successful completion, we normalize the final media file to output_path.
    temp_output_template = str(output_path.with_suffix("")) + ".%(ext)s"

    cmd = [
        ytdlp,
        "--continue",
        "--newline",
        "--progress",
        "--no-warnings",
        "--no-playlist",
        "--hls-use-mpegts",
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
        if attempt > 1:
            print(f"\n      Retry {attempt - 1}/{retries}; resuming partial download...")

        print("      Starting yt-dlp download/resume...")

        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

        last_output_time = time.monotonic()
        last_progress_time = time.monotonic()
        last_percent = -1.0
        last_frag = ""

        try:
            assert process.stdout is not None

            while True:
                ready, _, _ = select.select([process.stdout], [], [], 1.0)

                if ready:
                    line = process.stdout.readline()
                    if line:
                        line = line.rstrip()
                        last_output_time = time.monotonic()

                        progress = parse_ytdlp_progress_line(line)

                        if progress:
                            percent = float(progress["percent"])
                            frag = progress.get("frag") or ""

                            if percent > last_percent or (frag and frag != last_frag):
                                last_progress_time = time.monotonic()
                                last_percent = max(last_percent, percent)
                                last_frag = frag

                            print_ytdlp_progress_bar(
                                percent=percent,
                                speed=progress.get("speed") or "",
                                eta=progress.get("eta") or "",
                                frag=frag,
                            )
                        else:
                            # Keep only important messages, hide noisy:
                            # [generic], [redirect], [info], [hlsnative], etc.
                            lower = line.lower()
                            if "error:" in lower or line.startswith("ERROR"):
                                print(f"\n      {line}")
                            elif "warning:" in lower:
                                # Hide the noisy native-HLS live warning. It is common for Kan VOD.
                                if "live hls streams are not supported" not in lower:
                                    print(f"\n      {line}")

                    continue

                return_code = process.poll()

                if return_code is not None:
                    break

                now = time.monotonic()
                no_output = now - last_output_time > stall_timeout
                no_progress = now - last_progress_time > stall_timeout

                if no_output or no_progress:
                    print(
                        f"\n      No real yt-dlp progress for {stall_timeout}s. "
                        "Stopping and retrying with resume..."
                    )

                    process.terminate()

                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()

                    raise TimeoutError(
                        f"yt-dlp stalled for {stall_timeout} seconds"
                    )

            print()

            if return_code == 0:
                break

            last_error = subprocess.CalledProcessError(return_code, cmd)

        except KeyboardInterrupt:
            print("\n      Stopping yt-dlp. Partial file is kept; next run will resume from it.")
            process.terminate()

            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()

            raise

        except Exception as ex:
            last_error = ex

            # Keep yt-dlp partial files. They are needed for resume.
            if attempt <= retries:
                continue

            raise RuntimeError(
                f"yt-dlp failed after {attempt} attempt(s): {last_error}"
            ) from last_error

    else:
        raise RuntimeError(f"yt-dlp failed: {last_error}")

    # yt-dlp may leave the final file as .mp4/.mkv/.ts depending on stream/merge behavior.
    # Normalize the largest completed media file with the same stem to output_path.
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

    final_info = get_stream_info(str(output_path))
    print_quality_info("final file", final_info)

def download_stream(
    stream_url: str,
    output_file: str,
    quality: str = "best",
    downloader: str = "yt-dlp",
    stall_timeout: int = 180,
    retries: int = 3,
) -> None:
    if downloader == "yt-dlp":
        return download_stream_ytdlp(
            stream_url,
            output_file,
            quality,
            stall_timeout=stall_timeout,
            retries=retries,
        )

    if downloader == "ffmpeg":
        return download_stream_ffmpeg(stream_url, output_file, quality)

    raise ValueError(f"Unsupported downloader: {downloader}")

def command_download_program(args: argparse.Namespace) -> None:
    programs = filter_programs(
        fetch_all_programs(),
        titles=args.program_title,
        ids=args.program_id,
        mainids=args.program_mainid,
    )

    if not programs:
        print("No programs found.")
        return

    os.makedirs(args.output, exist_ok=True)

    for program in programs:
        print(f"Program: {program.title} ({program.id}, mainid={program.mainid})")

        try:
            seasons = parse_seasons(program)
        except Exception as ex:
            print(f"  Failed to parse seasons: {ex}")
            continue

        for season in seasons:
            season_num = season.season_number or 1

            if args.season and season_num != args.season:
                continue

            season_folder = os.path.join(args.output, f"s{season_num}")
            os.makedirs(season_folder, exist_ok=True)

            print(f"  Season: s{season_num} -> {season.url}")

            try:
                episodes = parse_episodes_from_page(program, season)
            except Exception as ex:
                print(f"    Failed to parse episodes: {ex}")
                continue

            if args.limit_episodes:
                episodes = episodes[: args.limit_episodes]

            for idx, episode in enumerate(episodes, start=1):
                filename = f"S{season_num:02d}E{idx:02d}.{args.format}"
                output_file = os.path.join(season_folder, filename)

                existing_file = episode_file_exists(
                    season_folder,
                    season_num,
                    idx,
                    args.format,
                )

                print(f"    Resolving stream: {filename} | {episode.title}")

                stream_url = episode.stream_url

                if not stream_url:
                    stream_url, _ = resolve_episode_stream(
                        episode.play_url or episode.url,
                        raise_on_error=False,
                    )

                if not stream_url:
                    print(f"    No stream found: {episode.title}")
                    continue

                if existing_file:
                    print(f"    Checking existing file duration: {existing_file}")
                    is_complete, file_duration, source_duration = is_existing_file_complete(
                        existing_file=existing_file,
                        stream_url=stream_url,
                        min_ratio=args.verify_ratio,
                    )

                    if is_complete:
                        print(
                            "    Exists and complete, skipping: "
                            f"{format_time(file_duration)} / {format_time(source_duration)}"
                        )
                        continue

                    print(
                        "    Existing file is incomplete, re-downloading/resuming: "
                        f"{format_time(file_duration)} / {format_time(source_duration)}"
                    )

                    # Remove broken final file. yt-dlp .part files are kept separately.
                    try:
                        os.remove(existing_file)
                    except OSError:
                        pass

                print(f"    Downloading: {output_file} using {args.downloader}")

                try:
                    download_stream(
                        stream_url=stream_url,
                        output_file=output_file,
                        quality=args.quality,
                        downloader=args.downloader,
                        stall_timeout=args.stall_timeout,
                        retries=args.retries,
                    )
                except KeyboardInterrupt:
                    if args.downloader == "yt-dlp":
                        print("\nStopped by user. yt-dlp partial file was kept; next run will resume from it.")
                    else:
                        print("\nStopped by user. Partial .part file was removed.")
                    return
                except Exception as ex:
                    print(f"    Failed: {episode.title} -> {ex}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Kan 11 VOD scanner")
    sub = parser.add_subparsers(dest="command", required=True)

    def add_program_filters(p: argparse.ArgumentParser) -> None:
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
