#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import json
import re
import sys
from html import unescape
from typing import Any, Optional
from urllib.parse import urljoin, urlsplit, urlunsplit

import cloudscraper
import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.kan.org.il"
PARTNER_ID = 2717431
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/121.0.0.0 Safari/537.36"
)

HEADERS = {
    "User-Agent": USER_AGENT,
    "Referer": BASE_URL + "/",
    "Accept": "*/*",
}


def log(msg: str) -> None:
    print(msg, file=sys.stderr)


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    value = re.sub(r"<[^>]+>", " ", value, flags=re.S)
    value = unescape(value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def clean_url(url: str) -> str:
    return (url or "").replace("?app=true", "").strip()


def make_scraper():
    return cloudscraper.create_scraper(
        interpreter="native",
        browser={
            "browser": "chrome",
            "platform": "darwin",
            "desktop": True,
        },
    )


def get_cf(url: str, retries: int = 5) -> str:
    scraper = make_scraper()
    last_status = None

    for attempt in range(1, retries + 1):
        response = scraper.get(url, headers=HEADERS, timeout=30)
        last_status = response.status_code
        if response.status_code == 403:
            log(f"Cloudflare 403, retry {attempt}/{retries}: {url}")
            continue
        response.raise_for_status()
        return response.text

    raise RuntimeError(f"Could not fetch page after {retries} retries. Last status={last_status}. URL={url}")


def normalize_stream_url(url: str) -> str:
    if not url:
        return ""
    url = url.replace("\\u0026", "&").replace("&amp;", "&")
    if url.startswith("//"):
        url = "https:" + url
    return url.strip()


def normalize_master_url(url: str) -> str:
    url = normalize_stream_url(url)
    parts = urlsplit(url)
    # Keep query, because Kan/Redge sometimes needs ?fmp4 or token params.
    return urlunsplit((parts.scheme, parts.netloc, parts.path, parts.query, ""))


def extract_kaltura_entry_id(html: str) -> Optional[str]:
    patterns = [
        r'<div[^>]+id=["\']video_item["\'][^>]+data-entryId=["\']([^"\']+)["\']',
        r'data-entryId=["\']([^"\']+)["\']',
        r'data-entryid=["\']([^"\']+)["\']',
        r'entry_id=([^"&\\]+)',
        r'["\']entry_id["\']\s*:\s*["\']([^"\']+)["\']',
        r'["\']entryId["\']\s*:\s*["\']([^"\']+)["\']',
        r'kaltura_player_[^"\']*?entry_id[=/]([^"&\\]+)',
    ]

    for pattern in patterns:
        match = re.search(pattern, html, flags=re.I | re.S)
        if match:
            return match.group(1).strip()

    return None


def get_kaltura_stream(entry_id: str) -> str:
    payload: dict[str, Any] = {
        "1": {
            "service": "session",
            "action": "startWidgetSession",
            "widgetId": f"_{PARTNER_ID}",
        },
        "2": {
            "service": "baseEntry",
            "action": "list",
            "ks": "{1:result:ks}",
            "filter": {"redirectFromEntryId": entry_id},
            "responseProfile": {
                "type": 1,
                "fields": "id,referenceId,name,description,thumbnailUrl,dataUrl,duration,msDuration,flavorParamsIds,mediaType,type,tags,dvrStatus,externalSourceType,status",
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
        "4": {
            "service": "metadata_metadata",
            "action": "list",
            "filter": {
                "objectType": "KalturaMetadataFilter",
                "objectIdEqual": entry_id,
                "metadataObjectTypeEqual": "1",
            },
            "ks": "{1:result:ks}",
        },
        "apiVersion": "3.3.0",
        "format": 1,
        "ks": "",
        "clientTag": "html5:v0.56.1",
        "partnerId": PARTNER_ID,
    }

    response = requests.post(
        "https://cdnapisec.kaltura.com/api_v3/service/multirequest",
        headers={
            "accept": "*/*",
            "accept-language": "en",
            "content-type": "application/json",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "cross-site",
            "referrer": BASE_URL,
            "referrerPolicy": "strict-origin-when-cross-origin",
            "User-Agent": USER_AGENT,
        },
        data=json.dumps(payload),
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()

    try:
        sources = data[2].get("sources") or []
    except Exception as exc:
        raise RuntimeError(f"Unexpected Kaltura response for entry_id={entry_id}: {data}") from exc

    for source in sources:
        if source.get("format") == "applehttp" and source.get("url"):
            return normalize_master_url(source["url"])

    raise RuntimeError(f"No applehttp stream found for Kaltura entry_id={entry_id}")


def resolve_episode_stream(episode_url: str) -> tuple[str, Optional[str]]:
    html = get_cf(episode_url)

    # Same checks as the addon GetPlayerKanUrl: direct Redge HLS/DASH first.
    hls_match = re.search(r'data-hls-url=["\']([^"\']+)["\']', html, flags=re.I)
    if hls_match:
        return normalize_master_url(hls_match.group(1)), None

    dash_match = re.search(r'data-dash-url=["\']([^"\']+)["\']', html, flags=re.I)
    if dash_match:
        return normalize_master_url(dash_match.group(1)), None

    # ByPlayer / Bynet redirector fallback.
    bynet = re.search(r'bynetURL:\s*["\'](.*?)["\']', html, flags=re.S)
    if not bynet:
        bynet = re.search(r'["\']UrlRedirector["\']\s*:\s*["\'](.*?)["\']', html, flags=re.S)
    if bynet:
        return normalize_master_url(bynet.group(1)), None

    # Kaltura fallback, as in common.GetKaltura.
    entry_id = extract_kaltura_entry_id(html)
    if not entry_id:
        raise RuntimeError(f"Could not find Kaltura entry_id in episode page: {episode_url}")

    return get_kaltura_stream(entry_id), entry_id


def parse_episode_cards(program_url: str, html: str, limit: int) -> list[dict[str, Any]]:
    episodes: list[dict[str, Any]] = []
    seen: set[str] = set()

    # First use the same rough area as the Kodi addon: class="seasons".
    body_match = re.search(r'<main id="main"(.*?)</main>', html, flags=re.S)
    body = body_match.group(1) if body_match else html

    seasons_match = re.search(r'class="seasons">(.*?)<div class="ec-section section', body, flags=re.S)
    if not seasons_match:
        seasons_match = re.search(r'class="seasons"(.*?)<script', body, flags=re.S)

    search_html = seasons_match.group(1) if seasons_match else body

    # Same card pattern as addon, but safer.
    li_items = re.findall(r'<li\b(.*?)</li>', search_html, flags=re.S)

    for item_html in li_items:
        href_match = re.search(r'href=["\']([^"\']+)["\']', item_html, flags=re.S)
        img_match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', item_html, flags=re.S)
        title_match = re.search(r'class=["\'][^"\']*card-title[^"\']*["\'][^>]*>(.*?)</div>', item_html, flags=re.S)
        desc_match = re.search(r'class=["\'][^"\']*card-text[^"\']*["\'][^>]*>(.*?)</div>', item_html, flags=re.S)

        if not href_match or not title_match:
            continue

        episode_url = clean_url(urljoin(program_url, href_match.group(1)))
        if episode_url in seen:
            continue
        seen.add(episode_url)

        image = urljoin(program_url, img_match.group(1)) if img_match else ""
        episodes.append(
            {
                "title": clean_text(title_match.group(1)),
                "description": clean_text(desc_match.group(1) if desc_match else ""),
                "page_url": episode_url,
                "image": image,
            }
        )

        if len(episodes) >= limit:
            return episodes

    # Fallback with BeautifulSoup, only links under .seasons, to avoid unrelated page links.
    soup = BeautifulSoup(html, "html.parser")
    roots = soup.select(".seasons") or []
    for root in roots:
        for card in root.select("a[href]"):
            episode_url = clean_url(urljoin(program_url, card.get("href") or ""))
            if not episode_url or episode_url in seen:
                continue

            title_el = card.select_one(".card-title")
            if not title_el:
                continue

            desc_el = card.select_one(".card-text")
            img_el = card.select_one("img")
            seen.add(episode_url)

            episodes.append(
                {
                    "title": clean_text(title_el.get_text(" ", strip=True)),
                    "description": clean_text(desc_el.get_text(" ", strip=True) if desc_el else ""),
                    "page_url": episode_url,
                    "image": urljoin(program_url, img_el.get("src")) if img_el and img_el.get("src") else "",
                }
            )

            if len(episodes) >= limit:
                return episodes

    return episodes


def find_first_season_url(program_url: str, html: str) -> Optional[str]:
    soup = BeautifulSoup(html, "html.parser")
    dropdown = soup.select_one(".dropdown")
    if not dropdown:
        return None

    for a in dropdown.select("a[href]"):
        href = a.get("href") or ""
        text = a.get_text(" ", strip=True)
        if href and ("עונה" in text or "/s" in href):
            return clean_url(urljoin(program_url, href))

    return None


def parse_program(program_url: str, limit: int) -> list[dict[str, Any]]:
    program_url = clean_url(program_url)
    html = get_cf(program_url)

    episodes = parse_episode_cards(program_url, html, limit)

    # If page only shows a season dropdown, enter the first season and parse only there.
    if not episodes:
        season_url = find_first_season_url(program_url, html)
        if season_url:
            log(f"No episodes on program page. Trying first season: {season_url}")
            html = get_cf(season_url)
            episodes = parse_episode_cards(season_url, html, limit)

    # Resolve real stream URL for each episode.
    final: list[dict[str, Any]] = []
    for ep in episodes[:limit]:
        log(f"Resolving stream: {ep['page_url']}")
        try:
            stream_url, entry_id = resolve_episode_stream(ep["page_url"])
            ep["stream_url"] = stream_url
            if entry_id:
                ep["entry_id"] = entry_id
        except Exception as exc:
            ep["stream_url"] = None
            ep["stream_error"] = str(exc)
        final.append(ep)

    return final


def main() -> None:
    parser = argparse.ArgumentParser(description="Parse Kan program episodes and resolve real stream URLs.")
    parser.add_argument("--program-url", required=True, help="Kan program URL, e.g. https://www.kan.org.il/content/kan/kan-11/p-1033206/")
    parser.add_argument("--limit", type=int, default=3, help="Number of episodes to return. Default: 3")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON")
    parser.add_argument("-o", "--output", help="Write JSON to file")
    args = parser.parse_args()

    data = parse_program(args.program_url, max(1, args.limit))
    text = json.dumps(data, ensure_ascii=False, indent=2 if args.pretty else None)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text + "\n")
    else:
        print(text)

    print(f"Found {len(data)} episodes", file=sys.stderr)


if __name__ == "__main__":
    main()
