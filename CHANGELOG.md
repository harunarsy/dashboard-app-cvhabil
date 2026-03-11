# Changelog — Dashboard CV Habil

## [v0.6.3] — March 11, 2026

### 🛠️ Improvements & Bug Fixes
- **ESLint Clean Slate** — Fixed all linting warnings (unused imports, missing dependencies).
- **Database Branch Isolation** — Backend now auto-detects git branch and loads `.env.dev` on `dev` branch, ensuring it never touches the production database (`dashboard_db`).
- **Network Access Sync** — Frontend now correctly hits backend port `5002` when running on `dev` branch, allowing full access via network IP (`192.168.3.4`).
- **Cleanup & Declutter** — Removed ~10MB of redundant files, old build folders, and unused CRA boilerplate.

## [v0.6.2] — March 11, 2026

### 🛠️ Improvements & Bug Fixes
- **Date Handling Fix** — Restored timezone-safe date parsing/formatting to prevent "shift +1 day" bugs.
- **Universal Search Enhancement** — Search now includes product names within invoices.
- **Improved UI for Paid Status** — Payment date now appears contextually when status is "Paid".
- **Dynamic Rekap Table** — Rekap per distributor now shows all known distributors even with 0 invoices for the month.
- **Visual Polish** — Added unique color dots per distributor and improved sorting logic.

## [v0.6.1] — March 11, 2026

### 🛠️ Improvements & Bug Fixes
- **Audit Log (Riwayat Perubahan)** — Added vertical timeline to track Create, Update, Delete, and Restore actions.
- **Disc COD Distribution** — COD discounts are now distributed proportionally across all items in an invoice.
- **Refined Sorting & Pagination** — Added table headers sorting and 5/10/25/50 per page pagination.
- **Responsive Navigation** — Improved sidebar functionality for smaller screens.

## [v0.5.2] — March 11, 2026

### 🐛 Root Cause Fix: Data Berantakan di Invoice 1260300020
Masalah yang dilaporkan: input 2x nomor yang sama → data lama tertimpa diam-diam, item_count salah, angka HNA/PPN/HPP tidak konsisten.

**Penyebab:**
- Backend langsung `DELETE invoice_items + INSERT` saat nomor duplikat, tanpa konfirmasi ke user
- Frontend tidak cek apakah nomor sudah ada sebelum submit
- User mengira "Add Invoice" akan merge/menambah produk, padahal replace semua

**Fix yang diterapkan:**
- Frontend cek duplikat *sebelum* kirim ke backend (bandingkan dengan state `invoices`)
- Jika duplikat terdeteksi → tampilkan dialog konfirmasi 3 opsi (tidak langsung simpan)
- Backend tetap bisa handle upsert tapi sekarang hanya dipanggil setelah user memilih

### ✨ New Features
- **Duplicate Invoice Dialog** — saat nomor faktur sudah ada, muncul dialog dengan 3 pilihan:
  1. **✏️ Buka & Edit Invoice yang Ada** — load existing + semua produknya, user bisa tambah/ubah (ini opsi yang paling sering dipakai)
  2. **🔄 Timpa dengan Data Sekarang** — ganti seluruh invoice dengan yang baru diisi
  3. **Batal** — kembali ke form, ganti nomor faktur
- **Draft Autosave on Change** — draft sekarang save 1.5 detik setelah *setiap* perubahan input (bukan setiap 30 detik). Pakai debounce agar tidak spam request.

### 📊 Analisis Data Invoice 1260300020
Berdasarkan data yang diberikan, seharusnya:

**Produk 1 — TS SWEET DIABTX IND 10-2028**
- QTY: 320, HNA: Rp 86.000
- HNA×QTY: Rp 27.520.000
- Disc 15%: Rp 4.128.000
- HNA Baru: Rp 23.392.000
- PPN (11%): Rp 2.573.120
- HNA+PPN: Rp 25.965.120
- HPP/item: Rp 81.141

**Produk 2 — TS NFDM 1000GR / 10-2027**
- QTY: 1, HNA: Rp 184.000
- HNA×QTY: Rp 184.000
- Disc 15%: Rp 27.600
- HNA Baru: Rp 156.400
- PPN (11%): Rp 17.204
- HNA+PPN: Rp 173.604
- HPP/item: Rp 173.604

**Total seharusnya (2 produk, 321 qty):**
- HNA×QTY: Rp 27.704.000
- DISC: Rp 4.155.600
- HNA Baru: Rp 23.548.400
- HNA Final: Rp 23.548.400 (tanpa Disc COD)
- PPN: Rp 2.590.324
- HNA+PPN: Rp 26.138.724
- HPP/item: Rp 26.138.724 ÷ 321 = Rp 81.430

---

## [v0.5.1] — March 11, 2026
- Universal search + collapsible filters
- Due date reminder + badge warna + alert counter
- Trash/soft-delete + restore
- Draft autosave setiap 30 detik
- HNA per Item
- Fix duplicate invoice number error → auto-upsert

## [v0.5.0] — March 11, 2026
- MasterSelect component (search, create inline, delete)
- Products master database

## [v0.4.0] — March 11, 2026
- Form faktur lengkap + kalkulasi otomatis real-time
- PPN formula, Disc COD, HPP per produk

## [v0.3.1] — March 11, 2026
- Fix add distributor tidak tersimpan ke DB

## [v0.3.0] — March 11, 2026
- Invoice Management System (CRUD)

## [v0.2.x] — March 11, 2026
- Apple HIG design, sidebar toggle

## [v0.1.0] — March 10, 2026
- MVP release
