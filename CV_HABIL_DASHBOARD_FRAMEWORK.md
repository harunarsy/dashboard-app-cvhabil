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

## 3. MODUL YANG SUDAH ADA (v1.0.1)

### Business Logic & Modules
- ✅ Full CRUD Invoice + Autosave Draft + Audit Log + Due Date Otomatis
- ✅ Pencarian Universal
- ✅ **Inventory lengkap** — FEFO (First Expired First Out), batch tracking, Stok Opname
- ✅ **Surat Pesanan (SP)** — penomoran otomatis, integrasi langsung ke stok saat barang diterima
- ✅ **Toko Online** — CSV importer Shopee & TikTok, profit dashboard berbasis data penarikan
- ✅ **Buku Besar (Ledger)** — restricted Direktur only, summary kategori per bulan

### Security & Infrastructure
- ✅ JWT auto-logout 15 menit
- ✅ Hapus demo credential buttons
- ✅ Fix IP/Port mismatch antar environment
- ✅ Pemisahan database main (`dashboard_db`) / dev (`dashboard_dev`)
- ✅ Akses jaringan lokal multi-device

### UI/UX
- ✅ Apple HIG redesign — Dashboard & Login screen
- ✅ Version Badge + Release Notes & Roadmap Modal di Dashboard

---

## 4. FOKUS PENGEMBANGAN SAAT INI (Prioritas Aktif)

### 🔗 A. Sinkronisasi & Integritas Database
Ini adalah fondasi sebelum fitur apapun dikerjakan. Semua modul harus saling terhubung dengan benar:

**Flow data yang harus saling terikat:**
```
Faktur Pembelian (dari distributor)
    → otomatis tambah stok di inventory (per batch + expired date)

Nota Penjualan (ke customer)
    → otomatis kurangi stok inventory (pakai logika FEFO)
    → otomatis catat di laporan keuangan jika direktur

Surat Pesanan (SP ke distributor)
    → saat "diterima" → otomatis jadi Faktur Pembelian
    → otomatis update stok

Stok Opname
    → input stok fisik → sistem hitung selisih dengan stok sistem
    → jika ada selisih → catat sebagai adjustment (bukan diam-diam)
```

**Yang harus dicek/diperbaiki:**
- Foreign key constraints aktif dan konsisten di semua tabel
- Tidak ada data orphan (item faktur tanpa faktur, stok tanpa produk, dll)
- Setiap transaksi yang mengubah stok harus tercatat di tabel `inventory_mutations` (audit trail stok)
- Rollback: jika nota dibatalkan → stok harus dikembalikan

---

### 🐛 B. Bug yang Diketahui (Harus Fix Dulu)
1. **Error saat edit distributor** — kemungkinan issue di form validation atau foreign key saat update
2. **Error saat edit list barang (line items)** — kemungkinan issue di state management React saat edit item di dalam array (tambah/hapus/ubah qty)

**Catatan untuk agent:** Cek apakah kedua bug ini terkait — bisa jadi root cause yang sama (misalnya: component tidak re-render saat data diubah, atau PUT endpoint tidak handle partial update dengan benar).

---

### 🖨️ C. Fitur Print / Save as PDF — Nota Penjualan
**Request baru:** Setiap nota penjualan harus bisa dicetak atau disimpan sebagai PDF langsung dari sistem.

**Spesifikasi:**
- Tombol "Cetak / Simpan PDF" di halaman detail nota
- Template PDF nota harus mencantumkan: nama & alamat CV Habil, nomor nota, tanggal, nama customer, tabel produk (nama, qty, harga satuan, subtotal), total, tanda tangan/cap (placeholder)
- Library yang direkomendasikan: `react-pdf` atau `jspdf` + `html2canvas`
- PDF ter-generate di frontend → bisa langsung print atau download
- Opsional: setelah generate PDF → tawarkan upload ke Dropbox
- Status nota di database terupdate: `pdf_generated: true`, `pdf_generated_at: timestamp`

---

### ✨ D. User Experience — Prinsip Utama
**Filosofi:** Sistem ini dipakai setiap hari oleh owner dan admin. UX yang buruk = tidak dipakai = kembali ke Excel.

**Referensi desain: Apple HIG (sudah diterapkan sejak awal)**

**Prinsip UX yang harus dijaga di setiap fitur baru:**

| Area | Yang Harus Ada |
|---|---|
| **Feedback** | Setiap aksi (save, delete, update) harus ada konfirmasi visual — toast notification atau inline status |
| **Loading states** | Saat fetch data, tampilkan skeleton/spinner — jangan halaman kosong |
| **Error states** | Pesan error harus dalam Bahasa Indonesia dan actionable ("Stok tidak cukup" bukan "Error 400") |
| **Empty states** | Jika data kosong, tampilkan ilustrasi/teks yang helpful ("Belum ada nota. Buat nota pertama →") |
| **Konfirmasi destructive action** | Delete apapun harus ada dialog konfirmasi — tidak boleh langsung hapus |
| **Form UX** | Autofocus field pertama, Enter untuk pindah field, validasi inline (bukan setelah submit) |
| **Mobile-friendly** | Bisa dipakai dari HP dalam jaringan lokal — layout harus responsif |
| **Konsistensi** | Tombol, warna, spacing, font harus konsisten di semua halaman |

**Specific UX untuk modul inventory:**
- Expired date yang < 3 bulan → highlight kuning
- Expired date yang sudah lewat → highlight merah + badge "EXPIRED"
- Stok di bawah minimum → badge merah di daftar produk

---

> Berdasarkan brainstorming roadmap v1.0.1 yang sudah didiskusikan dengan agent Antigravity.

### 🗂️ E. Master Data — React Select dengan Edit & Delete
**Semua master data harus bisa dikelola langsung dari UI**, mengikuti pola yang sudah ada di list invoice.

**Data yang harus punya UI manage (React Select style):**
- Produk (nama, HNA, harga jual, satuan)
- Customer offline (nama, telepon, alamat)
- Distributor (nama, kode)
- Toko online (nama toko, platform)

**Behavior yang harus ada di setiap master data:**
- **Inline select** saat dipakai di form (nota, faktur, SP) — bisa search/filter by nama
- **Edit** langsung dari list — klik edit → form terbuka inline atau modal → save
- **Hapus** dengan konfirmasi dialog — jika data masih dipakai di transaksi lain, tampilkan warning dan **jangan hapus** (soft delete saja: `is_active: false`)
- **Tambah baru** bisa langsung dari dropdown select saat di tengah input form ("+ Tambah customer baru") tanpa harus keluar dari halaman
- Konsisten dengan gaya list invoice yang sudah ada

---

#### 1. Security: Authentication
- **Bcrypt password hashing** — migrasi ke `bcryptjs` (saat ini kemungkinan masih plain text / simple encoding)
- **Refresh Token pattern** — agar user bisa stay logged in secara aman tanpa long-lived access token
- **RBAC lebih granular** — misalnya "Editor" vs "Viewer" per modul spesifik (bukan hanya Direktur vs Admin)

#### 2. Export & Reporting Engine
- **Export ke PDF** — invoice, SP, dan laporan Buku Besar yang profesional → gunakan `jspdf` atau `react-pdf`
- **Export ke Excel (.xlsx)** — laporan penjualan bulanan dan stok untuk keperluan audit eksternal
- **Data Visualization drill-down** — klik bar chart penjualan → langsung masuk ke detail invoice terkait

---

### 🟡 MEDIUM PRIORITY — Feature Expansion

#### 3. Finance & HR
- **Employee Management** — absensi, payroll dasar, assignment role karyawan
- **Expense Tracking** — integrasi ke Buku Besar untuk pengeluaran non-penjualan (listrik, sewa, dll)
- **Accounts Receivable/Payable** — dashboard khusus tracking hutang & piutang aktif

#### 4. Advanced Inventory
- **QR / Barcode Integration** — scan produk untuk Stock In/Out dan Stok Opname lebih cepat
- **Predictive Restocking** — alert otomatis ketika tren penjualan menunjukkan stok akan habis
- ~~Multi-Warehouse~~ — *tidak relevan, gudang dan toko jadi satu lokasi*

---

### 🟢 LOW PRIORITY — Tech Upgrades

#### 5. Infrastructure
- **TypeScript Migration** — dari `.js/.jsx` ke `.ts/.tsx` untuk type safety yang lebih baik
- **Unit & Integration Testing** — Jest/Cypress, khususnya untuk logika kritis seperti FEFO dan perhitungan laba
- **Containerization (Docker)** — konsistensi environment antara development dan production

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

## 12. URUTAN PENGEMBANGAN SELANJUTNYA (dari v1.0.1)

```
SEKARANG (Active Sprint):
  → Fix bug: edit distributor
  → Fix bug: edit list barang (line items)
  → Sinkronisasi DB — pastikan semua flow saling terikat (stok masuk/keluar/opname)
  → Fitur Print/Save PDF untuk Nota Penjualan
  → Master data (produk, customer, distributor, toko online) → React Select + edit + delete
  → Audit UX menyeluruh — terapkan prinsip Apple HIG di semua halaman

Phase Berikutnya (High Priority):
  → Bcrypt password hashing
  → Refresh token pattern
  → Export PDF laporan (Buku Besar, rekap bulanan)
  → Export Excel laporan bulanan

Phase Setelah Itu (Medium):
  → Employee management & payroll
  → Expense tracking (non-penjualan)
  → Dashboard hutang piutang
  → QR/Barcode untuk stok opname

Phase Jangka Panjang (Low):
  → TypeScript migration
  → Jest/Cypress testing
  → Docker containerization
```  → Docker containerization
```

---

*Dokumen ini dibuat berdasarkan analisis file: BUKU_BESAR_HABIL_2025.xlsx, CV_HABIL_2026.xlsx, DATA_CV_2025.xlsx, Laba_TOKO_ONLINE_HABIL.xlsx, BRAINSTORMING_ROADMAP.md*  
*Versi sistem saat ini: v1.0.1 | Stack: React 19 + Express 5.x + PostgreSQL 15*
