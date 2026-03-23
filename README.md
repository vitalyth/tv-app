# 📺 TV App (Frontend + Backend + Nginx)

Full-stack streaming application with:

- ⚛️ Next.js (Frontend)
- ⚡ FastAPI (Backend)
- 🌐 Nginx (Reverse Proxy)
- 🐳 Docker (Deployment)

---

## 🚀 Features

- Stream proxy (`/api/proxy`)
- EPG support (`/api/epg`)
- Unified port (8001)
- No CORS issues
- Works locally and in production (CasaOS)

---

## 📁 Project Structure

```
tv-app/
├── frontend/        # Next.js app
├── backend/         # FastAPI app
├── nginx.conf       # Reverse proxy config
├── docker-compose.yml
└── README.md
```

---

## 🧪 Run Locally (Development)

### 🔹 Backend

```bash
cd backend

python -m venv venv
source venv/bin/activate  # Mac/Linux

pip install .

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
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

frontend/.env.local

```
NEXT_PUBLIC_API_BASE=http://localhost:8000
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

## ⚙️ Environment Variables

### Backend (docker-compose)

```yaml
environment:
  - ROOT_PATH=/api
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

- `/` → Frontend
- `/api/*` → Backend

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

/api/proxy?url=<STREAM_URL>&referer=<REFERER>

---

## 🚀 Deploy on CasaOS

### 🔹 Step 1 — Clone repo

```bash
git clone https://github.com/YOUR_USERNAME/tv-app.git
cd tv-app
```

---

### 🔹 Step 2 — Run

```bash
docker compose up -d --build
```

---

### 🔹 Step 3 — Open

http://YOUR_SERVER_IP:8001

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

### ❗ Changes not applied

```bash
docker compose build --no-cache
docker compose up -d
```

---

## 💡 Notes

- Backend uses `ROOT_PATH=/api`
- Nginx forwards correct host and port using `$http_host`
- Works locally and in production

---

## 👨‍💻 Author

Vitaly Tserulnikov
