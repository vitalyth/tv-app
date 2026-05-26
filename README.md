# 📺 TV App (Frontend + Backend + Nginx)

Full-stack streaming application with:

* ⚛️ Next.js (Frontend)
* ⚡ FastAPI (Backend)
* 🌐 Nginx (Reverse Proxy – custom image)
* 🐳 Docker (Deployment)

Current version: `0.1.3`

---

## 🚀 Features

* Stream proxy (`/api/proxy`)
* EPG support (`/api/epg`)
* Interactive program guide with sticky channel and time headers
* Current channel/program highlighting and a visible `now` marker
* Alternate source picker for channels with backup streams
* Floating desktop player with drag support
* Mobile-friendly player layout
* Unified port (8001)
* No CORS issues
* Fully Dockerized
* Automatic EPG and VOD recent refresh jobs
* Works locally and in production (CasaOS)

---

## 📁 Project Structure

```
tv-app/
├── frontend/        # Next.js app
├── backend/         # FastAPI app
├── nginx/           # Nginx (Dockerfile + config)
│   ├── Dockerfile
│   └── nginx.conf
├── docker-compose.yml
├── docker-compose.dev.yml
└── README.md
```

---

## 🧪 Run Locally (Development)

### 🔹 Backend

```bash
cd backend

# pyenv will use backend/.python-version and select tv-channels.
pyenv version

pip install .

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

For local development, install in editable mode so code changes are picked up without reinstalling:

```bash
cd backend
pip install -e .
```

With development tools:

```bash
cd backend
pip install -e ".[dev]"
```

If you use the `backend/.venv` managed by uv:

```bash
cd backend
uv sync
```

Open:
http://localhost:8000/docs

---

### 🔹 Frontend

```bash
cd frontend

npm install
npm run dev
```

Open:
http://localhost:3000

---

### 🔹 Environment (Frontend)

Create file:

`frontend/.env.local`

```
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

---

## 🐳 Run with Docker (Development)

```bash
docker compose -f docker-compose.dev.yml up --build
```

Open:
http://localhost:8001

Watch scheduler logs:

```bash
docker compose -f docker-compose.dev.yml logs -f backend-scheduler
```

---

## 🐳 Run with Docker (Production)

### 🔹 Start everything

```bash
docker compose up -d --build
```

---

### 🔹 Open app

http://localhost:8001

---

### 🔹 API endpoints

http://localhost:8001/api/epg
http://localhost:8001/api/proxy
http://localhost:8001/api/docs

---

## 🔁 Automatic Refresh Jobs

The app includes a dedicated `backend-scheduler` service that uses the same backend image.

It runs immediately when the container starts, then continues automatically:

* EPG/channel programs: once per day
* Recent VOD cache: twice per day

Default commands:

```bash
python parse_epg.py --all-channels
python refresh_vod_recent.py
```

Default intervals:

```env
EPG_INTERVAL_SECONDS=86400
VOD_RECENT_INTERVAL_SECONDS=43200
```

The backend and scheduler share the same runtime cache volume:

```yaml
${BACKEND_CACHE_DIR:-/DATA/AppData/tv-app/backend-cache}:/app/cache
```

This means the scheduler writes `epg.json`, `epg/*.json`, and `vod_recent.json`, and the API reads the updated files from the same location.

To view scheduler logs:

```bash
docker compose logs -f backend-scheduler
```

To run only the scheduler locally:

```bash
docker compose -f docker-compose.dev.yml up --build backend-scheduler
```

When configuring the scheduler in a container UI instead of Compose, set the
container command to `python` and `/app/run_scheduler.py`.

---

## 🐳 Build Docker Images (Manual)

### 🔹 Frontend

```bash
docker build -t tv-app-frontend ./frontend
```

---

### 🔹 Backend

```bash
docker build -t tv-app-backend ./backend
```

---

### 🔹 Nginx (Custom Image)

```bash
docker build -t tv-app-nginx ./nginx
```

---

## 📦 Push Images to Docker Hub (Optional)

```bash
docker tag tv-app-frontend YOUR_DOCKERHUB/tv-app-frontend
docker push YOUR_DOCKERHUB/tv-app-frontend

docker tag tv-app-backend YOUR_DOCKERHUB/tv-app-backend
docker push YOUR_DOCKERHUB/tv-app-backend

docker tag tv-app-nginx YOUR_DOCKERHUB/tv-app-nginx
docker push YOUR_DOCKERHUB/tv-app-nginx
```

---

## ⚙️ Docker Compose Notes

* Nginx is built from `./nginx` (custom image)
* `backend-scheduler` refreshes cache files automatically
* Backend cache is stored outside git and should be mounted as a persistent volume
* Services communicate using Docker network:

  * `http://frontend:3000`
  * `http://backend:8000`

---

## ⚙️ Environment Variables

### Backend (docker-compose)

```yaml
environment:
  - ROOT_PATH=/api
```

### Scheduler (docker-compose)

```yaml
environment:
  - EPG_INTERVAL_SECONDS=86400
  - VOD_RECENT_INTERVAL_SECONDS=43200
```

### Shared cache volume

```yaml
volumes:
  - ${BACKEND_CACHE_DIR:-/DATA/AppData/tv-app/backend-cache}:/app/cache
```

---

### Frontend (docker-compose)

```yaml
environment:
  - NEXT_PUBLIC_API_BASE=/api
```

---

## 🌐 Nginx Configuration

Routes:

* `/` → Frontend
* `/api/*` → Backend

---

### 🔹 Important (Docker DNS)

```
resolver 127.0.0.11 valid=10s;
```

---

### 🔹 Streaming (HLS)

```
proxy_buffering off;
proxy_request_buffering off;
chunked_transfer_encoding off;
```

---

## 🔁 API Usage (Frontend)

❌ Do NOT use:

```js
http://localhost:8000
```

✔ Use:

```js
fetch("/api/epg")
fetch("/api/proxy?...")
```

---

## 🎥 Streaming Proxy

Example:

```
/api/proxy?url=<STREAM_URL>&referer=<REFERER>
```

---

## 🚀 Deploy on CasaOS

### 🔹 Step 1 — Clone repo

```bash
git clone https://github.com/YOUR_USERNAME/tv-app.git
cd tv-app
```

---

### 🔹 Step 2 — (Optional) Use prebuilt images

Edit `docker-compose.yml`:

```yaml
frontend:
  image: YOUR_DOCKERHUB/tv-app-frontend

backend:
  image: YOUR_DOCKERHUB/tv-app-backend

nginx:
  image: YOUR_DOCKERHUB/tv-app-nginx
```

---

### 🔹 Step 3 — Run

```bash
docker compose up -d
```

---

### 🔹 Step 4 — Open

http://YOUR_SERVER_IP:8001

---

### 🔹 Scheduler on CasaOS

The `backend-scheduler` service starts automatically with Docker Compose.

It runs the refresh jobs once after install/startup, then:

* EPG once every 24 hours
* VOD recent once every 12 hours

Recommended CasaOS persistent paths:

```env
BACKEND_CACHE_DIR=/DATA/AppData/tv-app/backend-cache
NGINX_CACHE_DIR=/DATA/AppData/tv-app/nginx-cache
```

Optional custom intervals:

```env
EPG_INTERVAL_SECONDS=86400
VOD_RECENT_INTERVAL_SECONDS=43200
```

Check logs:

```bash
docker compose logs -f backend-scheduler
```

---

## ⚠️ Troubleshooting

### ❗ Port not working

```bash
docker ps
```

---

### ❗ Proxy errors

```bash
docker logs nginx
docker logs backend
```

---

### ❗ Wrong API URL

Make sure frontend uses:

```js
/api/*
```

---

### ❗ Streaming not working

* Check `/api/proxy`
* Ensure nginx buffering is disabled
* Verify m3u8 source

---

### ❗ Changes not applied

```bash
docker compose build --no-cache
docker compose up -d
```

---

## 💡 Notes

* Backend uses `ROOT_PATH=/api`
* Nginx is a custom Docker image (not mounted config)
* `backend/cache/` is runtime data and is ignored by git
* All traffic goes through nginx
* No direct backend exposure
* Works locally and in production

---

## 👨‍💻 Author
Vitaly Thirulnikov
