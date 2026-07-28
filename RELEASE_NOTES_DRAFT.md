# Catatan Rilis — HABIL SUPERAPP

> **Catatan penyusunan (boleh dihapus sebelum ditempel ke GitHub):** GitHub Releases repo ini berhenti tercatat di `v1.0.1` (12 Maret 2026), padahal aplikasi yang berjalan sekarang sudah `v1.64.1` (27 Juli 2026). Dokumen ini dibuat untuk "mengejar ketertinggalan" — bagian pertama adalah catatan rilis lengkap untuk versi terbaru, disusul rangkuman bertahap seluruh perjalanan sejak awal, dikelompokkan per tema besar supaya tidak jadi puluhan bagian terpisah. Sumber: `CHANGELOG.md` (293 entri versi).

---

## v1.64.1 — 27 Juli 2026 (Rilis Terbaru)

Rilis kali ini murni perbaikan (tidak ada fitur baru), tapi menambal dua bug yang cukup mengganggu kepercayaan terhadap data di nota.

- **Nomor batch di nota sekarang ikut terbarui kalau dibetulkan.** Sebelumnya, kalau nomor batch di menu Stok dibetulkan (misalnya salah ketik `2651103GU` padahal seharusnya `26S1103GU`), nota lama yang sudah memakai batch itu tetap menampilkan tulisan yang salah — bahkan setelah nota dibuka dan disimpan ulang pun tidak ikut sembuh. Sekarang begitu batch dibetulkan di Stok, semua nota yang memakai batch tersebut ikut benar dengan sendirinya. 17 baris nota lama yang terlanjur salah atau kosong sudah diperbaiki sekaligus dalam satu proses yang aman (ada backup + skrip rollback). **Stok, HPP, dan laba tidak berubah sama sekali** — yang salah murni tulisan nomor batchnya, bukan angkanya.
- **Saran "harga biasanya" tidak lagi memunculkan angka ganjil akibat diskon sesekali.** Sebelumnya sistem memakai rata-rata harga 180 hari terakhir, jadi satu kali kasih diskon bisa menggeser saran harga selamanya (contoh: pelanggan yang 18× beli di harga Rp105.000 dan cuma 1× di Rp103.000 malah dapat saran Rp104.895 — angka yang tidak pernah benar-benar dipakai). Sekarang saran memakai harga yang **paling sering muncul di 8 transaksi terakhir**. Diskon sesekali tidak lagi mengacaukan saran, tapi kalau harga memang benar-benar berubah, saran akan ikut menyesuaikan dalam beberapa nota ke depan — bukan dibekukan selamanya di harga lama.
- **Jaring pengaman otomatis (test suite) kembali 100% hijau** (5 dari 5 kelompok pengujian, 10 dari 10 pengujian) — memastikan dua perbaikan di atas tidak diam-diam merusak bagian lain sistem.

---

## v1.60.0 – v1.64.0 — Toko Online Makin Pintar, Buku Besar 2.0, dan Menu Karyawan (13–14 Juli 2026)

- Tab baru **"Produk & Harga"** di Toko Online: tinggal upload file dari Shopee/TikTok, sistem otomatis mencocokkan tiap listing ke produk HABIL yang benar, lengkap dengan saran harga jual yang sudah memperhitungkan fee marketplace, target untung, dan pembulatan harga yang rapi (…900).
- Saran harga sekarang berbasis **riset harga pasar nyata** — sistem menambang harga yang benar-benar laku terjual di Shopee/TikTok sebagai acuan, lalu menyarankan harga yang kompetitif tapi tetap dipastikan untung, bukan cuma hitungan rumus di atas kertas.
- Semua editan (harga, stok, koreksi HPP) **tersimpan otomatis** saat diketik, ada tombol **"Apply semua saran"** untuk memetakan ratusan produk sekaligus dengan satu klik, dan toko yang sudah pernah diproses "lengket" di sistem — tidak perlu upload ulang setiap kali dibuka.
- **Buku Besar 2.0**: mutasi rekening koran bank bisa diimpor dan **dikategorikan otomatis** (gaji, kulak, listrik, dll berdasarkan pola nama transaksi), sisanya tinggal dipilih manual lewat filter "Perlu review" — ribuan transaksi tidak perlu diketik ulang satu-satu dari Excel.
- **Laporan Bulanan** otomatis membagi laba kotor ke "amplop" (Gaji, Modal, Bensin, Operasional, Listrik, Darurat) sesuai persentase target — meniru cara kerja Excel manual sebelumnya, tapi otomatis, dan sisa bulan lalu ikut terbawa ke bulan berikutnya.
- Menu baru **Hutang Piutang** (pinjam-meminjam pribadi di luar transaksi jual-beli) dan **Karyawan** (data & riwayat gaji karyawan) — keduanya khusus akses Direktur.

---

## v1.51.0 – v1.59.1 — Fitur Peminjaman Barang, Halaman Pajak, Dashboard per Bulan (19 Juni – 12 Juli 2026)

- Fitur baru **"Pinjaman"**: catat barang yang dipinjam customer lengkap dengan nomor batch & tanggal kedaluwarsa, stok otomatis terpotong saat dipinjam, dan bisa langsung dikonversi jadi nota penjualan resmi begitu customer bayar/beli barangnya.
- **Halaman Pajak** baru (khusus Direktur + akun konsultan pajak): rekap PPN masuk-keluar per bulan, perkiraan kurang bayar, dan fitur menandai nota mana yang dikecualikan dari hitungan PPN keluaran — lengkap dengan export untuk bahan lapor.
- **Dashboard bisa "digeser" ke bulan lain** — semua angka (total penjualan, laba kotor, margin per channel, top customer, grafik stok) otomatis ikut menampilkan bulan yang dipilih, bukan cuma bulan berjalan.
- **Perbaikan kritis HPP**: harga pokok di nota sempat "mengembang" sendiri sekitar 11% setiap kali nota dibuka untuk diedit lalu disimpan ulang, membuat margin terlihat rugi padahal sebenarnya tidak. Sudah diperbaiki dan HPP kini dikunci sesuai kondisi saat barang benar-benar terjual.
- **Sesi login diperpanjang dari 15 menit menjadi 4 jam**, supaya operator (Harun/Fivin/Ferry) tidak tiba-tiba ter-logout saat sedang input data.
- Tiga tahap audit tampilan HP & tablet: input tidak lagi "meloncat sendiri" saat diketik di HP, tabel tidak lagi terpotong di iPad, dan tombol-tombol dirapikan biar gampang disentuh jari.
- Tambahan kecil yang kepakai tiap hari: tombol WA pengingat jatuh tempo, pembulatan harga 3 arah (bawah/setengah/atas) di form nota, dan cetak Daftar Harga A4 dengan pilihan versi customer (tanpa HPP) atau versi internal (dengan HPP + watermark rahasia).

---

## v1.40.0 – v1.50.0 — Aplikasi Jauh Lebih Cepat + Pembenahan Total PPN (17–18 Juni 2026)

- Hampir semua halaman utama (Nota, Faktur, Daftar Harga, Dashboard, Surat Pesanan, Inventory) sekarang **terasa instan saat dibuka ulang** — data disimpan sementara di memori (cache) jadi tidak perlu menunggu server lagi setiap pindah halaman.
- **Pagination** ditambahkan ke semua daftar (Nota, Customer, Surat Pesanan, Daftar Harga) — halaman tidak lagi berat meski datanya sudah ribuan baris.
- PPN sempat dinaikkan serentak ke 12% untuk semua stok — ternyata bikin harga pokok stok lama ikut naik salah, jadi langsung dikoreksi. Sekarang **tiap faktur/batch punya tarif PPN sendiri** (11% atau 12% sesuai kondisi beli yang sebenarnya), tidak dipukul rata lagi.
- **HPP nota "dibekukan"** sesuai kondisi saat barang benar-benar terjual — tidak lagi berubah sendiri kalau nota dibuka lagi untuk diedit, kecuali operator memang sengaja memilih untuk memperbarui manual.
- Menu **Master Distributor** baru untuk kelola data distributor & kontak sales secara terpusat.

---

## v1.32.0 – v1.39.0 — Dashboard Dirombak & Data Semakin Konsisten (15–16 Juni 2026)

- **Dashboard ditata ulang**: metrik utama (Total Penjualan, Laba Kotor, Surat Pesanan Aktif, Stok Low/Expired) digabung jadi satu ringkasan di bagian atas supaya langsung terbaca tanpa scroll.
- Kalender **"Aktivitas Nota Harian"** (heatmap) dirombak — klik satu tanggal langsung menampilkan semua nota hari itu di panel samping, dan dari situ bisa langsung buka nota untuk diedit.
- Header semua halaman dirapikan jadi satu gaya ringkas ("Dashboard › Nama Halaman · N tercatat") — hemat ruang, daftar data langsung kelihatan.
- Sistem sekarang otomatis mengenali nama produk yang ditulis beda-beda oleh distributor (misalnya "ENTRAMIX 555" vs nama resminya di master) sebagai produk yang sama, jadi riwayat & batch-nya tetap nyambung dan tidak "hilang".
- Daftar Harga untuk kolom harga yang belum diisi kini otomatis mengikuti harga di Inventory, jadi tidak ada lagi harga yang "nyangkut" di angka lama saat harga Inventory sudah berubah.

---

## v1.27.0 – v1.31.0 — "Mini AI" Pertama: Saran & Insight Otomatis, Halaman Finance (13–15 Juni 2026)

- Dashboard mendapat **"Ringkasan Minggu Ini"** — kalimat otomatis yang merangkum omzet & margin 7 hari terakhir dibanding minggu sebelumnya, plus produk mana yang lagi naik atau melambat penjualannya.
- **Saran Restock** otomatis di halaman Stok: sistem memprediksi kapan suatu produk akan habis berdasarkan kecepatan jualnya, lengkap dengan distributor termurah dan tombol bikin draft Surat Pesanan otomatis.
- **Skor Kesehatan Produk (A–E)**, **Radar Customer** yang mulai jarang order (dengan tombol WA follow-up siap kirim), dan saran "sering dibeli bersama" saat bikin nota.
- **Penjaga Harga Rugi**: peringatan otomatis muncul sebelum nota disimpan kalau ada barang yang harga jualnya di bawah harga modal — mencegah rugi karena salah ketik harga.
- **Halaman Finance** baru: hutang ke distributor & piutang dari customer dalam satu layar, plus export laporan bulanan (Ringkasan + Nota + Faktur) ke Excel sekali klik.
- Estimasi berat paket otomatis di nota penjualan — bisa jadi acuan hitung ongkir kurir.

---

## v1.21.0 – v1.26.2 — Fondasi Kode Produk, Pemisahan Faktur/Nota, dan Mesin Saran Harga (7–13 Juni 2026)

- Setiap produk sekarang **wajib punya Kode unik** — fondasi supaya sistem tidak pernah salah mengenali dua produk yang mirip namanya, lengkap dengan pengenalan otomatis nama alias yang dipakai distributor.
- Pembelian sekarang dibedakan tegas: **Faktur** (kena PPN masukan 11%) vs **Nota** (tanpa PPN) — supaya harga pokok barang tidak salah hitung tergantung sumber pembeliannya.
- Menu **Daftar Harga** baru: satu tempat untuk atur & lihat riwayat harga jual tiap produk per saluran (Offline/Shopee/Tokopedia), lengkap mesin **"Saran Harga"** yang menghitung harga ideal per marketplace berdasarkan fee & target untung.
- Metode bayar **Kartu Kredit/EDC** bisa dipilih di nota, dengan pilihan biaya admin ditanggung toko atau dibebankan ke customer.
- **Audit besar-besaran** (3 tim audit paralel — kode, logika/keamanan, tampilan) menemukan dan menambal belasan celah, di antaranya: faktur yang bisa dobel-catat stok kalau tombol simpan diklik dua kali, dan harga pokok yang salah hitung saat Surat Pesanan diterima sebagian.
- Cetak A4 Daftar Harga kini punya pilihan versi customer (tanpa HPP) atau versi internal (dengan HPP + watermark rahasia).

---

## v1.13.0 – v1.20.9 — Wajah Baru Total: Desain Ulang Seluruh Aplikasi (1–7 Juni 2026)

- Seluruh tampilan aplikasi **didesain ulang total** mengikuti gaya modern ala Stripe — lebih bersih, konsisten, dan mudah dibaca di semua halaman.
- Sempat dicoba tampilan kaca transparan ("Liquid Glass") dan latar animasi kabut bergerak — setelah dievaluasi, dikembalikan ke tampilan solid karena jauh lebih mudah dibaca, terutama saat berpindah antara mode terang dan gelap.
- **Keamanan login diperketat**: password akun dienkripsi (bukan lagi teks polos), percobaan login berulang kali dibatasi otomatis, dan sesi login punya batas waktu yang jelas.
- Fondasi kecepatan aplikasi mulai dipasang (teknologi cache data), dan mulai dibangun **rangkaian pengujian otomatis di belakang layar** — ratusan pengujian ditambahkan untuk menjaga logika stok, batch, dan harga tidak rusak diam-diam setiap ada perubahan kode baru.

---

## v1.10.0 – v1.12.9 — Stok Makin Canggih: Scan Barcode & Laporan Makin Akurat (29–31 Mei 2026)

- **Stok Masuk, Stok Keluar, dan Opname** sekarang bisa pakai kamera HP/laptop untuk scan barcode/QR produk — tidak perlu cari & pilih produk manual satu-satu.
- **Cetak stiker barcode** langsung dari aplikasi — pilih produk mana saja dan berapa banyak stikernya, siap cetak & tempel di rak/kemasan.
- Ditemukan dan diperbaiki bug penting: kartu **"Laba Kotor bulan ini"** di Dashboard sebelumnya tidak menghitung PPN masukan sebagai biaya, sehingga angka laba yang tampil lebih besar dari kenyataan (selisihnya bisa jutaan rupiah sebulan).
- Dashboard mendapat widget baru: **Top 5 Customer bulan ini** dan grafik pergerakan stok 30 hari.
- Input harga produk sekarang **dua arah** — isi harga beli (HNA) atau harga yang sudah termasuk pajak (HPP), yang satunya otomatis ikut terisi.
- Bisa pilih & edit banyak produk sekaligus (kode & kategori) dari satu layar — hemat waktu dibanding buka satu-satu.

---

## v1.4.0 – v1.9.0 — Satuan Karton/Pcs, Harga Grosir Bertingkat, Inventory Dirombak (24–28 Mei 2026)

- Sistem sekarang paham **konversi satuan otomatis** (1 karton = sekian pcs), dipakai konsisten dari Faktur, Nota, sampai Surat Pesanan — tidak perlu hitung konversi manual lagi.
- **Harga grosir bertingkat**: bisa atur harga jual berbeda untuk jumlah pembelian tertentu (misalnya harga 1 lusin berbeda dengan harga 1 pcs satuan).
- Halaman **Inventory dirombak total**: klik nama produk untuk buka panel detail (profil, semua batch, riwayat mutasi) tanpa pindah halaman, dan stok opname sekarang bisa per-batch (bukan cuma per-produk).
- **Preview dokumen langsung terlihat** saat mengisi form Nota dan Surat Pesanan — bisa cek tampilan sebelum disimpan atau dicetak.
- Beberapa bug PDF diperbaiki: nota tidak lagi terpotong jadi 2 halaman untuk transaksi pendek, dan data alamat/telepon customer tampil dengan benar di cetakan.

---

## v1.0.0 – v1.3.47 — Fondasi HABIL SUPERAPP: Peluncuran & Pengokohan (12 Maret – 24 Mei 2026)

- Peluncuran modul-modul inti: **Inventory** dengan sistem FEFO (barang yang lebih dulu kedaluwarsa keluar lebih dulu), **Surat Pesanan**, **Faktur Pembelian**, **Nota Penjualan**, **Buku Besar**, dan import CSV **Toko Online** (Shopee/TikTok).
- Database dipindahkan dari Supabase ke **Neon.tech** untuk performa yang lebih baik dan stabil — sempat memicu beberapa error data pasca-migrasi, semuanya sudah ditambal.
- Keamanan dasar dipasang: password akun dienkripsi, percobaan login dibatasi, dan notifikasi error diganti dari popup bawaan browser menjadi notifikasi dalam aplikasi yang lebih rapi.
- Fondasi "satu sumber kebenaran" untuk harga pokok (HNA/HPP) mulai dibangun secara konsisten, menggantikan input manual yang rawan typo/salah hitung.
- Modul **Manajemen Tugas** (Kanban) untuk koordinasi tim, dan tampilan mobile pertama kali dirapikan (sidebar geser, tabel bisa di-scroll).
- **Ini adalah titik terakhir yang tercatat resmi di GitHub Releases** (`v1.0.1`, 12 Maret 2026) — seluruh rilis di atas sejak saat itu belum pernah dipublikasikan sebagai GitHub Release.
