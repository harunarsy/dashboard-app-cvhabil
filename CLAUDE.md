# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## System Identity

**HABIL SUPERAPP** — v1.14.0-stable line. Real-time business dashboard for invoice, orders, inventory, and financials. Design language: Stripe Modern premium SaaS, token-driven via `frontend/src/constants/ui.js`.

---

## Cara kerja di project ini

**Opus = mandor, Sonnet/Haiku = pelaksana.** Untuk perintah apa pun — termasuk sekadar
pengecekan — pecah tugasnya lalu delegasikan ke subagent murah (`model: "haiku"` untuk kerja
mekanis, `"sonnet"` untuk yang butuh penilaian). Opus hanya memecah tugas, memutuskan,
**memverifikasi hasil subagent**, dan bicara ke Harun. Jangan teruskan laporan subagent mentah —
selalu cek sendiri ke kode dulu. Jangan pakai Fable 5 (butuh kredit terpisah).

Bagi tugas subagent **per berkas, bukan per temuan** — dua agent tidak boleh memegang file yang
sama. Tiap subagent dilarang commit/push, dilarang menyentuh database, dan dilarang menjalankan
build/test; mandor yang menjalankannya sekali di akhir.

**`ACTION_LOG.md` di root = status pekerjaan berjalan.** Baca duluan kalau sesi terputus, dan
perbarui tiap kali ada tahap yang berubah.

---

## Commands

```bash
# Backend (local)
cd backend && npm run dev        # nodemon + DB check, port 5001

# Frontend (local)
cd frontend && npm start         # CRA dev server, port 3000

# DB utilities
node backend/scripts/check-db.js
node backend/scripts/run_production_migration.js

# Frontend tests
cd frontend && npm test
cd frontend && npm test -- --testPathPattern=SalesOrderList
```

**Port note**: backend runs on `5001` everywhere — `server.js` (`PORT || 5001`), `docker-compose.yml`, and the `api.js` dev fallback all agree. The old 5006 mismatch is resolved; no adjustment needed.

---

## Architecture

### Stack
- **Frontend**: React 19, CRA, React Router v7, Axios, Socket.io-client, Recharts, jsPDF
- **Backend**: Node.js + Express 5, `pg` (PostgreSQL pool), Socket.io, JWT auth
- **DB**: PostgreSQL on Neon.tech (Singapore). Prod uses `DATABASE_URL`; local uses individual `DB_*` env vars.
- **Deploy**: Frontend → Vercel (`habil-dashboard.vercel.app`). Backend → Vercel (`habil-backend.vercel.app`).

### Backend patterns
- **Schema migration**: Each route file calls `ensureSchema()` on startup via `ALTER TABLE IF NOT EXISTS`. No migration runner needed — schema evolves in-place.
- **Auth**: All routes use `middleware/auth.js` (JWT Bearer). Token decoded client-side for user state; 4-hour session (default `JWT_EXPIRE`, owner decision 19 Jun 2026).
- **Real-time**: `global.io` emits events (`invoiceCreated`, `invoiceUpdated`, `invoiceDeleted`, etc.) after mutations.
- **Env loading**: `server.js` auto-loads `.env.dev` if on `dev` git branch, else `.env`.

### Frontend patterns
- **Auth state**: `AuthContext` reads JWT from `localStorage`. On 401 response, Axios interceptor clears token and redirects to `/login`.
- **API layer**: All calls go through `src/services/api.js`. Each domain has a named export (`invoicesAPI`, `salesAPI`, `inventoryAPI`, etc.).
- **Route → Component**: Single-page app. Protected routes wrap every page with `Sidebar` + layout.

### Key data flows
1. **Faktur masukan (Invoice)** → on save, auto-inserts rows into `inventory_batches` + `inventory_mutations` (type: `'in'`).
2. **Nota penjualan (Sales)** → on save, deducts stock from `inventory_batches` via FEFO (earliest `expired_date` first), inserts `inventory_mutations` (type: `'out'`).
3. **Inventory** → `product_master` + `inventory_batches` (per-batch qty/HNA) + `inventory_mutations` (audit trail).
4. **Pricing on nota**: use `GET /api/inventory/fefo-hna/:productId` to get HNA from current FEFO batch.

### Domain modules
| Route prefix | File | Purpose |
|---|---|---|
| `/api/invoices` | `routes/invoices.js` | Faktur masukan, items, audit log, draft |
| `/api/sales` | `routes/sales.js` | Nota penjualan (sales orders) |
| `/api/inventory` | `routes/inventory.js` | Stock batches, mutations, opname, FEFO |
| `/api/purchase-orders` | `routes/purchaseOrders.js` | Surat pesanan (PO) |
| `/api/distributors` | `routes/distributors.js` | Distributor master list |
| `/api/products` | `routes/products.js` | Product name list (lightweight) |
| `/api/ledger` | `routes/ledger.js` | Buku besar (general ledger) |
| `/api/customers` | `routes/customers.js` | Customer master |
| `/api/tasks` | `routes/tasks.js` | Kanban tasks |

---

## Critical Protocols

### Auto-Versioning (MANDATORY before any commit)
Version must be consistent across **all** of these files:
- `frontend/src/components/Login.jsx`
- `frontend/src/components/Sidebar.jsx`
- `frontend/src/components/Dashboard.jsx` (badge + release modal RELEASES array)
- `frontend/src/index.js`
- `CHANGELOG.md`
- `SUPERAPP_BRAIN.md`

Verify with:
```bash
grep -rn "v1\.14\." frontend/src --include="*.jsx" --include="*.js"
```
If any file differs → fix before committing.

### Release modal storage
Use `sessionStorage`, key: `habil_release_seen_${VERSION.replace(/\./g, '_')}`.
**Never `localStorage`** — multiple operators share one account (Harun, Fivin, Ferry); popup must appear on every login.

### Roles
- **Direktur**: Full access including Buku Besar / financials.
- **Admin**: Daily ops (Stok, Nota, Toko Online). Buku Besar access **forbidden**.
