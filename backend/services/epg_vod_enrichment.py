import json
import os
import re
import time
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from typing import Any

from config import CACHE_DIR
from services.kan_vod_match_service import find_kan_vod_match


KAN_EPG_CHANNEL_IDS = {"11", "23", "33"}
VOD_RECENT_EPG_CHANNEL_IDS = {
    "12": {"vod_keshet12"},
    "13": {"vod_reshet13"},
}
VOD_RECHECK_SECONDS = int(os.getenv("EPG_VOD_RECHECK_SECONDS", str(6 * 60 * 60)))
RECENT_PROGRAM_WINDOW_SECONDS = int(os.getenv("EPG_VOD_RECENT_WINDOW_SECONDS", str(7 * 24 * 60 * 60)))
VOD_RECENT_CACHE_FILE = CACHE_DIR / "vod_recent.json"
MATCH_STOP_WORDS = {
    "של",
    "עם",
    "את",
    "על",
    "כל",
    "לא",
    "גם",
    "או",
    "זה",
    "זו",
    "הוא",
    "היא",
    "הם",
    "הן",
    "יש",
    "אין",
    "עוד",
    "פרק",
    "עונה",
    "חדשות",
    "שידור",
    "ישיר",
    "live",
    "vod",
}


def _compact_kan_vod_match(match: dict[str, Any]) -> dict[str, Any]:
    series = dict(match.get("series") or {})
    episode = dict(match.get("episode") or {})

    series.pop("episodes", None)

    return {
        "module": "kan-vod",
        "series": series,
        "episode": episode,
    }


def _normalize_text(value: str | None) -> str:
    normalized = value or ""
    normalized = re.sub(r"\s*[-–]\s*\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\s*$", "", normalized)
    normalized = re.sub(r"\s*\|\s*", " ", normalized)
    normalized = re.sub(r"[״\"׳'`]", "", normalized)
    normalized = re.sub(r"[^\w\s]", " ", normalized, flags=re.UNICODE)
    return re.sub(r"\s+", " ", normalized).strip().lower()


def _tokenize(value: str | None) -> list[str]:
    normalized = _normalize_text(value)
    if not normalized:
        return []

    tokens = []
    seen = set()
    for token in normalized.split(" "):
        if len(token) < 2 or token in MATCH_STOP_WORDS or token.isnumeric() or token in seen:
            continue
        seen.add(token)
        tokens.append(token)
    return tokens


def _token_overlap_score(source_tokens: list[str], target_tokens: list[str], max_score: int) -> int:
    if not source_tokens or not target_tokens:
        return 0

    target_set = set(target_tokens)
    shared = len([token for token in source_tokens if token in target_set])
    if not shared:
        return 0

    return round(max(shared / len(source_tokens), shared / len(target_tokens)) * max_score)


def _score_text_match(
    source_text: str | None,
    target_texts: list[str | None],
    exact_score: int,
    partial_score: int,
    overlap_score: int,
) -> int:
    source = _normalize_text(source_text)
    if not source:
        return 0

    source_tokens = _tokenize(source)
    scores = [0]
    for target_text in target_texts:
        target = _normalize_text(target_text)
        if not target:
            continue
        if target == source:
            scores.append(exact_score)
        elif len(source) >= 8 and len(target) >= 8 and (target in source or source in target):
            scores.append(partial_score)
        else:
            scores.append(_token_overlap_score(source_tokens, _tokenize(target), overlap_score))
    return max(scores)


def _parse_date(value: str | None) -> datetime | None:
    trimmed = (value or "").strip()
    if not trimmed:
        return None

    try:
        numeric = float(trimmed)
        if numeric > 0:
            timestamp = numeric / 1000 if numeric > 10_000_000_000 else numeric
            return datetime.fromtimestamp(timestamp)
    except ValueError:
        pass

    date_match = re.search(r"(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})", trimmed)
    if date_match:
        day = int(date_match.group(1))
        month = int(date_match.group(2))
        year_text = date_match.group(3)
        year = int(f"20{year_text}" if len(year_text) == 2 else year_text)
        try:
            return datetime(year, month, day)
        except ValueError:
            return None

    try:
        return datetime.fromisoformat(trimmed.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _date_distance_days(program: dict[str, Any], value: str | None) -> float | None:
    vod_date = _parse_date(value)
    if not vod_date:
        return None

    try:
        program_date = datetime.fromtimestamp(int(program.get("start") or 0))
    except (TypeError, ValueError, OSError):
        return None

    program_day = datetime(program_date.year, program_date.month, program_date.day)
    vod_day = datetime(vod_date.year, vod_date.month, vod_date.day)
    return abs((program_day - vod_day).total_seconds()) / (24 * 60 * 60)


def _load_vod_recent_items(cache_file: Path = VOD_RECENT_CACHE_FILE) -> list[dict[str, Any]]:
    if not cache_file.exists():
        return []

    try:
        data = json.loads(cache_file.read_text(encoding="utf-8"))
    except Exception:
        return []

    return data if isinstance(data, list) else []


def _compact_vod_recent_match(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "module": "vod-recent",
        "item": item,
    }


def _find_vod_recent_match(
    channel_id: str,
    program: dict[str, Any],
    vod_recent_items: list[dict[str, Any]],
) -> dict[str, Any] | None:
    allowed_vod_channel_ids = VOD_RECENT_EPG_CHANNEL_IDS.get(str(channel_id))
    if not allowed_vod_channel_ids or not _normalize_text(program.get("name")):
        return None

    scored: list[tuple[int, int, dict[str, Any]]] = []
    for item in vod_recent_items:
        if not item.get("isPlayable"):
            continue
        if item.get("vodChannelId") not in allowed_vod_channel_ids:
            continue

        title_score = _score_text_match(
            program.get("name"),
            [
                item.get("programName"),
                item.get("episodeName"),
                item.get("title"),
                item.get("name"),
            ],
            42,
            30,
            26,
        )
        description_score = (
            _score_text_match(
                program.get("description"),
                [
                    item.get("episodeDescription"),
                    item.get("programDescription"),
                    item.get("description"),
                    item.get("plot"),
                ],
                22,
                18,
                22,
            )
            if program.get("description")
            else 0
        )
        source_timestamp = item.get("sourceTimestamp")
        date_distance = _date_distance_days(
            program,
            item.get("aired") or (str(source_timestamp) if source_timestamp else ""),
        )
        if date_distance is None:
            date_score = 0
        elif date_distance == 0:
            date_score = 24
        elif date_distance <= 1:
            date_score = 10
        elif date_distance <= 2:
            date_score = 6
        else:
            date_score = -24

        score = title_score + description_score + date_score
        has_text_evidence = title_score >= 18 or description_score >= 12
        has_date_conflict = date_distance is not None and date_distance > 2

        if score >= 42 and title_score >= 12 and has_text_evidence and not has_date_conflict:
            scored.append((score, title_score, item))

    scored.sort(key=lambda value: (value[0], value[1]), reverse=True)
    return scored[0][2] if scored else None


def _should_check_program(program: dict[str, Any], now: int) -> bool:
    try:
        program_end = int(program.get("end") or 0)
    except (TypeError, ValueError):
        return False

    if program_end > now:
        return False

    if program.get("hasVod") and program.get("vodMatch"):
        return False

    if now - program_end > RECENT_PROGRAM_WINDOW_SECONDS:
        return False

    checked_at = int(program.get("vodCheckedAt") or 0)
    return checked_at <= 0 or now - checked_at >= VOD_RECHECK_SECONDS


def enrich_programs_with_vod(
    channel_id: str,
    programs: list[dict[str, Any]],
    api_prefix: str = "",
    now: int | None = None,
    vod_recent_items: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    channel_id = str(channel_id)
    if channel_id not in KAN_EPG_CHANNEL_IDS and channel_id not in VOD_RECENT_EPG_CHANNEL_IDS:
        return programs

    current_time = now or int(time.time())
    recent_items = vod_recent_items if vod_recent_items is not None else _load_vod_recent_items()
    enriched_programs: list[dict[str, Any]] = []

    for program in programs:
        next_program = deepcopy(program)

        if _should_check_program(next_program, current_time):
            kan_match = (
                find_kan_vod_match(next_program, api_prefix=api_prefix)
                if channel_id in KAN_EPG_CHANNEL_IDS
                else None
            )
            recent_match = (
                _find_vod_recent_match(channel_id, next_program, recent_items)
                if not kan_match and channel_id in VOD_RECENT_EPG_CHANNEL_IDS
                else None
            )
            match = _compact_kan_vod_match(kan_match) if kan_match else (
                _compact_vod_recent_match(recent_match) if recent_match else None
            )
            next_program["hasVod"] = bool(match)
            next_program["vodCheckedAt"] = current_time

            if match:
                next_program["vodMatch"] = match
            else:
                next_program.pop("vodMatch", None)

        enriched_programs.append(next_program)

    return enriched_programs


def enrich_epg_with_vod(
    epg: dict[str, list[dict[str, Any]]],
    api_prefix: str = "",
    now: int | None = None,
) -> dict[str, list[dict[str, Any]]]:
    current_time = now or int(time.time())
    vod_recent_items = _load_vod_recent_items()

    return {
        str(channel_id): enrich_programs_with_vod(
            str(channel_id),
            programs or [],
            api_prefix=api_prefix,
            now=current_time,
            vod_recent_items=vod_recent_items,
        )
        for channel_id, programs in epg.items()
    }
