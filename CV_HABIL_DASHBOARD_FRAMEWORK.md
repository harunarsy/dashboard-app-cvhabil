# CV HABIL DASHBOARD — MASTER FRAMEWORK DOCUMENT
> Dokumen ini adalah panduan lengkap untuk melanjutkan pengembangan sistem manajemen bisnis CV Habil Sejahtera Bersama. Dibuat untuk disampaikan ke AI coding agent (Google IDX / Antigravity IDE).

---

## 1. RINGKASAN SISTEM

**Nama Sistem:** Dashboard CV Habil  
**Versi Terakhir:** v0.6.3  
**Tujuan:** Sistem manajemen bisnis terpadu — invoice, pesanan, stok, keuangan, dan laporan toko online  
**Desain:** Apple Human Interface Guidelines (HIG) — premium, bersih, minimalis

### Tech Stack
| Layer | Teknologi |
|---|---|
| Frontend | React 19 |
| Backend | Node.js + Express 5.x |
| Database | PostgreSQL 15 |
| Jaringan | Local network (multi-device access) |
| Penyimpanan Dokumen | Google Drive (PDF) |

### Database
- Branch `main` → database: `dashboard_db`
- Branch `dev` → database: `dashboard_dev`

---

## 2. ROLE & HAK AKSES

### Role 1: Direktur (Owner)
- **Akses penuh ke semua modul**
- Termasuk akses ke: Buku Besar, Laporan Keuangan Perusahaan, semua data finansial
- Satu-satunya role yang bisa melihat data sensitif perusahaan

### Role 2: Admin
- Mengelola: stok/inventory, nota penjualan, toko online
- **TIDAK BOLEH mengakses:** Buku Besar, Laporan Keuangan Perusahaan, data gaji karyawan
- Akses dibatasi hanya pada operasional harian

> ⚠️ PENTING: Pemisahan akses ini adalah kebutuhan bisnis kritis. Data buku besar adalah data internal perusahaan yang bersifat rahasia.

---

## 3. MODUL YANG SUDAH ADA (v0.6.3)

Fitur berikut sudah diimplementasikan dan dianggap **stabil**:
- ✅ Full CRUD Invoice
- ✅ Autosave Draft
- ✅ Audit Log (riwayat perubahan)
- ✅ Pencarian Universal
- ✅ Manajemen Due Date Otomatis
- ✅ Pemisahan database main/dev
- ✅ Akses jaringan lokal multi-device

---

## 4. MODUL YANG PERLU DIBANGUN (PRIORITAS URUT)

### PRIORITAS 1 — Nota Penjualan ke Customer
**Latar belakang:** Data ada di `DATA_CV_2025.xlsx` sheet `NOTA CUSTOMER`, `NOTA RESELLER`, `NOTA DUS 1000`, dll. Selama ini nota dibuat manual di spreadsheet terpisah.

**Yang perlu dibangun:**
- Form pembuatan nota penjualan baru (nomor otomatis, tanggal, nama customer, produk, qty, harga, total)
- Referensi produk dari master data produk
- Cetak nota sebagai PDF → simpan otomatis ke Google Drive
- Riwayat nota per customer
- Nota bisa untuk: customer offline, reseller, tender/institusi (RSUD, dll)

**Fields penting berdasarkan data existing:**
- Nomor Transaksi / Kode / Tahun
- Nama Customer + Alamat
- Daftar Produk (nama, qty, harga satuan, total)
- Tanggal, Tanda Tangan / Cap (untuk PDF)

---

### PRIORITAS 2 — Inventory & Stok Opname
**Latar belakang:** Stok saat ini dicatat manual di kertas, tanpa tracking expired date. Admin harus crosscheck manual setiap buka/tutup toko.

**Yang perlu dibangun:**
- Master data produk (nama, kode produk, satuan, HPP/HNA, harga jual)
- Stok masuk otomatis dari faktur pembelian distributor
- Stok keluar otomatis dari nota penjualan
- **Tracking Expired Date per batch/lot** — ini KRITIS untuk bisnis farmasi/nutrisi
- Alert produk mendekati expired (misal: < 3 bulan)
- Alert stok minimum
- Fitur stok opname: input stok fisik, sistem tampilkan selisih dengan stok sistem
- History mutasi stok per produk

**Data existing yang bisa jadi referensi:**
- Sheet `INVENTORY` dan `STOK OPNAME` / `STOK OPNAM` di `DATA_CV_2025.xlsx`
- Sheet `HARGA PRODUK` di `CV_HABIL_2026.xlsx`

---

### PRIORITAS 3 — Surat Pesanan (SP) ke Distributor
**Latar belakang:** SP ke distributor selama ini dibuat manual di spreadsheet (sheet `SP PARIT P`, `SP APL`, `SP AAM`, `SP ENSEVAL` di `DATA_CV_2025.xlsx`).

**Yang perlu dibangun:**
- Form pembuatan Surat Pesanan baru
- Pilih distributor dari master (Parit Padang, APL, AAM, Enseval, AMS, dll)
- Tambah produk yang dipesan (nama produk, qty, harga)
- Generate PDF SP → simpan ke Google Drive
- Riwayat SP per distributor
- Ketika SP direalisasikan → otomatis masuk sebagai faktur pembelian dan update stok

---

### PRIORITAS 4 — Faktur Pembelian dari Distributor
**Latar belakang:** Data faktur masukan ada di `CV_HABIL_2026.xlsx` sheet per bulan (`JANUARI 2026`, `FEBRUARI 2026`, `MARET 2026`). Setiap faktur berisi: tanggal, distributor, nomor faktur, produk, qty, HNA.

**Yang perlu dibangun:**
- Input faktur pembelian (manual atau dari SP yang sudah dibuat)
- Fields: tanggal, distributor, nomor faktur, produk, qty, HNA, subtotal
- Saat faktur disimpan → otomatis tambah stok + catat HPP
- Rekap pembelian per distributor per bulan
- Referensi ke Google Drive untuk file PDF faktur fisik

**Data existing:**
- `CV_HABIL_2026.xlsx` sheet `REKAP PENJUALAN` dan sheet per bulan
- Sheet `2026` berisi ringkasan total belanja

---

## 5. MODUL TOKO ONLINE

### Setup Toko
| Platform | Jumlah Akun |
|---|---|
| Shopee | 4 akun |
| TikTok Shop | 3 akun |
| **Total** | **7 toko** |

### Logika Perhitungan Laba
```
LABA TOKO = TOTAL PENARIKAN SALDO - MODAL HPP
```
- Tidak ada perhitungan biaya iklan, ongkir, atau komisi platform (disederhanakan)
- Perhitungan per toko, per bulan
- Sumber data: **export CSV dari Seller Center** (Shopee & TikTok) — bukan API

### Data Existing
- File `Laba_TOKO_ONLINE_HABIL.xlsx` berisi sheet per bulan (Juli 2025 – Maret 2026)
- Setiap bulan mencatat: tanggal penarikan, nama toko, nominal, dan laba

### Yang Perlu Dibangun
- Upload/import CSV dari Shopee Seller Center dan TikTok Seller Center
- Parser yang membaca data penarikan dari CSV tersebut
- Input manual HPP/modal jika tidak otomatis
- Dashboard laba per toko per bulan
- Grafik tren laba 7 toko secara keseluruhan
- Rekap total laba online per bulan
- Hanya Direktur yang bisa lihat summary finansial; Admin bisa input data

---

## 6. MODUL BUKU BESAR (DIREKTUR ONLY)

**⛔ Akses: Direktur saja — Admin TIDAK BOLEH melihat modul ini**

**Data existing di `BUKU_BESAR_HABIL_2025.xlsx`:**
- `Pemasukan Pengeluaran Habil` — rekening perusahaan
- `Sheet26` — rekap 2026 dengan laba kotor, pendapatan, pengeluaran, target
- `Laporan Keuangan Habil`
- `GAJI KARYAWAN 2025`
- `TRANSAKSI OFFLINE HABIL 2025`
- `HUTANG PIUTANG DILUAR TRANSAKSI`
- `Habil Investment`

**Yang perlu ditampilkan di dashboard Direktur:**
- Ringkasan pemasukan vs pengeluaran bulanan
- Laba kotor vs target
- Hutang piutang aktif
- Transaksi offline
- Data ini bisa diinput manual atau di-import dari Excel existing

---

## 7. LOKASI FISIK STOK

- **Gudang dan toko berada di lokasi yang sama (1 tempat)**
- Tidak ada pemisahan gudang vs display toko
- Implikasi untuk sistem: cukup 1 lokasi stok, tidak perlu multi-warehouse/multi-location logic

---

## 8. INTEGRASI PENYIMPANAN DOKUMEN

**Filosofi utama: DATABASE ADALAH SUMBER KEBENARAN**
- Semua transaksi (nota, faktur, SP) **wajib tersimpan di PostgreSQL** terlebih dahulu
- PDF dan Dropbox bersifat **opsional / pelengkap** — bisa dilakukan kapan saja, tidak harus saat transaksi dibuat
- Jika PDF belum pernah dicetak atau belum diupload ke Dropbox, data tetap aman di database dan bisa di-generate ulang kapanpun

**Kondisi saat ini:** Dokumen PDF (nota, faktur, SP) disimpan **manual ke Dropbox** — prosesnya tidak konsisten dan sering kelewat/tidak tersimpan.

**Behavior sistem baru:**
- Simpan transaksi → **otomatis masuk database** ✅
- Tombol "Cetak PDF" atau "Simpan ke Dropbox" → **opsional, bisa dilakukan nanti**
- Dari halaman riwayat transaksi → bisa **generate ulang PDF kapanpun** dari data yang sudah ada di database
- Status PDF per transaksi ditampilkan: `Belum dicetak` / `Sudah dicetak` / `Sudah di-upload ke Dropbox`

**Integrasi Dropbox (opsional layer):**
- Gunakan Dropbox API v2
- Auto-upload bisa dipicu manual (tombol) atau otomatis saat cetak
- Simpan Dropbox link/path di database agar bisa dibuka langsung dari dashboard

**Struktur folder Dropbox yang disarankan:**
```
CV Habil Dashboard/
├── Nota Penjualan/
│   ├── 2025/
│   └── 2026/
├── Faktur Pembelian/
│   ├── AMS/
│   ├── Parit Padang/
│   └── ...
├── Surat Pesanan/
└── Dokumen Lain/
```

---

## 9. ARSITEKTUR DATABASE (TABEL-TABEL YANG PERLU DIBUAT)

```
products          → master produk (kode, nama, satuan, HNA, harga jual)
inventory         → stok per produk + expired date per batch
inventory_in      → stok masuk (dari faktur pembelian)
inventory_out     → stok keluar (dari nota penjualan)

customers         → master customer offline
purchase_invoices → faktur pembelian dari distributor
purchase_items    → detail item per faktur
distributors      → master distributor

sales_orders      → nota penjualan
sales_items       → detail item per nota

purchase_orders   → surat pesanan ke distributor
po_items          → detail item SP

online_stores     → master 7 toko (shopee/tiktok)
online_withdrawals → data penarikan per toko
online_profit     → rekap laba per toko per bulan

ledger            → buku besar (direktur only)
payroll           → gaji karyawan (direktur only)

users             → user login (direktur / admin)
audit_logs        → sudah ada
```

---

## 10. NAVIGASI / HALAMAN DASHBOARD

### Sidebar Admin
- 📦 Inventory & Stok
- 🧾 Nota Penjualan
- 📋 Surat Pesanan
- 🛒 Toko Online

### Sidebar Direktur (semua menu Admin +)
- 📊 Buku Besar
- 💰 Laporan Keuangan
- 👥 Karyawan & Gaji
- ⚙️ Pengaturan (user management, dll)

---

## 11. CATATAN TEKNIS PENTING

1. **Expired Date adalah fitur kritis** — bisnis menjual produk farmasi/nutrisi, expired harus selalu terlihat dan ada alertnya
2. **PDF generation** — setiap dokumen (nota, faktur, SP) harus bisa dicetak ke PDF langsung dari sistem
3. **Database = sumber kebenaran utama** — PDF dan Dropbox hanya pelengkap. Semua transaksi harus tersimpan di PostgreSQL duluan. PDF bisa di-generate ulang kapanpun dari data yang sudah ada. Tambahkan kolom status `pdf_status` (belum dicetak / sudah dicetak / sudah di-upload) di setiap tabel transaksi
4. **Import CSV toko online** — format CSV Shopee dan TikTok berbeda, perlu parser terpisah untuk masing-masing platform
5. **Akses lokal** — sistem harus tetap bisa diakses dari HP/tablet di dalam jaringan lokal (tidak hanya dari satu komputer)
6. **Buku besar = sacred data** — implementasikan middleware/guard yang ketat di backend agar route buku besar tidak bisa diakses dengan token admin
7. **Single location stok** — gudang dan toko jadi satu tempat, tidak perlu multi-warehouse logic; cukup 1 lokasi di sistem

---

## 12. URUTAN PENGEMBANGAN YANG DISARANKAN

```
Phase 1 (Sekarang):
  → Modul Nota Penjualan Customer (CRUD + PDF)
  → Master Produk & Master Customer

Phase 2:
  → Inventory dengan expired date tracking
  → Stok opname & alert

Phase 3:
  → Surat Pesanan ke Distributor
  → Faktur Pembelian dari Distributor
  → Integrasi stok otomatis

Phase 4:
  → Modul Toko Online (import CSV + hitung laba)

Phase 5:
  → Buku Besar (Direktur only)
  → Google Drive integration
  → Dashboard summary & grafik
```

---

*Dokumen ini dibuat berdasarkan analisis file: BUKU_BESAR_HABIL_2025.xlsx, CV_HABIL_2026.xlsx, DATA_CV_2025.xlsx, Laba_TOKO_ONLINE_HABIL.xlsx*  
*Versi sistem saat ini: v0.6.3 | Stack: React 19 + Express 5.x + PostgreSQL 15*
