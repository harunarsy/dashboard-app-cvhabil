# ACTION LOG — HABIL SUPERAPP

> Catatan lanjutan pekerjaan. **Baca file ini dulu** kalau sesi terputus, sebelum melanjutkan apa pun.
> Perbarui setiap kali ada tahap berubah — jangan menunggu sampai akhir.
> Pola kerja: Opus = mandor (memecah, memutuskan, memverifikasi), Sonnet/Haiku = pelaksana. Lihat `~/.claude/CLAUDE.md`.

## Update 30 Sep 2026 (pasca-push): v1.67.24-stable TER-DEPLOY & TERVERIFIKASI
- **Push:** `d1ee93e..653fe4b` → `origin/main` (2 commit: `cdb5e8e` keamanan+performa, `653fe4b` ronde-2 audit-diri).
- **CI GitHub:** run `36591722600` → **completed (success)** (version checker + test/build frontend + test backend).
- **Vercel backend:** `/api/health` kini memuat field `schema` → `{ok:true, expectedLatest:20260930_024…, latestApplied:20260930_024…, missingCount:0}` (kode baru live + skema sinkron). `/api/health/db` → 2 ms.
- **Vercel frontend:** bundle produksi `assets/index-CRaMDWmJ.js` memuat `v1.67.24-stable`.
- **Smoke produksi jalur keamanan baru:** `POST /api/auth/login` kredensial salah → **401** (bukan 500), dan tercatat di `login_attempts` (failed_count=1, belum terkunci) → lockout berbasis DB terbukti hidup. Baris smoke dibersihkan (rowcount 1 → 0; tabel kembali kosong).
- **Status saat ini:** produksi = v1.67.24; DB = migrasi 024; `npm audit` 0 kerentanan; backend & frontend suite hijau.
- **Sisa opsional untuk owner:** aktifkan backup terjadwal/PITR Neon (sekarang backup masih manual), dan opsional error tracking (Sentry) untuk mempercepat diagnosis.

## Update 30 Sep 2026: v1.67.24 ronde-2 — audit-diri + semua temuan dibereskan (COMMIT LOKAL, BELUM DIPUSH)
- **Instruksi owner:** audit ulang hasil kerja sendiri + audit keseluruhan aplikasi, lalu perbaiki semuanya di lokal (belum push). Temuan besar dari audit-diri dan tindakannya:
- **P0 tertangkap sebelum rilis — generator nomor dokumen.** `SUBSTRING(order_number FROM $1)` tanpa `::int` → PostgreSQL memilih varian REGEX → MAX ngawur (uji fungsi asli di DB: hasil `...015` padahal nomor aktif `...128`) ⇒ create nota bisa gagal/bertabrakan. Perbaikan: `SUBSTRING(... FROM $1::int)`; bukti: panggilan asli ke DB dalam transaksi ROLLBACK → `...129, ...130, ...131` unik & berurutan, 0 baris tersisa.
- **Penjaga baru:** `backend/scripts/test-sql-param-contract.js` (statis, ikut `npm test`) menolak `SUBSTRING(... FROM $n)`/`INTERVAL $n` tanpa cast; `backend/scripts/test-docnumbers-live.js` (`npm run test:db:docnumbers`) menguji ke DB nyata dan selalu ROLLBACK.
- **Deadlock edit nota ↔ edit batch** (urutan lock berlawanan): `SET LOCAL lock_timeout = '5s'` di kedua transaksi + `sendServerError` memetakan `40P01`/`55P03` → 409 "Data sedang dipakai proses lain. Coba lagi sebentar."
- **Audit edit batch** dibungkus SAVEPOINT (audit tidak bisa hilang, tapi tabel audit rusak tidak memblokir edit sah).
- **`login_attempts`** dibersihkan otomatis (>1 hari) saat ada login sukses.
- **Status skema terlihat:** `/api/health.schema` + peringatan `[schema] TERTINGGAL` di `server.js` saat boot. Verifikasi DB nyata: `{ok:true, latestApplied:20260930_024...}`. Invarian "import app.js tidak menyentuh DB" tetap dijaga test (cek dipindah ke server.js).
- **Logging/error:** log JSON terstruktur di `sendServerError`, error handler global Express 5, log `unhandledRejection`, pesan `roleGuard` berbahasa Indonesia.
- **UI hak akses:** hook `useCanDelete` (direktur/admin) menjaga aksi hapus di Nota, Faktur (+permanen), Produk, Batch, Customer, Distributor; fail-open bila peran tak diketahui (backend tetap penjaga 403).
- **Dependency:** `npm audit fix` → **0 kerentanan** di backend & frontend; kedua suite dijalankan ulang setelah bump.
- **Dokumen:** `FEEDBACK_LOG.md` diisi 2 insiden (inventory kosong karena migrasi belum jalan; P0 nomor dokumen tertangkap sebelum push); `AGENTS.md` diperbaiki (referensi Supabase/6543 → Neon/`DATABASE_URL`).
- **Verifikasi akhir:** backend `npm test` exit 0 (SQL param contract + expiry 67/67 + schema boundary + HTTP smoke + adjustment 43/43); frontend 316 lulus/1 skip; Vite build lulus; checker `v1.67.24-stable`; live doc-number & schema probe ke DB nyata lulus.
- **Catatan jujur:** test mock tidak bisa menangkap kelas bug parameter SQL — verifikasi ke DB nyata (read-only/ROLLBACK) mulai sekarang jadi syarat untuk setiap SQL baru.
- **Status git:** commit lokal menyusul; **tidak dipush**.

## Update 29 Sep 2026 (22:15 WIB): v1.67.24-stable — hardening audit (COMMIT LOKAL, BELUM DIPUSH)
- **Instruksi owner:** audit aplikasi (keamanan/bug/logic + performa) lalu perbaiki semua di lokal, commit lokal, **jangan push**.
- **Keamanan:**
  - `backend/utils/serverError.js` (baru) + codemod 116 titik `res.status(500).json({ error: err.message })` → `sendServerError(res, err, '<file>')`, plus pola `err.statusCode || 500`, `|| 400` (sales), `status(code)` (priceList), dan `responseForDeltaError` (invoices). Error validasi (statusCode < 500) tetap menyampaikan pesan; error internal (kode Postgres / TypeError) hanya ke log server, produksi dijawab generik.
  - `routes/auth.js`: fallback password plaintext dihapus (akun non-bcrypt ditolak + dicatat; 4/4 akun sudah bcrypt). Lockout login kini di tabel `login_attempts` (best-effort: bila tabel belum ada, login tetap jalan).
  - `middleware/auth.js`: TokenExpiredError dibedakan pesannya, error log tidak lagi dibanjiri, `JWT_SECRET` kosong → 500 eksplisit.
  - 11 rute destruktif diberi `roleGuard('direktur','admin')` (sales delete, invoices delete + permanent, inventory product/batch delete, products delete, customers delete, distributors delete, loans delete, marketplace store/sku-map delete).
- **Integritas/logic:**
  - `PUT /inventory/batches/:id` → transaksi penuh (`FOR UPDATE` + audit + sinkron snapshot nota ikut commit/rollback).
  - `utils/docNumbers.js` → `pg_advisory_xact_lock` per docType; MAX pakai `SUBSTRING` + filter regex (nomor tak berpola tidak lagi bikin error); counter baru mulai MAX+1.
  - `POST /marketplace/sku-map` → transaksi (kamus + katalog toko).
- **Performa:**
  - `GET /inventory/products` ditulis ulang (CTE agregat). Bukti: **exec 8,1 ms → 1,5 ms**, scan `inventory_batches` 5 → 1, **hasil identik 85/85 produk semua kolom** (skrip pembanding query lama vs baru).
  - Migrasi `20260930_024_login_attempts_and_indexes` **diterapkan ke DB**: tabel `login_attempts` + indeks `purchase_order_items(po_id)`, `inventory_batches(product_id, expired_date)`, `login_attempts(locked_until)`. Terverifikasi via information_schema/pg_indexes.
  - `frontend/src/lib/queryClient.js`: `staleTime` master data 10 menit (produk/customer/distributor/price-list/print-settings/counters), sisanya 60 detik; refetchOnWindowFocus tetap (hanya yang stale).
- **Verifikasi:** backend `npm test` exit 0 (expiry 67/67; HTTP smoke guard read-only diperluas khusus `login_attempts`; schema-boundary memuat 024); frontend 316 lulus / 1 skip; Vite build lulus; checker versi `v1.67.24-stable`.
- **Belum dikerjakan (perlu keputusan owner):** token JWT localStorage → cookie httpOnly, batching N+1 tulis nota/faktur, item list keluar dari payload daftar, cache agregat dashboard, base64 marketplace → object storage, gating tombol hapus di UI per role.
- **Status git:** commit lokal menyusul di `main`; **tidak di-push** sesuai instruksi.

## Update 29 Sep 2026 (21:45 WIB): AKAR MASALAH ED DITEMUKAN — `setItems` tidak ada di InvoiceModal
- **Gejala owner:** ED tidak bisa diisi sama sekali di Faktur Pembelian (baik "Bulan/tahun" maupun "Tanggal lengkap"), kolom kembali kosong.
- **Akar masalah (bukan picker bawaan, bukan data):** baris item form faktur dirender komponen `InvoiceModal` (`InvoiceList.jsx:4861`). Komponen itu menerima `items` dan `updateItem` sebagai **prop** dan **tidak punya `setItems`**, tetapi handler ED di sana memanggil `setItems(...)` → setiap perubahan ED melempar `ReferenceError: setItems is not defined` → nilai tidak pernah masuk state (kolom kembali kosong). Kolom lain (qty, disc, produk) aman karena memakai prop `updateItem`.
- **Fix:** handler ED kini memakai `updateItem(idx, "expired_date", value)` + `updateItem(idx, "expired_date_precision", precision)` (updateItem sudah functional-update, aman dipanggil berurutan). `InvoiceModal` juga diekspor untuk pengujian.
- **Test regresi baru `frontend/src/components/InvoiceModal.expiry.test.jsx` (4 kasus)** — mount langsung `InvoiceModal`, memastikan: pilih bulan memanggil `updateItem` (bukan `setItems`), tanggal lengkap memanggil `updateItem` + precision `day`, ED bulan tersimpan tampil sebagai dropdown terpilih, dan ED legacy `dd/mm/yyyy` (presisi NULL) tetap tampil utuh di mode tanggal. **Test ini gagal pada kode lama.**
- **Audit setter se-aplikasi (statis, `src/**/*.jsx`, 53 berkas):** satu-satunya setter "hantu" adalah bug di atas; sisanya false positive (fungsi lokal seperti `setVal`/`setFinal`, API seperti `setPrice`/`setPpn`/`setQueryData`/`setItem`, DOM `setHours`/`setDate`/`setDataTransfer`, dan prop seperti `setIsDarkMode`). Keempat pemakai `ExpiryInput` lain (Stok Masuk, Edit Batch, Surat Pesanan, Pinjaman) memakai setter state yang valid.
- **Keamanan data lama `dd/mm/yyyy`:** tidak ada perubahan backend/DB di batch ini; handler ED legacy default memakai mode tanggal (nilai `YYYY-MM-DD` tidak pernah dianggap bulan); payload hanya menulis presisi `NULL` bila ED tidak disentuh; migrasi 023 tetap tanpa backfill (hash data lama identik — sudah diverifikasi).
- **Verifikasi:** frontend **316 lulus / 1 skip (32 berkas)**; `ExpiryInput` 15/15; `InvoiceModal` 4/4; Vite build lulus; checker `v1.67.23-stable`; backend `npm test` exit 0 (expiry contract 67/67).
- **Sisa diketahui (bukan bug produk):** `InvoiceList.expiry.test.jsx` end-to-end tetap di-skip karena mounting `<InvoiceList/>` di jsdom spin 100% CPU (terbukti juga tanpa modal/data; komponen ini belum pernah punya test render). Jalur ED kini tercakup `InvoiceModal.expiry.test.jsx`. Berkas sementara uji profiling sudah dibersihkan.
- **Belum dipush** saat catatan ini ditulis: commit `167e710` (v1.67.23 dropdown ED) + commit menyusul untuk fix akar masalah ini; keduanya naik bersamaan ke `main`.

## Update 29 Sep 2026 (21:45 WIB): v1.67.23-stable — input ED bulan/tahun diperbaiki
- **Laporan owner (masih gagal setelah v1.67.22):** mode "Bulan/tahun" terlihat, kolom ED kosong (`--/----`), picker bulan bawaan Chrome terbuka, tapi bulan tidak bisa dipilih/tersimpan.
- **Akar masalah:** mode bulan memakai `<input type="month">` bawaan browser; nilai input di-set ulang setiap render React sehingga commit dari picker bawaan tidak pernah lengket (pilih bulan → kembali kosong). Tak terkait data/DB.
- **Fix (frontend saja):** mode bulan diganti **dua dropdown eksplisit — Bulan (Jan–Des) + Tahun** (tahun−3 s/d tahun+12, plus tahun dari nilai lama). `initialMode` kini juga mengenali nilai `YYYY-MM` walau metadata presisi hilang → tidak lagi jatuh ke mode tanggal yang menampilkan kosong. Urutan pilih tahun-dulu-lalu-bulan didukung via state `pendingYear`; kosongkan dropdown bulan → nilai NULL.
- **Test:** `frontend/src/components/common/ExpiryInput.test.jsx` diperluas menjadi 15 kasus (tahun-dulu-lalu-bulan, nilai bulan tanpa presisi, penghapusan) — lulus; suite frontend **312 lulus / 1 skip** (31 berkas); Vite build lulus; checker versi lulus `v1.67.23-stable`. Test InvoiceList.expiry (skip) disesuaikan ke UI baru.
- **Tidak ada perubahan backend/DB.**
- **Menunggu owner:** hard-refresh halaman lalu coba isi ED di Faktur (baru/edit) & Stok Masuk — sekarang lewat dropdown Bulan + Tahun.

## Update 29 Sep 2026 (21:35 WIB): v1.67.22-stable — SELESAI, DIPUSH, TER-DEPLOY
- **Fix wave F1–F3 selesai** (sebelumnya checkpoint RED):
  - `backend/routes/purchaseOrders.js`: `expired_date_precision` masuk SELECT `received_batches` + mapping response. `backend/routes/inventory.js`: kolom yang sama di query batches-by-product.
  - `backend/routes/sales.js`: pra-pass identitas item menggantikan `historicalSaleItem` — ID eksplisit wajib milik nota + produk sama + unik; baris tanpa ID (client lama) cocok lewat posisi saat jumlah baris sama, atau snapshot asal unik saat jumlah berubah; ambigu → `400` sebelum COMMIT. Flag `selected_batch_changed` otoritatif (client lama tetap dibandingkan seperti sebelumnya). `historical = preserve` — gate kedua yang jadi sumber bug dihapus.
  - Frontend `SalesOrderList.jsx`: kirim `id` item + `_batchIntent`/`selected_batch_changed`; hidrasi batch precision-aware (day vs month tidak lengket) dan pencocokan nama hanya bila unik; ganti produk melepas ID lama; intent picker hanya saat batch benar-benar berbeda; payload menormalkan id sintetis `legacy-*` → `null`. `InvoiceList.jsx` sudah membawa precision di prefill SP, payload, dan load edit.
- **Verifikasi:** `node backend/scripts/test-expiry.js` **67/67**; `npm --prefix backend test` exit 0; frontend `vitest run` **310 lulus / 1 skip (31 berkas lulus)**; `npm run build` lulus; `node scripts/check-version-consistency.mjs` lulus `v1.67.22-stable`.
- **Satu test di-skip (jujur):** `frontend/src/components/InvoiceList.expiry.test.jsx` — mounting `<InvoiceList/>` di jsdom membuat proses spin 100% CPU; dibuktikan juga pada test render-only tanpa modal/data ⇒ bukan akibat fitur ini (komponen belum pernah punya test render). Kontrak PO→faktur diverifikasi lewat test backend + pembacaan wiring prefill/payload.
- **DB produksi (Neon) — migrasi `20260929_023_expiry_precision` SUDAH DITERAPKAN** 29 Sep 14:10:45 UTC: backup `~/Downloads/habil-db-backup-pre-023-20260929.dump` (1.727.601 byte) → `scripts/migrate.js` (`ALLOW_SCHEMA_MIGRATION=true HABIL_DB_TARGET=prod ALLOW_PROD_LOCAL=true MIGRATION_TARGET_CONFIRM=<host>`) → 6 kolom nullable + 6 CHECK `day|month`. Tanpa backfill; jumlah + hash tanggal lama identik sebelum/sesudah; 0 orphan, 0 sesi DB menggantung, 0 baris presisi invalid.
- **Root cause "Inventory kosong" (kode lokal vs DB belum termigrasi):** kode fitur membaca kolom presisi baru sebelum kolomnya ada ⇒ `/api/inventory/products` error ⇒ daftar produk tampak kosong padahal data utuh (319 batch, 85 produk aktif; 147 batch berstok). Pulih setelah migrasi diterapkan.
- **Anomali data pre-existing (BUKAN dari sesi ini, belum diubah):** (1) 1 batch stok minus — `inventory_batches.id=108 / FNQC10BB / "Tropicana Slim Diabtx 150 sachet (Horeca)"` qty `-38` (mutasi in 320 vs out 358, terakhir bergerak 14 Jun 2026); (2) order_number duplikat legacy Mei 2026 (mayoritas baris `is_deleted`). Keduanya menunggu keputusan owner.
- **Git/deploy:** commit `ae38d3f` di `feat/expiry-month-year` → fast-forward `main` (`4e97c70..ae38d3f`) → push. Vercel terverifikasi: backend `/api/health` OK, bundle produksi memuat `v1.67.22-stable`.
- **Tidak diikutkan:** pekerjaan lokal owner (`.gitignore`, `AGENTS.md`, `.claude/`, `.codex/`, `.hermes/`, `.ngodingpakeai/`, `aistudio/`, `core/`, docker, dll).
- **Sisa untuk owner:** hard-refresh browser dan cek input ED mode Bulan/tahun + edit nota; laporkan bila masih ada perilaku aneh (kemungkinan besar tadi kena bundle HMR setengah-jadi saat berkas sedang diedit).

## Update 29 Sep 2026: ED fix wave F1-F3 (checkpoint RED menunggu controller)
- Scope owner: tiga Important findings di `docs/superpowers/plans/2026-09-29-expiry-review.md`; routes purchaseOrders/inventory/sales, SalesOrderList dan behavioral tests. Instruksi terbaru melarang test/build execution, DB/.env, git writes dan subagents pada wave ini.
- Root cause ditelusuri: PO SELECT/mapping dan inventory available-batches menghilangkan precision; edit frontend membuang sales item ID dan memasang inferred batch ID; backend fallback dapat mengambil history baris lain dari batch tujuan.
- Tes ditulis sebelum code fix: `backend/scripts/test-expiry.js`, fixture baru `backend/test/fixtures/expiry-po.cjs`, `frontend/src/components/SalesOrderList.test.jsx`, dan `frontend/src/components/InvoiceList.expiry.test.jsx`. Fixture PO menjalankan reader asli, membatasi response sesuai SELECT, lalu menguji prefill+payload komponen faktur.
- Pemeriksaan sintaks statis empat berkas lulus tanpa module evaluation. **Test/build belum dijalankan; RED/GREEN belum terverifikasi.** Route/komponen implementation belum diubah pada wave ini.
- Menunggu controller: jalankan `node backend/scripts/test-expiry.js` dan `TZ=Asia/Jakarta npm --prefix frontend test -- src/components/InvoiceList.expiry.test.jsx src/components/SalesOrderList.test.jsx`, kirim output+exit codes. Expected failures dan fixture cases: `docs/superpowers/plans/2026-09-29-expiry-fix-wave-checkpoint.md`.
- Berikutnya setelah expected RED: fix precision projections, item-ID ownership+safe legacy identity, intent pengguna vs hydration; no-op menjaga exact historical ED/raw precision, real selection mengambil metadata current DB. Semua tiga findings masih menunggu implementation/verification.
- Belum di-commit: tes/fixture/checkpoint report/log wave ini, di atas working tree ED precision existing. Tidak stage/commit/push.

## Update 29 Sep 2026: ED dual-presisi (implementasi disetujui, berjalan)
- Permintaan owner: petakan dampak ED bulan/tahun di seluruh aplikasi, termasuk inventory, faktur pembelian, nota, dan dokumen. Owner meminta diberi tahu jika membutuhkan perubahan database.
- Baseline terverifikasi: `main` / `origin/main` = `4e97c70`; checker versi lulus `v1.67.21-stable`. Perubahan lokal `.gitignore`, `AGENTS.md`, dan berkas untracked merupakan pekerjaan existing, tidak disentuh.
- Audit source frontend/backend selesai: lima input tanggal ED, lima tabel pemilik ED/snapshot, parser delta menolak YYYY-MM, PDF/WA dan FEFO memakai hari. Laporan agent diverifikasi selama implementasi/review.
- Owner memberi izin eksplisit implementasi + database + commit lokal + push main/Vercel tanpa konfirmasi tambahan. Scope terbaru menggantikan izin audit-only sebelumnya.
- Desain: dual-presisi day/month; month berlaku akhir bulan kalender; tanggal lengkap lama tidak diubah; metadata additive enam kolom di lima tabel. Spec/plan: `docs/superpowers/{specs,plans}/2026-09-29-expiry-precision*.md`.
- Sedang berjalan: test-first backend, lalu frontend input/dokumen, review/regresi, backup+migration, version bump v1.67.22 dan deploy.
- Keputusan controller: gunakan checkout existing dan branch fitur supaya user work tetap utuh; model selection tidak tersedia pada tool task, gunakan general. Anti-slop diterapkan selama UI sesuai izin owner menyelesaikan mandiri.
- Belum di-commit: ACTION_LOG dan dokumen spec/plan. Database belum berubah, produksi masih v1.67.21.

## Update 27 Sep 2026 — P0 PROD: Buat Nota gagal `invalid input syntax for type date: "final"` — FIX TER-DEPLOY (v1.67.20-stable)
- **Laporan owner dari produksi:** modal Buat Nota Baru menampilkan `invalid input syntax for type date: "final"` di bawah NOMOR NOTA — create nota gagal sejak v1.67.19 ter-deploy.
- **Akar masalah (terbukti, bukan dugaan):** `backend/routes/sales.js` POST `/api/sales` — daftar kolom INSERT menaruh `status` di posisi 26, tetapi VALUES menaruh literal `'final'` di posisi terakhir (46) → literal jatuh ke kolom DATE `tax_invoice_date`; snapshot formal bergeser satu kolom. Baris diperkenalkan commit `e165485` (persist legal/procurement snapshots) — sudah ada di `origin/main`.
- **Bukti repro:** statement dijalankan di `BEGIN..ROLLBACK` ke DB target — versi lama: error identik laporan; versi fix: `status='final'` + seluruh kolom formal landing benar, tidak ada data tertulis. Jalur PUT/edit nota & konversi pinjaman→nota tidak terpengaruh (statement terpisah, sudah benar).
- **Fix:** geser literal `'final'` ke posisi kolom status (setelah `$25`). Contract test statis baru `backend/scripts/test-sales-insert-contract.js` — dibuktikan **GAGAL di kode lama, LULUS di kode fix** — masuk `npm test`.
- **Kesenjangan tes:** tidak ada tes yang menyentuh create nota via `POST /api/sales` (HTTP smoke memakai DB mock dan hanya menguji adjustments; skrip lain memakai fixture kolom parsial). Kandidat tindak lanjut: tes integrasi create nota penuh dengan cleanup stok/counter — BELUM dikerjakan.
- **Deploy (opsi 2 owner, 27 Sep):** branch `hotfix/sales-create-date-p0` dari `origin/main` → fast-forward ke `main` → push → Vercel auto-deploy. Hotfix ini menjadi **`v1.67.20-stable`** yang live di produksi.
- **Versi batch ronde-2 (lokal):** di-renumber dari `v1.67.20` → **`v1.67.21-stable`** (CHANGELOG + README + SUPERAPP_BRAIN + Login + `index.js` + Sidebar + Dashboard `RELEASES[0]`; entri v1.67.20 = hotfix, `previous`). Siap di-merge setelah review owner.
- **Verifikasi:** hotfix (main): backend `npm test` seluruh skrip lulus (21/4/16/25/43 checks + schema-boundary + contract baru); frontend **192/192 test (24 berkas)** + Vite build; checker `v1.67.20-stable`; `git diff --check` bersih. Branch ronde-2: frontend **204/204 test (27 berkas)** + Vite build; checker `v1.67.21-stable`; `git diff --check` bersih.
- **STATUS: TER-DEPLOY.** Ronde-2 di-merge dan di-push 27 Sep sebagai **`v1.67.21-stable`** (fast-forward `main` → Vercel auto-deploy).

### ✅ Checklist pasca-deploy (owner)
7. Produksi → login: label versi `v1.67.20-stable` (rebrand "Habil Operational" menyusul di ronde-2). Lalu Penjualan → Buat Nota Baru → isi → Simpan → nota tersimpan (tidak ada lagi error `"...final"`); cek juga form A4 "Dokumen Resmi" (jika diisi) tampil benar saat dibuka ulang.

## Update 26 Sep 2026 — Ronde 2 temuan owner (v1.67.21-stable — DEPLOY 27 Sep)
- **Batch ini dikerjakan lokal lalu ter-deploy 27 Sep sebagai `v1.67.21-stable`** (fast-forward `main` → Vercel auto-deploy). Tidak menyentuh DB/backend.
- **Temuan ronde 2 & perbaikannya:**
  1. Sidebar salah sorot "Pinjaman Produk" saat tab "Penjualan" aktif → akar masalah: `SalesOrderList.jsx` `pageTab` hanya disink SATU ARAH dari `?tab=pinjaman` (tidak pernah reset ke "nota"), tombol tab tidak mengubah URL, sementara sidebar menyamakan `pathname + search` persis. Fix: efek jadi dua arah + klik tab `navigate()` ke `/sales` / `/sales?tab=pinjaman`; state `loanTab` dari banner Dashboard ikut menormalkan URL.
  2. Preview nota "berdiri" (portrait) dan tidak konsisten → `NotaPreview.jsx` kini berupa **lembar landscape** rasio kertas 210:148 (sama dengan cetak A5/A6), blok bawah menempel dasar lembar (catatan kiri / bank tengah / tanda tangan kiri-kanan / footer dasar), kolom sempit `overflowX: auto` (geser kiri/kanan). Berlaku otomatis di PrintSettings Live Preview & Preview Live form nota. Fakta penguat: `generateNotaPDF` baris 32 `orientation = isA4 ? 'p' : 'l'` — bukti visual A6/A5 landscape dirender via `sips` dari PDF asli (temp test, sudah dihapus).
  3. Form Pengaturan Cetak ("isian bikin OCD") → NAMA TOKO + ALAMAT kini full-width (tidak terpotong), ALAMAT 2 baris; deskripsi Live Preview diperjelas.
  4. Modal Changelog Dashboard terpotong di layar sempit → baris versi `flex-wrap`, tanggal `whitespace-nowrap`.
  5. "Faktur Pembelian masih error" → regresi parse `InvoiceList.jsx` (satu `</div>` berlebih di penutup panel filter); dihapus — halaman render normal kembali.
- **Housekeeping:** file temp `frontend/sp-visual-check.tmp.test.js` DIHAPUS (penyebab "No test suite found" di vitest). Assertion checker versi (label login) disesuaikan pasca-rebrand — tidak lagi menuntut teks "HABIL SUPERAPP".
- **Verifikasi ronde 2:** frontend **204/204 test (27 berkas)**; fokus `SalesOrderList.test.jsx` + `NotaPreview.test.jsx` lulus; Vite production build lulus; checker `v1.67.21-stable` lulus; `git diff --check` bersih. Backend tidak berubah (tidak dijalankan ulang).
- **Catatan:** item "temuan menyusul" tabrakan header A6 di renderer nota lama (`generateNotaPDF`, −18,1 mm) BELUM dikerjakan — masih kandidat fix berikutnya (belum jadi keluhan owner di ronde ini).

### ✅ Checklist tambahan review manual (ronde 2)
6. Penjualan → klik tab "Pinjaman" lalu "Penjualan": URL berubah (`?tab=pinjaman` muncul/hilang) dan sorotan sidebar ikut pindah — tidak lagi nyangkut di "Pinjaman Produk".
7. Pengaturan Cetak → Live Preview kini berbentuk lembar landscape (catatan kiri, bank tengah, ttd kiri/kanan); Preview Live di form nota sama; layar sempit bisa digeser kiri/kanan.
8. Dashboard → modal Changelog: baris versi `v1.67.21-stable` + tanggal tidak terpotong.
9. Invoice/Pembelian: filter & tabel tampil normal (regresi parse hilang).

## Update 26 Sep 2026 — Batch UX/desain lanjutan dari temuan owner (deploy 27 Sep sebagai v1.67.21)
- **Batch ini dikerjakan lokal atas permintaan owner, lalu ter-deploy 27 Sep sebagai bagian `v1.67.21-stable`.** Tidak ada migrasi/DB/backend yang disentuh.
- **Temuan owner pasca-deploy v1.67.19 → semua dikerjakan:**
  1. Preview Live form Buat/Edit Nota masih bahasa desain lama (biru) → `NotaPreview.jsx` dirombak: monokrom, mark H, kolom Harga Satuan, baris Estimasi Berat Paket, NOTE tinta — paritas isi dengan PDF.
  2. Nama file "Simpan sebagai PDF" di dialog cetak = UUID blob URL, bukan nomor nota ("vital") → akar masalah: jsPDF tidak menyetel judul metadata; fix di `salesDocumentPdfSource.js` (`setDocumentProperties({ title: <nama file>, creator })`) untuk kedua engine (A4 v2 + legacy A5/A6/TT). Tombol Unduh langsung sudah benar sejak awal.
  3. Tidak ada indikator persisten sudah dicetak/diunduh (UX flaw) → chip "Sudah dicetak" di `PdfPreviewPanel` (prop `printed`), badge "✓ Sudah dicetak" di kolom nomor `SalesOrderList`, copy prompt unduh diperjelas, status cetak disinkronkan langsung setelah PATCH sukses (tanpa tutup-buka modal).
  4. Permintaan tambahan owner: Surat Pesanan (PDF + preview form Buat/Edit) format baru + logo → `generateSPPDF.js` & `SPPreview.jsx` dirombak monokrom + mark H + header dua kolom + tabel headFill/zebra tanpa harga + tanda tangan aman multi-halaman; `PurchaseOrderList.jsx` memuat logo via `getMonochromeLogoDataUrl`; judul metadata `SP_<po>`.
- **Test baru/updated:** `NotaPreview.test.jsx`, `SPPreview.test.jsx`, `generateSPPDF.test.js` (judul metadata), judul metadata A4+A5 di `salesDocumentPdfSource.test.js`, chip + copy prompt di `PdfPreviewPanel.test.jsx`.
- **Versi:** `v1.67.21-stable` (CHANGELOG + README + SUPERAPP_BRAIN + Login + `index.js` + Sidebar + Dashboard `RELEASES[0]`; entri v1.67.19 di Dashboard dikoreksi: migrasi 022 sudah dijalankan).
- **Verifikasi:** frontend **200/200 test (27 berkas)** + Vite production build; version checker `v1.67.21-stable` lulus; `git diff --check` bersih. Backend tidak berubah (tidak dijalankan ulang).
- **Hasil audit batch deploy sebelumnya:** tidak ada bug baru di luar 3 temuan UX owner di atas; kolom `pdf_status` sebelumnya tidak dipakai di UI mana pun (gap yang kini ditutup).

### 🔧 Fix lanjutan dari review owner (26 Sep, lokal — SP dulu)
- **Bug cetak SP A6:** nama perusahaan menimpa judul — terukur company end **77,1 mm** vs title start **70,1 mm** (−7 mm). Akar masalah: header dua kolom tanpa batas lebar + logo tidak ter-center vertikal (nota punya formula centering, SP tidak).
- **Perbaikan:** `generateSPPDF.js` → `computeSpHeaderMetrics()` sebagai satu sumber kebenaran (fit-to-width nama & judul per kolom A4/A5/A6, diuji regresi "celah antar kolom ≥ 1 mm"); logo mark H di-center vertikal terhadap blok identitas. `SPPreview.jsx` disamakan (logo center `alignItems`, qty pack `qty_in_unit` + sub-line "(= X pcs)" persis PDF).
- **Bukti visual:** render PDF asli (A6 tanpa logo, A6 + A5 dengan logo placeholder) → PNG via `sips`, diperiksa manual — header bersih di ketiga ukuran.
- **Temuan menyusul (belum dikerjakan, sesuai arahan "SP dulu"):** renderer nota lama (`generateNotaPDF.js`) punya pola header yang sama dan **A6 juga bertabrakan**: company end **81,2 mm** vs title "NOTA PENJUALAN" start **63,1 mm** (−18,1 mm); A5 aman (+9,4 mm). Kandidat fix berikutnya dengan pola `computeSpHeaderMetrics`.
- Verifikasi batch fix: frontend **204/204 test (27 berkas)** + Vite build + checker lulus.
- **OCD pass daftar nota (26 Sep):** nomor nota, tanggal, nama customer, dan baris "Jatuh Tempo Pembayaran" dibuat `white-space: nowrap` — masing-masing satu baris utuh (sebelumnya pecah "HSB-NOTA-" / "2609054", "17 Sep" / "2026", "…Kamis," / "24 Sep 2026"). Label "Jatuh Tempo Pembayaran" DIPERTAHANKAN (konsisten dengan PDF/preview — standar lama); wrapper tabel sudah `overflowX: auto` jadi layar sempit scroll, bukan potong teks.

### ✅ Checklist review manual Harun (batch lokal v1.67.20)
1. Form nota → Buat/Edit → "Preview Live" tampil monokrom + mark H, isi setara PDF (harga satuan, estimasi berat).
2. Opsi Cetak → Cetak → pilih "Simpan sebagai PDF" di dialog Chrome → nama file otomatis `Nota_HSB-NOTA-….pdf` (bukan UUID) untuk A4/A5/A6; cek juga tanda terima `TT_…`.
3. Setelah "Ya, tandai" → chip "Sudah dicetak" di toolbar; tutup modal → badge "✓ Sudah dicetak" di daftar nota.
4. Surat Pesanan → Buat/Edit → preview baru (logo ter-center + header + tabel tanpa harga); Cetak SP → PDF bernama `SP_HSB-SP-….pdf`, berlogo, dan **header tidak tumpang-tindih** (nama perusahaan vs SURAT PESANAN) — cek ulang hasil cetak A6 seperti temuan 26 Sep.
5. ✅ Sudah di-push 27 Sep 2026 (fast-forward `main` ke `v1.67.21-stable`).

## Update 26 Sep 2026 — Batch final (renderer lama monokrom + mark H) + migrasi 022 DIJALANKAN + merge ke main
- **Batch final dari sesi owner** (renderer lama jadi monokrom + mark "H" resmi `habil-mark.svg`, modal cetak tidak bisa ditutup saat PATCH saving, validasi `terima`, logo di nota pinjaman) sudah diverifikasi mandor: frontend **192/192 test (24 berkas)**, build Vite lulus, backend lulus 21/4/16/13/25/43 checks. Batch tidak menyentuh backend.
- **Fix mandor pra-migrasi:** statement settings di migrasi 022 dibuat type-safe — DB live menyimpan `print_settings.setting_value` sebagai **TEXT** (bukan JSONB seperti definisi migrasi 014), jadi merge NPWP memakai blok `DO` pemilih tipe. Tanpa ini migrasi akan gagal saat dijalankan.
- **Migrasi 022 DIJALANKAN 26 Sep 2026** setelah backup penuh `pg_dump` 17 → `~/Downloads/habil-db-backup-pre-022-20260923.dump` (1.64 MB). Hasil: **1 applied, 21 skipped** (`[Migration] confirmed host ep-frosty-glitter-...neon.tech`). Verifikasi read-only: 20/20 kolom `sales_orders`, 8/8 kolom `customers`, `nota_layout.npwp` ter-seed, `documents_renderer_v2` ada dengan `enabled=false`.
- **Merge ke main + push dilakukan dalam sesi ini** (setelah migrasi, urutan benar: migrasi → backend → frontend): branch di-push, fast-forward ke `main`, `main` di-push → Vercel deploy otomatis. Bukti: `git log origin/main`.
- **Flag `documents_renderer_v2` tetap `false`** — A5/A6 memakai renderer lama (dengan tampilan monokrom baru) sampai cutover; A4 selalu engine baru.
- Rollback aplikasi: redeploy commit main sebelumnya — kolom additive boleh tetap ada, tidak ada backfill/data bisnis yang diubah oleh migrasi.

### ✅ Checklist pasca-deploy (owner)
1. Buka app produksi → login → version label `v1.67.19-stable`.
2. Nota A5/A6, tanda terima, nota pinjaman: tampilan monokrom + mark H; cetak/unduh normal; blob sama antara preview & file.
3. Nota A4 instansi: faktur + NPWP terbaca dari `nota_layout` (sudah ter-seed oleh migrasi).
4. Form nota → bagian "Dokumen Resmi (A4)": isi & simpan, buka lagi → snapshot terbaca (kolom DB sudah ada).
5. PrintSettings: ubah satu field → simpan → muat ulang → `npwp`/`email`/kunci lain tetap utuh.
6. Validasi: nota dengan total ≠ jumlah item → unduh/cetak terkunci; prompt status hanya menandai setelah "Ya, tandai".

## Update 23 Sep 2026 — Official Sales Documents Fase 2 + Fase 3 + rilis v1.67.19-stable (branch, belum di-push)
- **Fase 2 + Fase 3 SELESAI di branch `feat/official-sales-documents`** (sejak docs plan `b9cc34a`; HEAD: lipatan fase 3 ke CHANGELOG/ACTION_LOG — lihat `git log`) — **BELUM di-push, belum dideploy, tidak ada migrasi/SQL yang dijalankan.**
- Tiga bug diperbaiki dengan test-gagal-dulu: preservasi kunci `nota_layout` saat simpan PrintSettings (npwp/email tidak lagi terhapus), PPN 0% & tarif pecahan sesuai snapshot, judul per ukuran (A4 faktur, A5/A6 nota).
- Fitur baru: modul sumber PDF bersama (`salesDocumentPdfSource.js`), preview PDF aktual di modal Opsi Cetak (canvas + toolbar + jumlah halaman; blob sama untuk unduh/cetak; loading/error; responsif) via `pdfjs-dist` (lazy), dan panel validasi sebelum cetak (blocker mengunci unduh & cetak).
- **Fix wave final review:** blocker terbilang untuk total ≥ Rp 1 miliar (cabang Miliar/Triliun + fixture/golden `large-billion-amounts`), fallback NPWP v2 pra-migrasi 022, guard satu unduhan/cetakan berjalan (spec §12), saran ukuran pada pesan validasi jumlah item, dan koreksi wording jalur legacy nota hasil konversi pinjaman di CHANGELOG + ACTION_LOG.
- **Migration `20260922_022_sales_document_legal` masih BELUM dijalankan di database mana pun.** Audit penulis kolom baru + urutan rollout (migrasi → backend → frontend) + verifikasi read-only + rollback: `docs/superpowers/notes/2026-09-22-migration-022-rollout.md`.
- **Flag `documents_renderer_v2` masih `false`** — A5/A6 renderer lama; `terima` selalu jalur lama, `pinjaman` (nota hasil konversi bertipe `nota`) ikut jalur lama hanya di A5/A6 selama flag off (A4 sudah v2). Cutover A5/A6 menyusul.
- Verifikasi rilis fase 2: frontend 142/142 test (21 berkas, termasuk `angkaKeTerbilang.test.js` baru) + Vite production build; backend 21 delta unit + 4 confirmation + 16 safety + 13 schema boundary + 25 HTTP smoke + 43 adjustment hardening checks; version checker `v1.67.19-stable` lulus; `git diff --check` bersih.
- **Fase 3 SELESAI (23 Sep 2026) — empat celah ditutup** (commit `aa7f5e3` → `9eacda5`, semua dengan tes gagal-dulu):
  - **Validasi total berbasis item:** total vs Σ(qty × harga satuan) + ongkir + biaya (qty mengikuti `qty_in_unit ?? qty`); total nol/negatif/bukan angka dan mismatch memblokir unduh/cetak, termasuk saat `ppn_excluded`; dua fixture tes lama yang lolos karena identitas aljabar ikut dikoreksi.
  - **PrintSettings anti-timpa:** GET gagal atau respons tanpa `nota_layout` → form tidak dirender (tidak bisa menimpa), panel error + "Coba lagi", Simpan nonaktif sampai layout termuat.
  - **Status cetak eksplisit:** unduh/cetak tidak lagi menandai `sudah_dicetak` otomatis; prompt "Ya, tandai"/"Tidak" muncul setelah sukses — hanya "Ya, tandai" memanggil `updatePdfStatus`.
  - **Helper `printBlobInIframe` (baru):** timeout 10 dtk + `onerror` + fallback popup + iframe dibersihkan & blob URL di-revoke di semua jalur reject; pesan gagal per kode (`timeout`/`load_failed`/`popup_blocked`/`print_failed`).
  - **PdfPreviewPanel:** kegagalan render kanvas → pesan + "Coba lagi" (re-render, bukan rebuild blob); unduh/cetak tetap aktif.
- Verifikasi penuh pasca-fase 3 (final rilis): frontend **163/163 test (22 berkas)** + Vite production build; backend 21 delta unit + 4 confirmation + 16 safety + 13 schema boundary + 25 HTTP smoke + 43 adjustment hardening checks; version checker `v1.67.19-stable` lulus; `git diff --check` bersih. Tidak ada migrasi dijalankan.

### ✅ Checklist review manual Harun (Fase 2 + Fase 3)
1. **Preview PDF aktual:** buka nota → Opsi Cetak → preview ter-render; ganti A4/A5/A6 (preview ikut berubah), zoom/Fit/navigasi halaman, lalu unduh & cetak (dokumen sama dengan preview).
2. **Tarif PPN:** nota PPN 0% → tampil "PPN 0%"; nota tarif 11,5% → tampil "PPN 11,5%".
3. **PrintSettings:** ubah satu field → simpan → muat ulang → pastikan `npwp`/`email`/kunci lain tidak hilang.
4. **Validasi:** nota A4 tanpa nama/alamat customer atau nominal tidak konsisten → tombol unduh/cetak terkunci + alasan tampil di panel.
5. Verifikasi visual PDF (layout, pagination, tanda tangan) tetap manual.
6. **Validasi mismatch total (fase 3):** buat total nota tidak cocok dengan jumlah item + ongkir + biaya (atau total 0) → unduh/cetak terkunci; ulangi pada nota `ppn_excluded` → tetap terkunci.
7. **PrintSettings GET gagal (fase 3):** buka Pengaturan Cetak saat endpoint settings gagal → form tidak tampil (anti-timpa), muncul error + "Coba lagi", Simpan nonaktif; setelah pulih, "Coba lagi" memuat form & Simpan aktif.
8. **Prompt status cetak (fase 3):** unduh/cetak nota dari Opsi Cetak → prompt "Ya, tandai"/"Tidak" muncul; "Ya, tandai" → status jadi sudah dicetak; "Tidak" → status tidak berubah (tidak ada penandaan otomatis).
9. **Error kanvas + Coba lagi (fase 3):** saat pratinjau gagal dirender → pesan error + tombol "Coba lagi" (unduh/cetak tetap aktif); klik "Coba lagi" → halaman ter-render.

## Update 24 Sep 2026 — Official Sales Documents Fase 4 (branch, belum di-push)
- **Fase 4 SELESAI di branch `feat/official-sales-documents`** (commit `f017789` → `e4940f3` → `366b18e`; perbaikan kode dengan tes gagal-dulu, plus mutation check untuk guard hook di `e4940f3`) — **BELUM di-push, belum dideploy, tidak ada migrasi/SQL yang dijalankan.**
- **Sesi + orderId binding (hook baru `useSalesPrintFlow`):** semua hasil async unduh/cetak/konfirmasi hanya menyentuh state bila sesi modal & nota masih sama — cetak nota A yang selesai setelah operator pindah ke nota B tidak memunculkan prompt untuk B, tidak melepas `busy` sesi baru, dan tidak mengirim PATCH ke nota salah; buka/tutup modal me-reset sesi (`sessionRef`/`busyRef`/`savingRef` sinkron, bukan state React yang async).
- **PATCH gagal → konfirmasi dipertahankan:** prompt "Ya, tandai"/"Tidak" tidak hilang saat `updatePdfStatus` gagal sehingga "Ya, tandai" bisa retry tanpa unduh ulang; klik ganda "Ya, tandai" hanya mengirim satu PATCH (guard `savingRef` + tombol "Ya, tandai" nonaktif via prop `statusSaving`).
- **Canvas 2D null → kegagalan preview + retry:** `getContext('2d')` mengembalikan `null` kini menampilkan pesan + tombol "Coba lagi" (sebelumnya kanvas kosong tanpa penjelasan); unduh & cetak tetap aktif (blob, bukan kanvas).
- **Migration `20260922_022_sales_document_legal` masih BELUM dijalankan di database mana pun; flag `documents_renderer_v2` masih `false`** — A5/A6 renderer lama, `terima` selalu jalur lama, `pinjaman` ikut jalur lama hanya di A5/A6 selama flag off (A4 sudah v2). Cutover A5/A6 menyusul.
- Verifikasi penuh pasca-fase 4 (final rilis): frontend **171/171 test (23 berkas)** + Vite production build; backend 21 delta unit + 4 confirmation + 16 safety + 13 schema boundary + 25 HTTP smoke + 43 adjustment hardening checks; version checker `v1.67.19-stable` lulus; `git diff --check` bersih. Tidak ada migrasi dijalankan.

### ✅ Checklist review manual Harun (Fase 4)
1. **Sesi/nota terikat:** buka nota A → Cetak → tutup modal → buka nota B → biarkan cetak A selesai → pastikan tidak ada prompt konfirmasi / PATCH yang muncul untuk nota B (cek Network tab), dan unduh/cetak nota B tidak nyangkut.
2. **Retry PATCH gagal:** saat prompt muncul, matikan jaringan lalu klik "Ya, tandai" → konfirmasi tetap tampil + pesan gagal; pulihkan jaringan → "Ya, tandai" mengirim PATCH tanpa unduh ulang.
3. **Anti klik ganda:** klik "Ya, tandai" dua kali cepat → hanya satu PATCH (cek Network tab) + tombol tampak nonaktif selama menyimpan.
4. **Canvas 2D null:** di perangkat/browser tanpa canvas 2D → preview menampilkan kegagalan + "Coba lagi"; unduh & cetak tetap berfungsi.

## Update 22 Sep 2026 — Official Sales Documents Plan 1 (branch, belum di-push)
- **Plan 1 SELESAI di branch `feat/official-sales-documents`** (16 commit) dan **BELUM di-push ke origin** — tidak ada deployment dari branch ini.
- Model dokumen penjualan kanonis + renderer monokrom A4/A5/A6 dengan 30 ekspektasi golden (fixture × format) dan test paritas antar-ukuran.
- A4 "Faktur Penjualan" diekspos di Opsi Cetak; default mengikuti konteks (data formal → A4, customer bertipe `toko` → A6, selain itu A5). Nota `terima` selalu memakai renderer lama; nota hasil konversi `pinjaman` bertipe `nota` → A4 memakai engine baru, A5/A6 mengikuti flag.
- **Migration `20260922_022_sales_document_legal` BELUM dijalankan di database mana pun** (additive; aman dijalankan nanti, tanpa backfill).
- **Flag `documents_renderer_v2` masih `false`** (seed di `print_settings`) — A5/A6 tetap memakai renderer lama; A4 selalu memakai engine baru.
- Verifikasi rilis: frontend 87/87 test + Vite production build; backend 21 delta unit + 4 confirmation + 16 safety + 13 schema boundary + 25 HTTP smoke + 43 adjustment hardening checks lulus; version checker `v1.67.18-stable` lulus.
- **Plan 2 (menyusul):** preview PDF aktual (pdfjs-dist), panel validasi, cutover A5/A6 + penghapusan jalur lama, migrasi `terima` ke engine baru (`pinjaman` sudah lewat jalur `nota`: A4 v2, A5/A6 ikut flag).

### ✅ Checklist review manual Harun (Plan 1)
1. Buka nota yang datanya formal (instansi/perusahaan) → **Opsi Cetak** → pilih **A4** → unduh & buka PDF; cek judul "FAKTUR PENJUALAN", identitas, item, PPN, dan tanda tangan.
2. Buka form nota → expand bagian **"Dokumen Resmi (A4)"** → isi/cek field legal & pengadaan, simpan, lalu buka lagi untuk memastikan snapshot tersimpan.
3. Cek master customer bertipe **Toko** (badge tipe `Toko`) — itu yang membuat default Opsi Cetak jatuh ke A6.

## Update 02 Sep 2026 - v1.67.10 Deployed
- Pagination `generateNotaPDF` diubah dari reserve footer global menjadi pengukuran tinggi baris AutoTable dan pembagian tabel adaptif.
- Kasus nota A6 tiga item dengan jatuh tempo dan NOTE panjang kini satu halaman; fixture pelanggan nyata sudah dianonimisasi.
- Nota panjang diuji membagi A6 enam item menjadi 3+3 dan A5 delapan item menjadi 4+4, dengan tail tetap pada halaman terakhir.
- Root `package.json` menyediakan satu perintah `bun dev` untuk full stack. Database remote lokal dipaksa read-only; operasi tulis membutuhkan database dev terpisah.
- Dua linked worktree lama sudah dilepas; branch Git-nya tetap disimpan. Folder utama belum di-rename agar path lokal aktif tidak rusak saat verifikasi.
- Verifikasi: frontend 41/41 tests, Vite production build, HTTP frontend/backend 200, pool remote read-only aktif, dan version checker lulus.
- Versi v1.67.10 dipush ke `origin/main` melalui commit `c9a2570` dan `437bd81`.
- Neon production dikonfirmasi Free plan, region Singapore, scale-to-zero setelah 5 menit; tidak ada perubahan setting provider.
- Endpoint `/api/health/db` dan cron keep-warm `*/5` sudah dibuat lokal. Smoke test backend 18/18 lulus dan local HTTP DB health 200.
- Deployment Vercel backend dan frontend sukses. Backend `sin1` merespons `/api/health/db` HTTP 200; manual keep-warm run `33623774761` juga sukses, dengan dashboard HTTP 200.
- GitHub Release `v1.67.10-stable` dibuat pada tag final; in-app RELEASES juga sudah menampilkan PDF fix, backend `sin1`, dan keep-warm.
- Browser production benchmark 5 run: login API probe p50 658 ms (HTTP 401, username acak), dashboard data-ready p50 729 ms, API terlama p50 338 ms, FCP p50 484 ms; seluruh 50 request dashboard HTTP 200.
- Analisis query: `/api/dashboard/stats` sudah paralel via `Promise.all`; belum ada rewrite SQL karena variasi utama berasal dari cold-start/network, bukan satu query konsisten yang dominan.
- Reminder keamanan pasca benchmark: rotate credential Supabase/Neon dan GitHub PAT yang pernah tersimpan/terpapar di file lokal atau sesi; jangan memasukkan nilainya ke repo atau laporan.
- Update dependensi non-breaking & resolusi vulnerabilitas `qs` via commit `67b068c` sukses dideploy ke Vercel frontend & backend (CI lulus).
- Auto-release popup "Apa yang Baru?" dinonaktifkan di `Dashboard.jsx`; changelog manual tetap tersedia di tombol versi. Tetap di v1.67.10-stable.
- Optimasi main-thread & UX animasi: listener global pointermove dicabut, RouteFade instan 140ms murni opacity, skeleton KPI layout shift fixed, active feedback tombol distandarisasi scale(0.97).
- Optimasi aset & jaringan: font subsetting Latin-only (hemat 43 kB CSS gzipped & 50+ file font), endpoint komposit `/api/dashboard/bootstrap` memangkas 2 request awal jadi 1 round-trip.
- Workflow adjustment sales dibangun futureproof dan dipush pada commit `2f480f0`: paid-sale guard, notes-only audit, multi-item exchange, source invoice, condition/disposition, idempotency, settlement, void reversal, history API, dan PDF adjustment A5/A6. Tidak ada write production.
- Targeted schema migration adjustment production berhasil setelah backup PostgreSQL 17.11 berukuran 1.6M; `sales_audit_log`, `sales_adjustments`, `sales_adjustment_items`, dan `sales_settlements` terverifikasi ada. Tidak ada business-data write.
- Schema delta adjustment production berhasil diterapkan setelah backup kedua PostgreSQL 17.11. Commit `d8e006b` sukses dideploy; `/api/sales/368/adjustments` dan `/api/sales/383/adjustments` authenticated `200`, adjustment/settlement count tetap `0 -> 0`. Tidak ada nota, stok, atau ledger yang diubah.
- Final production test flow dipush pada commit `fc47c14`; Vercel frontend/backend dan CI sukses. Selector item kini eksplisit; `HSB-NOTA-2609003` dan `HSB-NOTA-2609014` tetap unchanged, adjustment/settlement count production tetap `0`.
- Snapshot nota utama adjustment, PDF A5/A6 lengkap, cetak ulang histori, status settlement, serta sidebar/filter Pinjaman sudah selesai lokal dan terverifikasi lewat 43 frontend tests. Snapshot schema production diterapkan setelah backup ketiga 1.6M tanpa write business data.

## ⚠️ Pekerjaan HABIL selalu menyangkut DUA folder

1. **`~/Projects/dashboard-app`** — aplikasinya (repo ini).
2. **`~/HABIL LABA & produk`** — BUKAN repo. Data mentah marketplace + **SOP aturan bisnis**:
   `GUIDE.md` (cara hitung laba per penarikan, HPP wajib fresh dari DB), `MAPPING-PRODUK.md`,
   `MAPPING-BUNDLE.md`, `PRICING-STRATEGY.md`, `STATUS-VALIDASI.md`, `PERTANYAAN-TERBUKA.md`,
   `engine_laba.py`, data per bulan (APRIL–JULI 2026 × 7 sub-toko), e-statement BCA, export produk.

Folder data = sumber kebenaran aturan bisnis; aplikasi = tempat aturan itu diserap
(contoh: aturan bundle/ecer → `marketplace.js` v1.63.x; e-statement → Buku Besar v1.64.0).
**Kalau tugasnya menyangkut laba/harga/produk marketplace: baca `GUIDE.md` + `MAPPING-PRODUK.md` dulu,
dan ambil HPP fresh dari DB — jangan pakai angka hardcode di `engine_laba.py`.**

---

**Terakhir diperbarui:** 24 Sep 2026
**Status:** ⏳ **v1.67.19-stable siap di branch `feat/official-sales-documents`** (Official Sales Documents Fase 2 + Fase 3 + Fase 4) — terverifikasi lokal (frontend 171/171 test + build, backend 6 suite, version checker lulus), **BELUM di-push dan belum dideploy**. Migration 022 belum dijalankan di DB mana pun; flag `documents_renderer_v2` masih `false`. Menunggu review manual Harun (checklist Fase 2–4 di atas), lalu cutover A5/A6.

### 📦 GitHub Releases dirapikan total (28 Jul 2026)
Sebelumnya berhenti di `v1.0.1` (Mar 2026) padahal kode sudah v1.64.1 — melompat 4 bulan.
- **77 rilis** sekarang: 12 rilis lama (v0.1.0–v1.0.1) dirapikan judul+isinya, **64 rilis baru**
  (v1.1–v1.64, satu per versi minor, tiap rilis memuat semua entri changelog di baris versinya),
  plus v1.64.1. Tidak ada lubang versi.
- Tag dibuat retroaktif, ditambatkan ke commit nyata berdasarkan tanggal rilis di `CHANGELOG.md`.
- **Kebocoran kedua ditemukan & ditutup**: badan rilis `v0.1.0` di GitHub memuat `Password: admin123`
  (pembersihan riwayat git TIDAK menyentuh teks rilis — saluran terpisah). Kini 0 kredensial di 77 badan rilis.
- `gh` CLI dipasang (brew) + Harun login sekali; rilis berikutnya bisa dibuat langsung dari sini.

### 🔐 Riwayat git ditulis ulang (27 Jul 2026)
Password produksi (`direktur`/`admin`) pernah ter-commit **teks polos** di `cloud_migration_backup.sql`
plus tersebar di 7 berkas lain (docs, changelog, seed `auth.js`). Atas keputusan Harun (menolak ganti
password, minta dibersihkan dari GitHub):
- Password dihapus dari semua berkas terlacak; seed `auth.js` kini ambil dari env
  (`SEED_DIREKTUR_PASSWORD` / `SEED_ADMIN_PASSWORD`), `cloud_migration_backup.sql` di-untrack + gitignore.
- Seluruh riwayat ditulis ulang dengan `git filter-repo --replace-text` (406 commit), lalu force-push
  `main` + `dev` + `audit-fixes` + semua tag.
- **Verifikasi**: kloning ulang dari GitHub → 406 commit, **0 memuat password**.
  (Verifikasi pertama sempat menemukan 232 commit masih kotor karena `dev`/`audit-fixes` belum ikut didorong — sudah diperbaiki.)
- Cadangan penuh sebelum penulisan ulang: `~/Downloads/habil-repo-backup-2026-07-27.bundle` (2,2 MB)
  dan `~/Downloads/cloud_migration_backup_LOKAL_2026-07-27.sql`.

⚠️ **Password lama MASIH AKTIF di produksi** — Harun memilih menunda. Aplikasi belum punya fitur ganti
password sama sekali (`auth.js` cuma `login`/`logout`). **Fitur ganti password = pekerjaan berikutnya yang disepakati.**

---

## ⛔ Aturan yang berlaku di sesi ini

- **JANGAN commit / push tanpa izin eksplisit Harun.**
- **JANGAN jalankan perintah tulis ke database.** Perubahan data hanya boleh setelah: backup + skrip rollback + transaksi ber-invarian + izin Harun.
- Build & test dijalankan **sekali oleh mandor** setelah semua subagent selesai, bukan per-agent.

---

## ✅ SELESAI & TERVERIFIKASI

### Tahap 1 — dikerjakan mandor langsung
| # | Perbaikan | Berkas |
|---|---|---|
| — | Nomor batch di nota tidak ikut terupdate (2 lapis: propagasi + loop kunci-HPP berhenti menimpa teks) | `backend/routes/sales.js`, `backend/routes/inventory.js` |
| — | Data: 17 baris `sales_items` disinkronkan. Transaksi ber-invarian (jumlah baris & total laba kotor wajib tetap). Terbukti: 315→315 baris, laba Rp71.276.816,42 tidak bergeser | DB prod |
| — | "Harga biasanya" AVG → **modus 8 transaksi terakhir** (`RECENT_PRICE_WINDOW`) | `backend/routes/insights.js`, `SalesOrderList.jsx` |
| — | Mock test basi → suite hijau 5/5 suite, 10/10 test | `Dashboard.test.js` |
| — | Versi v1.64.1 konsisten 6 berkas + CHANGELOG + SUPERAPP_BRAIN + koreksi catatan port di CLAUDE.md | banyak |

**Backup data:** `backend/backups/sales_items_batch_snapshot_BEFORE_2026-07-27.json` + `ROLLBACK_batch_snapshot_2026-07-27.sql` (skrip rollback sudah diuji jalan lalu dibatalkan).

### Tahap 2 — subagent, sudah diverifikasi mandor
| # | Perbaikan | Berkas | Model |
|---|---|---|---|
| 6 | `nota-restored` ikut dibersihkan saat nota diedit (mutasi yatim → stok tidak kepotong ulang) | `backend/routes/sales.js` | Sonnet |
| 9 | Stok negatif ditolak di `POST /batches/:id/adjust` | `backend/routes/inventory.js` | Haiku |
| 16 | Ganti nama distributor gagal → muncul notifikasi (`flash(msg,"error")`, tanda tangan diverifikasi) | `PurchaseOrderList.jsx` | Haiku |
| 3 | Tombol × pencarian bisa Enter/Space | `MasterSelect.jsx` | Haiku |
| 2 | Tombol band harga 22×24 → **34×34**, gap 3→6 | `MarketplaceProductTab.jsx` | Haiku |
| 4 | Label form tersambung ke 4 kolom + 1 badge warna | `CustomerList.jsx` | Haiku |
| 12 | Tier harga nyasar ke produk lain → penjaga `useRef` identitas produk | `InventoryDashboard.jsx` | Sonnet |
| 11 | Hapus batch di Opname → `ConfirmModal` (bukan `window.confirm`) | `inventory/OpnameModal.jsx` | Sonnet |
| 1 | Badge warna `var(--token)NN` (CSS tidak sah) → `color-mix`. Konversi diverifikasi: 15→8%, 18→9%, 20→12%, 22→13%, 33→20%, 66→40% | OpnameModal (3), CustomerList (1) | — |

---

### Tahap 3 — subagent, sudah diverifikasi mandor (27 Jul, sore)
| # | Perbaikan | Berkas | Model |
|---|---|---|---|
| 13 | Baris nota hilang saat input cepat — `setItems`/`setItemBatches` jadi bentuk fungsional (agent menemukan 2 pola tambahan di `setItemBatches` yang luput dari daftar) | `SalesOrderList.jsx` | Sonnet |
| 14 | 4 kolom uang pakai `RupiahInput` (HPP, harga jual, ongkir, biaya kurir) | `SalesOrderList.jsx` | Sonnet |
| 17 | Target tap hapus baris → 36×36, kolom grid dilebarkan. **Dialog konfirmasi sengaja BELUM** — menunggu keputusan Harun | `SalesOrderList.jsx` | Sonnet |
| 21 | Reset `formErrors`/`saveError` di `openAdd` **dan** `openEdit` | `SalesOrderList.jsx` | Sonnet |
| 5 | **Faktur di Sampah menarik stok** — guard tolak kalau stok sudah terjual, `FOR UPDATE` + cek kecukupan (dilarang minus), mutasi penanda `faktur-cancelled`/`faktur-restored`, restore simetris & bertransaksi, jatah SP dikembalikan | `backend/routes/invoices.js` | Sonnet |
| 1 | Sisa 8 badge warna (`50`→31%, `20`→12%, `18`→9%) — **total 14/14 beres** | InvoiceList (6), Dashboard (1), PurchaseOrderList (1) | Haiku |

**⚠️ Bug agent yang ditangkap & diperbaiki mandor:** agent `invoices.js` benar mengecualikan `faktur-cancelled`
di penjaga hapus-permanen (baris 1350) tapi **lupa melakukannya di penjaga soft-delete buatannya sendiri** (baris 1165).
Akibatnya siklus hapus→pulihkan→hapus-lagi akan ditolak dengan pesan yang salah. Sudah diperbaiki; kini kedua
penjaga konsisten (diverifikasi: 2 kejadian `reference_type <> 'faktur-cancelled'`).

**Verifikasi akhir:** `CI=true npm test` → **5/5 suite, 10/10 test hijau**. `npm run build` → **`Compiled successfully`, 0 warning**, main 120.48 kB. `node --check` lolos untuk sales.js, inventory.js, insights.js, invoices.js. Sisa warna CSS tidak sah: **0**.

**Efek samping perilaku yang perlu diketahui Harun:** `RupiahInput` mengirim nilai saat kolom **ditinggalkan (blur)**,
bukan tiap ketikan — jadi peringatan "harga rugi" & subtotal baru berubah setelah pindah kolom. Faktur & Inventory
memang sudah begitu (ini menyeragamkan), tapi di Nota ini baru.

---

### Tahap 4 — Official Sales Documents Plan 1 (22 Sep 2026, branch `feat/official-sales-documents`, belum di-push)
| # | Hasil | Berkas |
|---|---|---|
| — | Model dokumen kanonis + renderer monokrom A4/A5/A6 + 30 ekspektasi golden (fixture × format) | `frontend/src/utils/documents/` |
| — | A4 "Faktur Penjualan" di Opsi Cetak, default konteks, routing flag `documents_renderer_v2` (masih `false`) | `frontend/src/components/SalesOrderList.jsx`, `print_settings` |
| — | Migration additive 022 (kolom legal/pengadaan, `ppn_rate`, seed NPWP, seed flag) — **BELUM dijalankan** | `backend/migrations/routeSchemas.js` |
| — | Field legal di form nota + master customer; NPWP pindah dari hardcode ke print_settings | `SalesOrderList.jsx`, `CustomerList.jsx` |

---

## 📋 BELUM DIKERJAKAN

### Sudah diputuskan Harun, tinggal eksekusi
- **#15 Draft nota per perangkat** — sekarang 1 slot untuk bertiga karena akun dipakai bersama (`getDraftOwnerId` = `req.user.id`, `backend/routes/sales.js:275`; pola sama di `invoices.js:153`). Keputusan: **kunci ke ID perangkat/browser, bukan ID akun.** Ditahan sampai agent `SalesOrderList.jsx` selesai (berkas bentrok).

### Belum diputuskan — perlu jawaban Harun
- **#7** HPP dipercaya penuh dari browser, server tidak mencocokkan ulang ke batch yang benar-benar dipotong (`sales.js:498`). Laba bisa overstate kalau form lama dibiarkan terbuka. Perlu keputusan: server ambil ulang HPP dari batch, atau cukup peringatan di UI?
- **#8** Edit faktur "menyusul" (yang tidak membawa stok) menambah produk baru tanpa menambah stok, dan tetap menjawab sukses.
- **#5-lanjutan** Password default `<password-default>`/`<password-default>` **masih aktif di produksi** — hanya Harun yang bisa ganti. Ditunda atas permintaan Harun, tapi **ini risiko tertinggi yang masih terbuka**.

### Antre, belum dijadwalkan
- **#10** Tampilan gagal-muat vs kosong tidak dibedakan di 4 halaman (`isError` tidak dipakai). Lintas-berkas → harus giliran terakhir, sesudah semua agent per-berkas selesai.
- **#18** Heatmap Dashboard: klik 2 tanggal cepat → data bisa milik tanggal lain.
- **#19** Klik Edit 2 faktur cepat → bisa kebuka faktur yang salah.
- **#20** Buka Edit nota A lalu pindah B → snapshot batch A bisa nempel ke B.
- **#17-lanjutan** Konfirmasi hapus baris produk (baru target tap yang diperbesar; dialog konfirmasi sengaja BELUM — menunggu keputusan Harun).
- Dari audit lama: kerentanan dependensi (FE 45, BE 8 — CRA sudah end-of-life), `err.message` bocor 124×, `POST /api/bugs` tanpa auth, tabel `users` warisan, `React.memo` 0× di komponen raksasa, responsif lewat JS bukan CSS.

---

## 📌 Konteks lain yang menunggu

- **Rekonsiliasi TMA (Bu Susi)** — selesai, 3 item menunggu jawaban Harun. Lihat memory `rekonsiliasi-tma-book2`.
- **Permintaan Mas Viktor** — data penjualan Surya Sakti Jan 2026–kini, khusus produk Enseval. Detail menyusul dari Harun. App baru mulai ~April 2026, sisanya disinkronkan dari Drive/Dropbox.
- **Stok opname Enseval & PPG** — 9 foto di `~/Downloads/IMG_1898..1906.jpeg`, yang dicoret tangan saja. Belum disentuh.
- **Ide fitur**: kategori distributor per produk (Enseval / Parit Padang / AAM) supaya Inventory, opname, dan kulak tahu produk ini dari distributor mana. Perlu brainstorming dengan Harun dulu.

---


---

## 📌 ANTREAN TUGAS (dicatat 28 Jul 2026)

### A. Menyangkut orang lain — dahulukan
| # | Tugas | Catatan |
|---|---|---|
| A1 | **Bayar Om Irul (beras)** — cek nominal dulu | Mengunci HPP beras yang di rekonsiliasi TMA masih ESTIMASI Rp350.000 → 5 nota ⚠ bisa dihitung ulang benar |
| A2 | **Ko Hans**: penjualan online Juni 2026 | Data Juni ADA di app, bisa langsung ditarik |
| A3 | **Perbarui laporan keuangan** | Kemungkinan menunggu A1 |
| A4 | **Mas Viktor**: Surya Sakti Jan–kini, produk Enseval | Jan–Mar kemungkinan tidak ada di app → sinkron Drive/Dropbox. Detail belum diberikan |

### B. Aplikasi
| # | Tugas | Catatan |
|---|---|---|
| B1 | **Stok opname Enseval & PPG** | 9 foto `~/Downloads/IMG_1898..1906.jpeg`. HANYA yang dicoret tangan, dan itu pun sebagian (tiap salesman beda PIC) |
| B2 | **Kategori distributor per produk** | Enseval / Parit Padang / AAM. Satu produk bisa dari >1 distributor. **Brainstorming dulu** |
| B3 | **Filter isi repo biar profesional** | `CLAUDE.md`, `SUPERAPP_BRAIN.md`, `SEED_MIGRATION_HABIL.sql`, `ACTION_LOG.md`, `AUDIT_*`, `RELEASE_*_DRAFT.md` — mana yang layak publik? Cek juga riwayat/source code kalau ada yang nyangkut |
| B4 | **Fitur ganti password** | Disepakati. Belum ada sama sekali di `auth.js` — ini sebabnya password default masih aktif |
| B5 | **Audit mandiri lewat browser** | Fase khusus: Claude buka app-nya sendiri pakai browser tool — cek responsivitas (HP/tablet/desktop), telusuri fitur satu-satu, baca console error + network log, laporkan temuan visual & fatal. Selama ini audit baru dari membaca kode, belum dari memakai aplikasinya |
| B6 | **Buku Besar: perjelas keterangan & kategori** | Harun masih bingung membacanya — belum nyambung dengan buku besar Excel miliknya. Perlu: keterangan transaksi lebih terbaca, kategori sepadan dengan Excel, penanda laba minus. **Butuh berkas Excel buku besar Harun sebagai acuan** sebelum mulai. Saat ini ada 74 entri "Perlu review" yang belum terkategori |

### C. Sisa audit (21 temuan) yang belum digarap
#7 HPP dari browser · #8 edit faktur menyusul tak menambah stok · #10 bedakan layar gagal-muat vs kosong ·
#15 draft per perangkat (sudah diputuskan, tinggal eksekusi) · #18-20 race condition ringan ·
#17-lanjutan konfirmasi hapus baris · kerentanan dependensi · `err.message` bocor 124× · `React.memo` 0× · responsif lewat JS

## Dokumen terkait

- `AUDIT_TEMUAN_2026-07-27.md` — 21 temuan hasil audit 4 subagent, sudah diverifikasi mandor + tabel status
- `CHANGELOG.md` — entri v1.64.1
- `backend/backups/` — backup + rollback perubahan data
