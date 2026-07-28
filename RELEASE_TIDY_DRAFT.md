# Draft Rapi-rapi GitHub Releases — dashboard-app-cvhabil

Draft ini **belum diterapkan ke GitHub**. Isi dibaca dari `gh release view` untuk 12 tag lama
(v0.1.0 – v1.0.1), dirapikan judulnya jadi format seragam `vX.Y.Z — Ringkasan`, dan badan rilis
dirapikan jadi poin-poin tanpa mengubah fakta. Setelah direview, terapkan manual via
`gh release edit <TAG> --title "..." --notes-file <file>` (di luar cakupan tugas ini).

Setiap blok di bawah mengikuti format tetap: `### TAG:` / `TITLE:` / `BODY:` / `END`.

---

### TAG: v0.1.0
TITLE: v0.1.0 — Rilis MVP Awal
BODY:
**Ditambahkan**
- UI/desain lengkap untuk layout dashboard, responsif di desktop & tablet
- Halaman login dengan validasi form, dashboard terproteksi otentikasi JWT
- Tampilan manajemen pesanan (tabel data) & metrik real-time
- Skema database awal (6 tabel) + endpoint API untuk auth & pesanan
- Infrastruktur WebSocket (Socket.io) siap pakai

**Catatan**
- Stack: Node.js + Express 5.2.1, React 19.2.4, PostgreSQL 15, Socket.io 4.8.3
- Kredensial demo: `<dihapus>`
- Keterbatasan MVP: hashing password belum aktif, belum ada chart lanjutan, export PDF/Excel, notifikasi email, dan menu manajemen user

_Rilis awal Maret 2026 — dirapikan 28 Juli 2026._
END

### TAG: v0.2.0
TITLE: v0.2.0 — Poles Desain Apple HIG
BODY:
**Diubah**
- Desain ulang penuh mengikuti Apple Human Interface Guidelines (HIG)
- Palet warna Apple HIG (putih/hitam murni)
- Sidebar navigasi dengan styling bersih & profesional
- Metric card dengan accent line dan hierarki visual lebih baik
- Tipografi & spacing konsisten (grid 8px), styling chart & tabel diperhalus
- Migrasi ke Tailwind CSS, struktur & organisasi CSS lebih rapi

**Ditambahkan**
- Dark mode terintegrasi penuh dengan transisi yang mulus
- State interaktif lebih baik (hover, active, disabled)
- Animasi & transisi halus di seluruh dashboard

_Rencana saat itu untuk v0.3: mobile responsive, endpoint API tambahan, password hashing._

_Rilis awal Maret 2026 — dirapikan 28 Juli 2026._
END

### TAG: v0.2.1
TITLE: v0.2.1 — Perbaikan Bug & Toggle Sidebar
BODY:
**Diperbaiki**
- Celah spacing antara sidebar dan konten dashboard
- Kontras gridline chart di mode gelap/terang
- Padding & spacing responsif dirapikan

**Ditambahkan**
- Toggle/collapse sidebar dengan tombol panah (ikon ChevronLeft/ChevronRight sesuai status)
- Animasi sidebar halus (translate-x)
- Penempatan tombol toggle yang ramah mobile

_Rilis awal Maret 2026 — dirapikan 28 Juli 2026._
END

### TAG: v0.2.2
TITLE: v0.2.2 — Rilis Final & Perbaikan Tooltip
BODY:
**Ringkasan fitur (hingga versi ini)**
- Sistem desain Apple HIG, toggle dark/light mode
- Sidebar penuh (256px) & mini (80px) dengan tooltip hover pada ikon
- Animasi sidebar halus, transisi 300ms
- Metric card dengan accent line, chart tren pesanan, tabel pesanan terbaru
- Backend Express + JWT + PostgreSQL, frontend React 19 + Tailwind CSS, skema database 6 tabel

**Diperbaiki**
- Tooltip dobel yang muncul dihapus
- Presisi posisi tooltip diperbaiki
- Transisi margin dashboard responsif dirapikan

_Rilis awal Maret 2026 — dirapikan 28 Juli 2026._
END

### TAG: v0.3.0
TITLE: v0.3.0 — Modul Manajemen Faktur Baru
BODY:
**Ditambahkan**
- Modul Manajemen Faktur (CRUD) lengkap, dengan dropdown distributor + tambah distributor inline
- Formatter input Rupiah (Rp 1.234.567)
- Filter faktur: bulan, distributor, status, rentang tanggal
- Import Excel untuk upload faktur secara massal
- Metrik faktur: Total HNA, Total PPN, Margin, Jumlah
- Routing sidebar via React Router; menu yang belum aktif ditampilkan abu-abu
- Tabel database baru `invoices` & `invoice_items` (skema jadi 8 tabel) + index terkait

**Diperbaiki**
- Format input Rupiah — suffix `,00` tidak lagi merusak nilai yang diketik
- Field currency dipaksa `type="text"` (sebelumnya terblokir saat `type="number"`)
- Date picker Tanggal Pembelian (sebelumnya hardcode `type="text"`)
- Tooltip sidebar yang tampil dobel
- Handler logout memakai `useNavigate` (sebelumnya redirect rusak)

_Rilis awal Maret 2026 — dirapikan 28 Juli 2026._
END

### TAG: v0.5.1
TITLE: v0.5.1 — Jatuh Tempo, Trash & Draft Otomatis
BODY:
**Ditambahkan**
- Universal Search: satu search bar untuk cari no. faktur, distributor, atau status sekaligus; filter lanjutan jadi collapsible dengan indikator "!" saat ada filter aktif
- Due Date Reminder: field Tanggal Jatuh Tempo, badge warna (merah = terlambat, oranye = ≤7 hari, kuning = ≤3 hari), alert counter di header, auto-sort faktur mendesak ke atas
- Trash & Restore: delete jadi soft-delete, ada dialog konfirmasi, panel Trash dengan opsi Restore atau Hapus Permanen
- Draft Autosave: form faktur tersimpan otomatis tiap 30 detik, banner "Ada draft tersimpan", tombol Lanjutkan untuk resume sesi
- Kolom HNA/Item baru di expanded view (HNA Baru ÷ QTY), tampil juga sebagai HPP/item di summary

**Diperbaiki**
- Nomor faktur duplikat tidak lagi error — sekarang otomatis update faktur yang sudah ada
- Filter yang tidak reset dengan benar

**Database (auto-migrate saat backend start)**
- Kolom baru: `invoices.due_date`, `deleted_at`, `is_draft`, `draft_data`; `invoice_items.hna_per_item`

_Rilis awal Maret 2026 — dirapikan 28 Juli 2026._
END

### TAG: v0.6.0
TITLE: v0.6.0 — Perbaikan Tanggal & Laporan Bug
BODY:
**Diperbaiki**
- Timezone WIB pada semua tanggal
- Header kolom "HNA+PPN / HPP" disederhanakan jadi "HNA+PPN"
- HPP/Item kini punya 2 versi (tanpa PPN & dengan PPN)

**Ditambahkan**
- Fitur "Laporkan Bug / Saran Fitur" di sidebar
- Dashboard Bug Reports untuk developer (`/bugs`)

**Infrastruktur**
- Auto-restart proses via PM2
- Akses dari HP/PC lewat WiFi lokal

_Rilis awal Maret 2026 — dirapikan 28 Juli 2026._
END

### TAG: v0.6.1
TITLE: v0.6.1 — Audit Log & Diskon COD Persen
BODY:
**Ditambahkan**
- Audit log invoice — setiap perubahan tercatat (siapa, kapan, snapshot data)
- Disc COD kini bisa dalam persen (%) atau nominal
- Sidebar menyorot menu aktif otomatis sesuai halaman
- Ikon Moon untuk toggle dark mode

**Perbaikan internal**
- Endpoint baru `GET /invoices/:id/audit`
- `calcTotals` sekarang mengembalikan `disc_cod_amount`
- Refactor Sidebar & InvoiceList

**Infrastruktur (lanjutan dari v0.6.0)**
- PM2 auto-restart backend & frontend
- Akses dari HP/PC via WiFi lokal
- PostgreSQL auto-start via Homebrew

_Rilis awal Maret 2026 — dirapikan 28 Juli 2026._
END

### TAG: v0.6.2
TITLE: v0.6.2 — Riwayat Perubahan & Rekap Distributor
BODY:
**Diperbaiki**
- Bug tanggal: restore `parseLocalDate`/`formatLocalDate` + `TO_CHAR` di backend
- Tombol rename distributor & produk di dropdown (ikon pensil)
- Rekap per distributor selalu tampil semua (nilai 0 kalau kosong di bulan tsb)
- Universal search sekarang mencakup nama produk juga
- Tanggal dibayar tampil di baris status kalau sudah Paid
- Field tanggal bayar nonaktif kalau Belum Bayar, maksimal hari ini
- Jatuh tempo dipindah ke bawah kolom Status (lebih rapi)

**Ditambahkan**
- Warna unik per distributor di rekap stack & baris tabel
- Urutan kolom baru: Tgl Faktur > No Faktur > Distributor > ...
- Badge Jatuh Tempo sejajar dengan toolbar Add Invoice & Trash
- Riwayat Perubahan: tabel before/after, hanya menampilkan field yang berubah
- Disc COD didistribusikan per produk secara proporsional (rasio HNA baru)

_Rilis awal Maret 2026 — dirapikan 28 Juli 2026._
END

### TAG: v0.6.3
TITLE: v0.6.3 — Pembersihan Kode & Isolasi Database
BODY:
**Diperbaiki**
- ESLint Clean Slate — semua warning linting (unused imports, missing dependencies) dibereskan
- Database Branch Isolation — backend auto-deteksi git branch dan load `.env.dev` di branch `dev`, sehingga tidak pernah menyentuh database produksi (`dashboard_db`)
- Network Access Sync — frontend kini benar mengarah ke backend port `5002` saat berjalan di branch `dev`, akses penuh via IP jaringan (`192.168.3.4`)

**Diubah**
- Cleanup & Declutter — menghapus ~10MB berkas redundan, folder build lama, dan boilerplate CRA yang tidak terpakai

_Rilis awal Maret 2026 — dirapikan 28 Juli 2026._
END

### TAG: v1.0.0
TITLE: v1.0.0 — Rilis Resmi Manajemen Bisnis Lengkap
BODY:
Versi 1.0.0 menandai peluncuran fitur lengkap untuk manajemen bisnis CV Habil, mulai dari pengadaan barang hingga laporan keuangan.

**Ditambahkan**
- Inventory & Stok: manajemen stok dengan batch & tanggal kedaluwarsa (FEFO), alert stok menipis, Stok Opname otomatis
- Surat Pesanan (SP): pembuatan SP ke distributor (format SP2603xxxx) dengan fitur "Terima Barang" yang otomatis menambah stok gudang
- Toko Online: dashboard import CSV (Shopee & TikTok Shop), kalkulasi laba bersih otomatis, tracking penarikan saldo
- Buku Besar (Ledger): modul jurnal keuangan khusus Direktur — pencatatan debit/kredit & ringkasan per kategori (Penjualan, Operasional, Gaji, dll.)
- Keamanan: role-based access control (Admin vs Direktur)

_Rilis awal Maret 2026 — dirapikan 28 Juli 2026._
END

### TAG: v1.0.1
TITLE: v1.0.1 — Overhaul UI & Perbaikan Login
BODY:
**Ditambahkan**
- Overhaul UI Dashboard: layout modern baru dengan kartu quick stats ("Akses Cepat")
- Modal Riwayat Rilis: popup interaktif menampilkan changelog & roadmap
- Cache Busting: subteks versi diperbarui ke `v1.0.1` untuk memaksa refresh cache browser pada environment variable

**Diperbaiki**
- Konektivitas Database: timeout "Login Failed" teratasi dengan menyelaraskan port API frontend ke port backend branch `dev` (5001 → 5002)
- Environment React yang keras kepala: fallback port di `api.js` di-hardcode eksplisit agar tidak nyangkut di cache port server lama

**Diubah**
- Peningkatan keamanan: tombol demo login 1-klik "Direktur" dan "Admin" dihapus dari UI produksi/rilis
- Session timeout: masa berlaku JWT dipersingkat jadi `15m` untuk keamanan sesi & mencegah bentrok data

_Rilis awal Maret 2026 — dirapikan 28 Juli 2026._
END
