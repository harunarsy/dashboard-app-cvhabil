# Changelog — Dashboard CV Habil

## [v0.5.1] — March 11, 2026

### ✨ New Features
- **Universal Search** — satu search bar di atas untuk cari no. faktur, distributor, status sekaligus
- **Advanced Filters** — collapsible panel di bawah search, ada indikator "!" kalau filter aktif
- **Due Date / Jatuh Tempo** — field baru di form & kolom tersembunyi di list, dengan:
  - Badge merah untuk faktur yang sudah terlambat
  - Badge orange untuk jatuh tempo ≤ 7 hari
  - Badge kuning untuk jatuh tempo ≤ 3 hari
  - Alert counter di header halaman (klik langsung filter)
  - Auto-sort: faktur terlambat/terdekat muncul paling atas
- **Filter Jatuh Tempo** — opsi filter "Terlambat" dan "≤ 7 hari" di advanced filter
- **Trash / Soft Delete** — delete faktur sekarang pindah ke Trash dulu, bisa di-restore kapan saja
  - Confirm dialog sebelum delete (tidak bisa salah klik)
  - Panel Trash dengan tombol Restore dan Hapus Permanen
- **Draft Autosave** — form faktur auto-save ke server setiap 30 detik
  - Banner "Ada draft tersimpan" saat buka halaman
  - Klik "Lanjutkan" untuk resume sesi sebelumnya
  - Draft bersih otomatis setelah invoice berhasil disimpan
- **HNA per Item** — kolom baru di expanded view dan di form per-produk (HNA Baru ÷ QTY)
- **HPP per Produk** — ditampilkan di list invoice (warna ungu)
- **Duplicate Invoice Number** — tidak lagi error; nomor yang sama akan **update** invoice yang sudah ada

### 🐛 Bug Fixes
- Fixed duplicate invoice number constraint error — sekarang auto-upsert
- Fixed filter tidak reset saat klik "Hapus Filter"
- Fixed `getDueStatus` undefined di row expansion

### 🗄️ Database Changes (auto-migrate on start)
- `invoices`: tambah kolom `due_date`, `deleted_at`, `is_draft`, `draft_data`
- `invoice_items`: tambah kolom `hna_per_item`
- New soft-delete endpoints: `DELETE /invoices/:id` → pindah ke trash
- New restore endpoint: `PUT /invoices/:id/restore`
- New permanent delete: `DELETE /invoices/:id/permanent`
- New draft endpoints: `POST /invoices/draft`, `GET /invoices/draft`, `DELETE /invoices/draft/clear`
- New trash endpoint: `GET /invoices/trash`

---

## [v0.5.0] — March 11, 2026

### ✨ New Features
- **MasterSelect component** — dropdown custom dengan search, create inline, delete dengan double-confirm
- **Products Master Database** — tabel `products_master`, endpoint GET/POST/DELETE `/api/products`
- **Distributor delete** — endpoint DELETE `/api/distributors`
- Layout produk per-item diubah ke card style (lebih rapih)

---

## [v0.4.0] — March 11, 2026

### ✨ New Features
- Form faktur didesain ulang lengkap dengan semua field
- Per-item: Nama Produk, Expired Date, QTY, HNA, Disc%, HNA×QTY, Disc Nominal, HNA Baru
- Kalkulasi otomatis real-time untuk semua field finansial
- PPN Masukan = HNA Final × 11% (dengan 2 desimal, tidak ada bug input)
- PPN Pembulatan = INT(PPN Masukan)
- HNA Final, HNA+PPN, HPP per produk — semua auto-kalkulasi
- Disc COD dengan opsi Ada/Tidak Ada
- List invoice lebih informatif: HNA×QTY, HNA Final, HNA+PPN, PPN, item count
- Expand row untuk lihat detail produk per faktur

### 🗄️ Database Changes
- `invoices`: tambah kolom `hna_baru`, `disc_cod_ada`, `disc_cod_amount`, `hna_final`, `ppn_masukan`, `ppn_pembulatan`, `hna_plus_ppn`, `harga_per_produk`
- `invoice_items`: tambah kolom `expired_date`, `hna`, `hna_times_qty`, `disc_percent`, `disc_nominal`, `hna_baru`

---

## [v0.3.1] — March 11, 2026

### 🐛 Bug Fixes
- Fixed add distributor tidak tersimpan ke database
- Backend POST `/distributors` sekarang save ke tabel `distributors`
- GET `/distributors` gabungkan dari tabel `distributors` + `invoices` (UNION)
- Frontend: auto-select distributor baru setelah berhasil add

### 🗄️ Database Changes
- Tabel baru: `distributors` (id, name, created_at)

---

## [v0.3.0] — March 11, 2026
- Invoice Management System (CRUD)
- Distributor dropdown + add inline
- Rupiah currency input formatter
- Invoice filters: bulan, distributor, status, date range
- Excel import untuk bulk upload
- Invoice metrics: Total HNA, PPN, Margin, Count

## [v0.2.2] — March 11, 2026
- Final Apple HIG design, bug fixes

## [v0.2.1] — March 11, 2026
- Sidebar toggle, smooth animations

## [v0.2.0] — March 11, 2026
- Apple HIG design system

## [v0.1.0] — March 10, 2026
- MVP: auth, dashboard, orders
