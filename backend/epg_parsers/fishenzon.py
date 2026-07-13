import html
import json
import re
import zipfile
from io import BytesIO
from urllib.request import Request, urlopen

from epg_parsers.common import dedupe_and_sort_programs, fill_short_gaps


FISHENZON_EPG_URL = "https://raw.githubusercontent.com/fishenzon-epg/EPG/main/epg.json.zip"
FISHENZON_CHANNEL_IDS = ("24", "13comedy", "13nofesh", "13reality")
FISHENZON_RESHET_CHANNEL_IDS = ("13comedy", "13nofesh", "13reality")
RESHET_ALL_PROGRAMS_URL = "https://13tv.co.il/allshows/screen/1170108/"
MAKO_24_VOD_URL = "https://www.mako.co.il/mako-vod-index?filter=provider&vcmId=3377c13070733210VgnVCM2000002a0c10acRCRD&platform=responsive"
RESHET_IMAGE_WIDTH = 1280
RESHET_IMAGE_HEIGHT = 720
RESHET_IMAGE_QUALITY = 90
FISHENZON_CHANNEL_FALLBACK_IMAGES = {
    "24": "/ch/24telad.png",
    "13comedy": "https://images.frp1.ott.kaltura.com/Service.svc/GetImage/p/5031/entry_id/fc0d8109a18a4db3b585f154d32bd5b1/version/73",
    "13nofesh": "https://images.frp1.ott.kaltura.com/Service.svc/GetImage/p/5031/entry_id/f7f5a916948b4bd9a0db18be35ef3d3f/version/4",
    "13reality": "https://images.frp1.ott.kaltura.com/Service.svc/GetImage/p/5031/entry_id/8f1d7b6472ef4f679c12688c43829e44/version/4",
}


def fetch_fishenzon_epg(url: str = FISHENZON_EPG_URL) -> dict:
    request = Request(
        url,
        headers={
            "Accept": "application/zip,application/octet-stream,*/*",
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
            ),
        },
    )
    with urlopen(request, timeout=30) as response:
        zip_data = response.read()

    with zipfile.ZipFile(BytesIO(zip_data)) as archive:
        epg_name = next((name for name in archive.namelist() if name.endswith(".json")), None)
        if not epg_name:
            return {}
        return json.loads(archive.read(epg_name).decode("utf-8"))


def fetch_html(url: str) -> str:
    request = Request(
        url,
        headers={
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
        },
    )
    with urlopen(request, timeout=30) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def extract_next_data(html_text: str) -> dict:
    match = re.search(
        r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
        html_text,
        re.DOTALL,
    )
    if not match:
        return {}

    return json.loads(html.unescape(match.group(1)))


def normalize_program_name(name: str) -> str:
    name = " ".join(str(name or "").replace("\xa0", " ").split())
    name = re.sub(r",?\s*Segment ID:\s*\d+.*$", "", name)
    name = re.sub(r"\s*[,:-]?\s*עונה\s+\d+.*$", "", name)
    name = re.sub(r"\s*[,:-]?\s*פרק\s+\d+.*$", "", name)
    name = name.split(",")[0]
    name = re.sub(r'[״"׳\':;!?.,()\[\]{}-]+', " ", name)
    return " ".join(name.split()).strip().lower()


def format_kaltura_image_url(url: str) -> str:
    url = str(url or "").strip()
    if not url or "Service.svc/GetImage" not in url:
        return url

    url = re.sub(r"/width/\d+/height/\d+(?:/quality/\d+)?/?$", "", url)
    return f"{url}/width/{RESHET_IMAGE_WIDTH}/height/{RESHET_IMAGE_HEIGHT}/quality/{RESHET_IMAGE_QUALITY}"


def choose_series_image(series: dict) -> str:
    images = series.get("images") or []
    image = next((item for item in images if item.get("ratio") == "16x9"), None)
    image = image or next((item for item in images if item.get("imageTypeName") == "Landscape"), None)
    image = image or (images[0] if images else None)
    return format_kaltura_image_url((image or {}).get("url") or "")


def walk_series(obj) -> list[dict]:
    if isinstance(obj, dict):
        series = []
        if obj.get("typeDescription") == "Series" and obj.get("images"):
            series.append(obj)
        for value in obj.values():
            series.extend(walk_series(value))
        return series

    if isinstance(obj, list):
        series = []
        for value in obj:
            series.extend(walk_series(value))
        return series

    return []


def fetch_reshet_program_image_map(url: str = RESHET_ALL_PROGRAMS_URL) -> dict[str, str]:
    data = extract_next_data(fetch_html(url))
    image_map = {}
    for series in walk_series(data):
        name = series.get("name") or ""
        key = normalize_program_name(name)
        image = choose_series_image(series)
        if key and image:
            image_map[key] = image
    return image_map


def fetch_json(url: str) -> dict:
    request = Request(
        url,
        headers={
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
            "Referer": "https://www.mako.co.il/",
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
            ),
        },
    )
    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_mako24_program_image_map(url: str = MAKO_24_VOD_URL) -> dict[str, str]:
    data = fetch_json(url)
    root = data.get("root") if isinstance(data, dict) else {}
    items = []
    if isinstance(root, dict):
        items = root.get("items") or []
    if not items and isinstance(data, dict):
        items = data.get("items") or []
    image_map = {}

    for item in items or []:
        if not isinstance(item, dict):
            continue

        key = normalize_program_name(item.get("title") or item.get("name") or "")
        image = item.get("pic") or item.get("image") or item.get("picUrl") or ""
        if key and image:
            image_map[key] = image

    return image_map


def normalize_program(program: dict) -> dict | None:
    try:
        start = int(program["start"])
        end = int(program["end"])
    except (KeyError, TypeError, ValueError):
        return None

    if end <= start:
        return None

    normalized = {
        "start": start,
        "end": end,
        "name": str(program.get("name") or "").strip(),
        "description": str(program.get("description") or "").strip(),
    }
    image = program.get("image")
    if isinstance(image, str) and image.strip():
        normalized["image"] = format_kaltura_image_url(image)

    return normalized if normalized["name"] else None


def enrich_program_images(
    programs: list[dict],
    image_map: dict[str, str],
    fallback_image: str = "",
) -> list[dict]:
    fallback_image = format_kaltura_image_url(fallback_image)
    if not image_map and not fallback_image:
        return programs

    enriched = []
    for program in programs:
        item = dict(program)
        if not item.get("image"):
            image = find_program_image_match(item.get("name", ""), image_map)
            if image:
                item["image"] = image
            elif fallback_image:
                item["image"] = fallback_image
        enriched.append(item)
    return enriched


def find_program_image_match(program_name: str, image_map: dict[str, str]) -> str:
    key = normalize_program_name(program_name)
    if not key:
        return ""

    exact_image = image_map.get(key)
    if exact_image:
        return exact_image

    best_key = ""
    for candidate_key in image_map:
        if len(candidate_key) < 4:
            continue

        if key.startswith(f"{candidate_key} ") or key.startswith(candidate_key):
            if len(candidate_key) > len(best_key):
                best_key = candidate_key
            continue

        if candidate_key.startswith(f"{key} ") or candidate_key.startswith(key):
            if len(candidate_key) > len(best_key):
                best_key = candidate_key

    return image_map.get(best_key, "")


def parse_fishenzon_channel_epg(
    channel_id: str,
    epg_data: dict | None = None,
    image_map: dict[str, str] | None = None,
) -> list[dict]:
    epg_data = epg_data if epg_data is not None else fetch_fishenzon_epg()
    programs = [
        normalized
        for program in epg_data.get(channel_id, [])
        if (normalized := normalize_program(program)) is not None
    ]
    if channel_id == "24":
        try:
            image_map = fetch_mako24_program_image_map()
        except Exception as ex:
            print(f"Failed fetching Mako 24 program images: {ex}")
            image_map = image_map or {}
    elif image_map is None:
        try:
            image_map = fetch_reshet_program_image_map()
        except Exception as ex:
            print(f"Failed fetching Reshet 13 program images: {ex}")
            image_map = {}
    fallback_image = "" if channel_id == "24" else FISHENZON_CHANNEL_FALLBACK_IMAGES.get(channel_id, "")
    programs = enrich_program_images(programs, image_map, fallback_image)
    return fill_short_gaps(dedupe_and_sort_programs(programs))
