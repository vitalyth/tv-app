import os
import re
import sqlite3
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
    "עושה",
    "עושים",
    "עושות",
    "live",
    "vod",
}
TITLE_PART_SEPARATOR_RE = re.compile(r"\s*[-–—]\s*")


def _split_program_title(value: str | None) -> tuple[str, str]:
    title = (value or "").strip()
    if not title:
        return "", ""

    parts = [part.strip() for part in TITLE_PART_SEPARATOR_RE.split(title, maxsplit=1)]
    if len(parts) < 2:
        return title, ""

    series_part, episode_part = parts[0], parts[1]
    if len(_normalize_program_name(series_part)) < 4 or len(_normalize_program_name(episode_part)) < 2:
        return title, ""

    return series_part, episode_part


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


def _informative_tokens(value: str | None) -> list[str]:
    return [token for token in _tokenize_match_text(value) if len(token) >= 3]


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


def _extract_season_episode_numbers(*texts: str | None) -> tuple[int | None, int | None]:
    season: int | None = None
    episode: int | None = None

    for text in texts:
        normalized = _normalize_program_name(text)
        if not normalized:
            continue

        season_match = re.search(r"\bעונה\s*(\d{1,3})\b", normalized)
        if season_match and season is None:
            season = int(season_match.group(1))

        season_episode_match = re.search(r"\bעונה\s*(\d{1,3})\s+(\d{1,4})\b", normalized)
        if season_episode_match:
            if season is None:
                season = int(season_episode_match.group(1))
            if episode is None:
                episode = int(season_episode_match.group(2))

        episode_match = re.search(r"\bפרק\s*(\d{1,4})\b", normalized)
        if episode_match and episode is None:
            episode = int(episode_match.group(1))

    return season, episode


def _episode_display_order(episode: dict) -> int | None:
    value = episode.get("display_order") or episode.get("displayOrder")
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _episode_season_number(episode: dict) -> int | None:
    season_id = str(episode.get("season_id") or episode.get("seasonId") or "")
    season_id_match = re.search(r":s(\d+)$", season_id)
    if season_id_match:
        return int(season_id_match.group(1))

    season_name = episode.get("seasonName") or episode.get("season") or ""
    season_match = re.search(r"עונה\s*(\d+)", _normalize_program_name(season_name))
    if season_match:
        return int(season_match.group(1))

    return None


def _episode_row_to_dict(row: sqlite3.Row, api_prefix: str = "") -> dict:
    episode = dict(row)
    episode["streamUrl"] = episode.get("stream_url") or ""
    episode["playUrl"] = episode.get("play_url") or episode.get("url") or ""
    episode["episodeName"] = episode.get("title") or ""
    episode["episodeOverview"] = episode.get("description") or ""
    episode["episodeImage"] = episode.get("image") or ""
    episode["streamEndpoint"] = f"{api_prefix}/kan-vod/stream?episode_id={episode['id']}"
    return episode


def _episode_search_terms(program: dict) -> list[str]:
    program_name = program.get("name") or ""
    program_description = program.get("description") or ""
    _series_part, episode_part = _split_program_title(program_name)

    terms = [
        episode_part,
        program_name,
    ]

    description_tokens = _informative_tokens(program_description)
    if len(description_tokens) >= 2:
        terms.append(" ".join(description_tokens[:4]))

    unique_terms = []
    seen = set()
    for term in terms:
        normalized = _normalize_program_name(term)
        if len(normalized) < 3 or normalized in seen:
            continue
        seen.add(normalized)
        unique_terms.append(term)

    return unique_terms


def _find_episode_candidates_from_db(program: dict, api_prefix: str) -> list[tuple[dict, dict]]:
    if not os.path.exists(KAN_VOD_DB_PATH):
        return []

    terms = _episode_search_terms(program)
    if not terms:
        return []

    clauses = []
    params: list[str] = []
    for term in terms:
        like_term = f"%{term.strip()}%"
        clauses.append(
            """
            (
                e.title LIKE ? COLLATE NOCASE
                OR COALESCE(e.description, '') LIKE ? COLLATE NOCASE
                OR p.title LIKE ? COLLATE NOCASE
                OR COALESCE(p.description, '') LIKE ? COLLATE NOCASE
            )
            """
        )
        params.extend([like_term, like_term, like_term, like_term])

        tokens = _informative_tokens(term)
        if len(tokens) >= 2:
            token_clauses = []
            for token in tokens[:4]:
                token_like = f"%{token}%"
                token_clauses.append(
                    """
                    (
                        e.title LIKE ? COLLATE NOCASE
                        OR COALESCE(e.description, '') LIKE ? COLLATE NOCASE
                        OR p.title LIKE ? COLLATE NOCASE
                        OR COALESCE(p.description, '') LIKE ? COLLATE NOCASE
                    )
                    """
                )
                params.extend([token_like, token_like, token_like, token_like])
            clauses.append(f"({' AND '.join(token_clauses)})")

    with sqlite3.connect(KAN_VOD_DB_PATH) as con:
        con.row_factory = sqlite3.Row
        rows = con.execute(
            f"""
            SELECT
                e.*,
                p.id AS series_id,
                p.title AS series_title
            FROM episodes e
            JOIN programs p ON p.id = e.program_id
            WHERE {' OR '.join(clauses)}
            LIMIT 80
            """,
            params,
        ).fetchall()

    by_program_id: dict[str, list[dict]] = {}
    for row in rows:
        episode = _episode_row_to_dict(row, api_prefix=api_prefix)
        by_program_id.setdefault(str(row["program_id"]), []).append(episode)

    matches: list[tuple[dict, dict]] = []
    for program_id, episodes in by_program_id.items():
        series = get_kan_vod_series_details(program_id, api_prefix=api_prefix)
        if not series:
            continue
        series["episodes"] = episodes
        episode = _find_episode_match(program, series)
        if episode:
            full_series = get_kan_vod_series_details(program_id, api_prefix=api_prefix)
            if full_series:
                matches.append((full_series, episode))

    return matches


def _get_search_queries(program_name: str) -> list[str]:
    normalized = _normalize_program_name(program_name)
    series_part, episode_part = _split_program_title(program_name)
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
        if series_part and series_part != program_name:
            queries.append(series_part)

        tokens = [token for token in _tokenize_match_text(program_name) if len(token) >= 3]
        if len(normalized) >= 4:
            queries.append(program_name)
        if episode_part:
            episode_tokens = _informative_tokens(episode_part)
            if len(episode_tokens) >= 2:
                queries.append(" ".join(episode_tokens[:2]))
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
    series_part, episode_part = _split_program_title(program_name)
    episode_tokens = _informative_tokens(episode_part)
    has_episode_hint = len(episode_tokens) > 0
    requested_season, requested_episode = _extract_season_episode_numbers(program_name, program_description)
    scored = []

    for episode in series.get("episodes") or []:
        episode_season = _episode_season_number(episode)
        episode_number = _episode_display_order(episode)
        number_match = (
            requested_episode is not None
            and episode_number == requested_episode
            and (requested_season is None or episode_season == requested_season)
        )
        title_score = _score_text_match(
            program_name,
            [
                episode.get("episodeName"),
                episode.get("title"),
            ],
            42,
            30,
            26,
        )
        program_name_episode_score = _score_text_match(
            program_name,
            [
                episode.get("description"),
                episode.get("episodeOverview"),
            ],
            36,
            28,
            34,
        )
        episode_part_score = (
            _score_text_match(
                episode_part,
                [
                    episode.get("episodeName"),
                    episode.get("title"),
                    episode.get("description"),
                    episode.get("episodeOverview"),
                ],
                60,
                46,
                42,
            )
            if episode_part
            else 0
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

        number_score = 48 if number_match else 0
        score = (
            title_score
            + program_name_episode_score
            + episode_part_score
            + description_score
            + date_score
            + number_score
        )
        has_text_evidence = (
            title_score >= 18
            or program_name_episode_score >= 20
            or episode_part_score >= 18
            or description_score >= 12
            or number_match
        )
        has_episode_evidence = not has_episode_hint or episode_part_score >= 18 or number_match
        has_date_conflict = date_distance is not None and date_distance > 1 and not number_match

        if (
            score >= 42
            and (title_score >= 12 or program_name_episode_score >= 20 or episode_part_score >= 18 or number_match)
            and has_text_evidence
            and has_episode_evidence
            and not has_date_conflict
        ):
            scored.append((score, number_score, episode_part_score, title_score, episode))

    scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return scored[0][4] if scored else None


def _find_series_match(program: dict, candidates: list[dict], api_prefix: str) -> dict | None:
    program_name = program.get("name") or ""
    program_description = program.get("description") or ""
    series_part, _episode_part = _split_program_title(program_name)
    series_source = series_part or program_name
    scored: list[tuple[int, dict]] = []

    for series in candidates:
        details = get_kan_vod_series_details(str(series["id"]), api_prefix=api_prefix)
        if not details:
            continue

        title_score = _score_text_match(
            series_source,
            [details.get("title"), series.get("title"), details.get("name"), series.get("name")],
            54,
            42,
            32,
        )
        description_score = (
            _score_text_match(
                program_description,
                [details.get("description"), series.get("description")],
                18,
                14,
                14,
            )
            if program_description
            else 0
        )

        score = title_score + description_score
        if score >= 32 and title_score >= 26:
            scored.append((score, details))

    scored.sort(key=lambda item: item[0], reverse=True)
    return scored[0][1] if scored else None


def _is_strong_series_match(program: dict, series: dict | None) -> bool:
    if not series:
        return False

    program_name = program.get("name") or ""
    series_part, _episode_part = _split_program_title(program_name)
    source = _normalize_program_name(series_part or program_name)
    target = _normalize_program_name(series.get("title") or series.get("name"))

    if not source or not target:
        return False

    if source == target:
        return True

    return len(source) >= 6 and len(target) >= 6 and (source in target or target in source)


def _kan_vod_db_mtime() -> int:
    try:
        return int(os.path.getmtime(KAN_VOD_DB_PATH))
    except OSError:
        return 0


def _match_cache_key(program: dict, api_prefix: str) -> tuple[str, str, int, int, str, int]:
    return (
        str(program.get("name") or "").strip(),
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
) -> tuple[dict, dict | None] | None:
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

    candidates = list(candidates_by_id.values())
    series_match = _find_series_match(program, candidates, api_prefix)

    best_match: tuple[int, dict, dict] | None = None
    for details in [series_match] if series_match else []:
        episode = _find_episode_match(program, details)
        if not episode:
            continue

        title_score = _score_text_match(
            program_name,
            [episode.get("episodeName"), episode.get("title")],
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
        if _is_strong_series_match(program, series_match):
            return (series_match, None)

        episode_candidates = _find_episode_candidates_from_db(program, api_prefix)
        if episode_candidates:
            return episode_candidates[0]

        return (series_match, None) if series_match else None

    return best_match[1], best_match[2]


def find_kan_vod_match(program: dict, api_prefix: str = "") -> dict | None:
    cache_key = _match_cache_key(program, api_prefix)
    if not _normalize_program_name(cache_key[0]):
        return None

    match = _find_kan_vod_match_cached(*cache_key)
    if not match:
        return None

    series, episode = match
    return {
        "series": series,
        "episode": episode,
    }
