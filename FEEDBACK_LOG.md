# Evaluasi AI & Feedback Log

> [!IMPORTANT]
> **UPDATE PROTOKOL v1.2.2**: Audit versi global (`grep`) dan pencatatan error otomatis kini wajib dilakukan setiap rilis/temuan.

Dokumen ini berisi catatan evaluasi performa AI selama proses development, digunakan sebagai pedoman perbaikan agar kesalahan tidak terulang di sesi berikutnya.

## Sesi: Selesainya v1.1.9 & v1.2.0 (13 Mar 2026)

### 1. Kesalahan Miskomunikasi Kredensial Login
- **Deskripsi:** Saat menjalankan browser subagent untuk testing fitur Surat Pesanan, AI secara default mencoba login dengan username/password `admin`/`admin`.
- **Dampak:** Pengujian otomatis gagal di tahap awal, membuang-buang waktu dan efisiensi *token processing*.
- **Protokol Seharusnya:** Berdasarkan protokol yang sudah disepakati, kredensial yang sah adalah `admin`/`admin123` untuk admin, dan `direktur`/`direktur123` untuk role direktur.
- **Tindakan Perbaikan (Self-Correction):** AI tidak akan lagi menggunakan intuisi/tebakan *default* untuk kredensial. *Cross-check* ke dokumen framework atau riwayat percakapan wajib dilakukan sebelum menyalakan alat pengujian browser.

### 2. Kesalahan Pengujian Tulis (CRUD) di Environment Dev
- **Deskripsi:** AI memaksakan skenario Create/Update data (Simpan Distributor dan Simpan SP) pada environment `dev` yang databasenya terhubung/"narik" dari struktur *main/local* yang direstriksi.
- **Dampak:** Tombol "Simpan" merespons dengan kendala sistem karena environment *dev* seharusnya tidak sembarangan meloloskan perubahan (mencegah database utama berubah dari testing kotor).
- **Protokol Seharusnya:** Sadar bahwa di environment testing *dev branch*, fokusnya adalah integrasi UI/komponen dan validasi alur frontend. Jika ingin memvalidasi simpan data nyata, itu melanggar *safety net* dari database utama.
- **Tindakan Perbaikan (Self-Correction):** AI akan mencatat bahwa di *Dev Branch*, semua pengujian fungsional yang menyentuh tabel inti harus dimatikan ekspektasinya, cukup memvalidasi bahwa UI bereaksi dengan benar atau menangkap _error_ dengan baik tanpa ekspektasi *commit* database yang sukses.

### 3. Incident v1.2.1: Deployment Blocked by Lint Error (no-undef)
- **Deskripsi:** Vercel gagal melakukan deploy frontend pada rilis v1.2.1 karena terdapat lint error (`closeReleaseModal` is not defined) di `Dashboard.jsx`.
- **Dampak:** Perubahan fitur v1.2.1 tidak muncul di production (`main`) meskipun commit sudah berhasil, sehingga membingungkan user.
- **Penyebab:** Kesalahan penghapusan fungsi handler saat refactoring logic popup "Shared Account".
- **Tindakan Perbaikan (Self-Correction):** 
    1. AI tidak boleh menghapus fungsi handler yang masih direferensikan di JSX.
    2. Selalu cek dashboard Vercel atau jalankan `npm run build` lokal secara simulatif jika deployment tidak kunjung update.
    3. Untuk Akun Shared, popup rilis wajib muncul setiap login (trigger on mount).

### 4. Inkosistensi Versi UI (v1.2.2)
- **Deskripsi:** Beberapa elemen UI (Dashboard badge, Changelog modal, dan Popup) masih menampilkan versi lama (`v1.1.8` atau `v1.2.1`) meskipun sistem utama sudah `v1.2.2`.
- **Dampak:** Membingungkan user dan mengurangi kepercayaan terhadap akurasi sistem.
- **Penyebab:** Fragmentasi label versi di berbagai komponen frontend.
- **Tindakan Perbaikan (Self-Correction):** 
    1. Dilakukan pencarian menyeluruh dan pemusatan label versi.
    2. Hotfix diterapkan langsung ke `main` tanpa menaikkan versi lagi untuk menjaga konsistensi state.
    3. Di masa depan, pertimbangkan variabel global `APP_VERSION` untuk seluruh frontend.

### 7. Shadow Metadata IDE (v1.1.2)
- **Deskripsi:** Ditemukan sisa-sisa label `v1.1.2` di dalam file riwayat `Dashboard.jsx` dan dokumentasi arsip yang bisa memicu kebingungan Agent.
- **Dampak:** Ketidakjelasan "Source of Truth" bagi Agent AI yang baru masuk ke sesi.
- **Tindakan Perbaikan:** Pembersihan menyeluruh `v1.1.2` dari semua file aktif dan penguatan prosedur "Kill Shadow Metadata".

### 8. Kesalahan Format Versi (Spasi vs Hubung)
- **Deskripsi:** Penggunaan format `v1.2.5 hotfix` (dengan spasi) menyebabkan inkonsistensi pencarian grep.
- **Protokol Baru:** Wajib menggunakan tanda hubung (hyphen) tanpa spasi untuk semua label hotfix (Contoh: `v1.2.5-hotfix-2`).
- **Tindakan Perbaikan:** Sinkronisasi total ke format `-hotfix-2`.
