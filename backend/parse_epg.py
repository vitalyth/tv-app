import argparse
import json
import os
import traceback
from pathlib import Path

from epg_parsers.common import dedupe_and_sort_programs, merge_existing_with_new_programs, write_json
from epg_parsers.i24 import parse_i24_epg
from epg_parsers.tv10 import parse_tv10_epg
from epg_parsers.knesset import parse_knesset_epg
from epg_parsers.walla33 import parse_walla33_epg
from epg_parsers.kabbalah import parse_kabbalah_epg
from epg_parsers.hidabroot import parse_hidabroot_epg
from epg_parsers.kan_worldcup import parse_kan_worldcup_epg
from epg_parsers.radio100fm import parse_100fm_epg
from epg_parsers.ftv import parse_ftv_epg
from epg_parsers.local_us import LOCAL_US_CHANNEL_IDS, parse_local_us_epg
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


def merge_with_existing_channel(output_dir: Path, channel_id: str, new_programs: list[dict]) -> list[dict]:
    existing_programs = read_existing_channel_programs(output_dir, channel_id)
    return merge_existing_with_new_programs(existing_programs, new_programs)


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
    parser.add_argument(
        "--channel",
        help="Parse only one specific channel id, for example: 33, 10, 66, 99, i24news, 11.",
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
        i24_programs = merge_with_existing_channel(output_dir, "i24news", i24_programs)
        output_path = output_dir / "i24news.json"
        write_json(i24_programs, output_path)

        combined_epg = combine_epg_directory(output_dir)
        combined_epg["i24news"] = i24_programs
        write_json(combined_epg, combined_output)

        print(f"Wrote {len(i24_programs)} programs to {output_path}")
        print(f"Wrote {len(combined_epg)} channels to {combined_output}")
        return

    if args.channel:
        output_path = output_dir / f"{args.channel}.json"

        if args.channel == "10":
            programs = parse_tv10_epg()

        elif args.channel == "33":
            programs = parse_walla33_epg()

        elif args.channel == "66":
            programs = parse_kabbalah_epg()

        elif args.channel == "97":
            programs = parse_hidabroot_epg()

        elif args.channel == "100fm":
            programs = parse_100fm_epg()

        elif args.channel == "99":
            programs = parse_knesset_epg()

        elif args.channel == "i24news":
            programs = parse_i24_epg()

        elif args.channel == "kan_worldcup":
            programs = parse_kan_worldcup_epg()

        elif args.channel == "ftv":
            programs = parse_ftv_epg()

        elif args.channel in LOCAL_US_CHANNEL_IDS:
            programs = parse_local_us_epg(args.channel)

        else:
            first_html = fetch_html(args.url)
            channels = parse_channel_options(first_html, args.url)
            channel = next(
                (
                    item
                    for item in channels
                    if get_output_channel_id(item["id"], args.filename_mode) == args.channel
                    or item["id"] == args.channel
                ),
                None,
            )

            if not channel:
                raise SystemExit(f"Channel not found: {args.channel}")

            programs = parse_channel_epg(channel["url"], args.days, args.available_days)

        if args.channel == "ftv" and not programs:
            programs = []
        else:
            programs = merge_with_existing_channel(output_dir, args.channel, programs)
        write_json(programs, output_path)
        print(f"Wrote {len(programs)} programs to {output_path}")

        combined_epg = combine_epg_directory(output_dir)
        combined_epg[args.channel] = dedupe_and_sort_programs(programs)
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

            channel_programs = merge_with_existing_channel(output_dir, output_channel_id, channel_programs)
            combined_epg[output_channel_id] = channel_programs
            output_path = output_dir / f"{output_channel_id}.json"
            write_json(channel_programs, output_path)
            print(f"Wrote {len(channel_programs)} programs to {output_path}")

        print("\nParsing TV10 from official API")
        try:
            tv10_programs = parse_tv10_epg()
        except Exception as ex:
            failed_channels.append("10")
            print(f"Failed parsing TV10: {ex}")
            traceback.print_exc()
            tv10_programs = read_existing_channel_programs(output_dir, "10")
            if not tv10_programs:
                tv10_programs = []

        tv10_programs = merge_with_existing_channel(output_dir, "10", tv10_programs)
        combined_epg["10"] = tv10_programs
        if tv10_programs:
            output_path = output_dir / "10.json"
            write_json(tv10_programs, output_path)
            print(f"Wrote {len(tv10_programs)} programs to {output_path}")

        print("\nParsing Knesset from official site")
        try:
            knesset_programs = parse_knesset_epg()
        except Exception as ex:
            failed_channels.append("99")
            print(f"Failed parsing Knesset: {ex}")
            traceback.print_exc()
            knesset_programs = read_existing_channel_programs(output_dir, "99")
            if not knesset_programs:
                knesset_programs = []

        knesset_programs = merge_with_existing_channel(output_dir, "99", knesset_programs)
        combined_epg["99"] = knesset_programs
        if knesset_programs:
            output_path = output_dir / "99.json"
            write_json(knesset_programs, output_path)
            print(f"Wrote {len(knesset_programs)} programs to {output_path}")

        print("\nParsing Walla 33 from TV Guide")
        try:
            walla33_programs = parse_walla33_epg()
        except Exception as ex:
            failed_channels.append("33")
            print(f"Failed parsing Walla 33: {ex}")
            traceback.print_exc()
            walla33_programs = read_existing_channel_programs(output_dir, "33")
            if not walla33_programs:
                walla33_programs = []

        walla33_programs = merge_with_existing_channel(output_dir, "33", walla33_programs)
        combined_epg["33"] = walla33_programs
        if walla33_programs:
            output_path = output_dir / "33.json"
            write_json(walla33_programs, output_path)
            print(f"Wrote {len(walla33_programs)} programs to {output_path}")

        print("\nParsing Kabbalah from Walla TV Guide")
        try:
            kabbalah_programs = parse_kabbalah_epg()
        except Exception as ex:
            failed_channels.append("66")
            print(f"Failed parsing Kabbalah: {ex}")
            traceback.print_exc()
            kabbalah_programs = read_existing_channel_programs(output_dir, "66")
            if not kabbalah_programs:
                kabbalah_programs = []

        kabbalah_programs = merge_with_existing_channel(output_dir, "66", kabbalah_programs)
        combined_epg["66"] = kabbalah_programs
        if kabbalah_programs:
            output_path = output_dir / "66.json"
            write_json(kabbalah_programs, output_path)
            print(f"Wrote {len(kabbalah_programs)} programs to {output_path}")

        print("\nParsing Hidabroot from Walla TV Guide")
        try:
            hidabroot_programs = parse_hidabroot_epg()
        except Exception as ex:
            failed_channels.append("97")
            print(f"Failed parsing Hidabroot: {ex}")
            traceback.print_exc()
            hidabroot_programs = read_existing_channel_programs(output_dir, "97")
            if not hidabroot_programs:
                hidabroot_programs = []

        hidabroot_programs = merge_with_existing_channel(output_dir, "97", hidabroot_programs)
        combined_epg["97"] = hidabroot_programs
        if hidabroot_programs:
            output_path = output_dir / "97.json"
            write_json(hidabroot_programs, output_path)
            print(f"Wrote {len(hidabroot_programs)} programs to {output_path}")

        print("\nParsing 100FM from official schedule")
        try:
            radio100fm_programs = parse_100fm_epg()
        except Exception as ex:
            failed_channels.append("100fm")
            print(f"Failed parsing 100FM: {ex}")
            traceback.print_exc()
            radio100fm_programs = read_existing_channel_programs(output_dir, "100fm")
            if not radio100fm_programs:
                radio100fm_programs = []

        radio100fm_programs = merge_with_existing_channel(output_dir, "100fm", radio100fm_programs)
        combined_epg["100fm"] = radio100fm_programs
        if radio100fm_programs:
            output_path = output_dir / "100fm.json"
            write_json(radio100fm_programs, output_path)
            print(f"Wrote {len(radio100fm_programs)} programs to {output_path}")

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

            i24_programs = merge_with_existing_channel(output_dir, "i24news", i24_programs)
            combined_epg["i24news"] = i24_programs
            if i24_programs:
                output_path = output_dir / "i24news.json"
                write_json(i24_programs, output_path)
                print(f"Wrote {len(i24_programs)} programs to {output_path}")

        print("\nParsing FashionTV from TV guide")
        try:
            ftv_programs = parse_ftv_epg()
        except Exception as ex:
            failed_channels.append("ftv")
            print(f"Failed parsing FashionTV: {ex}")
            traceback.print_exc()
            ftv_programs = read_existing_channel_programs(output_dir, "ftv")
            if not ftv_programs:
                ftv_programs = []

        if ftv_programs:
            ftv_programs = merge_with_existing_channel(output_dir, "ftv", ftv_programs)
        combined_epg["ftv"] = ftv_programs
        if ftv_programs:
            output_path = output_dir / "ftv.json"
            write_json(ftv_programs, output_path)
            print(f"Wrote {len(ftv_programs)} programs to {output_path}")

        print("\nParsing Kan World Cup from official calendar")
        try:
            kan_worldcup_programs = parse_kan_worldcup_epg()
        except Exception as ex:
            failed_channels.append("kan_worldcup")
            print(f"Failed parsing Kan World Cup: {ex}")
            traceback.print_exc()
            kan_worldcup_programs = read_existing_channel_programs(output_dir, "kan_worldcup")
            if not kan_worldcup_programs:
                kan_worldcup_programs = []

        kan_worldcup_programs = merge_with_existing_channel(output_dir, "kan_worldcup", kan_worldcup_programs)
        combined_epg["kan_worldcup"] = kan_worldcup_programs
        if kan_worldcup_programs:
            output_path = output_dir / "kan_worldcup.json"
            write_json(kan_worldcup_programs, output_path)
            print(f"Wrote {len(kan_worldcup_programs)} programs to {output_path}")

        print("\nParsing local US channels from public TV guides")
        for channel_id in LOCAL_US_CHANNEL_IDS:
            try:
                local_programs = parse_local_us_epg(channel_id)
            except Exception as ex:
                failed_channels.append(channel_id)
                print(f"Failed parsing {channel_id}: {ex}")
                traceback.print_exc()
                local_programs = read_existing_channel_programs(output_dir, channel_id)
                if not local_programs:
                    continue
                print(f"Using existing cached programs for {channel_id}")

            local_programs = merge_with_existing_channel(output_dir, channel_id, local_programs)
            combined_epg[channel_id] = local_programs
            if local_programs:
                output_path = output_dir / f"{channel_id}.json"
                write_json(local_programs, output_path)
                print(f"Wrote {len(local_programs)} programs to {output_path}")

        write_json(combined_epg, combined_output)
        print(f"\nWrote {len(combined_epg)} channels to {combined_output}")
        if failed_channels:
            print(f"Completed with cached/skipped channels: {', '.join(failed_channels)}")
        return

    output_path = Path(args.output) if args.output else output_dir / f"{output_channel_id}.json"
    programs = parse_channel_epg(args.url, args.days, args.available_days, first_html=first_html)
    programs = merge_with_existing_channel(output_dir, output_channel_id, programs)
    write_json(programs, output_path)

    print(f"Wrote {len(programs)} programs to {output_path}")


if __name__ == "__main__":
    main()
