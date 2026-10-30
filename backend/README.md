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

* EPG once per day (`EPG_INTERVAL_SECONDS=86400`)
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

### Nextbet live channels

The custom catalog includes 14 additional source channels alongside existing
channels: Sport 1–4, ONE / ONE 2, Sport 5 / Live / Plus / Gold / Stars / Max,
and Eurosport 1 / 2. The source slugs `yes-1` through `yes-4` carry Sport 1–4,
not the similarly named yes movie channels. Existing IDs for Sport 5 and
Sport 5 Max remain stable.

Each additional source has its own guide index so the web guide does not
collapse it into an unrelated channel. Kan 11 uses the existing `ch_11` entry
and its existing backup sources under guide index 1, with the downloaded local
Kan logo. No duplicate Kan entry is added for the unavailable source.
The new sports channels have no EPG until a matching schedule source is configured.

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
