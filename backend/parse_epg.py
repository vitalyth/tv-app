import argparse
import os
import traceback
from pathlib import Path

from epg_parsers.c14 import parse_c14_epg
from epg_parsers.common import dedupe_and_sort_programs, merge_existing_with_new_programs
from epg_parsers.i24 import parse_i24_epg
from epg_parsers.keshet_thematic import KESHET_THEMATIC_CHANNELS, parse_keshet_thematic_epg
from epg_parsers.tv10 import parse_tv10_epg
from epg_parsers.nine_tv import parse_9tv_epg
from epg_parsers.knesset import parse_knesset_epg
from epg_parsers.walla33 import parse_walla33_epg
from epg_parsers.kabbalah import parse_kabbalah_epg
from epg_parsers.hidabroot import parse_hidabroot_epg
from epg_parsers.kan33 import enrich_program_images_from_vod, parse_kan11_epg, parse_kan23_epg, parse_kan33_epg
from epg_parsers.kan_worldcup import parse_kan_worldcup_epg
from epg_parsers.mako12 import parse_mako12_epg
from epg_parsers.radio100fm import parse_100fm_epg
from epg_parsers.reshet13 import parse_reshet13_epg
from epg_parsers.ftv import parse_ftv_epg
from epg_parsers.fishenzon import (
    FISHENZON_CHANNEL_IDS,
    fetch_fishenzon_epg,
    fetch_reshet_program_image_map,
    parse_fishenzon_channel_epg,
)
from epg_parsers.local_us import LOCAL_US_CHANNEL_IDS, parse_local_us_epg
from epg_parsers.isramedia import (
    DEFAULT_URL,
    fetch_html,
    get_output_channel_id,
    parse_channel_epg,
    parse_channel_id,
    parse_channel_options,
)
from services.epg_storage import (
    load_all_epg,
    load_channel_programs,
    replace_all_epg,
    replace_channel_programs,
)
from services.epg_vod_enrichment import enrich_epg_with_vod, enrich_programs_with_vod

KAN_MIN_PROGRAMS = 10
MAKO12_MIN_PROGRAMS = 10
RESHET13_MIN_PROGRAMS = 10
C14_MIN_PROGRAMS = 10
NINE_TV_MIN_PROGRAMS = 10


def get_epg_db_path_from_output_dir(output_dir: Path) -> Path:
    return output_dir.parent / "epg.sqlite"


def write_json(data, output_path: Path) -> None:
    """
    Backward-compatible writer for the parser.

    The parser still builds channel lists and a combined dict in memory, but the
    persisted cache now lives in SQLite.
    """
    if isinstance(data, dict):
        replace_all_epg(
            enrich_epg_with_vod(data),
            get_epg_db_path_from_output_dir(output_path.parent / "epg"),
        )
        return

    if isinstance(data, list):
        channel_id = output_path.stem
        replace_channel_programs(
            channel_id,
            enrich_programs_with_vod(channel_id, data),
            get_epg_db_path_from_output_dir(output_path.parent),
        )
        return


def combine_epg_directory(output_dir: Path) -> dict:
    db_path = get_epg_db_path_from_output_dir(output_dir)
    combined_epg = load_all_epg(db_path)
    return {
        channel_id: dedupe_and_sort_programs(programs)
        for channel_id, programs in combined_epg.items()
    }


def read_existing_channel_programs(output_dir: Path, channel_id: str) -> list[dict]:
    db_path = get_epg_db_path_from_output_dir(output_dir)
    programs = load_channel_programs(channel_id, db_path)
    if programs:
        return dedupe_and_sort_programs(programs)

    return []


def merge_with_existing_channel(output_dir: Path, channel_id: str, new_programs: list[dict]) -> list[dict]:
    existing_programs = read_existing_channel_programs(output_dir, channel_id)
    return merge_existing_with_new_programs(existing_programs, new_programs)


def parse_isramedia_channel(
    channel_id: str,
    url: str,
    days: str,
    available_days: bool,
    filename_mode: str,
) -> list[dict]:
    first_html = fetch_html(url)
    channels = parse_channel_options(first_html, url)
    channel = next(
        (
            item
            for item in channels
            if get_output_channel_id(item["id"], filename_mode) == channel_id
            or item["id"] == channel_id
        ),
        None,
    )

    if not channel:
        return []

    return parse_channel_epg(channel["url"], days, available_days)


def has_reliable_kan_schedule(programs: list[dict]) -> bool:
    return len(programs) >= KAN_MIN_PROGRAMS


def has_reliable_mako12_schedule(programs: list[dict]) -> bool:
    return len(programs) >= MAKO12_MIN_PROGRAMS


def has_reliable_reshet13_schedule(programs: list[dict]) -> bool:
    return len(programs) >= RESHET13_MIN_PROGRAMS


def has_reliable_c14_schedule(programs: list[dict]) -> bool:
    return len(programs) >= C14_MIN_PROGRAMS


def has_reliable_9tv_schedule(programs: list[dict]) -> bool:
    return len(programs) >= NINE_TV_MIN_PROGRAMS


def main():
    parser = argparse.ArgumentParser(description="Parse EPG sources into the local SQLite cache.")
    parser.add_argument("--url", default=DEFAULT_URL, help="IsraMedia EPG page URL")
    parser.add_argument("--output", help="Deprecated. Kept for CLI compatibility; EPG is stored in SQLite.")
    parser.add_argument("--output-dir", help="Deprecated output directory hint. The SQLite DB is stored next to this directory.")
    parser.add_argument(
        "--combined-output",
        help="Deprecated. Kept for CLI compatibility; EPG is stored in SQLite.",
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
        help="Parse every channel listed in the page channel selector and store it in SQLite.",
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
        help="Fetch only the official i24 Hebrew schedule and store it in SQLite.",
    )
    parser.add_argument(
        "--channel",
        help="Parse only one specific channel id, for example: 33, 10, 66, 99, i24news, i24newsen, i24newsfr, i24newsar, 11, 24, 13comedy, erets.",
    )
    args = parser.parse_args()

    channel_id = parse_channel_id(args.url)
    output_channel_id = get_output_channel_id(channel_id, args.filename_mode)
    default_cache_dir = Path(os.getenv("BACKEND_CACHE_DIR", Path(__file__).parent / "cache"))
    output_dir = Path(args.output_dir) if args.output_dir else default_cache_dir / "epg"
    combined_output = Path(args.combined_output) if args.combined_output else default_cache_dir / "epg.sqlite"

    if args.combine_existing:
        combined_epg = combine_epg_directory(output_dir)
        write_json(combined_epg, combined_output)
        print(f"Stored {len(combined_epg)} channels in {get_epg_db_path_from_output_dir(output_dir)}")
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
        print(f"Stored {len(combined_epg)} channels in {get_epg_db_path_from_output_dir(output_dir)}")
        return

    if args.channel:
        output_path = output_dir / f"{args.channel}.json"
        replace_existing_programs = False

        if args.channel == "10":
            programs = parse_tv10_epg()

        elif args.channel == "9":
            try:
                programs = parse_9tv_epg()
            except Exception as ex:
                print(f"Failed parsing 9TV official schedule: {ex}")
                programs = []

            if not has_reliable_9tv_schedule(programs):
                print(
                    f"9TV official schedule returned only {len(programs)} programs; "
                    "using fallback EPG source"
                )
                programs = parse_isramedia_channel(
                    "9",
                    args.url,
                    args.days,
                    args.available_days,
                    args.filename_mode,
                )
            else:
                replace_existing_programs = True

        elif args.channel == "12":
            try:
                programs = parse_mako12_epg()
            except Exception as ex:
                print(f"Failed parsing Keshet 12 official schedule: {ex}")
                programs = []

            if not has_reliable_mako12_schedule(programs):
                print(
                    f"Keshet 12 official schedule returned only {len(programs)} programs; "
                    "using fallback EPG source"
                )
                programs = parse_isramedia_channel(
                    "12",
                    args.url,
                    args.days,
                    args.available_days,
                    args.filename_mode,
                )
            else:
                replace_existing_programs = True

        elif args.channel == "13":
            try:
                programs = parse_reshet13_epg()
            except Exception as ex:
                print(f"Failed parsing Reshet 13 official schedule: {ex}")
                programs = []

            if not has_reliable_reshet13_schedule(programs):
                print(
                    f"Reshet 13 official schedule returned only {len(programs)} programs; "
                    "using fallback EPG source"
                )
                programs = parse_isramedia_channel(
                    "13",
                    args.url,
                    args.days,
                    args.available_days,
                    args.filename_mode,
                )
            else:
                replace_existing_programs = True

        elif args.channel == "14":
            try:
                programs = parse_c14_epg()
            except Exception as ex:
                print(f"Failed parsing Channel 14 official schedule: {ex}")
                programs = []

            if not has_reliable_c14_schedule(programs):
                print(
                    f"Channel 14 official schedule returned only {len(programs)} programs; "
                    "using fallback EPG source"
                )
                programs = parse_isramedia_channel(
                    "14",
                    args.url,
                    args.days,
                    args.available_days,
                    args.filename_mode,
                )
            else:
                replace_existing_programs = True

        elif args.channel == "33":
            try:
                programs = parse_kan33_epg()
            except Exception as ex:
                print(f"Failed parsing Kan 33 official schedule: {ex}")
                programs = []

            if not has_reliable_kan_schedule(programs):
                print(
                    f"Kan 33 official schedule returned only {len(programs)} programs; "
                    "using Walla fallback EPG source"
                )
                programs = parse_walla33_epg()
                replace_existing_programs = True
            else:
                replace_existing_programs = True

        elif args.channel == "23":
            try:
                programs = parse_kan23_epg()
            except Exception as ex:
                print(f"Failed parsing Kan 23 official schedule: {ex}")
                programs = []

            if not has_reliable_kan_schedule(programs):
                print(
                    f"Kan 23 official schedule returned only {len(programs)} programs; "
                    "using fallback EPG source"
                )
                programs = parse_isramedia_channel(
                    "23",
                    args.url,
                    args.days,
                    args.available_days,
                    args.filename_mode,
                )
                replace_existing_programs = True
            else:
                replace_existing_programs = True

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

        elif args.channel == "i24newsen":
            programs = parse_i24_epg(language="en")

        elif args.channel == "i24newsfr":
            programs = parse_i24_epg(language="fr")

        elif args.channel == "i24newsar":
            programs = parse_i24_epg(language="ar")

        elif args.channel == "11":
            try:
                programs = parse_kan11_epg()
            except Exception as ex:
                print(f"Failed parsing Kan 11 official schedule: {ex}")
                programs = []

            if not has_reliable_kan_schedule(programs):
                print(
                    f"Kan 11 official schedule returned only {len(programs)} programs; "
                    "using fallback EPG source"
                )
                programs = parse_isramedia_channel(
                    "11",
                    args.url,
                    args.days,
                    args.available_days,
                    args.filename_mode,
                )
                replace_existing_programs = True
            else:
                replace_existing_programs = True
            programs = enrich_program_images_from_vod(programs)

        elif args.channel == "kan_worldcup":
            programs = parse_kan_worldcup_epg()

        elif args.channel == "ftv":
            programs = parse_ftv_epg()

        elif args.channel in FISHENZON_CHANNEL_IDS:
            programs = parse_fishenzon_channel_epg(args.channel)
            replace_existing_programs = True

        elif args.channel in KESHET_THEMATIC_CHANNELS:
            programs = parse_keshet_thematic_epg(args.channel)
            replace_existing_programs = True

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
            if not replace_existing_programs:
                programs = merge_with_existing_channel(output_dir, args.channel, programs)
            if args.channel == "11":
                programs = enrich_program_images_from_vod(programs)
        write_json(programs, output_path)
        print(f"Wrote {len(programs)} programs to {output_path}")

        combined_epg = combine_epg_directory(output_dir)
        combined_epg[args.channel] = dedupe_and_sort_programs(programs)
        write_json(combined_epg, combined_output)
        print(f"Stored {len(combined_epg)} channels in {get_epg_db_path_from_output_dir(output_dir)}")
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

        print("\nParsing Keshet 12 from official Mako schedule")
        try:
            mako12_programs = parse_mako12_epg()
        except Exception as ex:
            failed_channels.append("12")
            print(f"Failed parsing Keshet 12: {ex}")
            traceback.print_exc()
            mako12_programs = combined_epg.get("12", []) or read_existing_channel_programs(output_dir, "12")

        if not has_reliable_mako12_schedule(mako12_programs):
            print(
                f"Keshet 12 official schedule returned only {len(mako12_programs)} programs; "
                "keeping existing parsed programs"
            )
            mako12_programs = combined_epg.get("12", []) or read_existing_channel_programs(output_dir, "12")

        combined_epg["12"] = mako12_programs
        if mako12_programs:
            output_path = output_dir / "12.json"
            write_json(mako12_programs, output_path)
            print(f"Wrote {len(mako12_programs)} programs to {output_path}")

        print("\nParsing Reshet 13 from official schedule")
        try:
            reshet13_programs = parse_reshet13_epg()
        except Exception as ex:
            failed_channels.append("13")
            print(f"Failed parsing Reshet 13: {ex}")
            traceback.print_exc()
            reshet13_programs = combined_epg.get("13", []) or read_existing_channel_programs(output_dir, "13")

        if not has_reliable_reshet13_schedule(reshet13_programs):
            print(
                f"Reshet 13 official schedule returned only {len(reshet13_programs)} programs; "
                "keeping existing parsed programs"
            )
            reshet13_programs = combined_epg.get("13", []) or read_existing_channel_programs(output_dir, "13")

        combined_epg["13"] = reshet13_programs
        if reshet13_programs:
            output_path = output_dir / "13.json"
            write_json(reshet13_programs, output_path)
            print(f"Wrote {len(reshet13_programs)} programs to {output_path}")

        print("\nParsing Fishenzon channels")
        try:
            fishenzon_epg = fetch_fishenzon_epg()
        except Exception as ex:
            fishenzon_epg = {}
            print(f"Failed fetching Fishenzon EPG: {ex}")
            traceback.print_exc()

        try:
            reshet_image_map = fetch_reshet_program_image_map()
        except Exception as ex:
            reshet_image_map = {}
            print(f"Failed fetching Reshet 13 program images: {ex}")
            traceback.print_exc()

        for fishenzon_channel_id in FISHENZON_CHANNEL_IDS:
            try:
                channel_programs = parse_fishenzon_channel_epg(
                    fishenzon_channel_id,
                    fishenzon_epg,
                    reshet_image_map,
                )
            except Exception as ex:
                failed_channels.append(fishenzon_channel_id)
                print(f"Failed parsing {fishenzon_channel_id}: {ex}")
                traceback.print_exc()
                channel_programs = read_existing_channel_programs(output_dir, fishenzon_channel_id)

            combined_epg[fishenzon_channel_id] = channel_programs
            if channel_programs:
                output_path = output_dir / f"{fishenzon_channel_id}.json"
                write_json(channel_programs, output_path)
                print(f"Wrote {len(channel_programs)} programs to {output_path}")

        print("\nParsing Keshet thematic live channels")
        for keshet_channel_id in KESHET_THEMATIC_CHANNELS:
            try:
                channel_programs = parse_keshet_thematic_epg(keshet_channel_id)
            except Exception as ex:
                failed_channels.append(keshet_channel_id)
                print(f"Failed parsing {keshet_channel_id}: {ex}")
                traceback.print_exc()
                channel_programs = read_existing_channel_programs(output_dir, keshet_channel_id)

            combined_epg[keshet_channel_id] = channel_programs
            if channel_programs:
                output_path = output_dir / f"{keshet_channel_id}.json"
                write_json(channel_programs, output_path)
                print(f"Wrote {len(channel_programs)} programs to {output_path}")

        print("\nParsing Channel 14 from official schedule")
        try:
            c14_programs = parse_c14_epg()
        except Exception as ex:
            failed_channels.append("14")
            print(f"Failed parsing Channel 14: {ex}")
            traceback.print_exc()
            c14_programs = combined_epg.get("14", []) or read_existing_channel_programs(output_dir, "14")

        if not has_reliable_c14_schedule(c14_programs):
            print(
                f"Channel 14 official schedule returned only {len(c14_programs)} programs; "
                "keeping existing parsed programs"
            )
            c14_programs = combined_epg.get("14", []) or read_existing_channel_programs(output_dir, "14")

        combined_epg["14"] = c14_programs
        if c14_programs:
            output_path = output_dir / "14.json"
            write_json(c14_programs, output_path)
            print(f"Wrote {len(c14_programs)} programs to {output_path}")

        print("\nParsing 9TV from official schedule")
        try:
            nine_tv_programs = parse_9tv_epg()
        except Exception as ex:
            failed_channels.append("9")
            print(f"Failed parsing 9TV: {ex}")
            traceback.print_exc()
            nine_tv_programs = combined_epg.get("9", []) or read_existing_channel_programs(output_dir, "9")

        if not has_reliable_9tv_schedule(nine_tv_programs):
            print(
                f"9TV official schedule returned only {len(nine_tv_programs)} programs; "
                "keeping existing parsed programs"
            )
            nine_tv_programs = combined_epg.get("9", []) or read_existing_channel_programs(output_dir, "9")

        combined_epg["9"] = nine_tv_programs
        if nine_tv_programs:
            output_path = output_dir / "9.json"
            write_json(nine_tv_programs, output_path)
            print(f"Wrote {len(nine_tv_programs)} programs to {output_path}")

        print("\nParsing Kan 11 from official schedule")
        try:
            kan11_programs = parse_kan11_epg()
        except Exception as ex:
            failed_channels.append("11")
            print(f"Failed parsing Kan 11: {ex}")
            traceback.print_exc()
            kan11_programs = read_existing_channel_programs(output_dir, "11")
            if not kan11_programs:
                kan11_programs = combined_epg.get("11", [])

        if not has_reliable_kan_schedule(kan11_programs):
            print(
                f"Kan 11 official schedule returned only {len(kan11_programs)} programs; "
                "keeping existing parsed programs"
            )
            kan11_programs = combined_epg.get("11", []) or read_existing_channel_programs(output_dir, "11")

        kan11_programs = enrich_program_images_from_vod(kan11_programs)
        combined_epg["11"] = kan11_programs
        if kan11_programs:
            output_path = output_dir / "11.json"
            write_json(kan11_programs, output_path)
            print(f"Wrote {len(kan11_programs)} programs to {output_path}")

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

        print("\nParsing Kan 33 from official schedule")
        try:
            kan33_programs = parse_kan33_epg()
        except Exception as ex:
            failed_channels.append("33")
            print(f"Failed parsing Kan 33: {ex}")
            traceback.print_exc()
            kan33_programs = read_existing_channel_programs(output_dir, "33")
            if not kan33_programs:
                kan33_programs = combined_epg.get("33", [])

        if not has_reliable_kan_schedule(kan33_programs):
            print(
                f"Kan 33 official schedule returned only {len(kan33_programs)} programs; "
                "using Walla fallback EPG source"
            )
            try:
                kan33_programs = parse_walla33_epg()
            except Exception as ex:
                print(f"Failed parsing Walla 33 fallback: {ex}")
                traceback.print_exc()
                kan33_programs = combined_epg.get("33", []) or read_existing_channel_programs(output_dir, "33")

        combined_epg["33"] = kan33_programs
        if kan33_programs:
            output_path = output_dir / "33.json"
            write_json(kan33_programs, output_path)
            print(f"Wrote {len(kan33_programs)} programs to {output_path}")

        print("\nParsing Kan 23 from official schedule")
        try:
            kan23_programs = parse_kan23_epg()
        except Exception as ex:
            failed_channels.append("23")
            print(f"Failed parsing Kan 23: {ex}")
            traceback.print_exc()
            kan23_programs = read_existing_channel_programs(output_dir, "23")
            if not kan23_programs:
                kan23_programs = combined_epg.get("23", [])

        if not has_reliable_kan_schedule(kan23_programs):
            print(
                f"Kan 23 official schedule returned only {len(kan23_programs)} programs; "
                "keeping existing parsed programs"
            )
            kan23_programs = combined_epg.get("23", []) or read_existing_channel_programs(output_dir, "23")

        combined_epg["23"] = kan23_programs
        if kan23_programs:
            output_path = output_dir / "23.json"
            write_json(kan23_programs, output_path)
            print(f"Wrote {len(kan23_programs)} programs to {output_path}")

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
            print("\nParsing i24news Hebrew from official schedule API")
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

            print("\nParsing i24news English from official schedule API")
            try:
                i24_en_programs = parse_i24_epg(language="en")
            except Exception as ex:
                failed_channels.append("i24newsen")
                print(f"Failed parsing i24news English: {ex}")
                traceback.print_exc()
                i24_en_programs = read_existing_channel_programs(output_dir, "i24newsen")
                if not i24_en_programs:
                    i24_en_programs = []

            i24_en_programs = merge_with_existing_channel(output_dir, "i24newsen", i24_en_programs)
            combined_epg["i24newsen"] = i24_en_programs
            if i24_en_programs:
                output_path = output_dir / "i24newsen.json"
                write_json(i24_en_programs, output_path)
                print(f"Wrote {len(i24_en_programs)} programs to {output_path}")

            print("\nParsing i24news French from official schedule API")
            try:
                i24_fr_programs = parse_i24_epg(language="fr")
            except Exception as ex:
                failed_channels.append("i24newsfr")
                print(f"Failed parsing i24news French: {ex}")
                traceback.print_exc()
                i24_fr_programs = read_existing_channel_programs(output_dir, "i24newsfr")
                if not i24_fr_programs:
                    i24_fr_programs = []

            i24_fr_programs = merge_with_existing_channel(output_dir, "i24newsfr", i24_fr_programs)
            combined_epg["i24newsfr"] = i24_fr_programs
            if i24_fr_programs:
                output_path = output_dir / "i24newsfr.json"
                write_json(i24_fr_programs, output_path)
                print(f"Wrote {len(i24_fr_programs)} programs to {output_path}")

            print("\nParsing i24news Arabic from official schedule API")
            try:
                i24_ar_programs = parse_i24_epg(language="ar")
            except Exception as ex:
                failed_channels.append("i24newsar")
                print(f"Failed parsing i24news Arabic: {ex}")
                traceback.print_exc()
                i24_ar_programs = read_existing_channel_programs(output_dir, "i24newsar")
                if not i24_ar_programs:
                    i24_ar_programs = []

            i24_ar_programs = merge_with_existing_channel(output_dir, "i24newsar", i24_ar_programs)
            combined_epg["i24newsar"] = i24_ar_programs
            if i24_ar_programs:
                output_path = output_dir / "i24newsar.json"
                write_json(i24_ar_programs, output_path)
                print(f"Wrote {len(i24_ar_programs)} programs to {output_path}")

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
        print(f"\nStored {len(combined_epg)} channels in {get_epg_db_path_from_output_dir(output_dir)}")
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
