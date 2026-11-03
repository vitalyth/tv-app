# 📺 TV Channels Streaming API

Backend API built with FastAPI for streaming TV channels and EPG (Electronic Program Guide).

Includes support for Kodi-based logic adapted to run in a Docker environment.

---

## 🚀 Features

* 📡 Stream proxy (`/proxy`)
* 🗓️ EPG XML (`/epg`)
* 🔁 EPG/VOD cache refresh scripts
* 🧠 Kodi plugin integration (xbmc compatibility layer)
* 🌍 Works with React / Next.js frontend
* 🐳 Dockerized for easy deployment

---

## Local Series HLS Conversion

Convert local series files into HLS for better browser playback and Chromecast support.

### Adaptive HLS (recommended)

Creates multiple qualities + master playlist:

```bash
python convert_local_series_to_hls.py "/Volumes/Data/tv" --adaptive
```

Limit maximum quality:

```bash
python convert_local_series_to_hls.py "/Volumes/Data/tv" --adaptive --max-height 1080
```

With subtitles export:

```bash
python convert_local_series_to_hls.py "/Volumes/Data/tv" --adaptive --subtitles
```

Adaptive output structure:

```text
Series Name/
  hls/
    s1e1/
      master.m3u8
      1080p/index.m3u8
      720p/index.m3u8
      480p/index.m3u8
      subs/he_0.vtt
      source_metadata.json
```

### Single HLS

```bash
python convert_local_series_to_hls.py "/Volumes/Data/tv/המפקדת"
python convert_local_series_to_hls.py "/Volumes/Data/tv/פאודה" --transcode
python convert_local_series_to_hls.py "/Volumes/Data/tv/פאודה" --all-audio
python convert_local_series_to_hls.py "/Volumes/Data/tv" --force
python convert_local_series_to_hls.py "/Volumes/Data/tv" --adaptive --dry-run
```

## 🛠️ Tech Stack

* Python 3.11+
* FastAPI
* Uvicorn
* Docker

---

# 🧪 Run Locally (Development)

```bash
git clone https://github.com/vitalyth/tv-channels.git
cd tv-channels
cd backend

# pyenv will use backend/.python-version and select tv-channels.
pyenv version

pip install .

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

For local development, install in editable mode so code changes are picked up without reinstalling:

```bash
pip install -e .
```

With development tools:

```bash
pip install -e ".[dev]"
```

If you use the `backend/.venv` managed by uv:

```bash
uv sync
```

---

# 🔁 Cache Refresh Jobs

Manual refresh:

```bash
python refresh_vod_recent.py
python parse_epg.py --all-channels
```

Scheduler:

```bash
python run_scheduler.py
```

The scheduler runs both jobs immediately on startup, then repeats:

* EPG every three hours (`EPG_INTERVAL_SECONDS=10800`)
* Recent VOD twice per day (`VOD_RECENT_INTERVAL_SECONDS=43200`)

Generated cache files are written under:

```bash
cache/
```

This directory is runtime data and is not tracked by git.

---

# 🐳 Build Docker Image

```bash
docker build -t vitalyth/tv-channels:latest .
```

---

# ☁️ Push to Docker Hub

```bash
docker login
docker push vitalyth/tv-channels:latest
```

---

# 🚀 Deploy on CasaOS

## 🔹 Step 1: Open CasaOS

Go to:

```
http://YOUR_SERVER_IP
```

---

## 🔹 Step 2: Install Custom App

* Open **App Store**
* Click ➕ **Custom Install**

---

## 🔹 Step 3: Fill in Details

### Docker Image

```
vitalyth/tv-channels
```

### Tag

```
latest
```

### Container Name

```
tv-channels
```

---

## 🔌 Ports

| Host | Container |
| ---- | --------- |
| 8001 | 8000      |

---

## 🌐 Web UI

Port:

```
8000
```

---

## 🔹 Step 4: Install

Click **Install**

CasaOS will:

* Pull image from Docker Hub
* Run container

---

# ✅ Verify Deployment

Open:

```
http://YOUR_SERVER_IP:8001/docs
```

If Swagger UI appears → 🎉 success

---

# ⚠️ Troubleshooting

## Port already in use

Change host port:

```
8002 → 8000
```

---

## Container crashes

Check logs in CasaOS

---

## Missing dependencies

Rebuild and push:

```bash
docker build --no-cache -t vitalyth/tv-channels:latest .
docker push vitalyth/tv-channels:latest
```

---

# 🔧 Advanced Notes

## PYTHONPATH

The container uses:

```
/app:/app/plugin_video_idanplus:/app/debug
```

---

## Kodi Compatibility

The project maps xbmc modules internally to allow running Kodi plugin logic without Kodi.

---

# 🌍 Access from Network

Example:

```
http://192.168.86.75:8001
```

---

# 🚀 Future Improvements

* Convert EPG XML → JSON
* Add caching layer
* Add authentication
* Improve streaming reliability

---

# 👨‍💻 Author

Vitaly Thirulnikov

### Channel display order

Set each channel's `orderNumber` in `data/custom_channels.json` to control its
display position. Lower numbers appear first; values have gaps of 10 to allow
inserting channels. The API and IPTV playlist share this order. `index` still
groups alternate sources, and `channelNumber` remains the displayed number.
Order-only overrides do not add absent upstream channels. Channels without a
configured order receive an `orderNumber` after the configured entries.
The configured TV order follows ascending channel numbers, with unnumbered
channels at the end. Alternate sources stay together, preserving primary-source
preference within each group. Radio ordering is unchanged.

Sports display numbers follow the published Israeli channel lineup: ONE 2 / ONE
49 / 50, Sport 1–4 at 51–54, Sport 5 / Plus / Gold / Live / Stars / Max at
55–60, and Eurosport 1 / 2 at 61 / 62. Both main Sport 5 sources use 55.
These numbers are independent of display order and source-group indices.
Sources: [yes sports lineup](https://www.yes.co.il/content/yes-magazine/sports-tvguide/)
and [HOT channel list](https://www.hot.net.il/heb/tv/channels/hotchannels/),
checked November 2, 2026.

### Nextbet live channels

The custom catalog includes 14 additional source channels alongside existing
channels: Sport 1–4, ONE / ONE 2, Sport 5 / Live / Plus / Gold / Stars / Max,
and Eurosport 1 / 2. The source slugs `yes-1` through `yes-4` carry Sport 1–4,
not the similarly named yes movie channels. Existing IDs for Sport 5 and
Sport 5 Max remain stable.

Additional channels have their own guide indices. Sport 5 groups the original
IdanPlus source (primary) and Nextbet source (alternate) under index 15 and
channel number 55, with the shared `sport5` EPG. Kan 11 uses the existing `ch_11` entry
and its existing backup sources under guide index 1, with the downloaded local
Kan logo. No duplicate Kan entry is added for the unavailable source.
The six Sport 5 linear channels use the official Sport 5 broadcast sheet EPG.
Sport 1–4, ONE and Eurosport retain their existing EPG configuration.

### Sport 5 EPG

`epg_parsers/sport5.py` imports up to ten published days from the official
[broadcast sheet](https://www.sport5.co.il/html/pages/broadcastsheet.html),
using its separate tabs for Sport 5, Plus, Live, Gold, Stars and Max. Each
linear channel has a dedicated `tvgID`: `sport5`, `sport5_plus`, `sport5_live`,
`sport5_gold`, `sport5_stars`, `sport5_max`.

A dedicated scheduler job refreshes all six channels using the shared
`EPG_INTERVAL_SECONDS` interval (default `10800`). The general import skips
Sport 5 to avoid duplicate source requests. To refresh the group manually, run `python parse_epg.py --sport5-only`. To refresh one channel:

```bash
python parse_epg.py --channel sport5_max
```

Requests match the site's unpadded `YYYY-M-D` date format.
The live badge beside a start time is retained as `ישיר` in the program description.
Times are interpreted in `Asia/Jerusalem`, including daylight saving changes.
Because the site publishes start times, each program ends at the next known
start; the importer fetches an additional day for the midnight boundary.
Unpublished rows stay empty, and failed or empty imports retain cached programs.
The ten-day window matches the site's day selector. Failed dates are skipped
so a missing day cannot hide a later published schedule. Requests are paced
to respect the site's rate limit; fetching stops on HTTP 403 or 429.
HTTP 500 is retried once after a delay: it can also occur for published dates,
so it is not treated as proof that a schedule is unavailable.
When a direct request returns HTTP 500, the importer tries the same URL with
Chrome browser impersonation using the existing `curl-cffi` dependency. This
works around Akamai failures without requiring the VPN backend.
The importer visits every channel for today before advancing to tomorrow and
later dates. On an unpublished day, invalid response, or provider failure, it
uses the official [yes schedule API](https://svc.yes.co.il/api/content/broadcast-schedule/channels?page=0&pageSize=1000)
as a backup. This also covers Sport 5 Plus while its official tab is empty.
The backup uses a Chrome-compatible client on the direct connection and preserves
its exact UTC timestamps and program ends. Both providers are paced; a 403/429
stops further requests to that provider for the batch. Cached schedules survive
empty/failed refreshes, and unknown times are never filled with invented programs.
Both Sport 5 TV sources use the `sport5` schedule; the separate audio radio
station retains `5radio`. The original TV source remains primary.
Its channel 55 override sets `linkDetails.vpn` so the app, web player and IPTV
playlist use the Israeli VPN backend for the CloudFront fallback introduced
in IdanPlus 4.0.4. That stream returns HTTP 403 on the direct local connection.

The backend resolves a fresh signed URL on playback through the source AJAX
endpoint; no expiring tokens are stored in the catalog. The existing stream
proxy supplies the source Referer, Origin and User-Agent for manifests and
segments, refreshes cached manifests, and serves the source's `.jpeg` transport
stream segments as `video/mp2t`. Clients use the existing `/stream?channel_id=…`
endpoint without supplying source headers.

Logos are served locally from `frontend/public/ch`. Download sources and output
sizes are documented in `frontend/docs/channel-logo-sources.json`. Original
artwork is retained in `frontend/public/ch/originals`. The additional sports
channels use 512×512 SVG tiles with embedded local artwork and contrasting
backgrounds. Sport 5 uses vertical marks; Eurosport uses compact E1/E2 marks.
Sport 1–4 use the official vector numeral above the complete wordmark, without
stretching either. Regenerate the tiles with
`node frontend/scripts/build-square-channel-logos.mjs` from the repository root.
No logos are loaded from third-party servers during playback.

These channels require the upstream website and CDN to be available from the
backend. Deploy the updated backend image, catalog and frontend assets together.

### Sport 1–4 EPG

Sport 1–4 use the official `sport1.maariv.co.il` broadcast API, with channel IDs
2, 3, 4 and 5 respectively. `python parse_epg.py --sport1-only` refreshes the
seven-day schedule independently; the scheduler uses the shared
`EPG_INTERVAL_SECONDS` interval (default `10800`). The general import uses
`--skip-sport1` to avoid duplicate requests. Times use `Asia/Jerusalem`, and shows
marked `ישיר` retain that label in their descriptions. Program ends come from
the following published start, including across midnight. Unpublished final
ends are not invented; failed/empty imports retain cached programs.

### ONE / ONE2 EPG

ONE and ONE2 import seven days from the official yes broadcast API (`TR01` and
`CH58`), sharing the same client as the Sport 5 backup. Run
`python parse_epg.py --one-only` to refresh both. The scheduler uses the shared
`EPG_INTERVAL_SECONDS` interval (default `10800`); the general import uses
`--skip-one`. The channel catalog maps to EPG IDs `one1` / `one2`. Exact UTC
start/end times, descriptions, live labels and available program images are
preserved. Empty or failed requests retain cached data. Provider rate limits
stop further requests for that batch.

### Eurosport 1 / Eurosport 2 EPG

Eurosport uses the same yes client and seven-day import window (`PT39` / `CH33`,
EPG IDs `eurosport1` / `eurosport2`). Run `python parse_epg.py --eurosport-only`
to refresh both channels. The scheduler uses the shared
`EPG_INTERVAL_SECONDS` interval (default `10800`); the general import
uses `--skip-eurosport`. Only published programs are imported, preserving exact
start/end times; Eurosport 2 can publish fewer days than Eurosport 1.

### Sports program images and yes coverage

All 14 sports channels (Sport 1–4, six Sport 5 channels, ONE/ONE2 and
Eurosport 1/2) import yes program artwork through the shared client. Sport 1–4
map to `PT53`, `PT98`, `CH09`, `CH11`. Sport 1 and Sport 5 import both sources:
yes intervals retain their exact ends and `image` URLs, while official-site
programs fill uncovered periods or provider failures. Refreshes preserve cached
programs, including overnight broadcasts when yesterday's yes API is empty.

### Channel 16 EPG

Channel 16 (`16tv`) imports up to seven published days from yes (`CN66`),
including descriptions, artwork and exact start/end times. Run
`python parse_epg.py --channel16-only` (or `--channel 16tv`) to refresh it.
The scheduler uses the shared `EPG_INTERVAL_SECONDS` interval (default
`10800`); the general import uses `--skip-channel16`. Empty or failed source
requests retain cached programs.

All EPG import jobs share `EPG_INTERVAL_SECONDS` (seconds, default `10800`).
Set `EPG_INTERVAL_SECONDS=7200` to refresh every channel group every two hours.
Jobs remain separate to avoid duplicate imports and isolate source failures,
with no channel-specific interval settings.

### Shared VOD database path

Set `VOD_DB_PATH` to the populated SQLite database shared by VOD providers.
The API, scheduler and `scripts/vod_db_scanner.py` use this same path. Provider
settings (`KESHET_VOD_DB_PATH`, legacy `KESHT_VOD_DB_PATH`, `RESHET_VOD_DB_PATH`,
`C14_VOD_DB_PATH`, `I24_VOD_DB_PATH`) remain optional overrides. Deployments
using only `KAN_VOD_DB_PATH` retain that legacy path; without either setting,
the default remains `db/kan_vod.db`. This prevents a CasaOS deployment using
`VOD_DB_PATH=/app/db/vod.db` from reading an empty `db/kan_vod.db` instead.
