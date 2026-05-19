import argparse
import json
import os
import traceback
from pathlib import Path

from epg_parsers.common import dedupe_and_sort_programs, write_json
from epg_parsers.i24 import parse_i24_epg
from epg_parsers.isramedia import (
    DEFAULT_URL,
    ISRAMEDIA_TVGID_MAP,
    MAPPED_ISRAMEDIA_IDS,
    fetch_html,
    get_output_channel_id,
    parse_channel_epg,
    parse_channel_id,
    parse_channel_options,
)


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


def read_existing_channel_programs(output_dir: Path, channel_id: str) -> list[dict]:
    channel_file = output_dir / f"{channel_id}.json"
    if not channel_file.exists():
        return []

    with channel_file.open("r", encoding="utf-8") as input_file:
        programs = json.load(input_file)

    if isinstance(programs, list):
        return dedupe_and_sort_programs(programs)

    return []


def main():
    parser = argparse.ArgumentParser(description="Parse EPG sources into JSON.")
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
    parser.add_argument(
        "--skip-i24",
        action="store_true",
        help="Do not override i24news with the official i24 schedule API.",
    )
    parser.add_argument(
        "--i24-only",
        action="store_true",
        help="Fetch only the official i24 Hebrew schedule and write i24news.json plus the combined EPG.",
    )
    args = parser.parse_args()

    channel_id = parse_channel_id(args.url)
    output_channel_id = get_output_channel_id(channel_id, args.filename_mode)
    default_cache_dir = Path(os.getenv("BACKEND_CACHE_DIR", Path(__file__).parent / "cache"))
    output_dir = Path(args.output_dir) if args.output_dir else default_cache_dir / "epg"
    combined_output = Path(args.combined_output) if args.combined_output else default_cache_dir / "epg.json"

    if args.combine_existing:
        combined_epg = combine_epg_directory(output_dir)
        write_json(combined_epg, combined_output)
        print(f"Wrote {len(combined_epg)} channels to {combined_output}")
        return

    if args.i24_only:
        i24_programs = parse_i24_epg()
        output_path = output_dir / "i24news.json"
        write_json(i24_programs, output_path)

        combined_epg = combine_epg_directory(output_dir)
        combined_epg["i24news"] = i24_programs
        write_json(combined_epg, combined_output)

        print(f"Wrote {len(i24_programs)} programs to {output_path}")
        print(f"Wrote {len(combined_epg)} channels to {combined_output}")
        return

    first_html = fetch_html(args.url)

    if args.all_channels:
        channels = parse_channel_options(first_html, args.url)
        if not channels:
            raise SystemExit("No channels found in page selector")

        print(f"Found {len(channels)} channels")
        combined_epg = {}
        failed_channels = []
        for channel in channels:
            output_channel_id = get_output_channel_id(channel["id"], args.filename_mode)
            print(f"\nParsing channel {channel['id']} -> {output_channel_id}: {channel['name']}")
            try:
                channel_programs = parse_channel_epg(channel["url"], args.days, args.available_days)
            except Exception as ex:
                failed_channels.append(output_channel_id)
                print(f"Failed parsing channel {channel['id']} -> {output_channel_id}: {ex}")
                traceback.print_exc()
                channel_programs = read_existing_channel_programs(output_dir, output_channel_id)
                if not channel_programs:
                    continue
                print(f"Using existing cached programs for {output_channel_id}")

            combined_epg[output_channel_id] = channel_programs
            output_path = output_dir / f"{output_channel_id}.json"
            write_json(channel_programs, output_path)
            print(f"Wrote {len(channel_programs)} programs to {output_path}")

        if not args.skip_i24:
            print("\nParsing i24news from official schedule API")
            try:
                i24_programs = parse_i24_epg()
            except Exception as ex:
                failed_channels.append("i24news")
                print(f"Failed parsing i24news: {ex}")
                traceback.print_exc()
                i24_programs = read_existing_channel_programs(output_dir, "i24news")
                if not i24_programs:
                    i24_programs = []

            combined_epg["i24news"] = i24_programs
            if i24_programs:
                output_path = output_dir / "i24news.json"
                write_json(i24_programs, output_path)
                print(f"Wrote {len(i24_programs)} programs to {output_path}")

        write_json(combined_epg, combined_output)
        print(f"\nWrote {len(combined_epg)} channels to {combined_output}")
        if failed_channels:
            print(f"Completed with cached/skipped channels: {', '.join(failed_channels)}")
        return

    output_path = Path(args.output) if args.output else output_dir / f"{output_channel_id}.json"
    programs = parse_channel_epg(args.url, args.days, args.available_days, first_html=first_html)
    write_json(programs, output_path)

    print(f"Wrote {len(programs)} programs to {output_path}")


if __name__ == "__main__":
    main()
