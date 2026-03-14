# 🧠 HABIL SUPERAPP — Source of Truth
> **Current Version**: `v1.3.18-stable`  
> **Last Modified**: 2026-03-14
> **VERSI SISTEM**: v1.3.18-stable

---

## 1. SYSTEM OVERVIEW

**Nama Sistem:** HABIL SUPERAPP  
**Core Identity:** Real-time business dashboard (Invoice, Orders, Inventory, Financials).  
**Design Language:** Apple Human Interface Guidelines (HIG) — Premium, minimalis, dan responsif.

### Tech Stack

- **Frontend:** React 19 (Vercel)
- **Backend:** Node.js + Express 5.x (Vercel)
- **Database:** PostgreSQL 17 (Neon.tech - Singapore Region)
- **Real-time:** Socket.io
- **Auth:** JWT (15m Session)

### Production URLs

- **Frontend:** [https://habil-dashboard.vercel.app](https://habil-dashboard.vercel.app)
- **Backend:** [https://habil-backend.vercel.app/api](https://habil-backend.vercel.app/api)

---

## 2. MASTER FRAMEWORK & SOP

### 🛡️ Core Protocols (Priority #1)

1. **Port 6543 (POOLER)**: Wajib menggunakan Port 6543 untuk koneksi Supabase di lingkungan IPv4 (Session Pooler) guna menghindari isu kompatibilitas DNS/IPv4.
2. **Database S.O.T**: Database PostgreSQL adalah sumber kebenaran utama. Dokumen PDF bersifat pelengkap dan bisa di-generate ulang kapan saja dari database.
3. **Audit Versi Global**: Setiap rilis, lakukan `grep` global untuk memastikan label versi di seluruh komponen (Login, Dashboard, Footer) sinkron dengan CHANGELOG.md.
4. **Automated Error Logging**: Jika menemukan error kritikal (misal: "Relation missing"), Agent **wajib** mencatat temuan ke `FEEDBACK_LOG.md` sebelum melakukan perbaikan.
5. **Mandatory IDE Extensions**: Untuk auditability & stabilitas, pastikan ekstensi **ESLint**, **markdownlint**, **Git History**, dan **SQLTools (PostgreSQL)** aktif di lingkungan development.

### [AUTO-VERSIONING SOP]

- **Shutdown Procedure**: Setiap kali prosedur Shutdown dijalankan atau berganti sesi, Agent wajib mengecek versi terakhir di CHANGELOG.md.
- **Auto-Bump (SemVer)**: Naikkan versi secara otomatis sesuai aturan SemVer (Major.Minor.Patch).
- **Global Grep-Replace**: Lakukan penggantian versi lama ke baru di seluruh UI (`Login.jsx`, `Dashboard.jsx`, `index.js`, dan file dokumentasi lainnya).

## 👥 Roles & Access Control

- **Direktur (Owner)**: Akses penuh ke modul sensitif (Buku Besar, Finansial, Payroll).
- **Admin**: Operasional harian (Stok, Nota, Toko Online). Akses Buku Besar **DILARANG**.
- **Shared Account UX**: Popup rilis ("Apa yang Baru") harus muncul setiap login (trigger on mount) karena satu akun dipakai oleh banyak operator (Harun, Fivin, Ferry).

---

## 3. [INCIDENT RECAP] (Feedback Loop)

### ⚠️ Top 5 Recent Critical Incidents

1. **Database Migration Connection Error (v1.3.9)**: Gagal koneksi ke Supabase pooler (Error: "Tenant not found"). Diselesaikan dengan identifikasi cluster yang tepat (`aws-1` vs `aws-0`) dan penggunaan port `5432` secara langsung.
2. **Infrastructure Switch (Supabase -> Neon)**: Migrasi seluruh data operasional ke Neon.tech untuk mengatasi keterbatasan performa Supabase Free Tier (v1.3.9).
3. **Deep Data Parity (v1.3.11)**: Penemuan data kosong pada tabel `employees`, `products`, dan `bug_reports` di Neon setelah migrasi awal. Diselesaikan dengan `deep_migrate.js` yang melakukan iterasi baris demi baris dan audit parity 100%.
4. **Database Schema Mismatch (Production)**: Kegagalan simpan tugas (Error 500) karena tertinggalnya script migrasi tabel `tasks`. Diselesaikan dengan iterasi eksekusi DDL via endpoint Vercel sementara (v1.3.6).
4. **Database Reliability**: Konsolidasi connection pool ke *shared config* untuk mengatasi "MaxClients reached" (v1.3.3).
5. **Optimasi Kanban & Layout**: Implementasi fitur Pro (PIC Assignment, Trash, edit, history).

---

## 4. FUTURE ROADMAP (Prioritas Pengembangan)

### 🔴 High Priority

- **Bcrypt Security**: Migrasi password ke salted hashing untuk keamanan level-enterprise.
- **Reporting Engine**: Export laporan bulanan ke Excel (.xlsx) dan PDF profesional dengan branding Habil.
- **Master Data UI**: Modul terpadu untuk management Produk & Distributor (Inline Edit/Delete).

### 🟡 Medium Priority

- **Finance Module**: Expense tracking otomatis dan Dashboard Hutang-Piutang.
- **Advanced Inventory**: QR/Barcode scanner integration & Predictive Restocking alerts.

### 🟢 Low Priority (Future)

- **TypeScript Migration**: Full type safety untuk seluruh codebase.
- **Dockerization**: Standarisasi env development via Container.

---

## 🛠️ MAINTENANCE COMMANDS

- **Verifikasi DB**: `node scripts/check-db.js`
- **Cloud Sync**: `./scripts/sync-to-local.sh` (Kloning data Supabase ke lokal)
- **Migration**: `node scripts/run_production_migration.js`

---
*Dokumen Master Brain ini menggantikan README, Master Framework, dan Roadmap lama.*
*Terakhir diupdate berdasarkan prosedur Auto-Versioning v1.3.16-stable*
