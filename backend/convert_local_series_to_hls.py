#!/usr/bin/env python3
"""
Convert local VOD series files to HLS using the tv-app folder convention.

Default output structure:
  <series folder>/hls/<episode-name>/index.m3u8
  <series folder>/hls/<episode-name>/segment_000.ts

Adaptive output structure with --adaptive:
  <series folder>/hls/<episode-name>/master.m3u8
  <series folder>/hls/<episode-name>/1080p/index.m3u8
  <series folder>/hls/<episode-name>/720p/index.m3u8
  <series folder>/hls/<episode-name>/480p/index.m3u8
  <series folder>/hls/<episode-name>/subs/sub_0.vtt
  <series folder>/hls/<episode-name>/source_metadata.json

Examples:
  python scripts/convert_local_series_to_hls.py "/Volumes/Data/tv/המפקדת"
  python scripts/convert_local_series_to_hls.py "/Volumes/Data/tv/פאודה" --transcode
  python scripts/convert_local_series_to_hls.py "/Volumes/Data/tv/פאודה" --adaptive
  python scripts/convert_local_series_to_hls.py "/Volumes/Data/tv/פאודה" --adaptive --subtitles
  python scripts/convert_local_series_to_hls.py "/Volumes/Data/tv/פאודה" --adaptive --force

Notes:
  - Single-output mode can use stream copy unless --transcode is passed.
  - Adaptive mode always transcodes video because it creates multiple resolutions.
  - Adaptive mode creates one audio track using AAC stereo by default.
  - Use --all-audio in single-output mode only. Multi-audio adaptive HLS is intentionally not enabled yet.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

VIDEO_EXTENSIONS = {".mp4", ".mkv", ".avi", ".mov", ".m4v", ".webm"}
SKIP_DIR_NAMES = {
    "hls",
    "cache",
    ".cache",
    "transcode",
    ".transcode",
    "transcoded",
    ".transcoded",
    "tmp",
    "temp",
    "@eadir",
    "#recycle",
    "$recycle.bin",
    "system volume information",
    "__macosx",
}

ADAPTIVE_PROFILES = [
    {"name": "2160p", "height": 2160, "video_bitrate": "12000k", "maxrate": "14000k", "bufsize": "24000k", "audio_bitrate": "192k"},
    {"name": "1440p", "height": 1440, "video_bitrate": "7000k", "maxrate": "8500k", "bufsize": "14000k", "audio_bitrate": "192k"},
    {"name": "1080p", "height": 1080, "video_bitrate": "4500k", "maxrate": "5500k", "bufsize": "9000k", "audio_bitrate": "160k"},
    {"name": "720p", "height": 720, "video_bitrate": "2500k", "maxrate": "3000k", "bufsize": "5000k", "audio_bitrate": "128k"},
    {"name": "480p", "height": 480, "video_bitrate": "1200k", "maxrate": "1500k", "bufsize": "2400k", "audio_bitrate": "96k"},
    {"name": "360p", "height": 360, "video_bitrate": "700k", "maxrate": "900k", "bufsize": "1400k", "audio_bitrate": "96k"},
]


def run(command: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=check,
    )


def require_tool(name: str) -> None:
    if shutil.which(name) is None:
        raise SystemExit(f"Missing required tool: {name}. Install it first.")


def is_hidden_or_system_file(path: Path) -> bool:
    name = path.name
    lower = name.lower()

    if name.startswith("."):
        return True

    if lower in {"thumbs.db", "desktop.ini", ".ds_store"}:
        return True

    if (
        lower.endswith(".tmp")
        or lower.endswith(".part")
        or lower.endswith(".download")
        or lower.endswith(".crdownload")
        or ".faststart." in lower
        or ".transcoded." in lower
        or ".cast." in lower
    ):
        return True

    return False


def is_video_file(path: Path) -> bool:
    return (
        path.is_file()
        and path.suffix.lower() in VIDEO_EXTENSIONS
        and not is_hidden_or_system_file(path)
    )


def iter_video_files(root: Path) -> list[Path]:
    results: list[Path] = []

    for current_root, dirs, files in os.walk(root):
        dirs[:] = [
            d
            for d in dirs
            if not d.startswith(".")
            and d.lower() not in SKIP_DIR_NAMES
        ]

        for filename in files:
            path = Path(current_root) / filename
            if is_video_file(path):
                results.append(path)

    return sorted(results)


def ffprobe_json(path: Path) -> dict[str, Any]:
    result = run([
        "ffprobe",
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ])
    return json.loads(result.stdout or "{}")


def stream_summary(probe: dict[str, Any]) -> dict[str, Any]:
    streams = probe.get("streams", []) or []
    fmt = probe.get("format", {}) or {}

    video_streams = [s for s in streams if s.get("codec_type") == "video"]
    audio_streams = [s for s in streams if s.get("codec_type") == "audio"]
    subtitle_streams = [s for s in streams if s.get("codec_type") == "subtitle"]

    return {
        "format": fmt.get("format_name"),
        "duration": fmt.get("duration"),
        "bit_rate": fmt.get("bit_rate"),
        "videos": [
            {
                "index": s.get("index"),
                "codec": s.get("codec_name"),
                "profile": s.get("profile"),
                "width": s.get("width"),
                "height": s.get("height"),
                "pix_fmt": s.get("pix_fmt"),
                "language": (s.get("tags") or {}).get("language"),
            }
            for s in video_streams
        ],
        "audios": [
            {
                "index": s.get("index"),
                "codec": s.get("codec_name"),
                "channels": s.get("channels"),
                "channel_layout": s.get("channel_layout"),
                "language": (s.get("tags") or {}).get("language"),
                "title": (s.get("tags") or {}).get("title"),
            }
            for s in audio_streams
        ],
        "subtitles": [
            {
                "index": s.get("index"),
                "codec": s.get("codec_name"),
                "language": (s.get("tags") or {}).get("language"),
                "title": (s.get("tags") or {}).get("title"),
            }
            for s in subtitle_streams
        ],
    }


def get_primary_video_height(summary: dict[str, Any]) -> int:
    videos = summary.get("videos") or []
    if not videos:
        return 0

    return int(videos[0].get("height") or 0)


def select_adaptive_profiles(source_height: int, max_height: int | None = None) -> list[dict[str, Any]]:
    ceiling = min(source_height or 0, max_height or source_height or 0)
    if ceiling <= 0:
        ceiling = 1080

    profiles = [profile for profile in ADAPTIVE_PROFILES if profile["height"] <= ceiling]

    if not profiles:
        profiles = [ADAPTIVE_PROFILES[-1]]

    # Avoid producing too many outputs for small sources; keep source-ish + lower fallbacks.
    return profiles


def safe_episode_name(path: Path) -> str:
    """
    Keep names like s1e1 / S01E01 when present; otherwise use the file stem.
    """
    stem = path.stem.strip()
    match = re.search(r"(s\d{1,2}e\d{1,3})", stem, flags=re.IGNORECASE)
    if match:
        return match.group(1).lower()

    safe = re.sub(r"[^\w.\-\u0590-\u05FF]+", "_", stem, flags=re.UNICODE)
    safe = safe.strip("._-")
    return safe or "episode"


def find_series_root(input_root: Path, file_path: Path) -> Path:
    relative = file_path.relative_to(input_root)

    if len(relative.parts) <= 1:
        return input_root

    first = input_root / relative.parts[0]

    if relative.parts[0].lower() in {"s1", "s2", "s3", "s4", "s5", "season1", "season2", "season3", "season4", "season5"}:
        return input_root

    return first


def shell_join(command: list[str]) -> str:
    return " ".join(f'"{x}"' if " " in x else x for x in command)


def build_single_hls_command(
    source: Path,
    output_dir: Path,
    *,
    hls_time: int,
    transcode: bool,
    include_all_audio: bool,
    include_subtitles: bool,
) -> list[str]:
    segment_pattern = output_dir / "segment_%03d.ts"
    playlist_path = output_dir / "index.m3u8"

    command = [
        "ffmpeg",
        "-hide_banner",
        "-y",
        "-i",
        str(source),
        "-map",
        "0:v:0",
    ]

    if include_all_audio:
        command += ["-map", "0:a?"]
    else:
        command += ["-map", "0:a:0?"]

    if include_subtitles:
        command += ["-map", "0:s?"]

    if transcode:
        command += [
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "22",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-ac",
            "2",
            "-b:a",
            "160k",
        ]
        if include_subtitles:
            command += ["-c:s", "webvtt"]
    else:
        command += [
            "-c:v",
            "copy",
            "-c:a",
            "copy",
        ]
        if include_subtitles:
            command += ["-c:s", "copy"]

    command += [
        "-start_number",
        "0",
        "-hls_time",
        str(hls_time),
        "-hls_playlist_type",
        "vod",
        "-hls_segment_filename",
        str(segment_pattern),
        str(playlist_path),
    ]

    return command


def build_variant_hls_command(
    source: Path,
    output_dir: Path,
    profile: dict[str, Any],
    *,
    hls_time: int,
    preset: str,
    crf: int,
) -> list[str]:
    variant_dir = output_dir / profile["name"]
    segment_pattern = variant_dir / "segment_%03d.ts"
    playlist_path = variant_dir / "index.m3u8"

    return [
        "ffmpeg",
        "-hide_banner",
        "-y",
        "-i",
        str(source),
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-vf",
        f"scale=-2:{profile['height']}",
        "-c:v",
        "libx264",
        "-preset",
        preset,
        "-crf",
        str(crf),
        "-pix_fmt",
        "yuv420p",
        "-b:v",
        profile["video_bitrate"],
        "-maxrate",
        profile["maxrate"],
        "-bufsize",
        profile["bufsize"],
        "-c:a",
        "aac",
        "-ac",
        "2",
        "-b:a",
        profile["audio_bitrate"],
        "-start_number",
        "0",
        "-hls_time",
        str(hls_time),
        "-hls_playlist_type",
        "vod",
        "-hls_segment_filename",
        str(segment_pattern),
        str(playlist_path),
    ]


def write_master_playlist(output_dir: Path, profiles: list[dict[str, Any]]) -> None:
    lines = ["#EXTM3U", "#EXT-X-VERSION:3"]

    bandwidth_map = {
        "2160p": 14000000,
        "1440p": 8500000,
        "1080p": 5500000,
        "720p": 3000000,
        "480p": 1500000,
        "360p": 900000,
    }

    resolution_map = {
        "2160p": "3840x2160",
        "1440p": "2560x1440",
        "1080p": "1920x1080",
        "720p": "1280x720",
        "480p": "854x480",
        "360p": "640x360",
    }

    for profile in profiles:
        name = profile["name"]
        bandwidth = bandwidth_map.get(name, 2500000)
        resolution = resolution_map.get(name, f"1280x{profile['height']}")
        lines.append(
            f'#EXT-X-STREAM-INF:BANDWIDTH={bandwidth},RESOLUTION={resolution},CODECS="avc1.64001f,mp4a.40.2"'
        )
        lines.append(f"{name}/index.m3u8")

    (output_dir / "master.m3u8").write_text("\n".join(lines) + "\n", encoding="utf-8")


def export_subtitles(source: Path, output_dir: Path, summary: dict[str, Any]) -> list[dict[str, Any]]:
    subtitles = summary.get("subtitles") or []
    exported: list[dict[str, Any]] = []

    if not subtitles:
        return exported

    subs_dir = output_dir / "subs"
    subs_dir.mkdir(parents=True, exist_ok=True)

    for index, sub in enumerate(subtitles):
        stream_index = sub.get("index")
        language = sub.get("language") or f"sub{index}"
        safe_lang = re.sub(r"[^a-zA-Z0-9_-]+", "_", str(language))
        out_file = subs_dir / f"{safe_lang}_{index}.vtt"

        command = [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-i",
            str(source),
            "-map",
            f"0:{stream_index}",
            "-c:s",
            "webvtt",
            str(out_file),
        ]

        result = run(command, check=False)
        if result.returncode == 0 and out_file.exists():
            exported.append({
                "language": language,
                "title": sub.get("title"),
                "path": str(out_file),
                "relativePath": f"subs/{out_file.name}",
            })
        else:
            print(f"Subtitle export skipped/failed for stream {stream_index}: {source}")
            if result.stderr:
                print(result.stderr)

    return exported


def convert_adaptive_hls(
    source: Path,
    output_dir: Path,
    summary: dict[str, Any],
    *,
    hls_time: int,
    max_height: int | None,
    preset: str,
    crf: int,
    include_subtitles: bool,
    dry_run: bool,
) -> bool:
    source_height = get_primary_video_height(summary)
    profiles = select_adaptive_profiles(source_height, max_height=max_height)

    print("Adaptive profiles:")
    for profile in profiles:
        print(f"  - {profile['name']} {profile['video_bitrate']}")

    commands = [
        build_variant_hls_command(
            source,
            output_dir,
            profile,
            hls_time=hls_time,
            preset=preset,
            crf=crf,
        )
        for profile in profiles
    ]

    for command in commands:
        print("Command:")
        print(shell_join(command))

    if dry_run:
        return False

    for profile in profiles:
        (output_dir / profile["name"]).mkdir(parents=True, exist_ok=True)

    for command in commands:
        result = run(command, check=False)
        if result.returncode != 0:
            print(result.stderr)
            print(f"FAILED adaptive variant: {source}")
            return False

    write_master_playlist(output_dir, profiles)

    exported_subtitles = []
    if include_subtitles:
        exported_subtitles = export_subtitles(source, output_dir, summary)

    return (output_dir / "master.m3u8").exists()


def convert_file(
    source: Path,
    input_root: Path,
    *,
    force: bool,
    hls_time: int,
    transcode: bool,
    include_all_audio: bool,
    include_subtitles: bool,
    adaptive: bool,
    max_height: int | None,
    preset: str,
    crf: int,
    dry_run: bool,
) -> bool:
    episode_name = safe_episode_name(source)
    series_root = find_series_root(input_root, source)
    output_dir = series_root / "hls" / episode_name
    playlist_path = output_dir / ("master.m3u8" if adaptive else "index.m3u8")
    metadata_path = output_dir / "source_metadata.json"

    if playlist_path.exists() and not force:
        print(f"SKIP exists: {playlist_path}")
        return False

    probe = ffprobe_json(source)
    summary = stream_summary(probe)

    print()
    print(f"Source: {source}")
    print(f"Output: {playlist_path}")
    print("Metadata:")
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    if dry_run:
        output_dir_for_print = output_dir
    else:
        output_dir.mkdir(parents=True, exist_ok=True)
        metadata_path.write_text(
            json.dumps(
                {
                    "source": str(source),
                    "episodeName": episode_name,
                    "seriesRoot": str(series_root),
                    "hlsPlaylist": str(playlist_path),
                    "adaptive": adaptive,
                    "transcode": transcode or adaptive,
                    "includeAllAudio": include_all_audio if not adaptive else False,
                    "includeSubtitles": include_subtitles,
                    "probe": summary,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

    if adaptive:
        ok = convert_adaptive_hls(
            source,
            output_dir,
            summary,
            hls_time=hls_time,
            max_height=max_height,
            preset=preset,
            crf=crf,
            include_subtitles=include_subtitles,
            dry_run=dry_run,
        )
    else:
        command = build_single_hls_command(
            source,
            output_dir,
            hls_time=hls_time,
            transcode=transcode,
            include_all_audio=include_all_audio,
            include_subtitles=include_subtitles,
        )

        print("Command:")
        print(shell_join(command))

        if dry_run:
            return False

        result = run(command, check=False)
        if result.returncode != 0:
            print(result.stderr)
            print(f"FAILED: {source}")
            return False

        ok = playlist_path.exists()

    if ok:
        print(f"OK: {playlist_path}")

    return ok


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Convert local series video files to HLS using hls/<episode>/index.m3u8 or adaptive master.m3u8 structure."
    )
    parser.add_argument("directory", help="Series directory or parent VOD directory to scan.")
    parser.add_argument("--force", action="store_true", help="Recreate HLS even if output playlist already exists.")
    parser.add_argument("--hls-time", type=int, default=6, help="HLS segment length in seconds. Default: 6.")
    parser.add_argument("--transcode", action="store_true", help="Transcode to H.264/AAC for better Cast compatibility.")
    parser.add_argument("--adaptive", action="store_true", help="Create adaptive bitrate HLS with master.m3u8 and multiple qualities.")
    parser.add_argument("--max-height", type=int, default=None, help="Maximum adaptive output height, e.g. 1080 or 720.")
    parser.add_argument("--preset", default="fast", help="x264 preset for transcode/adaptive mode. Default: fast.")
    parser.add_argument("--crf", type=int, default=22, help="x264 CRF for adaptive mode. Default: 22.")
    parser.add_argument("--all-audio", action="store_true", help="Single-HLS mode only: keep all audio tracks instead of only the first audio track.")
    parser.add_argument("--subtitles", action="store_true", help="Try to export subtitle streams to WebVTT in adaptive mode, or include subtitles in single mode.")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be converted without running ffmpeg.")

    args = parser.parse_args()

    require_tool("ffmpeg")
    require_tool("ffprobe")

    root = Path(args.directory).expanduser().resolve()
    if not root.is_dir():
        print(f"Directory not found: {root}", file=sys.stderr)
        return 1

    if args.adaptive and args.all_audio:
        print("Note: --all-audio is currently only supported in single-HLS mode. Adaptive mode uses the first audio track.")

    files = iter_video_files(root)
    print(f"Found {len(files)} video file(s) under {root}")

    converted = 0
    failed = 0

    for source in files:
        ok = convert_file(
            source,
            root,
            force=args.force,
            hls_time=args.hls_time,
            transcode=args.transcode,
            include_all_audio=args.all_audio,
            include_subtitles=args.subtitles,
            adaptive=args.adaptive,
            max_height=args.max_height,
            preset=args.preset,
            crf=args.crf,
            dry_run=args.dry_run,
        )

        if args.dry_run:
            continue

        if ok:
            converted += 1
        else:
            episode_name = safe_episode_name(source)
            series_root = find_series_root(root, source)
            expected = series_root / "hls" / episode_name / ("master.m3u8" if args.adaptive else "index.m3u8")
            if not expected.exists():
                failed += 1

    print()
    print(f"Done. Converted: {converted}, failed: {failed}, total source files: {len(files)}")

    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
