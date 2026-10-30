"""Resolve short-lived Nextbet streams without storing signed URLs in the catalog."""
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
import time

import requests
from fastapi import HTTPException
from utils.http import create_session

SITE_URL = "https://1nextbet7.tv/"
CHANNEL_SLUGS = {
    "yes-1",
    "yes-2",
    "yes-3",
    "yes-4",
    "One-1",
    "one-2",
    "yes-5",
    "yes-5-live",
    "yes-5-plus",
    "yes-5-gold",
    "yes-5-stars",
    "sport-5-max",
    "euro1",
    "euro2",
}
session = create_session()


def is_nextbet_referer(referer):
    return urlparse(referer or "").hostname == urlparse(SITE_URL).hostname


def fresh_manifest_url(url):
    parsed = urlparse(url)
    query = [(key, value) for key, value in parse_qsl(parsed.query) if key != "_"]
    query.append(("_", str(time.time_ns())))
    return urlunparse(parsed._replace(query=urlencode(query)))


def resolve_stream(slug):
    if slug not in CHANNEL_SLUGS:
        raise HTTPException(status_code=502, detail="Unknown Nextbet channel")
    try:
        # The lookup endpoint rejects the minimal Mozilla UA used by the media CDN.
        with session.get(
            f"{SITE_URL}ajax",
            params={"method": "channel_stream", "stream": slug},
            headers={"User-Agent": "curl/8.7.1", "Accept": "*/*"},
            timeout=(10, 15),
        ) as response:
            response.raise_for_status()
            data = response.json()
        url = data.get("stream") if isinstance(data, dict) and data.get("ok") is True else None
        if not isinstance(url, str) or urlparse(url).scheme != "https" or not urlparse(url).hostname:
            raise ValueError("Invalid stream response")
        return url
    except (requests.RequestException, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Nextbet stream is unavailable") from exc
