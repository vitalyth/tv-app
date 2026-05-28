# Kan VOD DB Scanner

A Python scanner for scraping Kan (כאן) VOD content, storing programs, seasons, episodes, and stream URLs in SQLite.

## Features

- Scan all Kan programs.
- Scan a single program by title, program id, or mainid.
- Save metadata into SQLite.
- Resolve playable `stream_url` values.
- Resume interrupted scans.
- Skip already completed programs or episodes.
- Search programs and episodes.
- Debug with verbose output.
- Optional metadata enrichment from episode pages.

---

## Installation

Create and activate a virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Install dependencies:

```bash
pip install requests beautifulsoup4 cloudscraper lxml
```

---

## Database

Default database path:

```bash
db/kan_vod.db
```

The scanner creates these tables:

- `programs`
- `seasons`
- `episodes`

### programs

| Column | Description |
|---|---|
| `id` | Kan program id |
| `mainid` | Kan main id |
| `title` | Program title |
| `description` | Program description |
| `url` | Program page URL |
| `image` | Program image |
| `program_format` | Program format, for example `סדרה` or `סרט` |
| `program_genre` | Program genre |

### seasons

| Column | Description |
|---|---|
| `season_id` | Internal season id |
| `program_id` | Parent program id |
| `title` | Season title |
| `url` | Season URL |
| `season_number` | Parsed season number |

### episodes

| Column | Description |
|---|---|
| `id` | Episode id |
| `program_id` | Parent program id |
| `season_id` | Parent season id |
| `title` | Episode title |
| `description` | Episode description |
| `url` | Metadata/content page URL |
| `play_url` | Playback page URL |
| `image` | Episode image |
| `stream_url` | Direct playable stream URL |
| `kaltura_entry_id` | Kaltura entry id |
| `published` | Publish date, when available |

---

## Basic Usage

### Full metadata scan

```bash
python scripts/kan_db_scanner.py scan --db db/kan_vod.db
```

### Full scan with streams

```bash
python scripts/kan_db_scanner.py scan \
  --db db/kan_vod.db \
  --with-streams
```

### Full scan with detailed output

```bash
python scripts/kan_db_scanner.py scan \
  --db db/kan_vod.db \
  --with-streams \
  --verbose
```

---

## Scan a Specific Program

### By title

```bash
python scripts/kan_db_scanner.py scan \
  --db db/kan_vod.db \
  --program-title "לא לריב" \
  --with-streams
```

### By mainid

```bash
python scripts/kan_db_scanner.py scan \
  --db db/kan_vod.db \
  --program-mainid 5460 \
  --with-streams
```

### Examples

#### לא לריב

```bash
python scripts/kan_db_scanner.py scan \
  --db db/kan_vod.db \
  --program-mainid 5460 \
  --with-streams
```

#### דודו טסה - לתפוס דג

```bash
python scripts/kan_db_scanner.py scan \
  --db db/kan_vod.db \
  --program-mainid 5464 \
  --with-streams
```

#### טהרן

```bash
python scripts/kan_db_scanner.py scan \
  --db db/kan_vod.db \
  --program-title "טהרן" \
  --with-streams
```

#### כאן ספיישלים

```bash
python scripts/kan_db_scanner.py scan \
  --db db/kan_vod.db \
  --program-title "כאן ספיישלים" \
  --with-streams \
  --verbose
```

---

## Resume and Skip Existing Data

### Skip complete episodes

```bash
python scripts/kan_db_scanner.py scan \
  --db db/kan_vod.db \
  --with-streams \
  --skip-complete-episodes
```

### Skip programs where all existing episodes already have streams

```bash
python scripts/kan_db_scanner.py scan \
  --db db/kan_vod.db \
  --with-streams \
  --skip-programs-with-streams
```

This is useful after an interrupted run.

---

## Resolve Missing Streams Only

This is usually faster than rescanning everything:

```bash
python scripts/kan_db_scanner.py resolve-missing-streams \
  --db db/kan_vod.db
```

Limit the batch size:

```bash
python scripts/kan_db_scanner.py resolve-missing-streams \
  --db db/kan_vod.db \
  --limit 500
```

---

## List Programs

```bash
python scripts/kan_db_scanner.py list-programs
```

Find a program:

```bash
python scripts/kan_db_scanner.py list-programs | grep "טהרן"
```

---

## List Episodes

### Fast listing

```bash
python scripts/kan_db_scanner.py list-episodes \
  --program-title "לא לריב"
```

### Show URLs

```bash
python scripts/kan_db_scanner.py list-episodes \
  --program-title "לא לריב" \
  --show-urls
```

### Include streams

```bash
python scripts/kan_db_scanner.py list-episodes \
  --program-title "לא לריב" \
  --with-streams
```

### Enrich missing metadata

This is slower because it opens individual episode pages:

```bash
python scripts/kan_db_scanner.py list-episodes \
  --program-title "כאן ספיישלים" \
  --enrich-metadata
```

---

## Search the DB

```bash
python scripts/kan_db_scanner.py search \
  --db db/kan_vod.db \
  --query "טהרן"
```

---

## Get a Single Episode

```bash
python scripts/kan_db_scanner.py get-episode \
  --db db/kan_vod.db \
  --episode-id 1033208
```

Resolve stream if missing:

```bash
python scripts/kan_db_scanner.py get-episode \
  --db db/kan_vod.db \
  --episode-id 1033208 \
  --resolve
```

---

## Resolve Stream URL from an Episode Page

```bash
python scripts/kan_db_scanner.py stream-url \
  --episode-url "https://www.kan.org.il/content/kan/kan-11/p-1033206/s1/1033208/"
```

JSON output:

```bash
python scripts/kan_db_scanner.py stream-url \
  --episode-url "https://www.kan.org.il/content/kan/kan-11/p-1033206/s1/1033208/" \
  --json
```

---

## Stream Status

Show programs missing streams:

```bash
python scripts/kan_db_scanner.py stream-status \
  --db db/kan_vod.db \
  --only-missing
```

---

## Missing Descriptions

```bash
python scripts/kan_db_scanner.py missing-descriptions \
  --db db/kan_vod.db
```

---

## Recommended Workflow

### 1. Initial metadata scan

```bash
python scripts/kan_db_scanner.py scan --db db/kan_vod.db
```

### 2. Resolve streams separately

```bash
python scripts/kan_db_scanner.py resolve-missing-streams --db db/kan_vod.db
```

### 3. Resume safely later

```bash
python scripts/kan_db_scanner.py scan \
  --db db/kan_vod.db \
  --with-streams \
  --skip-programs-with-streams
```

---

## Troubleshooting

### Scan is slow

Use `resolve-missing-streams` instead of rescanning all programs.

```bash
python scripts/kan_db_scanner.py resolve-missing-streams --db db/kan_vod.db
```

### Cloudflare / network issues

Retry later, or scan smaller batches by selecting a specific program.

### Ctrl+C interruption

The DB keeps already saved rows. Resume with:

```bash
python scripts/kan_db_scanner.py scan \
  --db db/kan_vod.db \
  --with-streams \
  --skip-programs-with-streams
```

### Broken test DB schema

If you used older test versions and the schema is broken, delete the DB and rebuild:

```bash
rm -f db/kan_vod.db
python scripts/kan_db_scanner.py scan --db db/kan_vod.db
```

---

## Notes

- `url` is the content page.
- `play_url` is the playback page.
- `stream_url` is the playable stream.
- Some programs are single movies and do not have seasons.
- Some pages have CTA links like “לצפייה בפרק הראשון”; the scanner prefers the real `.seasons` episode grid when possible.
