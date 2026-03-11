# Panduan Upload v0.5.1 ke GitHub & Menjalankan dari Scratch

## A. Upload ke GitHub (dari komputer yang sudah ada repo-nya)

```bash
# 1. Masuk ke folder repo kamu
cd /path/to/dashboard-cvhabil

# 2. Copy file yang berubah dari zip v0.5.1 ini ke folder repo kamu:
#    - backend/routes/invoices.js
#    - frontend/src/services/api.js
#    - frontend/src/components/InvoiceList.jsx
#    - README.md
#    - CHANGELOG.md

# 3. Stage semua perubahan
git add .

# 4. Commit
git commit -m "feat: v0.5.1 — due date reminder, trash/restore, draft autosave, universal search, HNA/item"

# 5. Push ke GitHub
git push origin main

# 6. Buat Release di GitHub:
#    - Buka repo di GitHub
#    - Klik "Releases" → "Draft a new release"
#    - Tag: v0.5.1
#    - Title: "Dashboard CV Habil v0.5.1 — Due Date, Trash & Draft"
#    - Copy isi GITHUB_RELEASE_NOTES.md ke description
#    - Upload zip: dashboard-app-cvhabil-0.5.1.zip
#    - Klik "Publish release"
```

---

## B. Setup dari Awal di Komputer Admin (Fresh Install)

### Prasyarat
- Node.js 18+ → https://nodejs.org
- PostgreSQL 15+ → https://postgresql.org/download
- Git → https://git-scm.com

### Step 1 — Clone repo

```bash
git clone https://github.com/harunarsy/dashboard-cvhabil.git
cd dashboard-cvhabil
```

Atau jika dari zip:
```bash
unzip dashboard-app-cvhabil-0.5.1.zip
cd dashboard-app-v051
```

### Step 2 — Setup database PostgreSQL

```bash
# Buka psql
psql -U postgres

# Di dalam psql:
CREATE DATABASE dashboard_db;
\c dashboard_db
\i backend/schema.sql
\q
```

### Step 3 — Setup Backend

```bash
cd backend

# Copy env
cp .env.example .env

# Edit .env sesuai komputer kamu
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=dashboard_db
# DB_USER=postgres
# DB_PASSWORD=passwordmu
# JWT_SECRET=randomstringyangpanjang
# PORT=5001
# FRONTEND_URL=http://localhost:3000

# Install dependencies
npm install

# Jalankan backend
npm run dev
# atau: node server.js
```

Backend jalan di → http://localhost:5001

> ⚠️ Saat pertama kali start, backend otomatis migrate kolom baru ke DB. Tidak perlu SQL manual.

### Step 4 — Setup Frontend

```bash
# Buka terminal baru
cd frontend

# Install dependencies
npm install

# Jalankan frontend
npm start
```

Frontend jalan di → http://localhost:3000

### Step 5 — Login

```
URL:      http://localhost:3000
Username: admin
Password: admin123
```

---

## C. Update dari v0.5.0 ke v0.5.1 (sudah punya instalasi)

```bash
# 1. Pull latest (kalau pakai git)
git pull origin main

# 2. Restart backend (auto-migrate DB)
cd backend
npm run dev

# 3. Refresh frontend (kalau sudah running, ctrl+c lalu start lagi)
cd frontend
npm start
```

Tidak ada SQL migration manual yang perlu dijalankan.

---

## D. Menjalankan Production (kalau mau deploy)

```bash
# Build frontend
cd frontend
npm run build

# Serve static (pakai serve atau nginx)
npx serve -s build -l 3000

# Backend production mode
cd backend
NODE_ENV=production node server.js
```
