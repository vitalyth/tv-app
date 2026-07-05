import os
import re
from datetime import datetime
from functools import lru_cache

from services.kan_vod_service import KAN_VOD_DB_PATH, get_kan_vod_series, get_kan_vod_series_details


DAY_SECONDS = 24 * 60 * 60
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


def _normalize_program_name(value: str | None) -> str:
    normalized = value or ""
    normalized = re.sub(r"\s*[-–]\s*\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\s*$", "", normalized)
    normalized = re.sub(r"\s*\|\s*", " ", normalized)
    normalized = re.sub(r"[״\"׳'`]", "", normalized)
    normalized = re.sub(r"[^\w\s]", " ", normalized, flags=re.UNICODE)
    normalized = re.sub(r"\s+", " ", normalized).strip().lower()
    return normalized


def _tokenize_match_text(value: str | None) -> list[str]:
    normalized = _normalize_program_name(value)
    if not normalized:
        return []

    tokens = []
    seen = set()
    for token in normalized.split(" "):
        token = token.strip()
        if (
            len(token) < 2
            or token in MATCH_STOP_WORDS
            or token.isnumeric()
            or token in seen
        ):
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

    source_ratio = shared / len(source_tokens)
    target_ratio = shared / len(target_tokens)
    return round(max(source_ratio, target_ratio) * max_score)


def _parse_vod_date(value: str | None) -> datetime | None:
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


def _date_distance_days(program_start: int, value: str | None) -> float | None:
    vod_date = _parse_vod_date(value)
    if not vod_date:
        return None

    program_date = datetime.fromtimestamp(program_start)
    program_day = datetime(program_date.year, program_date.month, program_date.day)
    vod_day = datetime(vod_date.year, vod_date.month, vod_date.day)
    return abs((program_day - vod_day).total_seconds()) / DAY_SECONDS


def _score_text_match(
    source_text: str | None,
    target_texts: list[str | None],
    exact_score: int,
    partial_score: int,
    overlap_score: int,
) -> int:
    source = _normalize_program_name(source_text)
    if not source:
        return 0

    source_tokens = _tokenize_match_text(source)
    scores = [0]
    for target_text in target_texts:
        target = _normalize_program_name(target_text)
        if not target:
            continue

        if target == source:
            scores.append(exact_score)
            continue

        if len(source) >= 8 and len(target) >= 8 and (target in source or source in target):
            scores.append(partial_score)
            continue

        scores.append(_token_overlap_score(source_tokens, _tokenize_match_text(target), overlap_score))

    return max(scores)


def _get_search_queries(program_name: str) -> list[str]:
    normalized = _normalize_program_name(program_name)
    queries: list[str] = []

    if (
        "מהדורת כאן חדשות" in normalized
        or "חדשות כאן" in normalized
        or "חדשות הערב" in normalized
    ):
        queries.append("מהדורת כאן חדשות")

    if "כאן בשש" in normalized:
        queries.append("כאן בשש")
    if "העולם היום" in normalized:
        queries.append("העולם היום")
    if "בנימיני וגואטה" in normalized:
        queries.append("בנימיני וגואטה")
    if "שלוש" in normalized:
        queries.append("שלוש")
    if "שבע" in normalized:
        queries.append("שבע")

    if not queries:
        tokens = [token for token in _tokenize_match_text(program_name) if len(token) >= 3]
        if len(normalized) >= 4:
            queries.append(program_name)
        if len(tokens) >= 2:
            queries.append(" ".join(tokens[:2]))
        if tokens:
            queries.append(tokens[0])

    unique_queries = []
    seen = set()
    for query in queries:
        query = query.strip()
        key = _normalize_program_name(query)
        if query and key not in seen:
            seen.add(key)
            unique_queries.append(query)

    return unique_queries


def _find_episode_match(program: dict, series: dict) -> dict | None:
    program_name = program.get("name") or ""
    if not _normalize_program_name(program_name):
        return None

    program_start = int(program.get("start") or 0)
    program_description = program.get("description") or ""
    scored = []

    for episode in series.get("episodes") or []:
        title_score = _score_text_match(
            program_name,
            [
                episode.get("episodeName"),
                episode.get("title"),
                series.get("title"),
            ],
            42,
            30,
            26,
        )
        description_score = (
            _score_text_match(
                program_description,
                [
                    episode.get("description"),
                    episode.get("episodeOverview"),
                    series.get("description"),
                ],
                22,
                18,
                22,
            )
            if program_description
            else 0
        )
        date_distance = _date_distance_days(program_start, episode.get("published") or "")
        if date_distance is None:
            date_score = 0
        elif date_distance == 0:
            date_score = 24
        elif date_distance <= 1:
            date_score = 10
        else:
            date_score = -24

        score = title_score + description_score + date_score
        has_text_evidence = title_score >= 18 or description_score >= 12
        has_date_conflict = date_distance is not None and date_distance > 1

        if score >= 42 and title_score >= 12 and has_text_evidence and not has_date_conflict:
            scored.append((score, title_score, episode))

    scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return scored[0][2] if scored else None


def _kan_vod_db_mtime() -> int:
    try:
        return int(os.path.getmtime(KAN_VOD_DB_PATH))
    except OSError:
        return 0


def _match_cache_key(program: dict, api_prefix: str) -> tuple[str, str, int, int, str, int]:
    return (
        _normalize_program_name(program.get("name")),
        _normalize_program_name(program.get("description")),
        int(program.get("start") or 0),
        int(program.get("end") or 0),
        api_prefix,
        _kan_vod_db_mtime(),
    )


@lru_cache(maxsize=512)
def _find_kan_vod_match_cached(
    program_name: str,
    program_description: str,
    program_start: int,
    program_end: int,
    api_prefix: str,
    _db_mtime: int,
) -> tuple[dict, dict] | None:
    program = {
        "name": program_name,
        "description": program_description,
        "start": program_start,
        "end": program_end,
    }
    candidates_by_id: dict[str, dict] = {}

    for query in _get_search_queries(program_name):
        result = get_kan_vod_series(query=query, limit=5, offset=0)
        for series in result.get("series") or []:
            series_id = str(series.get("id") or "")
            if series_id:
                candidates_by_id.setdefault(series_id, series)

    best_match: tuple[int, dict, dict] | None = None
    for series in candidates_by_id.values():
        details = get_kan_vod_series_details(str(series["id"]), api_prefix=api_prefix)
        if not details:
            continue

        episode = _find_episode_match(program, details)
        if not episode:
            continue

        title_score = _score_text_match(
            program_name,
            [episode.get("episodeName"), episode.get("title"), details.get("title")],
            42,
            30,
            26,
        )
        description_score = _score_text_match(
            program_description,
            [episode.get("description"), episode.get("episodeOverview"), details.get("description")],
            22,
            18,
            22,
        )
        date_distance = _date_distance_days(program_start, episode.get("published") or "")
        date_score = 24 if date_distance == 0 else 10 if date_distance is not None and date_distance <= 1 else 0
        score = title_score + description_score + date_score

        if best_match is None or score > best_match[0]:
            best_match = (score, details, episode)

    if not best_match:
        return None

    return best_match[1], best_match[2]


def find_kan_vod_match(program: dict, api_prefix: str = "") -> dict | None:
    cache_key = _match_cache_key(program, api_prefix)
    if not cache_key[0]:
        return None

    match = _find_kan_vod_match_cached(*cache_key)
    if not match:
        return None

    series, episode = match
    return {
        "series": series,
        "episode": episode,
    }
