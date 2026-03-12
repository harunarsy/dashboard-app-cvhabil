# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
