# ACTION LOG — HABIL SUPERAPP

> Catatan lanjutan pekerjaan. **Baca file ini dulu** kalau sesi terputus, sebelum melanjutkan apa pun.
> Perbarui setiap kali ada tahap berubah — jangan menunggu sampai akhir.
> Pola kerja: Opus = mandor (memecah, memutuskan, memverifikasi), Sonnet/Haiku = pelaksana. Lihat `~/.claude/CLAUDE.md`.

## Update 02 Sep 2026 - Local, Belum Dipush
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

**Terakhir diperbarui:** 27 Jul 2026 (malam)
**Status:** ✅ **v1.65.1-stable SUDAH DI-PUSH ke `main`** (29 Jul) — barcode nota, tombol WA di daftar, filter PPN, fix chunk gagal muat. Sebelumnya v1.65.0 (nota dengan/tanpa PPN) & v1.64.1-stable — Vercel deploy otomatis. Tag `v1.64.1` sudah ada di GitHub.

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
