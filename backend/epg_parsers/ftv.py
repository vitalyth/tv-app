import json
import re
from datetime import datetime, timedelta
from html import unescape
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from epg_parsers.common import dedupe_and_sort_programs


FTV_CHANNEL_ID = "FashionTV"
EPGPW_CHANNEL_ID = "76775"
EPGPW_URL = "https://epg.pw/api/epg.json?lang=en&date={date}&channel_id={channel_id}"
FTV_URL = (
    "https://tv.sms.cz/index.php"
    "?P_id_kategorie=56456"
    "&P_soubor=televize%2Findex.php%3Ftv2%3D{channel}%26datum%3D{date}%26casod%3D-1"
)
APP_TZ = ZoneInfo("America/New_York")
SOURCE_TZ = ZoneInfo("Europe/Prague")


def fetch_html(url: str) -> str:
    request = Request(
        url,
        headers={
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
            ),
        },
    )
    with urlopen(request, timeout=30) as response:
        return response.read().decode("windows-1250", errors="ignore")


def fetch_json(url: str):
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
            ),
        },
    )
    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def clean_html_text(value: str) -> str:
    value = re.sub(r"<!--.*?-->", "", value or "", flags=re.DOTALL)
    value = re.sub(r"<[^>]+>", " ", value)
    return " ".join(unescape(value).split()).strip()


def parse_smscz_page(html: str) -> list[dict]:
    programs = []
    tables = re.findall(
        r'(<table\b(?=[^>]*\bclass="porad\b)[\s\S]*?</table>)',
        html or "",
        flags=re.IGNORECASE,
    )

    for table in tables:
        start_match = re.search(r'data-k="(\d{8})\s+(\d{4})"', table)
        end_match = re.search(r'data-konec="(\d+)"', table)
        if not start_match or not end_match:
            continue

        title_match = re.search(
            r'<td[^>]*class="[^"]*\bnazev\b[^"]*"[^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)</a>',
            table,
            flags=re.IGNORECASE,
        )
        if not title_match:
            continue

        desc_match = re.search(
            r'<td[^>]*class="[^"]*\binfo1\b[^"]*"[^>]*>([\s\S]*?)</td>',
            table,
            flags=re.IGNORECASE,
        )

        start_dt = datetime.strptime(" ".join(start_match.groups()), "%Y%m%d %H%M").replace(tzinfo=SOURCE_TZ)
        end_ts = int(end_match.group(1))
        title = clean_html_text(title_match.group(1))
        description = clean_html_text(desc_match.group(1)) if desc_match else ""

        if not title or end_ts <= int(start_dt.timestamp()):
            continue

        programs.append(
            {
                "start": int(start_dt.timestamp()),
                "end": end_ts,
                "name": title,
                "description": description,
            }
        )

    return dedupe_and_sort_programs(programs)


def parse_epgpw_json(data: dict) -> list[dict]:
    entries = data.get("epg_list") or []
    dated_entries = []

    for entry in entries:
        title = entry.get("title")
        start_date = entry.get("start_date")
        if not title or not start_date:
            continue

        start_dt = datetime.fromisoformat(start_date)
        dated_entries.append(
            {
                "start_dt": start_dt,
                "name": str(title).strip(),
                "description": str(entry.get("desc") or "").strip(),
            }
        )

    dated_entries.sort(key=lambda item: item["start_dt"])

    programs = []
    for index, entry in enumerate(dated_entries):
        start_dt = entry["start_dt"]
        if index + 1 < len(dated_entries):
            end_dt = dated_entries[index + 1]["start_dt"]
        else:
            end_dt = start_dt + timedelta(minutes=30)

        if end_dt <= start_dt:
            continue

        programs.append(
            {
                "start": int(start_dt.timestamp()),
                "end": int(end_dt.timestamp()),
                "name": entry["name"],
                "description": entry["description"],
            }
        )

    return dedupe_and_sort_programs(programs)


def parse_ftv_epg(today: datetime | None = None, days: int = 5, html_pages: list[str] | None = None) -> list[dict]:
    today = today or datetime.now(APP_TZ)

    if html_pages is None:
        date_value = today.astimezone(APP_TZ).strftime("%Y%m%d")
        url = EPGPW_URL.format(date=date_value, channel_id=EPGPW_CHANNEL_ID)
        try:
            return parse_epgpw_json(fetch_json(url))
        except Exception:
            return []

    programs = []

    for html in html_pages:
        programs.extend(parse_smscz_page(html))

    return dedupe_and_sort_programs(programs)


if __name__ == "__main__":
    import json

    print(json.dumps(parse_ftv_epg(), ensure_ascii=False, indent=2))
