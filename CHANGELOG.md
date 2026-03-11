# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
