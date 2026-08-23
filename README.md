# HABIL SUPERAPP

Dashboard bisnis terintegrasi untuk mengelola faktur, nota penjualan, stok, dan keuangan CV Habil Sejahtera Bersama.

- **Versi**: v1.67.2-stable (23 Agustus 2026)
- **Status**: Production-stable

---

## Ringkas Teknis

| Aspek | Detail |
|-------|--------|
| **Frontend** | React 19, Vite 8, Tailwind CSS 4 lokal, React Router v7, Axios, Recharts, jsPDF |
| **Backend** | Node.js + Express 5, PostgreSQL (via `pg`), JWT auth |
| **Database** | PostgreSQL 17 (Neon.tech, Singapore region) |
| **Deploy** | Frontend: Vercel (`habil-dashboard.vercel.app`), Backend: Vercel (`habil-backend.vercel.app`) |
| **Transport** | REST/HTTP request-response; tidak ada channel WebSocket aktif |

---

## Jalankan Lokal

### Persyaratan
- Node.js 24.19.0 LTS
- PostgreSQL (atau koneksi ke database cloud)
- npm atau pnpm

### Setup Backend
```bash
cd backend
npm install
npm run dev
```
Backend berjalan di port **5001**.

### Setup Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend berjalan di port 3000 (Vite dev server).

### Test Frontend
```bash
cd frontend
npm test
```

---

## Modul Utama

1. **Surat Pesanan (PO)** — Manajemen pesanan dari distributor
2. **Faktur Masukan** — Input invoice dari supplier; auto-update stok & mutasi
3. **Nota Penjualan** — Penjualan produk; FEFO batch tracking, otomatis hitung HPP
4. **Stok & Opname** — Manajemen batch (FEFO), mutasi audit trail, restock helper
5. **Daftar Harga** — Master harga per channel (offline, Shopee, TikTok)
6. **Toko Online** — Sinkronisasi harga/stok ke marketplace; rekomendasi harga cerdas
7. **Buku Besar** — Pencatatan transaksi bank, kategorisasi otomatis, laporan bulanan (Direktur-only)
8. **Karyawan** — Master karyawan dan riwayat gaji (Direktur-only)
9. **Master Data** — Produk, distributor, customer, kontak
10. **Kanban Tugas** — Tugas & pekerjaan tim
11. **Habil Smart-Assistant** — Rekomendasi rule-based yang read-only, transparan, dan dilengkapi reason/evidence

---

## Struktur Folder

```
dashboard-app/
├── backend/
│   ├── routes/           # Endpoint per domain (invoices, sales, inventory, dll)
│   ├── migrations/       # Registry perubahan schema eksplisit
│   ├── middleware/       # Auth JWT, error handling
│   ├── scripts/          # DB check, test, runner migration eksplisit
│   ├── server.js         # Entry point Express
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/   # Halaman & komponen (Dashboard, SalesOrderList, dll)
│   │   ├── services/     # API client (api.js, invoicesAPI, salesAPI, dll)
│   │   ├── constants/    # UI tokens (ui.js), config
│   │   ├── utils/        # Helper (pricingEngine, xlsx parsing, dll)
│   │   ├── index.js      # Entry kompatibilitas & version title
│   │   └── main.jsx      # Bootstrap React
│   ├── vite.config.mjs   # Build, env compatibility, Vitest
│   ├── postcss.config.mjs # Tailwind 4 lokal
│   └── package.json
├── docs/                 # Dokumentasi teknis
├── CHANGELOG.md          # Riwayat versi
├── SUPERAPP_BRAIN.md     # Master spec & roadmap
├── CLAUDE.md             # Guidance untuk Claude Code
└── README.md             # File ini
```

---

## Peran & Akses

- **Direktur** (pemilik): Akses penuh termasuk Buku Besar, Karyawan, laporan finansial
- **Admin** (operasional): Surat Pesanan, Faktur, Nota, Stok, Toko Online; Buku Besar **terlarang**

---

## Protokol Penting

### Versi
Setiap rilis, pastikan label versi **v1.X.Y-stable** konsisten di:
- `frontend/src/components/Login.jsx`
- `frontend/src/components/Dashboard.jsx` (badge + modal)
- `frontend/src/index.js`
- `CHANGELOG.md`
- `SUPERAPP_BRAIN.md`

Gunakan: `grep -rn "v1\." frontend/src --include="*.jsx" --include="*.js"`

### Release Modal
Modal "Apa yang Baru" harus muncul setiap login (bukan di-cache), karena satu akun dipakai beberapa operator (Harun, Fivin, Ferry). Simpan progress di `sessionStorage`, bukan `localStorage`.

### Database
- **Source of Truth**: PostgreSQL (Neon.tech)
- **Schema**: Route tidak menjalankan DDL saat startup. Perubahan schema hanya melalui `npm run migrate:schema` dengan opt-in dan konfirmasi host eksplisit; `npm run migrate:schema:list` aman untuk inventaris tanpa koneksi DB.
- **Auth**: JWT Bearer (4 jam session)

### Stok & HPP
- **Metode FEFO**: Batch tertua dijual duluan
- **Mutasi**: Setiap transaksi (masuk/keluar) tercatat di `inventory_mutations` untuk audit trail
- **HPP Nota**: Diambil dari batch FEFO aktif, bukan harga master

---

## Dokumentasi Lengkap

- **CHANGELOG.md** — Semua perubahan per versi
- **SUPERAPP_BRAIN.md** — Spek sistem, roadmap, incident recap
- **CLAUDE.md** — Petunjuk untuk Claude Code (tech lead, pola, perintah)
- **docs/** — Dokumentasi teknis tambahan

---

## Kontak & Support

Tim: Harun (arsitek), Fivin (operasi), Ferry (input data)

---

_HABIL SUPERAPP v1.67.2-stable. Didukung oleh React 19, Node.js, PostgreSQL, Vercel._
