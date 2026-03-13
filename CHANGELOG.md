# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
## [1.2.1] - 2026-03-13

### Fixed
- **Lint & Build Fix**: Memperbaiki fungsi `closeReleaseModal` yang tidak terdefinisi di `Dashboard.jsx`, yang sebelumnya mencegah build produksi di Vercel.

### Added
- **Auto-Release Popup**: Menambahkan modal "APA YANG BARU?" yang merangkum fitur v1.1.9 & v1.2.0. Modal ini dikonfigurasi untuk tampil setiap kali user login ke dashboard.

### Optimized
- **Pre-Deployment Audit**: Memastikan konsistensi routing koneksi API menuju domain Vercel/Supabase Production dan menyesuaikan setup CORS.
- **Merge & Deployment**: Branch `dev` resmi digabungkan ke `main` dan deploy otomatis ke Vercel production server.

## [1.2.0] - 2026-03-13

### Added
- **SP Module Mastery**: Enhanced `distributors` table with `short_code`, `salesman_name`, and `salesman_phone`. Added a Many-to-Many pivot table `product_distributors`.
- **Master Distributor UI**: Added an inline edit modal inside the Purchase Orders form to update salesman details directly.
- **SP Editor Enhancements**: Added a PIC Dropdown for "Harun Al Rasyid" and "Fivin Soehaeni". Salesman contacts are dynamically displayed based on the selected Distributor.
- **A6 Print Layout for SP**: Developed a custom "Blue Area" PDF generation module (`generateSPPDF.js`) specifically sized for A6 format, featuring a centered header, tabular item list, and designated stamp/signature footer.

## [1.1.9] - 2026-03-13

### Changed
- **Branding & Identity**: Updated app-wide text references from "CV Habil Business System" to **"HABIL SUPERAPP"**. Implemented dynamic tab titles and replaced the favicon.

### Added
- **Document Counters Engine**: Introduced `document_counters` database table for SP, Nota, and TT to deprecate spreadsheet-based numbering.
- **Migration Protocol UI**: Added a System Controls section in Print Settings to Lock/Unlock automated document numbering, allowing manual input during the transition phase.

## [1.1.8] - 2026-03-13

### Optimized
- **Documentation Consolidation**: Menyatukan seluruh riwayat teknis dari `walkthrough.md` ke dalam `CHANGELOG.md` sebagai *Single Source of Truth*.
- **Database Performance**: Menambahkan index pada `product_master(name)` untuk mempercepat pencarian produk.
- **Security**: Mengamankan log API frontend agar tidak membocorkan URL produksi di konsol browser.

### Fixed
- **Startup Automation**: Integrasi `check-db.js` ke dalam `npm run dev` agar verifikasi database berjalan setiap startup.

## [1.1.7] - 2026-03-13

### Optimized
- **AI Efficiency Rules**: Mengadopsi protokol koding baru (Port 6543, Dynamic API URL, Dev Branch isolation).
- **Dynamic API Endpoint**: Frontend sekarang otomatis mendeteksi apakah berjalan di `localhost` (port 5002) atau production tanpa perlu ganti file `.env` manual.
- **Improved Connection SOP**: Mengutamakan Port 6543 untuk Supabase guna menghindari limitasi IPv4 DNS.

## [1.1.6] - 2026-03-12

### Added
- **Local Data Sync Utility**: Menambahkan `backend/scripts/sync-to-local.sh` untuk melakukan kloning data dari Supabase ke environment lokal MacBook.
- **Auto-Restore from Backup**: Melakukan restorasi data otomatis dari `cloud_migration_backup.sql` untuk memastikan login (`admin` / `admin123`) dan data dashboard (37+ produk) langsung aktif di lokal.

## [1.1.5] - 2026-03-12

### Added
- **Cloud Database Bridge**: Memungkinkan environment lokal untuk terhubung langsung ke database Supabase via `DATABASE_URL`.
- **Database Diagnostic Script**: Menambahkan `backend/scripts/check-db.js` untuk memverifikasi koneksi database (Lokal vs Cloud) secara instan.

### Changed
- **Improved DB Logging**: Backend sekarang memberikan log yang jelas saat mencoba connect ke Lokal atau Cloud, dengan tips perbaikan jika koneksi gagal.

## [1.1.4] - 2026-03-12

### Added
- **Testing & QA (Skeleton Loading)**: Implementasi unit testing untuk komponen `Skeleton.jsx` dan integration testing untuk `Dashboard` serta `SalesOrderList`.
- **Test Infrastructure**: Menambahkan `setupTests.js` dengan polyfills untuk JSDOM (`TextEncoder`, `TextDecoder`) agar mendukung library eksternal dalam testing.

### Fixed
- **Dashboard Imports**: Memperbaiki missing React imports di `Dashboard.jsx` yang menyebabkan kegagalan rendering di environment testing.

## [1.1.3] - 2026-03-12

### Added
- **Skeleton Loading**: Implementasi visual skeleton loading di seluruh modul utama (Dashboard, Sales, Inventory, Invoices, Purchase Orders, dan Online Store) untuk meningkatkan UX saat pengambilan data.
- **Reusable Skeleton Component**: Komponen `Skeleton.jsx` baru yang fleksibel untuk berbagai bentuk dan ukuran placeholder.

## [1.1.2] - 2026-03-12

### Added
- **Dashboard Notes**: Menambahkan modul "Catatan Developer" di dashboard untuk memfasilitasi feedback dan laporan bug dari user.
- **Region Migration**: Selesai memindahkan infrastruktur (Vercel & Supabase) ke region **Singapore** untuk akses data instan.

### Changed
- **Version Sync**: Standarisasi versi v1.1.2 di halaman Login, Dashboard, dan Changelog untuk konsistensi sistem.

## [1.1.1] - 2026-03-12

### Added
- **Sales Order Filters**: Added Month and Year intuitive select filters on the `SalesOrderList` page.
- **Payment Method Integration**: Added `QRIS`, `Transfer`, and `Tunai` payment options. Integrated the persistence of these options directly to the database via `payment_method` and `payment_details`.
- **UI/UX Sales Revamp**: Implemented a modern table design for Sales Orders, including dynamic "Draft/Final" and "Metode Pembayaran" badges.

### Fixed
- **PDF Generation Layout**: Forced A5 and A6 paper sizes to render in *Landscape* across 'Nota Penjualan' and 'Tanda Terima' types. Recalculated coordinates to prevent text overlapping in the header.
- **Save/Update Error 500**: Fixed database schema mismatch on `dashboard_dev` preventing successful saving of the new payment method features.
- **Month Filter Bug**: Fixed an issue where selecting "Semua Bulan" dynamically returned an empty array on the frontend UI.

## [1.1.0] - 2026-03-12

### Added
- **Dynamic Dashboard Stats API**: Implemented `/api/dashboard/stats` to fetch real-time analytics from the database instead of using mocked UI values.
- **Master Data Seeding**: Successfully migrated 76 rows of core data from legacy Excel sheets (`SEED_MIGRATION_HABIL.sql`) encompassing Distributors, Customes, and Product Masters.

## [1.0.1] - 2026-03-12

### Added
- **Dashboard UI Overhaul**: New modern layout with quick stats cards ("Akses Cepat").
- **Release History Modal**: Interactive popup showing changelog and roadmap history.
- **Cache Busting**: Version subtext updated to `v1.0.1` to force browser cache refresh of environment variables.

### Fixed
- **Database Connectivity**: Resolved "Login Failed" timeout issue by aligning frontend API ports with backend `dev` branch ports (5001 -> 5002).
- **React Environment Stubbornness**: Explicitly hardcoded fallback port in `api.js` to prevent stale caching of old server ports.

### Changed
- **Security Enhancements**: Removed 1-click "Direktur" and "Admin" demo login buttons from production/release UI.
- **Session Timeout**: JWT expiration shortened to `15m` for better session security and data collision prevention.

---

## [1.0.0] - 2026-03-12

### Added
- **Inventory Module**: Full FEFO (First Expired First Out) logic, stock opname, and low-stock alerts.
- **Purchase Order (SP)**: CRUD for purchase orders with automated PO numbers and inventory receive integration.
- **Online Store Integration**: CSV importers for Shopee and TikTok orders with profit calculation.
- **General Ledger (Buku Besar)**: Financial journaling with debit/credit and monthly category summaries.
- **Universal Search**: Sidebar search across modules.

---

## [0.6.3] - 2026-03-11
- ESLint fixes, code decluttering, and DB branch isolation.
