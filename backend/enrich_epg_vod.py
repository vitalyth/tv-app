from services.epg_storage import DEFAULT_EPG_DB_PATH, load_all_epg, replace_all_epg
from services.epg_vod_enrichment import enrich_epg_with_vod


def main() -> int:
    epg = load_all_epg(DEFAULT_EPG_DB_PATH)
    if not epg:
        print(f"No EPG data found in {DEFAULT_EPG_DB_PATH}")
        return 0

    enriched = enrich_epg_with_vod(epg)
    replace_all_epg(enriched, DEFAULT_EPG_DB_PATH)

    matched_count = sum(
        1
        for programs in enriched.values()
        for program in programs
        if program.get("hasVod") and program.get("vodMatch")
    )
    checked_count = sum(
        1
        for programs in enriched.values()
        for program in programs
        if program.get("vodCheckedAt")
    )

    print(
        f"Updated EPG VOD metadata in {DEFAULT_EPG_DB_PATH}: "
        f"{matched_count} matched, {checked_count} checked"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
