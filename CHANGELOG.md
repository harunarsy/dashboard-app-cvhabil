# Changelog HABIL SUPERAPP

Semua perubahan signifikan pada Habil SuperApp akan dicatat di file ini.

## [v1.3.28-stable] - 2026-03-16
### Changed
- **UI/UX — Mobile Sidebar**: Redesign ke pattern **Modal Navigation Drawer** yang lebih premium: lebar 80% (max 300px), scrim/backdrop gelap (0.5) + blur, rounded ending edge, shadow lebih dalam, animasi slide+fade 280ms.
- **UX — Drawer Behavior**: Klik backdrop/klik menu item auto-close, swipe kiri untuk tutup, focus trap + Escape untuk tutup, dan prevent body scroll saat drawer terbuka.

## [v1.3.27-stable] - 2026-03-15
### Fixed
- **Bug — Section "Kepada Yth" hilang total di PDF Nota**: Root cause: tabel PDF punya `startY` fixed `margin+30` sehingga menimpa blok customer. Tabel sekarang mulai setelah blok customer (`addressY + padding`). Nama customer selalu tampil; alamat/telepon tampil hanya jika ada di DB.

## [v1.3.26-stable] - 2026-03-15
### Fixed
- **Bug — Alamat & telepon customer tidak muncul di PDF Nota**: API GET /api/sales sekarang JOIN customers untuk customer_phone; kolom customer_phone ditambah di sales_orders. Form Nota punya field Telepon, auto-fill dari customer terpilih. generateNotaPDF render address/phone hanya bila ada data.

## [v1.3.25-stable] - 2026-03-15
### Fixed
- **Bug — Alamat & telepon CV Habil tampil "-" di PDF Nota**: Normalisasi field mapping (shop_name→company_name, footer→footer_text). Hanya render baris alamat/telepon bila ada data; kosong di DB = baris tidak muncul. Refetch print_settings saat buka modal cetak dan sebelum generate PDF.

## [v1.3.24-stable] - 2026-03-15
### Fixed
- **Bug — Data Pengaturan (print_settings) hilang setelah refresh**: GET endpoint sekarang menormalisasi `setting_value` (parse JSON jika string dari DB/driver). BULK update memastikan nilai di-`JSON.stringify` sebelum INSERT. Data Pengaturan kini persisten setelah refresh, login ulang, atau buka dari device lain.

## [v1.3.23-stable] - 2026-03-15
### Fixed
- **Bug #1 — Header PDF SP**: Tampilkan `settings.address` dan `settings.phone` di bawah nama perusahaan, menggunakan `-` saat kosong.
- **Bug #2 — Audit log Invoice**: Render per-field diff `field: lama → baru` dengan visual `lama` merah strikethrough, `baru` hijau bold; fallback aman jika `snapshot` null/undefined.

## [v1.3.22-stable] - 2026-03-15
### Fixed
- **Bug #1 — Login Version Text**: Perbaiki kontras teks versi di halaman Login dari `text-white/40` menjadi `text-gray-700` agar terbaca jelas tanpa di-highlight.
- **Bug #2 — Release Modal Session**: Modal "Apa yang Baru" kini muncul otomatis setiap login baru menggunakan sessionStorage berbasis versi terbaru. Gunakan `habil_release_seen_v${version}` key untuk memastikan modal muncul ketika ada versi upgrade.

### Added
- **PROTOKOL A — Auto-Versioning**: Dokumentasi yang wajib dicek sebelum commit — include grep-command untuk memastikan versi file sinkron di seluruh frontend.
- **PROTOKOL B — Token Efficiency**: SOP untuk efisiensi token, baca file per range 100 baris, jangan dump seluruh file, dan progress ringkas.

## [v1.3.21-stable] - 2026-03-15
### Added
- **Fitur #1 — HNA/HPP per Batch**: Tambahkan field HNA/HPP di form Stok Masuk. Nilai default diambil dari master produk, bisa diubah manual per batch. Saat pilih produk di Nota Penjualan, HPP auto-fill dari batch FEFO (expired date paling dekat).
  - Kolom `hna` di tabel `inventory_batches` untuk menyimpan HPP per batch
  - Field HNA di form Stok Masuk dengan auto-fill dari product master
  - Endpoint `/inventory/fefo-hna/:productId` untuk get HPP dari batch FEFO
  - Auto-fill HPP di Nota Penjualan saat produk dipilih

- **Fitur #2 — Standarisasi Dropdown ke MasterSelect**: Refactoring semua dropdown master data ke komponen `MasterSelect` yang sama:
  - Dropdown Produk di Stok Masuk (InventoryDashboard): search + edit + hapus + tambah baru
  - Dropdown Distributor di Surat Pesanan (PurchaseOrderList): search + edit + hapus + tambah baru
  - Dropdown Customer di Nota Penjualan (SalesOrderList): sudah menggunakan MasterSelect sejak v1.3.20
  - Semua edit dan hapus dari dropdown langsung update database
  - Konsisten menggunakan 1 shared component MasterSelect

### Changed
- **Database**: Auto-migration menambah kolom `hna` ke `inventory_batches`.
- **API**: Updated `/inventory/stock-in`, Purchase Order receive, dan Invoice create untuk handle HNA per batch.

## [v1.3.20-stable] - 2026-03-15
### Fixed
- **Bug #1 — Header PDF**: Tampilkan alamat & nomor telepon CV Habil di bawah nama perusahaan di header kiri PDF Nota Penjualan. Data diambil dari tabel `print_settings`. Jika kosong, tampilkan placeholder "-".
- **Bug #2 — Label HPP**: Tambahkan label kolom "HPP" yang jelas di form Edit Nota. Perbarui placeholder dari "HPP" menjadi "0" untuk konsistensi dengan field lain.

### Added
- **Fitur #3 — Standarisasi Dropdown Customer**: Refactoring dropdown Customer di form Nota Penjualan menggunakan komponen `MasterSelect` (sama seperti dropdown Produk). Fitur baru:
  - 🔍 Search real-time dengan keyword filtering
  - ✏️ Edit customer inline
  - 🗑️ Delete customer langsung dari dropdown
  - ➕ Tombol "+ Tambah Baru" untuk menambah customer tanpa meninggalkan form
  - Semua perubahan langsung update database via API

## [v1.3.19-stable] - 2026-03-14
### Perubahan
- **Fitur**: Tempat Sampah (Trash) untuk Task Management.
- **Backend**: API `/trash`, `/restore`, dan `/permanent` delete untuk tasks.
- **UI/UX**: Modal interaktif Tempat Sampah di papan Kanban.
- **API**: Centralized `tasksAPI` di layanan frontend.

## [v1.3.18-stable] — 2026-03-14

### Fixed
- **Settings Save Bug**: Perbaikan error "Gagal menyimpan pengaturan" dengan implementasi bulk update API dan sinkronisasi state frontend-backend.

## [v1.3.17-stable] — 2026-03-14

### Added
- **Revenue & Profit Tracking**: Tracking status pembayaran (Paid/Unpaid) pada Nota Penjualan.
- **HPP CRUD**: Input HPP kustom per item di Nota Penjualan (HPP default dari Master Produk).
- **Laba Kotor**: Card statistik baru di Dashboard untuk memantau akumulasi laba kotor dari nota lunas bulan ini.
- **Auto-fill HPP**: Otomatis menarik harga HPP (hna) saat memilih produk di form nota.

### Changed
- **Dashboard Stats**: Reorganisasi card statistik untuk menyertakan Laba Kotor.
- **Sales Order API**: Kalkulasi `gross_profit` dipindahkan ke sisi server untuk integritas data.

## [v1.3.16-stable] — 2026-03-14
### Added
- **Mobile Responsive Sidebar**: Hamburger menu untuk layar kecil dengan overlay slide-in.
- **Prompt 2 — UI/UX Standardization**:
  - **PDF Nota**: Customer address now shown below customer name in Nota Penjualan PDF.
  - **PDF SP**: Distributor address now shown in "Kepada Yth." block of Surat Pesanan PDF.
  - **Pengaturan**: Settings page restored with live split-panel document preview (real-time).
  - **Mobile Sidebar**: Hamburger menu + slide-in sidebar with backdrop overlay for screens <768px.

## [v1.3.15-stable] - 2026-03-14
### Fixed
- **Bug #1 — PDF Print Error**: Added null-safety guards (`String(val || '')`) to all `jsPDF.text()` calls in `generateNotaPDF.js` and `generateSPPDF.js`. Prevents "Invalid arguments passed to jsPDF.text" crash on A5/A6 format.
- **Bug #2 — Blank Release Notes Modal**: Expanded `typeConfig` in `Dashboard.jsx` to include `feat`, `ui`, `docs`, `changed`, `stability` types. Added safe fallback so unknown types no longer crash the modal renderer.
- **Bug #3 — Drag-to-Delete Kanban**: Added `PATCH /api/tasks/:id/soft-delete` backend endpoint. Frontend now calls soft-delete (sets `is_deleted = TRUE`) instead of non-existent DELETE route. Tasks properly disappear from board without data loss.

## [v1.3.14-stable] - 2026-03-14
### Fixed
- **Bug Reports Restoration**: Standardized `bug_reports` schema in Neon.tech by renaming `created_at` to `reported_at` and adding missing columns (`steps`, `contact`, `user_agent`). Data parity is now fully restored in the UI.
- **UI Consistency**: Updated version labels across Dashboard, Login, and Sidebar to `v1.3.14-stable`.

## [v1.3.13-stable] - 2026-03-14
### Fixed
- **Build Failure Hotfix**: Removed unused variables and imports in `PrintSettings.jsx` that were blocking Vercel deployment (CI=true).

## [v1.3.12-stable] - 2026-03-14
### Added
- **Final Parity Audit**: Confirmed 100% data integrity across all migrated tables from Supabase to Neon.tech.
- **System Shutdown**: Finalized deployment and merged to main.

## [v1.3.11-stable] - 2026-03-14
### Added
- **Full Database Parity**: Successfully migrated all operational tables from Supabase to Neon.tech.
- **Premium Skeleton Loading**: Implemented across Bugs, Customers, Ledger, Kanban, and Print Settings.
- **Deep Migration Engine**: New robust script for cross-platform data synchronization.

### Fixed
- **Parsing Errors**: Resolved syntax and import issues in `BugReports.jsx` and `PrintSettings.jsx`.
- **Data Gap**: Fixed missing records in `employees`, `products`, and `custom_orders`.

### Changed
- **UX Refinement**: Replaced all legacy loading indicators with visual placeholders.

## [v1.3.11-stable] - 2026-03-14

### Fixed
- **Deep Data Migration**: Selesai memigrasikan data tabel `invoices`, `invoice_items`, `purchase_orders`, `purchase_order_items`, dan `bug_reports` dengan data parity 100%.
- **Database Schema**: Sinkronisasi kolom `disc_cod_per_item` dan `hna_after_cod` pada tabel `invoice_items` di Neon.

### Changed
- **Versioning**: Global bump ke v1.3.11-stable untuk menandai selesainya migrasi infrastruktur penuh.

## [1.3.10-stable] - 2026-03-14

### Changed
- **Session Shutdown**: Final audit versi global dan sin*Terakhir diupdate berdasarkan prosedur Auto-Versioning v1.3.13-stable*
- **Primary Database**: Neon.tech (PostgreSQL 17)
- **Status**: Stable & Migrated
- **Documentation**: Update [SUPERAPP_BRAIN.md](SUPERAPP_BRAIN.md) dan [FEEDBACK_LOG.md](FEEDBACK_LOG.md) dengan recap migrasi database.

## [1.3.9-stable] - 2026-03-14

### Fixed

- **Database Migration**: Full data migration completion from Supabase to Neon.tech. All tables (Users, Invoices, Products, etc.) are now successfully transferred.
- **Data Consistency**: Resolved schema mismatches between old Supabase data and new Neon table structures.

### Changed

- **Infrastructure**: Officially switched to Neon.tech serverless PostgreSQL as the primary database for improved performance.

## [1.3.8-stable] - 2026-03-14

### Changed
- **Infrastructure**: Migrasi database utama dari Supabase ke Neon.tech untuk performa yang lebih tinggi.
- **Backend**: Update konfigurasi database untuk mendukung koneksi Neon serverless.

## [1.3.7-stable] - 2026-03-14

### Changed
- **SOP Maintenance**: Evaluasi insiden missing DB schema di FEEDBACK_LOG dan penutupan log.


## [1.3.6-stable] - 2026-03-14

### Fixed
- **Database**: Migrasi skema `pic` pada tabel `tasks` untuk mencegah error 500 saat Simpan Tugas.
- **Stability**: Inisialisasi ulang seluruh skema Kanban pada database cloud.

## [1.3.5-stable] - 2026-03-14

### Fixed
- **Kanban Functionality**: Memperbaiki tombol "Simpan Tugas" yang tidak responsif pada modal pembuatan dan pengeditan tugas.
- **Kanban UI Consistency**: Menambahkan opsi prioritas "High" yang sebelumnya hilang pada modal pembuatan tugas.
- **State Integrity**: Sinkronisasi pembersihan state PIC dan form setelah data berhasil disimpan ke database.

## [1.3.4-standard] - 2026-03-14

### Changed
- **Session Shutdown Audit**: Finalisasi audit versi global, sinkronisasi label sistem ke v1.3.4-standard, dan pembaharuan log insiden infrastruktur.

## [1.3.3-standard] - 2026-03-14

### Added
- **Kanban PIC Assignment**: Menambahkan field Penanggung Jawab (PIC) pada modul Manajemen Tugas menggunakan `react-select`.

### Fixed
- **Database Connection Optimization**: Konsolidasi seluruh rute API ke *shared connection pool* untuk mencegah error "MaxClientsInSessionMode".
- **Kanban Functional Fixes**: Perbaikan tombol "Simpan Tugas" yang tidak responsif dan sinkronisasi modal detail.

### Changed
- **Unified Navigation**: Mengubah label sidebar "Pengaturan Cetak" menjadi "Pengaturan" untuk cakupan fungsi yang lebih luas.
- **Global Version Sync**: Pembersihan total label versi lama (`v1.2.6`) di Dashboard dan sinkronisasi ke format v1.3.3-standard.

## [1.3.2-standard] - 2026-03-14

### Changed
- **Final Shutdown Audit**: Sinkronisasi log insiden, pembersihan dokumentasi, dan audit versi global untuk penutupan sesi yang stabil.

## [1.3.1-standard] - 2026-03-14

### Fixed
- **Invoice Filter Synchronization**: Menyatukan state filter bulan antara panel Rekap dan tabel utama untuk mencegah data yang tidak konsisten saat melakukan audit distributor.

## [1.3.0-standard] - 2026-03-14

### Added
- **Invoice Metadata Transparency**: Sekarang setiap faktur menampilkan informasi waktu input asli (timestamp database) untuk audit operasional yang lebih baik.
- **Robust HPP Engine**: Perbaikan bug HPP "0" melalui logika fallback yang lebih cerdas dan skrip migrasi data otomatis untuk record lama.

## [1.2.9-standard] - 2026-03-14

### Fixed
- **Vercel Build Stability**: Perbaikan lint error (unused variables) di `TasksKanban.jsx` yang menyebabkan build gagal saat deployment ke production.

## [1.2.8-standard] - 2026-03-14

### Changed
- **Formal Session Shutdown**: Finalisasi audit versi global dan sinkronisasi seluruh komponen UI ke state v1.2.8-standard.
- **Auto-Versioning Finalization**: Memastikan konsistensi label versi di Login, Dashboard, dan Walkthrough sebelum penutupan sesi.

## [1.2.7-standard] - 2026-03-14

### Added
- **Advanced Kanban Features**: Implementasi modal **Detail Tugas**, fitur **History Log** per tugas, dan area **Trash (Soft-Delete)**.
- **Improved Task UX**: Scroll internal di setiap kolom Kanban (max 3 kartu terlihat) untuk menjaga kerapian Dashboard.

### Changed
- **Dashboard Priority Layout**: Memindahkan modul **Manajemen Tugas** ke posisi paling atas Dashboard sebagai prioritas utama.
- **Popup Logic Optimization**: "Release Notes" sekarang hanya muncul sekali per sesi (session-based) melalui `sessionStorage`.
- **UI Refinement**: Compact "Akses Cepat" dan pengurangan label versi redundan.
- **Global Audit**: Penyelarasan versi v1.2.7-standard di seluruh sistem.

## [1.2.6-standard] - 2026-03-13

### Changed
- **Kanban Board Integration**: Penyatuan modul tugas langsung ke dalam Dashboard utama.
- **UI Refresh**: Catatan Developer dipindah ke popup dan pembersihan sidebar dari link `/tasks`.


## [1.2.5-hotfix-2] - 2026-03-13

### Changed
- **Global Version Synchronization**: Penyelarasan seluruh label versi menjadi v1.2.5-hotfix-2 di seluruh komponen UI (Login, Dashboard, Footer) dan dokumentasi master.
- **Consistency Fix**: Memastikan riwayat changelog di dashboard sinkron dengan dokumentasi fisik.

## [1.2.4] - 2026-03-13

### Changed
- **Session Shutdown**: Menutup sesi pengembangan v1.2.x dengan auditing menyeluruh.
- **Auto-Versioning Finalization**: Sinkronisasi global versi v1.2.5-hotfix-2 di seluruh komponen UI (Login, Dashboard) dan file dokumentasi master.

## [1.2.3] - 2026-03-13

### Changed
- **Documentation Consolidation**: Meluncurkan `SUPERAPP_BRAIN.md` sebagai file master tunggal yang menggabungkan README, Master Framework, dan Roadmap.
- **Dynamic Versioning SOP**: Menstandarisasi referensi versi secara dinamis ke CHANGELOG.md.
- **Auto-Versioning Protocol**: Menetapkan prosedur wajib kenaikan versi (SemVer) dan audit versi global setiap shutdown sesi.

## [1.2.2] - 2026-03-13

### Fixed
- **Database Schema**: Memperbaiki error `relation document_counters does not exist` di Supabase Production Singapore.
- **Counters Sync**: Melakukan inisialisasi data counter awal sesuai standar spreadsheet: SP (#63), Nota (#235), TT (#235).
- **Migration Script**: Menambahkan runner script `run_production_migration.js` untuk pemeliharaan database di masa depan.
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
