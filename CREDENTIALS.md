# 🔐 CREDENTIALS & CONFIGURATION

## DATABASE (PostgreSQL)

### Local Database (Mac Testing)
- **Database Name:** dashboard_db
- **Database User:** dashboard_user
- **Database Password:** test_password_123
- **Host:** localhost
- **Port:** 5432

### Production Database (Windows - akan diupdate nanti)
- **Database Name:** dashboard_db
- **Database User:** dashboard_user
- **Database Password:** [AKAN DIUPDATE SAAT SETUP WINDOWS]
- **Host:** localhost
- **Port:** 5432

## BACKEND (.env)

### Local (.env di Mac)
```
DB_USER=dashboard_user
DB_PASSWORD=test_password_123
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dashboard_db

PORT=5000
NODE_ENV=development

JWT_SECRET=dev_secret_key_change_later
JWT_EXPIRE=7d

FRONTEND_URL=http://localhost:3000
```

### Production (.env di Windows - AKAN DIUPDATE)
```
DB_USER=dashboard_user
DB_PASSWORD=[STRONG_PASSWORD]
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dashboard_db

PORT=5000
NODE_ENV=production

JWT_SECRET=[GENERATE_STRONG_SECRET]
JWT_EXPIRE=30d

FRONTEND_URL=http://localhost:3000
```

## GIT REPOSITORY

- Repository URL: [AKAN DIUPDATE NANTI]
- Branch: main (development), production (for Windows)

## LOGIN CREDENTIALS (Demo)

### Backend API
- Username: admin
- Password: admin123
- Role: admin

## NOTES

- ⚠️ JANGAN push .env file ke GitHub!
- ⚠️ Untuk production, generate strong password & JWT secret
- ⚠️ Ganti semua test passwords sebelum production

## LAST UPDATED
- Created: 2026-03-10
- Last Update: 2026-03-10

---

## HOW TO CHANGE CREDENTIALS

### Ganti Database Password (Mac)
```bash
psql postgres
ALTER USER dashboard_user WITH PASSWORD 'new_password_here';
\q
```

### Ganti Database Password (Windows - nanti)
```powershell
psql -U postgres
ALTER USER dashboard_user WITH PASSWORD 'new_password_here';
\q
```

### Ganti JWT Secret
1. Edit backend/.env
2. Ubah JWT_SECRET ke value baru
3. Restart backend service

### Ganti Login Demo Credentials
File: backend/routes/auth.js
Cari: `if (username === 'admin' && password === 'admin123')`
Ubah credentials di sini (atau setup proper authentication nanti)

