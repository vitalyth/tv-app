import argparse
import json
import re
from datetime import datetime, timedelta
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urljoin, urlparse, urlunparse
from urllib.request import Request, urlopen


DEFAULT_URL = (
    "https://www.isramedia.net/%D7%9C%D7%95%D7%97-%D7%A9%D7%99%D7%93%D7%95%D7%A8%D7%99%D7%9D/"
    "12/%D7%A2%D7%A8%D7%95%D7%A5-12-%D7%A9%D7%99%D7%93%D7%95%D7%A8-%D7%97%D7%99?days=0"
)

ISRAMEDIA_TVGID_MAP = {
    "1": "11",
    "4": "99",
    "5": "5radio",
    "9": "9",
    "12": "12",
    "13": "13",
    "14": "14",
    "24": "24",
    "326": "23",
    "5628": "33",
    "9568": "i24news",
}
MAPPED_ISRAMEDIA_IDS = set(ISRAMEDIA_TVGID_MAP.keys()) - set(ISRAMEDIA_TVGID_MAP.values())


class IsraMediaEpgParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows = []
        self._in_tvguide = False
        self._table_depth = 0
        self._current_row = None
        self._current_cell = None
        self._current_time_datetime = None

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)

        if tag == "table" and "tvguide" in attrs_dict.get("class", "").split():
            self._in_tvguide = True
            self._table_depth = 1
            return

        if not self._in_tvguide:
            return

        if tag == "table":
            self._table_depth += 1
        elif tag == "tr":
            self._current_row = {
                "class": attrs_dict.get("class", ""),
                "cells": [],
                "time_datetime": None,
            }
        elif tag in {"td", "th"} and self._current_row is not None:
            self._current_cell = {
                "class": attrs_dict.get("class", ""),
                "text": [],
            }
        elif tag == "time" and self._current_row is not None:
            self._current_time_datetime = attrs_dict.get("datetime")

    def handle_data(self, data):
        if self._in_tvguide and self._current_cell is not None:
            self._current_cell["text"].append(data)

    def handle_endtag(self, tag):
        if not self._in_tvguide:
            return

        if tag in {"td", "th"} and self._current_cell is not None:
            text = " ".join("".join(self._current_cell["text"]).split())
            self._current_row["cells"].append(
                {
                    "class": self._current_cell["class"],
                    "text": text,
                }
            )
            self._current_cell = None
        elif tag == "time" and self._current_row is not None:
            self._current_row["time_datetime"] = self._current_time_datetime
            self._current_time_datetime = None
        elif tag == "tr" and self._current_row is not None:
            self.rows.append(self._current_row)
            self._current_row = None
        elif tag == "table":
            self._table_depth -= 1
            if self._table_depth <= 0:
                self._in_tvguide = False


class IsraMediaDaysParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.urls = []
        self._in_dates = False
        self._list_depth = 0

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)

        if tag == "ul" and "tvguide-dates" in attrs_dict.get("class", "").split():
            self._in_dates = True
            self._list_depth = 1
            return

        if not self._in_dates:
            return

        if tag == "ul":
            self._list_depth += 1
        elif tag == "a" and attrs_dict.get("href"):
            self.urls.append(attrs_dict["href"])

    def handle_endtag(self, tag):
        if not self._in_dates:
            return

        if tag == "ul":
            self._list_depth -= 1
            if self._list_depth <= 0:
                self._in_dates = False


class IsraMediaChannelOptionsParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.channels = []
        self._current_option = None

    def handle_starttag(self, tag, attrs):
        if tag != "option":
            return

        attrs_dict = dict(attrs)
        url = attrs_dict.get("value", "")
        if not url:
            return

        self._current_option = {
            "url": url,
            "label": [],
        }

    def handle_data(self, data):
        if self._current_option is not None:
            self._current_option["label"].append(data)

    def handle_endtag(self, tag):
        if tag != "option" or self._current_option is None:
            return

        url = self._current_option["url"]
        label = " ".join("".join(self._current_option["label"]).split())
        self._current_option = None

        channel_id = parse_channel_id(url)
        if channel_id == "epg":
            return

        parsed = urlparse(url)
        if "isramedia.net" not in parsed.netloc:
            return
        if "לוח-שידורים" not in parsed.path and "%D7%9C%D7%95%D7%97" not in parsed.path:
            return

        self.channels.append(
            {
                "id": channel_id,
                "name": label,
                "url": url,
            }
        )


def fetch_html(url: str) -> str:
    request = Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
            )
        },
    )
    with urlopen(request, timeout=30) as response:
        return response.read().decode("windows-1255")


def parse_duration(value: str) -> timedelta:
    match = re.fullmatch(r"\s*(\d{1,2}):(\d{2})\s*", value or "")
    if not match:
        return timedelta()
    hours, minutes = match.groups()
    return timedelta(hours=int(hours), minutes=int(minutes))


def parse_channel_id(url: str) -> str:
    path_parts = [part for part in urlparse(url).path.split("/") if part]
    for index, part in enumerate(path_parts):
        if part.isdigit() and index > 0:
            return part
    for part in path_parts:
        if part.isdigit():
            return part
    return "epg"


def get_output_channel_id(isramedia_channel_id: str, filename_mode: str) -> str:
    if filename_mode == "isramedia":
        return isramedia_channel_id
    return ISRAMEDIA_TVGID_MAP.get(isramedia_channel_id, isramedia_channel_id)


def set_days_param(url: str, day: int) -> str:
    parsed = urlparse(url)
    query = parse_qs(parsed.query, keep_blank_values=True)
    query["days"] = [str(day)]
    return urlunparse(parsed._replace(query=urlencode(query, doseq=True)))


def parse_days(value: str) -> list[int]:
    days = set()
    for part in value.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            start, end = part.split("-", 1)
            days.update(range(int(start), int(end) + 1))
        else:
            days.add(int(part))
    return sorted(days)


def parse_available_day_urls(html: str, base_url: str) -> list[str]:
    parser = IsraMediaDaysParser()
    parser.feed(html)

    urls = []
    seen = set()
    for url in parser.urls:
        absolute_url = urljoin(base_url, url)
        if absolute_url in seen:
            continue
        seen.add(absolute_url)
        urls.append(absolute_url)
    return urls


def parse_channel_options(html: str, base_url: str) -> list[dict]:
    parser = IsraMediaChannelOptionsParser()
    parser.feed(html)

    channels = []
    seen = set()
    for channel in parser.channels:
        absolute_url = urljoin(base_url, channel["url"])
        channel_id = parse_channel_id(absolute_url)
        if channel_id in seen:
            continue
        seen.add(channel_id)
        channels.append(
            {
                "id": channel_id,
                "name": channel["name"],
                "url": absolute_url,
            }
        )
    return channels


def parse_epg(html: str) -> list[dict]:
    parser = IsraMediaEpgParser()
    parser.feed(html)

    programs = []
    pending_program = None

    for row in parser.rows:
        row_class = row.get("class", "")
        cells = row.get("cells", [])

        if "description" in row_class:
            if pending_program and len(cells) >= 2:
                pending_program["description"] = cells[1]["text"]
            continue

        time_datetime = row.get("time_datetime")
        if not time_datetime:
            continue

        name_cell = next((cell for cell in cells if "tvguideshowname" in cell["class"]), None)
        duration_cell = next((cell for cell in cells if "tvshowduration" in cell["class"]), None)
        if not name_cell or not duration_cell:
            continue

        start_dt = datetime.fromisoformat(time_datetime)
        end_dt = start_dt + parse_duration(duration_cell["text"])

        pending_program = {
            "start": int(start_dt.timestamp()),
            "end": int(end_dt.timestamp()),
            "name": name_cell["text"],
            "description": "",
        }
        programs.append(pending_program)

    return programs


def dedupe_and_sort_programs(programs: list[dict]) -> list[dict]:
    deduped = {}
    for program in programs:
        key = (program["start"], program["end"], program["name"])
        deduped[key] = program
    return sorted(deduped.values(), key=lambda program: (program["start"], program["end"], program["name"]))


def write_json(data, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as output_file:
        json.dump(data, output_file, ensure_ascii=False, indent=2)
        output_file.write("\n")


def build_epg_urls(base_url: str, first_html: str, days: str, available_days: bool) -> list[str]:
    if available_days:
        urls = parse_available_day_urls(first_html, base_url)
        return urls or [base_url]
    return [set_days_param(base_url, day) for day in parse_days(days)]


def parse_channel_epg(base_url: str, days: str, available_days: bool, first_html: str | None = None) -> list[dict]:
    html = first_html or fetch_html(base_url)
    urls = build_epg_urls(base_url, html, days, available_days)

    programs = []
    for index, url in enumerate(urls):
        page_html = html if index == 0 and url == base_url else fetch_html(url)
        day_programs = parse_epg(page_html)
        print(f"Parsed {len(day_programs)} programs from {url}")
        programs.extend(day_programs)

    return dedupe_and_sort_programs(programs)


def combine_epg_directory(output_dir: Path) -> dict:
    combined_epg = {}
    for channel_file in sorted(output_dir.glob("*.json")):
        channel_id = channel_file.stem
        if channel_id in MAPPED_ISRAMEDIA_IDS and (output_dir / f"{ISRAMEDIA_TVGID_MAP[channel_id]}.json").exists():
            continue

        with channel_file.open("r", encoding="utf-8") as input_file:
            programs = json.load(input_file)
        combined_epg[channel_id] = dedupe_and_sort_programs(programs)

    return combined_epg


def main():
    parser = argparse.ArgumentParser(description="Parse IsraMedia EPG page into JSON.")
    parser.add_argument("--url", default=DEFAULT_URL, help="IsraMedia EPG page URL")
    parser.add_argument("--output", help="Output JSON path. Defaults to backend/cache/epg/<channel>.json")
    parser.add_argument("--output-dir", help="Output directory for --all-channels. Defaults to backend/cache/epg")
    parser.add_argument(
        "--combined-output",
        help="Combined EPG JSON path for --all-channels. Defaults to backend/cache/epg.json",
    )
    parser.add_argument(
        "--filename-mode",
        choices=["tvgid", "isramedia"],
        default="tvgid",
        help="Use your channel tvgID names when available, or keep IsraMedia channel IDs.",
    )
    parser.add_argument(
        "--days",
        default="0-4",
        help="Days query values to scan, for example 0-4 or 0,1,2. Ignored when --available-days is used.",
    )
    parser.add_argument(
        "--available-days",
        action="store_true",
        help="Scan day links listed on the page instead of the --days range.",
    )
    parser.add_argument(
        "--all-channels",
        action="store_true",
        help="Parse every channel listed in the page channel selector and write <channel_id>.json for each.",
    )
    parser.add_argument(
        "--combine-existing",
        action="store_true",
        help="Build the combined EPG JSON from files already in --output-dir without fetching pages.",
    )
    args = parser.parse_args()

    channel_id = parse_channel_id(args.url)
    output_channel_id = get_output_channel_id(channel_id, args.filename_mode)
    output_dir = Path(args.output_dir) if args.output_dir else Path(__file__).parent / "cache" / "epg"
    combined_output = Path(args.combined_output) if args.combined_output else Path(__file__).parent / "cache" / "epg.json"

    if args.combine_existing:
        combined_epg = combine_epg_directory(output_dir)
        write_json(combined_epg, combined_output)
        print(f"Wrote {len(combined_epg)} channels to {combined_output}")
        return

    first_html = fetch_html(args.url)

    if args.all_channels:
        channels = parse_channel_options(first_html, args.url)
        if not channels:
            raise SystemExit("No channels found in page selector")

        print(f"Found {len(channels)} channels")
        combined_epg = {}
        for channel in channels:
            output_channel_id = get_output_channel_id(channel["id"], args.filename_mode)
            print(f"\nParsing channel {channel['id']} -> {output_channel_id}: {channel['name']}")
            channel_programs = parse_channel_epg(channel["url"], args.days, args.available_days)
            combined_epg[output_channel_id] = channel_programs
            output_path = output_dir / f"{output_channel_id}.json"
            write_json(channel_programs, output_path)
            print(f"Wrote {len(channel_programs)} programs to {output_path}")

        write_json(combined_epg, combined_output)
        print(f"\nWrote {len(combined_epg)} channels to {combined_output}")
        return

    output_path = Path(args.output) if args.output else output_dir / f"{output_channel_id}.json"
    programs = parse_channel_epg(args.url, args.days, args.available_days, first_html=first_html)
    write_json(programs, output_path)

    print(f"Wrote {len(programs)} programs to {output_path}")


if __name__ == "__main__":
    main()
