# Dashboard CV Habil

A real-time business dashboard for managing invoices, orders, inventory, and financials.

## Tech Stack

- **Backend:** Node.js + Express 5.x
- **Frontend:** React 19 + Tailwind CSS
- **Database:** PostgreSQL 15
- **Real-time:** Socket.io
- **Auth:** JWT

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- npm or yarn

### 1. Clone & Setup

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

Default backend runs on **http://localhost:5001**

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
PORT=5001
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
