import re

from services.vod_recent_common import (
    VodRecentSourceContext,
    sort_direct_recent_items,
    timestamp_matches_dates,
    today_and_yesterday_dates,
)


def fetch_reshet_recent_items(limit: int, context: VodRecentSourceContext) -> list[dict]:
    build_id = _get_build_id(context)
    if not build_id:
        return []

    allshows_url = (
        "https://13tv.co.il/_next/data/"
        f"{build_id}/he/allshows/screen/1170108.json?all=screen&all=1170108"
    )
    data = context.http_get_json(allshows_url, headers={"User-Agent": "Mozilla/5.0"})
    children = (
        (data or {})
        .get("pageProps", {})
        .get("leafs", [{}])[0]
        .get("child", [])
    )
    if not isinstance(children, list):
        return []

    candidates = []
    for source_order, serie in enumerate(children):
        metas = serie.get("metas") or {}
        series_id = metas.get("SeriesID")
        if not series_id:
            continue
        serie_name = context.clean_kodi_label(serie.get("name", ""))
        serie_description = context.clean_kodi_label(serie.get("description", ""))
        if "חדשות 13" not in f"{serie_name} {serie_description}":
            continue
        candidates.append(
            {
                "series_id": str(series_id),
                "name": serie_name,
                "description": serie_description,
                "image": context.first_image(serie.get("images")),
                "source_order": source_order,
                "series_timestamp": context.normalize_unix_timestamp(serie.get("createDate")),
            }
        )

    allowed_dates = today_and_yesterday_dates()
    by_source_order = sorted(candidates, key=lambda item: item["source_order"])[:25]
    by_new_series = sorted(candidates, key=lambda item: item["series_timestamp"], reverse=True)[:15]
    selected_series = {item["series_id"]: item for item in [*by_source_order, *by_new_series]}.values()

    recent_items: list[dict] = []
    for serie in selected_series:
        series_url = (
            "https://13tv.co.il/_next/data/"
            f"{build_id}/he/allshows/series/{serie['series_id']}.json"
            f"?all=series&all={serie['series_id']}"
        )
        series_data = context.http_get_json(series_url, headers={"User-Agent": "Mozilla/5.0"})
        program = (series_data or {}).get("pageProps", {}).get("program", {})
        seasons = program.get("seasonsList") or []
        if not isinstance(seasons, list):
            continue

        season_positions = [
            str(season.get("position"))
            for season in seasons
            if season.get("position") is not None
        ]
        for season_position in season_positions[:3]:
            season_url = (
                "https://13tv.co.il/_next/data/"
                f"{build_id}/he/allshows/series/{serie['series_id']}/season/{season_position}.json"
                f"?all=series&all={serie['series_id']}&all=season&all={season_position}"
            )
            season_data = context.http_get_json(season_url, headers={"User-Agent": "Mozilla/5.0"})
            episodes = (
                (season_data or {})
                .get("pageProps", {})
                .get("program", {})
                .get("episodes", [])
            )
            if not isinstance(episodes, list):
                continue

            for episode in episodes[:12]:
                created_at = context.normalize_unix_timestamp(episode.get("createDate"))
                if not timestamp_matches_dates(created_at, allowed_dates):
                    continue
                entry_id = episode.get("entryId")
                if not entry_id:
                    continue
                name = episode.get("name") or serie["name"]
                image = context.first_image(episode.get("images")) or serie["image"]
                recent_items.append(
                    context.make_vod_recent_item(
                        module="reshet",
                        mode=3,
                        url=f"--kaltura--{entry_id}===",
                        name=name,
                        logo=image,
                        more_data="",
                        description=episode.get("description", ""),
                        aired=context.timestamp_to_date(created_at),
                        program_name=serie["name"],
                        program_image=serie["image"],
                        channel_name="רשת 13",
                        channel_image="13.jpg",
                        source_timestamp=created_at,
                    )
                )

    unique_items = {}
    for item in sort_direct_recent_items(recent_items, context):
        unique_items.setdefault(item["id"], item)
    return list(unique_items.values())[:limit]


def _get_build_id(context: VodRecentSourceContext) -> str:
    html = context.http_get_text(
        "https://13tv.co.il/allshows/screen/1170108/",
        headers={"User-Agent": "Mozilla/5.0"},
    )
    next_data = context.extract_next_data(html)
    build_id = (next_data or {}).get("buildId") or ""
    if build_id:
        return build_id

    match = re.search(r"/_next/static/([^/]+)/_buildManifest\.js", html)
    return match.group(1) if match else ""
