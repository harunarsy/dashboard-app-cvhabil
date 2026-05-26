import React, { useState, useEffect } from 'react';
import { Info, X, Activity, ShoppingCart, Package, Plus, Sparkles, Wrench, Palette, Zap } from 'lucide-react';
import api from '../services/api';
import TasksKanban from './TasksKanban';
import Skeleton from './common/Skeleton';

const RELEASES = [
  {
    version: 'v1.8.0-stable', date: '26 Mei 2026', status: 'latest',
    changes: [
      { type: 'feat', text: '🏷️ HNA / HPP Consistency: kolom Inventory split jadi 2 — "HNA (exc PPN)" (raw cost) + "HPP (inc PPN)" (raw × 1.11). Edit Produk + Edit Batch + Stok Masuk semua tampil chip HPP computed auto. Bedain mana harga kulak sebenarnya vs harga raw.' },
      { type: 'feat', text: '💰 Decimal Precision: input HNA / Disc COD / Stok Masuk kini support 2 digit desimal dengan format Indo "Rp 288.288,25" (titik ribuan + koma desimal). Lebih akurat untuk faktur masukan.' },
      { type: 'feat', text: '✂️ Edit Faktur Simplified: hide cascade fields (HNA × QTY, Disc Nominal, HNA Baru, HNA/Item, COD Bagian, HNA After COD) by default. Tampil HPP final highlight + tombol "Detail kalkulasi" untuk yang mau verify breakdown.' },
      { type: 'feat', text: '📐 Karton UX Sync: Faktur form tampil conversion preview "20 karton (= 240 pcs)" mirror SalesOrderList. SP PDF tambah sub-line "(= X pcs)" konsisten dengan Nota PDF.' },
      { type: 'fix', text: 'Backend /batches-by-product: HPP computation salah formula (hna/qty × 1.11) — sekarang fix ke hna × 1.11 (hna sudah per-pcs).' },
      { type: 'fix', text: 'PPN rate konsolidasi via konstanta (backend/utils/tax.js + frontend/utils/rupiah.js) — gak hardcoded 1.11 di banyak tempat lagi.' },
      { type: 'fix', text: 'PDF Laporan: HPP sub-row label eksplisit "HPP/pcs (inc PPN)" + 2 decimal digit untuk akurasi.' },
    ]
  },
  {
    version: 'v1.7.0-stable', date: '25 Mei 2026', status: 'stable',
    changes: [
      { type: 'feat', text: '💰 Tiered Pricing (Grosir): set harga per qty range per produk (contoh: 1-4 karton @212k, 5-9 @208k, 10+ @204k). Auto-apply ke Nota saat qty match — tampil tag "🏷️ Harga grosir tier" untuk transparency.' },
      { type: 'feat', text: '📊 Multi-Select Nota Penjualan → Export PDF Laporan: checkbox column di list nota + sticky action bar saat ada selection. Export PDF landscape A4 berisi tabel ringkasan, Grand Total, breakdown Lunas vs Belum Bayar.' },
      { type: 'feat', text: '📦 Stok Keluar Batch Picker: dropdown batch di modal Stok Keluar (default FEFO terdekat, bisa override pilih batch tertentu). Backend single-batch deduction kalau manual override.' },
      { type: 'feat', text: 'PDF Nota item: tampil batch_no + ED snapshot per item (kalau ada di sales_items snapshot). Audit trail clear di nota cetak.' },
      { type: 'fix', text: 'Filter textbox Nota: text tidak kepotong lagi (ellipsis + paddingRight adequate untuk chevron + minWidth sesuai opsi terpanjang).' },
      { type: 'fix', text: 'Hapus footer "Business Management System" di root level — gak ikut dark mode + redundant dengan version di Sidebar/Login/Dashboard.' },
    ]
  },
  {
    version: 'v1.6.0-stable', date: '25 Mei 2026', status: 'stable',
    changes: [
      { type: 'feat', text: '📦 Multi-Unit Packaging (Carton ↔ Pcs): produk kini support dual unit — eceran (pcs/btl/sachet) + kemasan (karton/dus/box). Set pack_size + harga jual per kemasan di Produk form. Auto-konversi qty di Faktur Masukan, Surat Pesanan, dan Nota Penjualan.' },
      { type: 'feat', text: 'Dual Pricing: sell_price (per eceran) + sell_price_pack (per kemasan) independent — allow diskon grosir per karton vs harga eceran. Auto-fill di Nota saat user pilih unit.' },
      { type: 'feat', text: 'Unit Dropdown Universal: replace free-text unit input dengan dropdown smart di 4 form (Produk, PO, Faktur, Nota). Options dinamis berdasarkan product.base_unit + pack_unit.' },
      { type: 'fix', text: 'Faktur Masukan: tambah kolom Satuan (sebelumnya MISSING) — distributor invoice unit kini tersimpan.' },
      { type: 'fix', text: 'SP Receive: unit asal PO kini dipertahankan saat receive → inventory_batches (sebelumnya unit di-drop, qty selalu dianggap pcs).' },
      { type: 'ui', text: 'Inventory batch display: append "240 pcs (= 20 karton)" preview untuk produk dengan pack_size > 1. PDF Nota & SP juga tampil unit user-friendly.' },
    ]
  },
  {
    version: 'v1.5.1-stable', date: '25 Mei 2026', status: 'stable',
    changes: [
      { type: 'feat', text: '🔧 OpnameModal CRUD Inline: Tambah/Edit/Hapus/Adjust batch langsung dari modal Stok Opname per-Batch. Tombol "+ Batch Baru" di header produk; per-batch action icons (Sliders/Pencil/Trash2) dengan tooltip. Zero context switch ke ProductDrawer.' },
      { type: 'fix', text: '🛡️ Backend Safety — Deleted Batch Tidak Bocor ke Nota: 4 query backend di-patch dengan filter COALESCE(is_active, TRUE) = TRUE. Dropdown batch nota + FEFO stock-out (stock-out, nota, opname legacy) semua skip batch yang sudah di-hapus.' },
      { type: 'ui', text: 'Empty State Polish: Produk tanpa batch kini tampilkan tombol "+ Tambah Batch Pertama" (CTA inline) — bukan pesan static "Lakukan Stok Masuk dulu".' },
    ]
  },
  {
    version: 'v1.5.0-stable', date: '25 Mei 2026', status: 'stable',
    changes: [
      { type: 'feat', text: '🪟 Liquid Glass Theme (Beta): Tema visual Apple-style (WWDC25) — sidebar/modal/drawer/cards berubah jadi semi-transparent dengan backdrop blur + saturate + inner glow. Toggle di Login page sebelah Dark Mode (icon Sparkles).' },
      { type: 'feat', text: 'Toggle Glass dari Login: Tombol di pojok kanan atas Login page. First-time enable tampil warning + auto-detect device <4GB RAM. Persist via localStorage habil_glass_mode.' },
      { type: 'feat', text: 'Animasi Transisi 350ms: Crossfade smooth saat toggle on/off (backdrop-filter + bg + border + shadow). Icon Glass micro-animation scale 1.08 saat aktif + ripple saat click.' },
      { type: 'fix', text: 'Triple Safety Net: (1) Git tag v1.4.2-pre-glass-stable untuk rollback. (2) URL kill switch ?glass=off untuk emergency disable. (3) Try-catch wrapper di hook — auto-disable kalau gagal.' },
      { type: 'ui', text: 'Apple HIG Compliance: Frost level 18/24/12 (regular/clear/ultra tier), saturate 180%, respect prefers-reduced-transparency + prefers-reduced-motion. Tabel & input field tidak kena glass untuk readability.' },
      { type: 'feat', text: 'Stats Cards Tinted: 4 metric card Dashboard pakai glass dengan tint warna sesuai (green/blue/orange/purple). Welcome modal "APA YANG BARU?" cards juga glass-aware.' },
    ]
  },
  {
    version: 'v1.4.2-stable', date: '25 Mei 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'Dashboard Dark Mode: Kanban Manajemen Tugas, task cards, DRAG HERE TO DELETE zone, modal add/edit tugas — semua kini ikut dark mode (sebelumnya hardcoded putih).' },
      { type: 'fix', text: 'Inventory Visual: Mini bar Stok tidak lagi muncul untuk produk tanpa Stok Minimum (hilangkan garis nyasar). Kolom Exp Terdekat: produk aman (>90 hari) tampil plain text, hanya yang mendekati/expired yang punya badge background.' },
      { type: 'feat', text: 'Nota Penjualan — Sort Kolom: Klik header No.Nota / Tanggal / Total untuk sort asc/desc dengan indicator chevron. Default sort by Tanggal terbaru.' },
      { type: 'feat', text: 'Customer — Metadata Cards: Setiap card kini tampil jumlah nota, total transaksi (compact), dan tanggal transaksi terakhir. Sort dropdown: A-Z / Z-A / Paling Aktif / Top Spender / Terlama.' },
      { type: 'ui', text: 'Customer Cards: Customer tanpa telepon & alamat tampil callout "Lengkapi data →" (clickable). Empty state baru dengan CTA "Tambah Customer Pertama".' },
      { type: 'ui', text: 'Accessibility: Aria-label untuk semua icon button (Cetak/Edit/Hapus di Nota + Customer cards). Fix colspan empty state Nota Penjualan (6 → 7).' },
    ]
  },
  {
    version: 'v1.4.1-stable', date: '24 Mei 2026', status: 'stable',
    changes: [
      { type: 'feat', text: 'Dark Mode di Login: Toggle ☀️/🌙 muncul di pojok kanan atas Login page — preferensi tersimpan di localStorage dan persist ke seluruh app.' },
      { type: 'feat', text: 'Welcome Modal Auto-Sync: Popup "APA YANG BARU?" tiap login otomatis render dari RELEASES[0].changes (ikon + badge per type: feat/fix/ui/perf). Tidak hardcoded lagi.' },
      { type: 'ui', text: 'Roadmap Cleanup: Password Hashing dipindah dari Upcoming → sudah implemented sejak v1.3.40 (bcrypt dual-mode). Tambah QR Scanner + Predictive Restocking + TypeScript Migration sebagai upcoming.' },
    ]
  },
  {
    version: 'v1.4.0-stable', date: '24 Mei 2026', status: 'stable',
    changes: [
      { type: 'feat', text: 'Inventory — Expandable Row: Klik chevron ▶ di list produk untuk lihat semua batch (No.Batch, ED, Qty, HNA) tanpa pindah halaman.' },
      { type: 'feat', text: 'Inventory — Detail Drawer: Klik nama produk → panel slide-in dari kanan dengan 3 tab: Profil, Batch (CRUD lengkap), Riwayat (timeline mutasi).' },
      { type: 'feat', text: 'Inventory — Edit Batch Penuh: No.Batch, ED, HNA, Catatan bisa di-edit langsung; qty via tombol Adjust dengan audit trail (alasan wajib).' },
      { type: 'feat', text: 'Stok Opname Per Batch: Modal opname rombak total — 2-pane layout, input fisik per batch, selisih ke-trace ke batch spesifik (bukan per-produk lagi).' },
      { type: 'ui', text: 'Inventory Toolbar: Tombol Stok Keluar kini di header (sebelumnya hanya icon row); tambah filter status (low/expiring/expired); mini stock bar visual di kolom Stok.' },
      { type: 'feat', text: 'Endpoint Baru: GET /products/:id/full, PUT/DELETE /batches/:id, POST /batches/:id/adjust + realtime socket emit setelah batch berubah.' },
      { type: 'fix', text: 'Schema: ALTER stock_opname.batch_id + inventory_batches.notes/is_active untuk per-batch tracking & soft-delete batch.' },
    ]
  },
  {
    version: 'v1.3.47-stable', date: '24 Mei 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'Tambah Produk Gagal: Error "duplicate key value violates unique constraint product_master_pkey" saat tambah produk baru di Inventory kini sudah teratasi. Penyebab: sequence ID tertinggal setelah migrasi data Supabase → Neon. Fix: auto-resync sequence saat backend start (juga untuk batch, mutations, dan opname).' },
    ]
  },
  {
    version: 'v1.3.46-stable', date: '11 Mei 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'Nota PDF — Layout 1 Halaman: PDF nota tidak lagi terpecah menjadi 2 halaman. NOTE, rekening, QRIS, dan tanda tangan kini selalu muncul bersama di bawah grand total — tidak ada lagi halaman kosong.' },
    ]
  },
  {
    version: 'v1.3.45-stable', date: '11 Mei 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'Nota PDF — Footer Sync: "Dengan senang hati melayani anda" dan data Pengaturan kini benar-benar masuk ke PDF (fix key mismatch shop_name/footer → company_name/footer_text).' },
      { type: 'feat', text: 'Nota PDF — Nama Penanda Tangan: Garis kanan nota kini menampilkan "Hormat kami," + nama penanda tangan yang diatur di Pengaturan.' },
      { type: 'feat', text: 'Nota PDF — Ketentuan / Notes: Tambah field ketentuan pengembalian di Pengaturan — tampil merah di PDF (NOTE: 1. 2. 3.).' },
      { type: 'feat', text: 'Nota PDF — Info Rekening & QRIS: Tambah field rekening bank dan teks QRIS di Pengaturan — tampil di PDF sebelum tanda tangan.' },
      { type: 'ui', text: 'Pengaturan Cetak: Tambah 4 field baru (Nama Penanda Tangan, Rekening Bank, QRIS, Ketentuan) dengan live preview yang menampilkan semua elemen nota.' },
    ]
  },
  {
    version: 'v1.3.45-stable', date: '10 Mei 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'Schema payment_status + paid_at: Kolom ini kini dibuat otomatis via ALTER TABLE — dashboard stats dan update status bayar tidak lagi crash pada fresh DB.' },
      { type: 'fix', text: 'Product Rename Sync: Rename produk kini juga update product_catalog — nama lama tidak lagi muncul di dropdown setelah diganti.' },
      { type: 'fix', text: 'Opname FOR UPDATE: Deduction batch saat opname kini pakai SELECT FOR UPDATE — mencegah double-deduct jika 2 opname berjalan bersamaan.' },
      { type: 'fix', text: 'Batch Picker Expired Filter: Dropdown batch di nota penjualan tidak lagi menampilkan batch yang sudah expired.' },
      { type: 'fix', text: 'Soft-delete GET/:id: Faktur dan Surat Pesanan yang sudah dihapus kini mengembalikan 404 — tidak bisa diakses via direct URL.' },
      { type: 'fix', text: 'Over-receive Guard: Penerimaan barang (SP → Faktur) kini divalidasi — tidak bisa menerima lebih dari qty yang dipesan.' },
      { type: 'fix', text: 'HPP NaN Fix: Kolom HPP di daftar faktur tidak lagi menampilkan "NaN" untuk item dengan hna_per_item = 0.' },
      { type: 'perf', text: 'API Timeout: Timeout global naik dari 10s → 30s — PDF dan operasi besar tidak lagi timeout di production.' },
      { type: 'perf', text: 'Kanban History: Hapus wasted API call (tasksAPI.getAll) setiap buka history task.' },
    ]
  },
  {
    version: 'v1.3.43-stable', date: '10 Mei 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'FEFO Transaction Safety: Stock deduction nota penjualan kini berada di dalam DB transaction — mencegah race condition stok negatif saat 2 user order bersamaan.' },
      { type: 'fix', text: 'FEFO Expired Filter: Batch yang sudah expired tidak lagi dipakai untuk penjualan (filter expired_date >= today).' },
      { type: 'fix', text: 'Stok Kurang Error: Jika stok tidak cukup saat buat nota, transaksi dibatalkan otomatis + pesan error jelas (sebelumnya: nota tersimpan tapi stok tidak terpotong).' },
      { type: 'fix', text: 'Invoice Transaction: Simpan faktur masukan kini atomic — jika auto stock-in gagal, seluruh faktur dibatalkan (tidak ada data setengah-setengah).' },
      { type: 'fix', text: 'Invoice Delete Cleanup: Hapus permanen faktur kini juga membersihkan inventory_batches dan mutations terkait — tidak ada lagi phantom stock.' },
      { type: 'fix', text: 'Schema Missing Columns: Tambah ALTER TABLE untuk gross_profit (sales_orders) dan unit_hpp (sales_items) — fresh DB tidak lagi crash saat buat nota.' },
      { type: 'perf', text: 'Invoice List: Faktur tidak lagi auto-expand semua baris saat halaman dibuka — menghilangkan 50+ API calls beruntun yang memperlambat halaman.' },
      { type: 'ui', text: 'Filter Tahun Dinamis: Dropdown filter tahun di Nota Penjualan kini auto-generate ±2 tahun dari tahun sekarang — tidak lagi stuck di 2024-2026.' },
    ]
  },
  {
    version: 'v1.3.42-stable', date: '10 Mei 2026', status: 'stable',
    changes: [
      { type: 'feat', text: 'Product MasterSelect di Nota: Dropdown produk di form nota penjualan kini dilengkapi CRUD inline — cari, tambah, rename, dan hapus produk langsung dari nota.' },
      { type: 'feat', text: 'HPP Auto-fill Reliable: Pilih produk via dropdown → HPP/HNA otomatis terisi dari batch FEFO, bisa diedit manual per baris.' },
      { type: 'fix', text: 'Error Feedback Inventory: Pesan error saat tambah/edit produk kini tampil merah (❌) di dalam modal dan sebagai toast — tidak lagi tampil hijau seperti sukses.' },
    ]
  },
  {
    version: 'v1.3.42-stable', date: '05 Mei 2026', status: 'stable',
    changes: [
      { type: 'feat', text: 'Batch Number Faktur: Field No. Batch/Lot per item di faktur masukan — tersimpan ke inventory batch untuk traceability.' },
      { type: 'feat', text: 'Tempo Pembayaran Nota: Quick-select 7/14/30 hari di form nota penjualan — due_date otomatis terhitung dari tanggal jual.' },
      { type: 'feat', text: 'Quick-Select Jatuh Tempo Faktur: Tombol +1/+7/+21/+30 hari di form faktur untuk isi due_date cepat.' },
      { type: 'feat', text: 'Dropdown Batch Harga Nota: Pilih batch spesifik (batch_no + ED + stok + HNA) saat input produk di nota — harga otomatis dari batch FEFO.' },
      { type: 'ui', text: 'Animasi Overdue: Badge jatuh tempo merah berkedip (pulse) saat faktur/nota sudah melewati due_date.' },
      { type: 'fix', text: 'Persistent Login: Token JWT diperpanjang 15 menit → 7 hari — user tidak perlu login ulang setiap buka browser.' },
    ]
  },
  {
    version: 'v1.3.40-stable', date: '26 Apr 2026', status: 'stable',
    changes: [
      { type: 'feat', text: 'Keamanan: Password hashing bcrypt (dual-mode migration) — plaintext otomatis di-upgrade saat login.' },
      { type: 'feat', text: 'Rate Limiting: Login dibatasi 5x per 15 menit per IP untuk mencegah brute force.' },
      { type: 'feat', text: 'Auth Middleware: Semua endpoint Tasks kini memerlukan token JWT.' },
      { type: 'feat', text: 'Validasi Hapus Customer: Customer yang masih punya nota belum lunas tidak bisa dihapus.' },
      { type: 'ui', text: 'Toast Notifications: Semua alert() browser diganti dengan toast notification in-app.' },
      { type: 'ui', text: 'Empty States: Tampilan "belum ada data" di semua halaman list.' },
      { type: 'ui', text: 'PDF Loading State: Tombol Cetak menampilkan "Membuat PDF..." dan di-disable saat proses berlangsung.' },
      { type: 'ui', text: 'Mobile Responsive Tables: Semua tabel kini bisa di-scroll horizontal di layar kecil.' },
    ]
  },
  {
    version: 'v1.3.39-stable', date: '29 Apr 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Pelunasan Date Picker: Klik badge BELUM BAYAR → modal pilih tanggal pelunasan. Tanggal LUNAS bisa diedit kapan saja (✏️).' },
      { type: 'new', text: 'Batalkan Pelunasan: Modal edit menampilkan tombol untuk mengembalikan status ke Belum Bayar.' },
      { type: 'new', text: 'Channel Online/Offline: Setiap nota kini punya flag 🏪 Offline / 🛒 Online — untuk laporan pajak (digunggung vs tidak). Tidak tampil di PDF.' },
      { type: 'ui', text: 'Filter Saluran: Dropdown filter baru "Semua Saluran / Offline / Online" di halaman Nota Penjualan.' },
      { type: 'ui', text: 'Badge Channel: Kolom Customer menampilkan badge OFFLINE/ONLINE di bawah nama customer.' },
    ]
  },
  {
    version: 'v1.3.38-stable', date: '23 Apr 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'Edit SP Loading: Tombol Simpan kini menampilkan "Menyimpan..." dan error edit tampil inline.' },
      { type: 'fix', text: 'Auto Counter SP: Counter sync ke MAX aktual sebelum increment — tidak loncat setelah SP dihapus.' },
      { type: 'fix', text: 'Manual SP: Nomor SP yang sudah dihapus kini bisa dipakai ulang (partial unique index).' },
      { type: 'fix', text: 'Edit SP Date: Estimasi Tiba kosong tidak lagi menyebabkan error "invalid input syntax for type date".' },
      { type: 'ui', text: 'Sort Tabel SP: Klik header kolom untuk sort asc/desc · Shift+klik untuk multi-column sort (contoh: Tanggal ▼ + No.SP ▼ = terkini) · tombol ↺ Reset Sort muncul saat aktif.' },
    ]
  },
  {
    version: 'v1.3.38-stable', date: '23 Apr 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'Duplicate Key Customer: Reset sequence customers_id_seq — mencegah error saat tambah customer baru di Nota Penjualan.' },
      { type: 'fix', text: 'Duplicate Key Bug Report: Reset sequence bug_reports_id_seq — mencegah error saat kirim laporan bug.' },
      { type: 'fix', text: 'Cleanup Supabase: Hapus sisa referensi Supabase dari kode aktif. Sistem kini full Neon.' },
    ]
  },
  {
    version: 'v1.3.36-stable', date: '20 Mar 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'Counter Auto Desync: Manual save otomatis mengupdate sequence counter (Purchase Orders & Sales).' }
    ]
  },
  {
    version: 'v1.3.34-stable', date: '20 Mar 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'Duplicate Key Error Items: Sinkronisasi sequence tabel items dengan id maksimal real di DB.' }
    ]
  },
  {
    version: 'v1.3.33-stable', date: '20 Mar 2026', status: 'stable',
    changes: [
      { type: 'ui', text: 'Split Number Field: Prefix HSB-SP-/NOTA- dibuat readonly; field angka memiliki input mandiri.' },
      { type: 'fix', text: 'Counter Increment Refetch: Memastikan frontend memanggil ulang fetchCounters setelah save mode Auto.' }
    ]
  },
  {
    version: 'v1.3.32-stable', date: '20 Mar 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'Document Counter: Sinkronisasi nilai MAX(id) untuk SP untuk mencegah collision manual SP.' },
      { type: 'ui', text: 'Mode Dokumen: Sentralisasi tombol Auto/Manual ke dalam UI Pembuatan SP dan Nota.' }
    ]
  },
  {
    version: 'v1.3.31-stable', date: '20 Mar 2026', status: 'stable',
    changes: [
      { type: 'ui', text: 'UX Polish: Standarisasi seluruh copy/teks UI ke Bahasa Indonesia (Tombol Buat, Nama Menu, dll).' },
      { type: 'ui', text: 'Safe Actions: Universal Confirm Modal menggantikan window.confirm default browser.' },
      { type: 'ui', text: 'Navigasi: Breadcrumbs ditambahkan untuk semua halaman.' }
    ]
  },
  {
    version: 'v1.3.30-stable', date: '20 Mar 2026', status: 'stable',
    changes: [
      { type: 'ui', text: 'Mobile: Content area full-width saat sidebar hidden (centralized padding).' },
      { type: 'fix', text: 'Inventory Alert: Counter header sinkron dengan isi tab (exclude expired batches).' },
      { type: 'fix', text: 'Release Modal: sessionStorage di-clear saat logout — modal muncul setiap login baru.' },
      { type: 'ui', text: 'Form Nota: Validasi inline (red border + pesan error) menggantikan alert mentah.' },
      { type: 'ui', text: 'Loading: Skeleton loader di header mencegah flash "0 records".' }
    ]
  },
  {
    version: 'v1.3.29-stable', date: '20 Mar 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'BUG-001: Task creation — validasi input wajib, null-safe binding teratasi dari error 500 Vercel.' },
      { type: 'fix', text: 'BUG-002: HPP auto-fill dari FEFO batch — fallback multi-tier ke sell_price produk.' }
    ]
  },
  {
    version: 'v1.3.28-stable', date: '16 Mar 2026', status: 'stable',
    changes: [
      { type: 'ui', text: 'Sidebar Mobile: Redesign ke Modal Navigation Drawer (overlay 0.5 + blur, rounded edge, shadow lebih dalam).' },
      { type: 'ui', text: 'Animasi: Slide-in/out + backdrop fade 280ms dengan easing smooth.' },
      { type: 'fix', text: 'UX Drawer: Klik backdrop/menu auto-close, swipe kiri untuk tutup, focus trap + Escape, dan lock body scroll.' }
    ]
  },
   {
    version: 'v1.3.21-stable', date: '15 Mar 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'Nota: Header PDF kini menampilkan alamat & nomor telepon CV Habil dari pengaturan.' },
      { type: 'fix', text: 'Nota: Field HPP di form sekarang punya label yang jelas (sebelumnya hanya placeholder).' },
      { type: 'feat', text: 'Nota: Customer dropdown diupgrade ke MasterSelect dengan search, edit, delete, & tambah baru.' }
    ]
  },
   {
    version: 'v1.3.19-stable', date: '14 Mar 2026', status: 'stable',
    changes: [
      { type: 'feat', text: 'Tasks: Fitur Tempat Sampah (Trash) untuk melihat & restore task yang dihapus.' },
      { type: 'feat', text: 'Tasks: Support penghapusan permanen dari database via Trash.' },
      { type: 'ui', text: 'Tasks: Modal interaktif Trash yang elegan dan user-friendly.' }
    ]
  },
  {
    version: 'v1.3.18-stable', date: '14 Mar 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'Pengaturan: Perbaikan error "Gagal menyimpan pengaturan" & sinkronisasi data.' },
      { type: 'feat', text: 'Nota: Tracking status pembayaran (Lunas/Belum) dengan 1-click toggle.' },
      { type: 'feat', text: 'Nota: CRUD HPP per item barang dan kalkulasi otomatis Laba Kotor.' }
    ]
  },
  {
    version: 'v1.3.17-stable', date: '14 Mar 2026', status: 'stable',
    changes: [
      { type: 'feat', text: 'Nota: Tracking status pembayaran (Lunas/Belum) dengan 1-click toggle.' },
      { type: 'feat', text: 'Nota: CRUD HPP per item barang dan kalkulasi otomatis Laba Kotor.' },
      { type: 'ui', text: 'Dashboard: Card statistik baru untuk total Laba Kotor (Paid Only).' },
      { type: 'fix', text: 'Inventory: Auto-fill HPP default dari master produk saat pilih barang di Nota.' }
    ]
  },
  {
    version: 'v1.3.15-stable', date: '14 Mar 2026', status: 'stable',
    changes: [
      { type: 'feat', text: 'Infrastructure: Migrasi database ke Neon.tech (Postgres Serverless) untuk optimasi kecepatan.' },
      { type: 'fix', text: 'Performance: Penurunan latency query database dan cold-start yang lebih responsif.' }
    ]
  },
  {
    version: 'v1.3.7-stable', date: '14 Mar 2026', status: 'stable',
    changes: [
      { type: 'docs', text: 'SOP Maintenance: Penutupan sesi, auto-journaling insiden schema Vercel.' },
      { type: 'fix', text: 'Global Audit: Verifikasi stabilitas database API dan sistem log v1.3.7.' }
    ]
  },
  {
    version: 'v1.3.6-stable', date: '14 Mar 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'Database: Migrasi skema "pic" pada tabel tasks untuk mencegah error 500 saat Simpan Tugas.' },
      { type: 'feat', text: 'Stability: Inisialisasi ulang seluruh skema Kanban pada database cloud.' }
    ]
  },
  {
    version: 'v1.3.5-stable', date: '14 Mar 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'Kanban: Resolusi tombol Simpan yang tidak responsif di beberapa skenario.' },
      { type: 'fix', text: 'Kanban: Penyelarasan opsi prioritas (High/Medium/Low) di modal pembuatan tugas.' },
      { type: 'fix', text: 'State Management: Perbaikan pembersihan form (state reset) setelah tugas tersimpan.' }
    ]
  },
  {
    version: 'v1.3.4-standard', date: '14 Mar 2026', status: 'stable',
    changes: [
      { type: 'feat', text: 'Stability: Konsolidasi database connection pool untuk mencegah error MaxClients.' },
      { type: 'feat', text: 'Kanban: Fitur penugasan PIC (Harun/Fivin/Admin) dengan react-select.' },
      { type: 'fix', text: 'Kanban: Perbaikan bug tombol Simpan dan sinkronisasi modal detail.' },
      { type: 'ui', text: 'Sidebar: Rename "Pengaturan Cetak" menjadi "Pengaturan" yang lebih universal.' }
    ]
  },
  {
    version: 'v1.3.2-standard', date: '13 Mar 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'Universal Sync: Sinkronisasi total label versi ke format v1.3.2-standard.' },
      { type: 'new', text: 'UI Audit: Pembersihan sisa-sisa label versi lama di seluruh tampilan.' }
    ]
  },
  {
    version: 'v1.2.5', date: '13 Mar 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'Global Version Sync: Penyelarasan seluruh label versi di UI & Dokumentasi.' },
      { type: 'new', text: 'Consistency: Sinkronisasi riwayat changelog modal dengan CHANGELOG.md.' }
    ]
  },
  {
    version: 'v1.2.5', date: '13 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Session Shutdown: Penutupan sesi dan auditing SOP otomatis.' }
    ]
  },
  {
    version: 'v1.2.1', date: '13 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Auto-Release Popup: Menampilkan ringkasan update HANYA SEKALI setelah login.' },
      { type: 'fix', text: 'Pre-Deployment Audit: Koneksi production dipastikan stabil.' }
    ]
  },
  {
    version: 'v1.2.0', date: '13 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Master Distributor: Penambahan short_code, nama salesman, dan nomor HP.' },
      { type: 'new', text: 'Surat Pesanan (SP): UI PIC Dropdown (Harun/Fivin) & Info Salesman Otomatis.' },
      { type: 'new', text: 'Print SP A6: Layout "Blue Area" khusus kertas A6 tersentral.' }
    ]
  },
  {
    version: 'v1.1.9', date: '13 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Branding: App kini resmi bernama HABIL SUPERAPP.' },
      { type: 'new', text: 'Migrasi Counter: Sistem Auto-Numbering untuk SP, Nota, TT (Lock/Unlock feature).' }
    ]
  },
  {
    version: 'v1.1.8', date: '13 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Documentation Consolidation: Single technical source of truth di CHANGELOG.md' },
      { type: 'new', text: 'Health Check Automatis: Pre-flight check DB setiap npm run dev' },
      { type: 'fix', text: 'Performance: Database indexing untuk pencarian produk' }
    ]
  },
  {
    version: 'v1.1.7', date: '13 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'AI Efficiency Rules: Standarisasi Port 6543 & Dynamic API URL' },
      { type: 'fix', text: 'Smart API: Deteksi otomatis environment Lokal vs Vercel' }
    ]
  },
  {
    version: 'v1.1.6', date: '12 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Data Sync: Auto-restore data produk & customer dari cloud backup' },
      { type: 'new', text: 'Sync Script: Tool mandiri untuk tarik data terbaru dari Supabase' }
    ]
  },
  {
    version: 'v1.1.5', date: '12 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Cloud Bridge: Koneksi langsung ke database Supabase via Cloud URI' },
      { type: 'fix', text: 'Diagnostic Check: Script verifikasi koneksi database (Lokal/Cloud)' }
    ]
  },
  {
    version: 'v1.1.4', date: '12 Mar 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'Quality Assurance: Automated tests untuk Skeleton components' },
      { type: 'fix', text: 'Dashboard Fix: Perbaikan import React yang hilang' }
    ]
  },
  {
    version: 'v1.1.3', date: '12 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Premium UX: Implementasi Skeleton Loading (Apple Style)' },
      { type: 'fix', text: 'Layout Consistency: Pencegahan layout shift saat muat data' }
    ]
  },
  {
    version: 'v1.1.2', date: '12 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Dashboard Notes: Menambahkan bagian catatan/pengumuman penting untuk feedback user' },
      { type: 'fix', text: 'Version Sync: Sinkronisasi versi v1.1.2 di seluruh sistem (Anti-Belang)' },
      { type: 'fix', text: 'UI Fix: Perbaikan minor di halaman Print Settings' }
    ]
  },
  {
    version: 'v1.1.1', date: '12 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Cloud Migration: Integrasi penuh dengan Vercel & Supabase (Singapore Region)' },
      { type: 'fix', text: 'CORS Fix: Perbaikan akses antar domain di lingkungan produksi' },
      { type: 'new', text: 'Nota PDF Builder: Layout landscape untuk A5 & A6' }
    ]
  },
  {
    version: 'v1.1.0', date: '12 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Dashboard Stats Integrasi: Angka penjualan, pesanan aktif, stok low, dan customer kini real-time dari database' },
      { type: 'new', text: 'Database Seed Master: Integrasi data existing SP, Customer, dan Distributor ke sistem' }
    ]
  },
  {
    version: 'v1.0.0', date: '12 Mar 2026', status: 'stable',
    changes: [
      { type: 'new', text: 'Toko Online: Import CSV Shopee & TikTok, Kalkulasi profit' },
      { type: 'new', text: 'Buku Besar: Sistem Jurnal Keuangan Khusus Direktur' },
      { type: 'new', text: 'Surat Pesanan: Auto-PO, tracking receive langsung masuk Inventory' },
      { type: 'new', text: 'Inventory: FEFO tracking otomatis' },
    ]
  },
  {
    version: 'v0.6.3', date: '11 Mar 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'ESLint warnings bersih: unused imports & missing dependencies diperbaiki' },
      { type: 'fix', text: 'Database branch isolation: otomatis deteksi branch git & load .env.dev di dev branch' },
      { type: 'new', text: 'Clean Repo: hapus ~10MB file sampah, build lama, dan CRA boilerplate' },
    ]
  },
  {
    version: 'v0.6.2', date: '11 Mar 2026', status: 'stable',
    changes: [
      { type: 'fix', text: 'Bug tanggal: restore parseLocalDate/formatLocalDate + TO_CHAR di backend' },
      { type: 'new', text: 'Warna unik per distributor di rekap stack & row tabel' },
    ]
  }
];

// UPCOMING_FEATURES — single source of truth untuk roadmap modal "Changelog & Roadmap".
// Cara update: tambah/edit/hapus entry. Saat fitur shipped, HAPUS dari sini dan tambahkan ke RELEASES[0].changes.
// Fields: priority ('high'|'medium'|'low'), title (string), desc (string).
const upcoming = [
  { priority: 'high', title: 'Export PDF / Excel', desc: 'Export faktur individual atau rekap bulanan ke PDF & Excel untuk laporan dan arsip' },
  { priority: 'high', title: 'Halaman Finance & Karyawan', desc: 'Modul lanjutan untuk penggajian dan manajemen hutang/piutang' },
  { priority: 'medium', title: 'QR / Barcode Scanner', desc: 'Scan barcode produk untuk stok masuk / keluar / opname lebih cepat' },
  { priority: 'medium', title: 'Predictive Restocking', desc: 'Alert otomatis kapan harus restock berdasarkan velocity penjualan + lead time supplier' },
  { priority: 'low', title: 'TypeScript Migration', desc: 'Full type safety untuk seluruh codebase' },
];

export default function Dashboard({ isDarkMode, isSidebarOpen, isMobile }) {
  const [showModal, setShowModal] = useState(false);
  const [showDevNotes, setShowDevNotes] = useState(false);
  const [loading, setLoading] = useState(true);
  // Show release modal once per session (per new login), reset on new version
  const [showReleaseModal, setShowReleaseModal] = useState(() => {
    const latestVersion = RELEASES[0]?.version || 'v1.8.0-stable';
    const storageKey = `habil_release_seen_${latestVersion.replace(/\./g, '_')}`;
    return !sessionStorage.getItem(storageKey);
  });

  const bg = isDarkMode ? '#000' : '#F5F5F7';
  const cardBg = isDarkMode ? '#1C1C1E' : '#FFF';
  const border = isDarkMode ? '#2C2C2E' : '#E5E5EA';
  const text = isDarkMode ? '#FFF' : '#000';
  const sub = '#86868B';

  const typeConfig = {
    new:       { label: 'Baru',     color: '#34C759', bg: '#34C75918' },
    fix:       { label: 'Fix',      color: '#007AFF', bg: '#007AFF18' },
    feat:      { label: 'Fitur',    color: '#34C759', bg: '#34C75918' },
    ui:        { label: 'UI/UX',    color: '#5856D6', bg: '#5856D618' },
    docs:      { label: 'Docs',     color: '#FF9500', bg: '#FF950018' },
    changed:   { label: 'Ubah',     color: '#FF9500', bg: '#FF950018' },
    stability: { label: 'Stabil',   color: '#34C759', bg: '#34C75918' },
    removed:   { label: 'Hapus',    color: '#FF3B30', bg: '#FF3B3018' },
  };
  const priorityConfig = {
    high:   { label: 'Prioritas Tinggi', color: '#FF3B30', bg: '#FF3B3018' },
    medium: { label: 'Sedang',           color: '#FF9500', bg: '#FF950018' },
    low:    { label: 'Nanti',            color: '#86868B', bg: '#86868B18' },
  };

  const [stats, setStats] = useState({
    totalPenjualan: 0,
    totalLaba: 0,
    suratPesananAktif: 0,
    stokLowExpired: 0,
    totalCustomer: 0
  });

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/dashboard/stats');
        setStats(data);
      } catch (error) {
        console.error('Failed to fetch dashboard stats', error);
      } finally {
        setTimeout(() => setLoading(false), 500); // Small delay for smooth transition
      }
    };
    fetchStats();
  }, []);

  const closeReleaseModal = () => {
    setShowReleaseModal(false);
    const latestVersion = RELEASES[0]?.version || 'v1.8.0-stable';
    const storageKey = `habil_release_seen_${latestVersion.replace(/\./g, '_')}`;
    sessionStorage.setItem(storageKey, 'true');
  };

  const formatRupiah = (number) => {
    if (number >= 1000000) {
      return 'Rp ' + (number / 1000000).toFixed(1) + 'M';
    }
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number);
  };


  return (
    <div className="font-sans min-h-screen transition-all duration-300" style={{ padding: isMobile ? '1rem' : '2.5rem', paddingTop: isMobile ? '4rem' : '2.5rem', backgroundColor: bg }}>
      
      {/* Header Section */}
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-3xl font-bold mb-2 tracking-tight" style={{ color: text }}>Dashboard</h1>
          <p className="text-sm font-medium" style={{ color: sub }}>Welcome back to HABIL SUPERAPP.</p>
        </div>
        
        {/* Version Badge & Changelog Trigger */}
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-full border transition-colors hover:shadow-sm"
          style={{ backgroundColor: cardBg, borderColor: border, color: text }}
        >
          <Info size={16} className="text-blue-500" />
          <span className="text-sm font-semibold">Version {RELEASES[0]?.version}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium ml-2">Release Notes</span>
        </button>
      </div>

      {/* Kanban Tasks Section - MOVED TO TOP */}
      <div className="glass-target mb-10 rounded-3xl p-8 border shadow-sm" style={{ backgroundColor: cardBg, borderColor: border }}>
        <TasksKanban isDarkMode={isDarkMode} isMobile={isMobile} />
      </div>

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {[
          { label: 'Total Penjualan bln ini', value: stats.totalPenjualan, type: 'currency', tint: 'green', icon: <Activity size={24} className="text-green-500"/> },
          { label: 'Laba Kotor bln ini', value: stats.totalLaba, type: 'currency', tint: 'blue', icon: <Activity size={24} className="text-blue-500"/> },
          { label: 'Surat Pesanan Aktif', value: stats.suratPesananAktif, type: 'number', tint: 'orange', icon: <ShoppingCart size={24} className="text-orange-500"/> },
          { label: 'Stok Low/Expired', value: stats.stokLowExpired, type: 'number', tint: 'purple', icon: <Package size={24} className="text-red-500"/> },
        ].map((stat, i) => (
          <div key={i} className={`glass-target glass-target--tint-${stat.tint} rounded-2xl p-6 border shadow-sm`} style={{ backgroundColor: cardBg, borderColor: border }}>
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-gray-50 rounded-xl dark:bg-gray-800">{stat.icon}</div>
            </div>
            {loading ? (
              <Skeleton width="80%" height="36px" className="mb-2" />
            ) : (
              <h3 className="text-3xl font-bold mb-1" style={{ color: text }}>
                {stat.type === 'currency' ? formatRupiah(stat.value) : stat.value.toString()}
              </h3>
            )}
            <p className="text-sm font-medium" style={{ color: sub }}>{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Quick Access Section - Compacted Row */}
      <div className="flex flex-col md:flex-row gap-6 mb-10">
        <div className="glass-target flex-1 rounded-3xl p-6 border shadow-sm flex items-center justify-between" style={{ backgroundColor: cardBg, borderColor: border }}>
          <div className="flex items-center gap-6">
            <h2 className="text-lg font-bold" style={{ color: text }}>Akses Cepat</h2>
            <div className="flex flex-wrap gap-3">
              <a href="/sales" className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-1"><Plus size={14} /> Buat Nota</a>
              <a href="/orders" className="px-4 py-2 rounded-xl border text-xs font-semibold transition-all hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center gap-1" style={{ borderColor: border, color: text }}><Plus size={14} /> Buat SP</a>
              <a href="/online-store" className="px-4 py-2 rounded-xl border text-xs font-semibold transition-all hover:bg-gray-50 dark:hover:bg-gray-800" style={{ borderColor: border, color: text }}>CSV Online</a>
            </div>
          </div>
          
          <button 
            onClick={() => setShowDevNotes(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-blue-100 bg-blue-50/30 text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <Info size={14} />
            <span className="text-xs font-bold">Catatan Developer</span>
          </button>
        </div>
      </div>

      {/* Auto-Release Popup v1.2.1 */}
      {showReleaseModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] transition-opacity">
          <div
            className="glass-target glass-target--clear w-full max-w-lg overflow-hidden rounded-3xl shadow-2xl flex flex-col transform transition-all scale-100"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
          >
            <div style={{ color: sub, fontSize: '11px', fontWeight: 'bold', marginTop: '1.5rem', opacity: 0.5 }}>
            HABIL SUPERAPP v1.8.0-stable — 2026
          </div>
            {/* Spotlight Header */}
            <div className="relative p-8 text-center" style={{ background: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)' }}>
              <div className="mx-auto w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4 shadow-inner backdrop-blur-sm">
                <span className="text-3xl">🚀</span>
              </div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight">APA YANG BARU?</h2>
              <p className="text-white/80 font-medium mt-1">Habil SuperApp {RELEASES[0]?.version} telah mengudara!</p>
            </div>

            {/* Content Highlights — auto-sourced dari RELEASES[0].changes */}
            <div className="p-6 pb-2" style={{ backgroundColor: bg }}>
              <div className="flex flex-col gap-3 max-h-[55vh] overflow-y-auto pr-1">
                {(RELEASES[0]?.changes || []).slice(0, 6).map((c, idx) => {
                  const typeMeta = {
                    feat:   { Icon: Sparkles, bg: 'bg-blue-50 dark:bg-blue-900/30',     fg: 'text-blue-600 dark:text-blue-400',     label: 'BARU' },
                    new:    { Icon: Sparkles, bg: 'bg-blue-50 dark:bg-blue-900/30',     fg: 'text-blue-600 dark:text-blue-400',     label: 'BARU' },
                    fix:    { Icon: Wrench,   bg: 'bg-green-50 dark:bg-green-900/30',   fg: 'text-green-600 dark:text-green-400',   label: 'FIX' },
                    ui:     { Icon: Palette,  bg: 'bg-purple-50 dark:bg-purple-900/30', fg: 'text-purple-600 dark:text-purple-400', label: 'UI' },
                    perf:   { Icon: Zap,      bg: 'bg-orange-50 dark:bg-orange-900/30', fg: 'text-orange-600 dark:text-orange-400', label: 'CEPAT' },
                  }[c.type] || { Icon: Activity, bg: 'bg-gray-50 dark:bg-gray-800', fg: 'text-gray-500', label: c.type?.toUpperCase() };
                  const TypeIcon = typeMeta.Icon;
                  const [headLine, ...rest] = (c.text || '').split(':');
                  const heading = rest.length ? headLine : headLine.length > 60 ? headLine.slice(0, 60) + '…' : headLine;
                  const body = rest.length ? rest.join(':').trim() : '';
                  return (
                    <div key={idx} className="flex gap-3 items-start p-3.5 rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700">
                      <div className={`p-2 rounded-xl ${typeMeta.bg} ${typeMeta.fg} flex-shrink-0`}>
                        <TypeIcon size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-bold text-gray-900 dark:text-white leading-tight text-sm">{heading}</h3>
                          <span className={`text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded ${typeMeta.bg} ${typeMeta.fg}`}>{typeMeta.label}</span>
                        </div>
                        {body && (
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 leading-relaxed">{body}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
                {(RELEASES[0]?.changes?.length || 0) > 6 && (
                  <p className="text-xs text-center text-gray-500 dark:text-gray-400 italic py-1">
                    + {RELEASES[0].changes.length - 6} perubahan lainnya di Changelog
                  </p>
                )}
                {(RELEASES[0]?.changes?.length || 0) === 0 && (
                  <p className="text-sm text-center text-gray-500 dark:text-gray-400 py-4">Tidak ada catatan perubahan untuk versi ini.</p>
                )}
              </div>
            </div>
            
            {/* CTA Button */}
            <div className="p-6 pt-4 flex justify-center" style={{ backgroundColor: bg }}>
              <button 
                onClick={closeReleaseModal}
                className="w-full py-3.5 rounded-xl text-white font-bold text-base shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all outline-none focus:ring-4 focus:ring-blue-500/50"
                style={{ background: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)' }}
              >
                Siap, Gas!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Changelog & Upcoming Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] transition-opacity">
          <div
            className="glass-target glass-target--clear w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-3xl shadow-2xl flex flex-col"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b" style={{ borderColor: border }}>
              <div>
                <h2 className="text-xl font-bold" style={{ color: text }}>🚀 Changelog & Roadmap</h2>
                <p className="text-xs mt-1" style={{ color: sub }}>Aktual: {RELEASES[0]?.version} - Terakhir diupdate {RELEASES[0]?.date}</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <X size={20} style={{ color: sub }} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto" style={{ backgroundColor: bg }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Release History */}
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: sub }}>
                    🕐 Release History
                  </h3>
                  {RELEASES.map((rel, ri) => (
                    <div key={ri} className="rounded-2xl p-5 mb-4 border shadow-sm" style={{ backgroundColor: cardBg, borderColor: border }}>
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold" style={{ color: text }}>{rel.version}</span>
                          <span className="text-xs font-bold px-2.5 py-1 rounded-md" style={{ backgroundColor: rel.status === 'latest' ? '#34C75918' : '#007AFF18', color: rel.status === 'latest' ? '#34C759' : '#007AFF' }}>
                            {rel.status === 'latest' ? 'LATEST' : 'STABLE'}
                          </span>
                        </div>
                        <span className="text-xs font-medium" style={{ color: sub }}>{rel.date}</span>
                      </div>
                      <div className="flex flex-col gap-3">
                        {rel.changes && rel.changes.length > 0 ? (
                          rel.changes.map((c, ci) => {
                            try {
                              const cfg = typeConfig[c.type] || typeConfig.fix;
                              return (
                                <div key={ci} className="flex gap-3 items-start">
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase mt-0.5 shrink-0" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                                    {cfg.label}
                                  </span>
                                  <span className="text-sm leading-relaxed" style={{ color: isDarkMode ? '#EBEBF0' : '#3A3A3C' }}>{c.text}</span>
                                </div>
                              );
                            } catch (err) {
                              console.error(`[Dashboard] Error rendering change at index ${ci}:`, err);
                              return <div key={ci} style={{ color: 'red' }}>Error rendering change</div>;
                            }
                          })
                        ) : (
                          <div style={{ color: 'orange' }}>No changes recorded</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Upcoming */}
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: sub }}>
                    🌟 Upcoming Features
                  </h3>
                  {upcoming.map((item, i) => {
                    const cfg = priorityConfig[item.priority];
                    return (
                      <div key={i} className="rounded-2xl p-5 mb-3 border flex gap-4 items-start shadow-sm transition-transform hover:-translate-y-0.5" style={{ backgroundColor: cardBg, borderColor: border }}>
                        <div className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: cfg.color, boxShadow: `0 0 8px ${cfg.color}80` }} />
                        <div className="flex-1">
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="font-semibold" style={{ color: text }}>{item.title}</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                              {cfg.label}
                            </span>
                          </div>
                          <p className="text-xs leading-relaxed" style={{ color: sub }}>{item.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="p-4 border-t flex justify-end" style={{ borderColor: border, backgroundColor: cardBg }}>
              <button 
                onClick={() => setShowModal(false)}
                className="px-6 py-2 rounded-xl bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Developer Notes Modal */}
      {showDevNotes && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] transition-opacity">
          <div
            className="glass-target glass-target--clear w-full max-w-md overflow-hidden rounded-3xl shadow-2xl flex flex-col"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
          >
            <div className="flex justify-between items-center p-6 border-b" style={{ borderColor: border }}>
              <div className="flex items-center gap-3 text-blue-500">
                <Info size={20} />
                <h2 className="text-lg font-bold">Catatan Developer</h2>
              </div>
              <button onClick={() => setShowDevNotes(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <X size={20} style={{ color: sub }} />
              </button>
            </div>
            <div className="p-8">
              <p className="text-sm leading-relaxed mb-6" style={{ color: sub }}>
                Mungkin ada beberapa fitur yang belum work atau "ganjel" dalam penggunaannya, bisa dilaporkan via 
                <span className="font-bold text-blue-500 mx-1">Bug / Saran Fitur</span> 
                di sidebar agar segera diperbaiki oleh tim pengembang.
              </p>
              <div className="p-4 rounded-2xl bg-blue-50 text-xs font-medium text-blue-600 flex gap-3 items-start border border-blue-100">
                 <Activity size={16} className="mt-0.5 shrink-0" />
                 <span>Ekspektasi Performa: Latency antar pulau (Singapore) ~500ms - 1s (Normal).</span>
              </div>
            </div>
            <div className="p-4 border-t flex justify-center" style={{ borderColor: border, backgroundColor: bg }}>
              <button 
                onClick={() => setShowDevNotes(false)}
                className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-all"
              >
                Tutup Catatan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}