# AUDIT HABIL SUPERAPP — 27 Jul 2026

Basis: HEAD `1b29e45` v1.64.0-stable. Semua temuan diverifikasi langsung (kode + query read-only ke DB prod).

## Status eksekusi (diperbarui 27 Jul 2026, sore)

| # | Temuan | Status |
|---|---|---|
| 1 | Password default masih aktif | ⏳ **menunggu Harun** — hanya bisa diganti manual |
| 2 | Batch number tidak ikut terupdate | ✅ **SELESAI** — kode + 17 baris data, rilis v1.64.1 |
| 3 | "Harga biasanya" angka ganjil | ✅ **SELESAI** — modus 8 transaksi terakhir, v1.64.1 |
| 4 | Qty menerima `040` | ⏳ belum |
| 5 | Kerentanan dependensi | ⏳ belum — butuh keputusan (migrasi Vite?) |
| 6 | Test suite merah | ✅ **SELESAI** — 5/5 suite, 10/10 test hijau |
| 7 | `POST /api/bugs` tanpa auth | ⏳ belum |
| 8 | `err.message` bocor 124× | ⏳ belum |
| 9 | Tabel `users` warisan | ⏳ belum — perlu izin sebelum drop |
| 10 | Komponen raksasa tanpa `React.memo` | ⏳ belum — rilis terpisah |
| 11 | Responsif lewat JS, bukan CSS | ⏳ belum — perlu brainstorming dulu |
| 12 | Aksesibilitas | ✅ tidak ada masalah serius |
| 13 | `CLAUDE.md` port usang | ✅ **SELESAI** — dikoreksi |

Perubahan data yang dilakukan: hanya #2 (17 baris `sales_items`, 2 kolom teks/tanggal), dalam satu transaksi
ber-invarian. Backup + rollback: `backend/backups/`. Total laba kotor terverifikasi tidak bergeser (Rp71.276.816,42
sebelum dan sesudah).

---

## 🔴 P0 — Perbaiki hari ini

### 1. Password default masih aktif di produksi
`direktur` / `<password-default>` dan `admin` / `<password-default>` **masih bisa login** (diverifikasi via `bcrypt.compare` ke hash di `app_users`).
Siapa pun yang tahu URL `habil-dashboard.vercel.app` bisa masuk sebagai Direktur → seluruh Buku Besar, gaji karyawan, hutang piutang terbuka.

Sumber: `backend/routes/auth.js:55` (seed) dan `backend/scripts/neon_migration.sql:271`.
Seed hanya jalan kalau tabel kosong, jadi bukan seed yang menimpa — passwordnya memang belum pernah diganti.

**Aksi**: ganti password ketiga akun sekarang. Lalu hapus password literal dari `neon_migration.sql`.

---

## 🟠 P1 — Bug yang kelihatan user

### 2. Nomor batch di nota tidak ikut terupdate saat diperbaiki di Inventory

**Gejala**: batch diperbaiki `2651103GU` → `26S1103GU` di Inventory, tapi nota HSB-NOTA-2607060 tetap menampilkan yang lama. Simpan ulang nota pun tidak menyembuhkan.

**Akar masalah — dua lapis:**

- **Lapis 1** — `PUT /api/inventory/batches/:id` (`backend/routes/inventory.js:498`) hanya meng-update `inventory_batches.batch_no`. Nota menyimpan salinan teks sendiri di `sales_items.batch_no_snapshot`, dan tidak pernah ikut diperbarui. Query GET nota (`json_agg(i)`, `sales.js:255/307/326/573/869`) mengembalikan salinan itu apa adanya, tanpa join ke batch hidup.

- **Lapis 2 (ini yang bikin simpan-ulang gagal)** — di `PUT /api/sales/:id`, baris 770-775 sudah menulis snapshot BARU yang benar, tapi kemudian loop "kunci HPP" v1.59.1 di baris **781-793** menimpanya kembali dengan nilai LAMA yang ditangkap sebelum delete. Jadi menyimpan nota justru mengembalikan typo-nya.

Efek samping lapis 2: nota lama yang `batch_no_snapshot`-nya `NULL` akan dipaksa `NULL` lagi setiap kali diedit → itulah 6 baris kosong di bawah.

**Sebaran (query read-only, 313 item nota):**

| Kondisi | Jumlah |
|---|---|
| Teks batch basi (tidak sama dengan batch hidup) | 11 |
| Teks batch kosong padahal batch-nya ada | 6 |
| **Total bermasalah** | **17** |
| `batch_id_snapshot` yatim / hilang | **0** ✅ |

Daftar lengkap: nota `26030002`, `2605025`, `2606007`, `2606009`, `2606010`, `2606017`, `2606019`(×2), `2606020`, `2606026`, `2606035`, `2606037`, `2606047`, `2606050`, `2606053`, `2606059`, `2607060`.

**Kabar baiknya**: `batch_id_snapshot` 100% sehat, stok dan HPP tidak terpengaruh. Ini murni teks tampilan.

**Usulan perbaikan (3 langkah, urut):**
1. **Kode** — di loop kunci HPP `sales.js:781-793`, berhenti me-restore `batch_no_snapshot` dan `expired_date_snapshot`. Tetap restore `batch_id_snapshot` + field HPP (itu memang niat aslinya: mengunci HPP, bukan mengunci teks batch). Identitas batch sudah dipatok oleh ID; teksnya harus ikut ID.
2. **Kode** — di `PUT /api/inventory/batches/:id`, setelah update batch, propagasi ke `sales_items` yang `batch_id_snapshot = :id`. Sekali tulis, semua nota lama ikut benar.
3. **Data** — satu UPDATE sekali jalan untuk 17 baris yang sudah terlanjur (butuh persetujuan Harun dulu).

### 3. "Harga biasanya" memunculkan angka ganjil (Rp104.867)

**Gejala**: Bu Ling selalu beli Tropicana Slim Classic di 105.000, tapi app menyarankan 104.867.

**Akar masalah**: `backend/routes/insights.js:496` memakai `AVG(price)` — **rata-rata**, bukan harga yang paling sering. Frontend `SalesOrderList.jsx:4801` menampilkannya apa adanya sebagai "biasanya".

**Bukti data 180 hari terakhir (Bu Ling × TS Classic, n=19):**

| Statistik | Nilai |
|---|---|
| 105.000 | **18 transaksi** |
| 103.000 | 1 transaksi (HSB-NOTA-2607024, 10 Jul) |
| MEAN (dipakai app) | 104.895 ⚠ |
| MODUS (paling sering) | **105.000** ✅ |
| Harga terakhir | 105.000 |

Satu diskon sekali seumur hidup mencemari saran harga selamanya. Makin banyak transaksi makin ganjil angkanya.

**Usulan**: ganti `AVG(price)` → **modus** (harga paling sering), fallback ke harga terakhir kalau seri. Kata "biasanya" secara bahasa memang berarti modus, bukan rata-rata. Sekalian tampilkan `n` transaksi biar Harun tahu dasarnya kuat atau tidak.

### 4. Field qty menerima angka berawalan nol
Terlihat di form buat nota: qty terisi `040`. Input number menerima leading zero tanpa normalisasi. Kosmetik, tapi bikin ragu saat input cepat.

---

## 🟡 P2 — Kesehatan teknis

### 5. Kerentanan dependensi naik dari audit Juni
| | Juni 2026 | Sekarang |
|---|---|---|
| Frontend | 10 | **45** (2 critical, 23 high) |
| Backend | 10 | **8** (7 high) |

Mayoritas frontend berasal dari `react-scripts` (CRA) yang sudah tidak dirawat — sebagian besar hanya dampak build-time, bukan runtime. Tetap perlu direncanakan: CRA sudah end-of-life, migrasi ke Vite layak dipertimbangkan.

### 6. Test suite tidak hijau
`CI=true npm test` → **1 gagal, 9 lulus**.
Penyebab: `Dashboard.test.js:25-27` mem-mock `insightsAPI` tapi hanya mendaftarkan `getWeeklySummary`, sedangkan `Dashboard.jsx:4336` memanggil `getRestock()` + `getDormant()` yang memang ada di `api.js:251/263`.
→ **Mock-nya yang basi, bukan bug produksi.** Tapi selama merah, test kehilangan fungsinya sebagai jaring pengaman.

Backend masih **0 test** untuk 156 endpoint. Logika uang (FEFO, HPP, PPN, amplop) tanpa test regresi = risiko paling mahal di repo ini.

### 7. Endpoint tanpa autentikasi
Dari 156 endpoint, hanya 2 tanpa `auth`:
- `POST /api/auth/login` — memang harus publik ✅
- `POST /api/bugs` (`bugs.js:32`) — siapa pun bisa menulis ke `bug_reports` tanpa login. Perlu rate-limit atau captcha kalau URL sudah tersebar.

### 8. Kebocoran pesan error
`error: err.message` dikembalikan ke client di **124 tempat** di `routes/`. Helper `getServerError()` sudah ada di `auth.js:35` dan menyembunyikan detail saat produksi — tapi belum dipakai di route lain. Struktur tabel/kolom bisa bocor lewat pesan error Postgres.

### 9. Tabel `users` warisan masih ada
DB punya dua tabel: `app_users` (dipakai login, berisi direktur/admin/konsultan) dan `users` (berisi dummy `admin`/`user1` sejak 10 Mar 2026). Tidak ada satu pun kode yang menyentuh `users` — sudah mati, tapi membingungkan siapa pun yang mengaudit DB nanti (aku sendiri sempat salah baca karenanya).

---

## 🔵 P3 — Arsitektur, UI & interaksi

### 10. Komponen raksasa tanpa memoization
| Komponen | Baris |
|---|---|
| `Dashboard.jsx` | 6.252 |
| `SalesOrderList.jsx` | 5.852 |
| `InvoiceList.jsx` | 5.767 |
| `InventoryDashboard.jsx` | 3.885 |

`React.memo` dipakai **0 kali** di seluruh frontend. `useMemo` 32×, `useCallback` 24× untuk ~30.000 baris JSX — sangat tipis. Ditambah **2.426** literal `style={{...}}` inline yang membuat objek baru tiap render. Konsekuensinya: satu ketikan di form nota me-render ulang pohon komponen 5.800 baris.

Ini penyebab paling mungkin dari keluhan lag/timeout yang sempat ditambal di v1.63.2.

### 11. Responsif dikerjakan lewat JavaScript, bukan CSS
`useIsMobile()` (`App.js:41`, breakpoint 768px, sudah di-debounce 150ms dengan benar) disebar sebagai prop ke **23 komponen**. Sementara `index.css` hanya punya **4 blok `@media`**, dan cuma **satu** yang benar-benar breakpoint lebar (767px: font-size 16px anti-zoom iOS + padding halaman).

Artinya hampir semua tata letak responsif bergantung pada state React, bukan CSS. Akibatnya:
- Ganti orientasi HP → re-render seluruh app, bukan sekadar reflow browser
- Hanya dua tingkat (HP / bukan HP) — tablet dan layar sempit dapat tata letak desktop
- Tabel lebar (nota: Produk/Qty/Satuan/HPP/Harga/Subtotal/Margin) hanya punya 15 penanganan `overflowX` untuk 21 halaman

**Yang sudah bagus dan jangan diubah**: debounce resize, `font-size:16px` di mobile (mencegah auto-zoom iOS), dan mematikan tooltip di perangkat sentuh (`@media (hover:none)`) — tiga detail itu justru menunjukkan perhatian ke pengalaman HP.

### 12. Aksesibilitas — lebih baik dari dugaan awal
337 `<button>` berbanding 103 `aria-label` terlihat timpang, tapi setelah dicek, tombol ikon-saja di baris nota **sudah berlabel** (`SalesOrderList.jsx:2992/3023/3052`, mis. `aria-label="Hapus nota HSB-NOTA-..."`). Selisihnya kebanyakan tombol yang memang sudah bertulisan. Tidak ada masalah serius di sini.

### 13. Dokumentasi tidak sinkron dengan kode
`CLAUDE.md:31` menulis: *"`frontend/src/services/api.js` hardcodes `localhost:5006`; jalankan backend di 5006 atau sesuaikan"*.
Kenyataannya `api.js:5` sudah `localhost:5001`, sama dengan `server.js:28` dan `docker-compose.yml`. **Konflik port itu sudah selesai** — catatannya yang belum dihapus, dan justru menyesatkan orang baru untuk "memperbaiki" hal yang sudah benar.

---

## ✅ Yang sudah beres sejak audit Juni 2026

Semua P0 lama sudah tertutup — layak dicatat:

| Temuan Juni | Status sekarang |
|---|---|
| `backend/.env.save` berisi JWT_SECRET + DB password ter-commit | ✅ hilang dari git dan dari disk |
| `stock_received` boolean → stok dobel/hilang saat terima parsial | ✅ `received_qty` granular, 37 referensi di routes |
| `PUT` faktur tanpa transaksi → stok desync | ✅ sudah pakai `client.query` bertransaksi |
| Bundle utama 579 kB | ✅ **120 kB** — route lazy-load jalan |
| `socket.io-client` mati tapi terpasang | ✅ sudah dihapus dari frontend |
| Tidak ada `helmet` | ✅ terpasang di `app.js` |
| Buku Besar hanya disembunyikan di UI | ✅ dijaga server: `ledger.js:116` `router.use(auth, roleGuard('direktur'))`, `tax.js:20` untuk direktur+pajak |

Build produksi: **`Compiled successfully`, 0 warning.**

---

## Urutan yang kusarankan

1. **Ganti password produksi** (5 menit, risiko tertinggi)
2. **Batch snapshot** — kode langkah 1+2, lalu data 17 baris setelah disetujui
3. **Harga "biasanya"** AVG → modus
4. **Perbaiki mock test** biar suite hijau lagi, lalu mulai test backend untuk jalur uang
5. **Bersihkan** — `getServerError()` ke semua route, hapus tabel `users`, koreksi `CLAUDE.md:31`
6. **Perf** — `React.memo` untuk baris tabel di 4 komponen besar (dampak terasa, risiko rendah)

Nomor 1-3 layak masuk satu rilis v1.64.1. Nomor 6 sebaiknya rilis sendiri karena menyentuh banyak berkas.
