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

python -m venv venv
source venv/bin/activate  # Mac/Linux

pip install .

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
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
