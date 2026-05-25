#!/usr/bin/env python3
from pathlib import Path
import argparse
import re
import shutil

VIDEO_EXTENSIONS = {
    ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv",
    ".webm", ".m4v", ".ts", ".mpeg", ".mpg"
}

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

EPISODE_PATTERNS = [
    re.compile(r"\bS(?P<season>\d{1,2})E(?P<episode>\d{1,3})\b", re.I),
    re.compile(r"\bS\s*(?P<season>\d{1,2})\s*E\s*(?P<episode>\d{1,3})\b", re.I),
    re.compile(r"\b(?P<season>\d{1,2})\s*x\s*(?P<episode>\d{1,3})\b", re.I),

    re.compile(
        r"\b(?:season|series|session)\s*(?P<season>\d{1,2})\D{0,20}"
        r"(?:episode|ep|e)\s*(?P<episode>\d{1,3})\b",
        re.I,
    ),
    re.compile(
        r"\b(?:episode|ep|e)\s*(?P<episode>\d{1,3})\D{0,20}"
        r"(?:season|series|session)\s*(?P<season>\d{1,2})\b",
        re.I,
    ),

    re.compile(
        r"(?:עונה|ע)\s*(?P<season>\d{1,2})\D{0,20}"
        r"(?:פרק|פ)\s*(?P<episode>\d{1,3})"
    ),
    re.compile(
        r"(?:פרק|פ)\s*(?P<episode>\d{1,3})\D{0,20}"
        r"(?:עונה|ע)\s*(?P<season>\d{1,2})"
    ),

    # episode only - season must come from folder
    re.compile(r"\b(?:episode|ep|e)\s*(?P<episode>\d{1,3})\b", re.I),
    re.compile(r"(?:פרק|פ)\s*(?P<episode>\d{1,3})"),
]

SEASON_PATTERNS = [
    re.compile(r"\bS0?(?P<season>\d{1,2})\b", re.I),
    re.compile(r"\b(?:season|series|session)\s*(?P<season>\d{1,2})\b", re.I),
    re.compile(r"(?:עונה|ע)\s*(?P<season>\d{1,2})"),
]


def normalize(text: str) -> str:
    return re.sub(r"[._\-]+", " ", text)


def is_mac_metadata_file(path: Path) -> bool:
    name = path.name
    return (
        name.startswith("._")     # AppleDouble files on SMB/network drives
        or name == ".DS_Store"
        or name.lower() in {"thumbs.db", "desktop.ini"}
    )


def is_video_file(path: Path) -> bool:
    if not path.is_file():
        return False

    if is_mac_metadata_file(path):
        return False

    if path.name.startswith("."):
        return False

    return path.suffix.lower() in VIDEO_EXTENSIONS


def should_skip_dir(path: Path) -> bool:
    name = path.name
    lower = name.lower()
    return name.startswith(".") or lower in SKIP_DIR_NAMES


def iter_video_files(base: Path):
    for path in base.rglob("*"):
        relative = path.relative_to(base)

        if any(should_skip_dir(parent) for parent in relative.parents):
            continue

        if is_video_file(path):
            yield path


def extract_season_from_path(file: Path, base: Path):
    try:
        relative_parent = file.parent.relative_to(base)
    except ValueError:
        relative_parent = file.parent

    for part in reversed(relative_parent.parts):
        name = normalize(part)
        for pattern in SEASON_PATTERNS:
            match = pattern.search(name)
            if match:
                return int(match.group("season"))

    return None


def extract_episode_info(file: Path, base: Path):
    name = normalize(file.stem)

    for pattern in EPISODE_PATTERNS:
        match = pattern.search(name)
        if not match:
            continue

        episode = int(match.group("episode"))

        season_value = match.groupdict().get("season")
        if season_value:
            return int(season_value), episode

        season = extract_season_from_path(file, base)
        if season:
            return season, episode

    return None


def target_season_dir(base: Path, season: int) -> Path:
    return base / f"s{season}"


def target_file_path(base: Path, season: int, episode: int, suffix: str) -> Path:
    return target_season_dir(base, season) / f"S{season:02d}E{episode:02d}{suffix.lower()}"


def rename_and_sort_videos(directory: str, apply: bool = False):
    base = Path(directory).expanduser().resolve()

    if not base.exists() or not base.is_dir():
        raise ValueError(f"Invalid directory: {base}")

    files = list(iter_video_files(base))

    if not files:
        print(f"No real video files found under: {base}")
        return

    changed = 0
    skipped = 0
    unchanged = 0

    for file in files:
        info = extract_episode_info(file, base)
        if not info:
            skipped += 1
            print(f"SKIP no season/episode: {file.relative_to(base)}")
            continue

        season, episode = info
        target = target_file_path(base, season, episode, file.suffix)

        # Already correct: s1/S01E01.ext
        if file.resolve() == target.resolve():
            unchanged += 1
            print(f"OK already correct: {file.relative_to(base)}")
            continue

        # Never create _2. If target exists, skip and show warning.
        if target.exists():
            skipped += 1
            print(
                f"SKIP target exists: {file.relative_to(base)} "
                f"-> {target.relative_to(base)}"
            )
            continue

        print(f"{file.relative_to(base)} -> {target.relative_to(base)}")
        changed += 1

        if apply:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(file), str(target))

    print()
    mode = "Apply" if apply else "Dry run"
    print(f"{mode} complete.")
    print(f"Changed: {changed}")
    print(f"Already correct: {unchanged}")
    print(f"Skipped: {skipped}")

    if not apply:
        print("No files were changed. Add --apply to rename/move files.")


def rename_all_series(tv_directory: str, apply: bool = False):
    tv_root = Path(tv_directory).expanduser().resolve()

    if not tv_root.exists() or not tv_root.is_dir():
        raise ValueError(f"Invalid TV directory: {tv_root}")

    series_dirs = [
        path
        for path in sorted(tv_root.iterdir())
        if path.is_dir() and not should_skip_dir(path)
    ]

    if not series_dirs:
        print(f"No series folders found under: {tv_root}")
        return

    print(f"Found {len(series_dirs)} series folder(s) under: {tv_root}")

    for series_dir in series_dirs:
        print()
        print("=" * 80)
        print(f"Series: {series_dir.name}")
        print("=" * 80)
        rename_and_sort_videos(str(series_dir), apply=apply)


def main():
    parser = argparse.ArgumentParser(
        description="Rename TV episodes to SxxExx and sort into s1, s2... folders."
    )
    parser.add_argument("directory", help="Series directory, or TV root directory when using --all-series")
    parser.add_argument("--apply", action="store_true", help="Actually rename and move files")
    parser.add_argument(
        "--all-series",
        action="store_true",
        help="Treat directory as TV root and process each direct subfolder as a separate series",
    )

    args = parser.parse_args()

    if args.all_series:
        rename_all_series(args.directory, apply=args.apply)
    else:
        rename_and_sort_videos(args.directory, apply=args.apply)


if __name__ == "__main__":
    main()
