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
import time
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

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
