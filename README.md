# Dashboard CV Habil

A real-time business dashboard for managing invoices, orders, inventory, and financials.

## Tech Stack

- **Frontend:** React 19 (Deployed on Vercel)
- **Backend:** Node.js + Express 5.x (Deployed on Vercel)
- **Database:** PostgreSQL 15 (Supabase - Singapore Region)
- **Real-time:** Socket.io
- **Auth:** JWT (15m Session)

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- npm or yarn

### 1. Cloud-First Deployment
The application is optimized for cloud deployment using Vercel (Frontend/Backend) and Supabase (Database).

**Production URLs:**
- **Frontend:** [https://habil-dashboard.vercel.app](https://habil-dashboard.vercel.app)
- **Backend:** [https://habil-backend.vercel.app/api](https://habil-backend.vercel.app/api)

### 2. Local Development (Optional)
```bash
git clone https://github.com/harunarsy/dashboard-app-cvhabil.git
cd dashboard-app-cvhabil
```

### 2. Database Setup

```bash
psql -U postgres
CREATE DATABASE dashboard_db;
\c dashboard_db
\i backend/schema.sql
\q
```

### 3. Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your DB credentials
npm install
npm run dev
```

Default backend runs on **http://localhost:5002** (or 5001 depending on branch)

### 4. Frontend

```bash
cd frontend
npm install
npm start
```

Default frontend runs on **http://localhost:3000**

### 5. Login

```
Username: admin
Password: admin123
```

## Environment Variables

```env
# backend/.env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dashboard_db
DB_USER=postgres
DB_PASSWORD=yourpassword
JWT_SECRET=your_jwt_secret
PORT=5002
FRONTEND_URL=http://localhost:3000
```

## Updating from a Previous Version

If you're updating from v0.3.x or v0.5.0, the database schema will **auto-migrate** when the backend starts — no manual SQL needed. Just pull the latest code and restart.

```bash
git pull
cd backend && npm install
npm run dev
```

## Release History

| Version | Date | Highlights |
|---|---|---|
| v1.1.8 | Mar 13, 2026 | **v1.1.8 Cleanup**: Logic "Smart API" masking, Automated DB Health Check, Performance Indexing |
| v1.1.7 | Mar 13, 2026 | **v1.1.7 Optimization**: Port 6543 standardization, Dynamic URL detection, Efficiency Rules |
| v1.1.6 | Mar 12, 2026 | **v1.1.6 Data Sync**: Auto-restore from backup, local data cloning from Supabase |
| v1.1.3 | Mar 12, 2026 | **v1.1.3 UX**: Skeleton Loading (visual feedback) across all major modules |
| v1.1.2 | Mar 12, 2026 | **v1.1.2 Infrastructure**: Singapore Region migration, Dashboard Notes/Feedback system |
| v1.0.1 | Mar 12, 2026 | **v1.0.1 Hotfix**: Login port alignment, Dashboard UI overhaul, Auto-logout logic, Release History Modal |
| v1.0.0 | Mar 12, 2026 | **v1.0 Official Release**: Inventory (FEFO), Surat Pesanan, Toko Online (Shopee/TikTok), Buku Besar |
| v0.6.3 | Mar 11, 2026 | ESLint fixes, declutter, DB branch isolation |
| v0.6.2 | Mar 11, 2026 | Ongoing updates and feature enhancements |
| v0.5.1 | Mar 11, 2026 | Due date reminders, trash/restore, draft autosave, universal search, HNA/item |
| v0.5.0 | Mar 11, 2026 | MasterSelect for distributor & product, products_master DB |
| v0.4.0 | Mar 11, 2026 | Full invoice form redesign, per-item calculations, PPN formula |
| v0.3.1 | Mar 11, 2026 | Fix add distributor bug, distributors table |
| v0.3.0 | Mar 11, 2026 | Invoice Management System |
| v0.2.2 | Mar 11, 2026 | Final Apple HIG design |
| v0.2.1 | Mar 11, 2026 | Sidebar toggle & bug fixes |
| v0.2.0 | Mar 11, 2026 | Apple HIG design polish |
| v0.1.0 | Mar 10, 2026 | MVP release |
