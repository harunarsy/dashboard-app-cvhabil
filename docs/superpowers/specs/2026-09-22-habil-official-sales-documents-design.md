# Habil Official Sales Documents — Rancangan A4, A5, A6, dan Preview

**Tanggal:** 22 September 2026

**Status:** disetujui; Plan 1 dan Fase 2 (perbaikan bug, preview PDF aktual, panel validasi) diimplementasikan pada branch `feat/official-sales-documents` (rilis lokal v1.67.19-stable, belum di-push). Flag `documents_renderer_v2` masih `false`; migrasi 022 belum dijalankan. Cutover A5/A6 dan migrasi `terima`/`pinjaman` menyusul.

**Baseline aplikasi:** v1.67.17-stable

**Permukaan utama:** Nota Penjualan, PDF penjualan, dan preview cetak

---

## 1. Tujuan

Membentuk satu keluarga dokumen penjualan Habil yang dapat melayani transaksi toko,
perusahaan, rumah sakit, instansi pemerintah, dan transaksi yang kelak berasal dari
e-Katalog tanpa menggandakan transaksi atau mengubah penomoran nota yang sudah berjalan.

Satu transaksi penjualan tetap menjadi sumber kebenaran untuk stok, pembayaran, piutang,
laba, dan histori. Transaksi yang sama dapat dicetak dalam ukuran dan tingkat formalitas
yang berbeda:

```text
Transaksi Penjualan — HSB-NOTA-{YYMM}{NNN}
    ├── A4: Faktur Penjualan / Sales Invoice resmi
    ├── A5: Nota Penjualan bisnis
    └── A6: Nota Penjualan operasional ringkas
```

Mengganti ukuran kertas tidak boleh membuat transaksi baru, mengganti nomor, menghitung
ulang stok, atau mengubah nilai transaksi.

---

## 2. Audiens dan konteks penggunaan

### Operator Habil

Operator membuat transaksi sekali, memeriksa preview, memilih ukuran dokumen, lalu
mengunduh atau mencetak hasilnya. Operator tidak perlu memahami perbedaan implementasi
renderer atau memindahkan data secara manual antar-template.

### Customer umum

Menerima A5 atau A6 yang cepat dibaca, memuat barang, jumlah, harga, pembayaran, dan tanda
terima tanpa informasi pengadaan yang tidak relevan.

### Perusahaan dan instansi

Menerima A4 formal untuk penagihan dan arsip, lengkap dengan identitas para pihak,
referensi pesanan, rincian nilai, rekening, serta area otorisasi.

### Pengadaan pemerintah dan e-Katalog

Menggunakan A4 sebagai dokumen komersial yang mampu menampilkan referensi pengadaan.
Rancangan ini menyiapkan ruang dan kontrak data, tetapi tidak mencakup integrasi otomatis
ke sistem LKPP atau penerbitan Faktur Pajak resmi.

---

## 3. Keputusan yang dikunci

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Sumber transaksi | Satu `sales_order` | Mencegah stok, piutang, dan pembayaran ganda |
| Nomor dokumen | Tetap `HSB-NOTA-{YYMM}{NNN}` | Menjaga histori, pencarian, dan urutan yang sudah berlaku |
| Sistem template | Adaptif dari satu view-model | Mencegah total, PPN, atau isi berbeda antarukuran |
| A4 | Portrait, formal | Cocok untuk penagihan, perusahaan, instansi, dan SPJ |
| A5 | Landscape, bisnis ringkas | Menjaga keluasan tabel tanpa kepadatan A4 |
| A6 | Landscape, operasional | Mempertahankan nota paket/toko yang cepat dibaca |
| Gaya visual | Monokrom, print-first | Formal, hemat tinta, dan aman dicetak hitam-putih |
| Preview | PDF aktual | Preview dan file unduhan harus identik |
| Pajak | Nilai snapshot transaksi | Dokumen historis tidak berubah ketika aturan berubah |

### Yang sengaja tidak dilakukan

- Tidak membuat counter baru untuk A4, A5, atau A6.
- Tidak menyalin transaksi hanya untuk menghasilkan dokumen formal.
- Tidak mengecilkan layout A4 secara mekanis menjadi A5/A6.
- Tidak menamai PDF komersial Habil sebagai Faktur Pajak.
- Tidak menerbitkan Faktur Pajak dari aplikasi tanpa kanal resmi.
- Tidak mengubah Nota Penjualan historis atau menghitung ulang nilainya.
- Tidak mengintegrasikan Coretax, PJAP, atau e-Katalog pada tahap ini.

---

## 4. Bahasa visual

Dokumen menggunakan dunia visual **Habil Official Monochrome**:

- Latar putih, teks hitam, dan abu-abu untuk metadata sekunder.
- Logo Habil menjadi identitas; warna logo tidak boleh menjadi satu-satunya pembeda.
- Garis struktur tipis menggantikan bidang warna besar.
- Hirarki dibentuk melalui bobot, ukuran, alignment, dan ruang kosong.
- Nomor dokumen, tanggal, dan nominal menggunakan angka tabular.
- Judul dan identitas perusahaan dominan, tetapi tidak bersaing dengan total tagihan.
- Tabel memakai header monokrom yang tetap terbaca pada printer kantor biasa.
- Tidak memakai emoji, gradient, glass effect, atau dekorasi yang menambah konsumsi tinta.
- Field kosong disembunyikan, bukan dicetak sebagai `null`, `undefined`, atau tanda hubung
  yang memenuhi halaman.

Dokumen boleh memakai font PDF bawaan yang stabil selama hirarki dan metriknya diuji.
Penyematan font baru hanya dilakukan jika lolos uji ukuran file, wrapping, dan paritas
lintas browser.

---

## 5. Kontrak informasi bersama

Ketiga ukuran mengonsumsi satu `SalesDocumentViewModel` konseptual:

```text
identity
  companyName, npwp, address, phone, email, logo

document
  orderNumber, saleDate, dueDate, paymentStatus, documentKind

buyer
  displayName, legalName, entityType, npwpOrNik, phone, email
  billingAddress, shippingAddress, picName, picPosition, workUnit

procurement
  source, platformOrderNumber, purchaseOrderNumber, packageNumber
  contractNumber, procurementMethod, governmentAgency

items[]
  name, code, qty, unit, unitPrice, discount, lineTotal
  batchNumber, expiredDate

totals
  productGross, discountTotal, dpp, vatRate, vatAmount
  shippingCharge, paymentFee, grandTotal, amountInWords

payment
  method, bankName, accountNumber, accountName, terms

taxReference
  status, number, date

signatures
  recipientName, examinerName, issuerName
```

Tidak semua field wajib tersedia pada tahap pertama. Renderer memilih field sesuai ukuran
dan menyembunyikan kelompok yang tidak tersedia. Data referensi pengadaan tidak boleh
dititipkan permanen ke `notes` karena kelak perlu dicari, divalidasi, dan diekspor sebagai
data terstruktur.

---

## 6. A4 — Faktur Penjualan resmi

### Peran

Dokumen formal untuk perusahaan, rumah sakit, instansi pemerintah, SPJ, dan transaksi
e-Katalog. Judul utama:

```text
FAKTUR PENJUALAN
SALES INVOICE
```

### Susunan

1. **Header perusahaan**
   - Logo dan nama CV di kiri.
   - Alamat, telepon, email, dan NPWP dalam hierarki ringkas.
   - Judul dokumen di kanan.

2. **Metadata dokumen**
   - Nomor invoice/nota memakai `order_number` yang sudah ada.
   - Tanggal transaksi, jatuh tempo, dan status pembayaran.
   - Barcode menjadi data pendukung, bukan fokus utama.

3. **Para pihak**
   - `Ditagihkan kepada` dan `Dikirim kepada` tampil sebagai dua kolom.
   - Jika kedua alamat identik, alamat pengiriman dapat diringkas tanpa duplikasi panjang.

4. **Referensi pengadaan**
   - Hanya tampil jika salah satu field referensi tersedia.
   - Menampung nomor pesanan, PO/SP, paket, kontrak/SPK, metode pengadaan, dan satuan kerja.

5. **Tabel barang**
   - Kolom inti: nomor, nama barang, qty, satuan, harga satuan, diskon, jumlah.
   - Kode, batch, dan ED menjadi metadata di bawah nama barang agar tabel tidak terlalu lebar.
   - Item tidak boleh terpotong di antara dua halaman.

6. **Ringkasan nilai**
   - DPP, diskon, PPN dengan tarif snapshot, ongkir, biaya lain yang dibebankan, dan total.
   - Baris yang bernilai nol dan tidak relevan disembunyikan.
   - Grand total menjadi titik fokus numerik utama.

7. **Terbilang dan pembayaran**
   - Terbilang berada langsung setelah total.
   - Rekening dan termin pembayaran berada dalam blok tersendiri.

8. **Catatan dan otorisasi**
   - Catatan transaksi, pengiriman, atau ketentuan pembayaran.
   - Tiga area tanda tangan: penerima, pemeriksa, dan Habil.
   - Referensi Faktur Pajak hanya tampil jika sudah benar-benar dicatat.

### Pagination

- Target nyaman: 1–12 item per halaman pertama.
- Header identitas ringkas dan nomor dokumen diulang pada halaman lanjutan.
- Ringkasan nilai, terbilang, pembayaran, dan tanda tangan hanya muncul di halaman terakhir.
- Footer memuat nomor halaman `Halaman x dari y`.

---

## 7. A5 — Nota Penjualan bisnis

### Peran

Dokumen bisnis profesional untuk transaksi umum dan perusahaan yang tidak membutuhkan
seluruh metadata A4. Orientasi tetap landscape untuk menjaga ruang tabel.

### Susunan

- Identitas Habil dan judul berada pada satu header horizontal.
- Customer dan referensi utama memakai dua kolom ringkas.
- Maksimal dua referensi pengadaan ditampilkan; sisanya tersedia pada A4.
- Tabel memuat barang, qty, satuan, harga, dan jumlah.
- Batch dan ED tampil sebagai baris metadata kecil jika tersedia.
- DPP, PPN, ongkir, dan grand total berada di sisi kanan.
- Terbilang dan rekening berada di sisi kiri.
- Dua area tanda tangan: penerima dan Habil.

### Pagination

- Target nyaman: 1–7 item.
- 8–14 item boleh memakai kepadatan lebih tinggi dalam batas keterbacaan.
- Di atas kisaran tersebut, dokumen berlanjut atau preview menyarankan A4.
- Saran ukuran tidak memblokir operator untuk mencetak.

---

## 8. A6 — Nota Penjualan operasional

### Peran

Dokumen ringkas untuk transaksi toko, lampiran paket, dan serah terima sederhana. A6 bukan
format utama untuk transaksi pemerintah atau e-Katalog yang memiliki metadata panjang.

### Susunan

- Header satu baris: identitas Habil, judul, nomor, dan tanggal.
- Barcode ditempatkan dekat nomor dokumen dengan ukuran minimum yang tetap dapat dipindai.
- Customer diringkas menjadi nama, instansi bila ada, dan telepon.
- Tabel memuat barang, qty, harga, dan jumlah.
- Satuan digabung ke qty; metadata batch/ED ditampilkan hanya bila muat.
- PPN diringkas menjadi satu baris dan total tetap paling dominan.
- Terbilang, rekening ringkas, penerima, dan Habil tetap tersedia.
- Referensi eksternal dibatasi satu nilai pendek berlabel `Ref:`.

### Pagination dan peringatan

- Target nyaman: 1–5 item.
- Konten panjang tidak boleh dikecilkan di bawah ambang keterbacaan.
- Bila estimasi tidak muat, preview memperingatkan dan menyarankan A5/A4.
- Jika operator tetap memilih A6, halaman lanjutan harus tetap memiliki nomor dokumen dan
  konteks customer; tidak boleh menghasilkan halaman kosong khusus tanda tangan.

---

## 9. Matriks informasi

| Informasi | A4 | A5 | A6 |
|---|:---:|:---:|:---:|
| Nomor nota sekarang | Ya | Ya | Ya |
| Barcode | Ya | Ya | Ya |
| Identitas CV lengkap | Ya | Ringkas | Sangat ringkas |
| NPWP Habil | Ya | Ya | Ya |
| Data legal pembeli | Lengkap | Opsional | Tidak |
| Tagihan dan pengiriman terpisah | Ya | Tidak | Tidak |
| Referensi pengadaan | Lengkap | Maksimal dua | Maksimal satu |
| Batch dan ED | Opsional | Opsional | Bila muat |
| DPP dan PPN | Lengkap | Lengkap | Ringkas |
| Terbilang | Ya | Ya | Ya |
| Rekening | Lengkap | Ringkas | Ringkas |
| Catatan panjang | Ya | Ringkas | Maksimal dua baris |
| Tanda tangan | Tiga pihak | Dua pihak | Dua pihak |
| Referensi Faktur Pajak | Ya | Opsional | Tidak |

---

## 10. Preview dokumen

### Masalah yang diselesaikan

Preview HTML dan generator PDF saat ini merupakan dua jalur rendering. Bentuk, wrapping,
pagination, atau kalkulasi bisa terlihat benar di preview tetapi berbeda setelah file
diunduh.

### Arah baru

Preview menampilkan **PDF aktual** yang akan disimpan atau dicetak:

- Perubahan ukuran A4/A5/A6 membuat blob PDF baru dari snapshot transaksi yang sama.
- Regenerasi diberi debounce agar pengetikan tidak membuat browser tersendat.
- Canvas preview mempertahankan rasio fisik halaman.
- Toolbar menyediakan ukuran kertas, zoom, fit halaman, dan navigasi halaman.
- Jumlah halaman selalu terlihat.
- Tombol unduh dan cetak memakai blob yang sedang ditampilkan, bukan menghasilkan versi
  lain setelah operator menekan tombol.

### Validasi sebelum cetak

Preview menyediakan panel pemeriksaan:

- Nomor nota tidak tersedia.
- Customer atau alamat wajib belum lengkap untuk A4.
- Jatuh tempo belum diisi untuk transaksi tempo.
- Referensi pengadaan terlalu panjang.
- Jumlah item tidak ideal untuk ukuran yang dipilih.
- Data PPN atau total tidak konsisten.

Peringatan ukuran bersifat informatif. Ketidakkonsistenan nominal atau data wajib A4 dapat
memblokir cetak sampai diperbaiki.

### Responsivitas

- Desktop: modal besar dengan toolbar satu baris dan halaman di tengah canvas.
- Tablet: toolbar membungkus menjadi dua baris tanpa mengecilkan touch target.
- Ponsel: preview layar penuh, halaman dapat di-zoom/pan, dan aksi utama berada pada bar
  bawah yang aman dari area sistem.
- Semua kontrol keyboard-accessible, memiliki focus state, dan touch target minimum 44px.

---

## 11. Alur operator

```text
Buka Nota Penjualan
    ↓
Pilih transaksi / selesai menyimpan transaksi
    ↓
Pilih Cetak Dokumen
    ↓
Default ukuran mengikuti konteks
    ├── customer/instansi formal → A4
    ├── bisnis umum             → A5
    └── toko/lampiran paket     → A6
    ↓
Sistem menghasilkan PDF aktual
    ↓
Operator memeriksa warning dan halaman
    ↓
Unduh atau cetak blob yang sama
    ↓
Status PDF transaksi diperbarui tanpa mengubah nilai transaksi
```

Pemilihan default hanya membantu. Operator tetap dapat mengganti ukuran sebelum mencetak.

---

## 12. Penanganan state dan error

- **Loading:** skeleton halaman dengan teks `Menyiapkan preview PDF`.
- **Error renderer:** pesan tetap berada di modal dan menyebut data atau tahap yang gagal.
- **Data belum lengkap:** field yang perlu diperbaiki diberi tautan kembali ke editor.
- **PDF multi-halaman:** navigasi dan jumlah halaman selalu tersedia.
- **Browser tidak mendukung preview:** tetap sediakan unduh PDF, disertai penjelasan.
- **Regenerasi gagal:** preview terakhir yang valid tetap terlihat tetapi diberi status
  `Pratinjau belum diperbarui`; tombol cetak terbaru dinonaktifkan.
- **Double click:** satu proses render/unduh aktif pada satu waktu.

Tidak boleh ada kondisi di mana toast sukses tampil sebelum blob berhasil dibuat dan status
PDF berhasil diperbarui.

---

## 13. Konsistensi data dan keamanan

- Renderer hanya membaca snapshot transaksi.
- Tidak ada mutasi stok, pembayaran, item, atau customer dari layar preview.
- Format kertas adalah preferensi cetak, bukan atribut finansial transaksi.
- Nominal dihitung oleh satu fungsi kanonis sebelum masuk renderer.
- Data historis menggunakan snapshot pajak dan nilai pada saat transaksi.
- Dokumen resmi Habil tidak mengklaim sebagai Faktur Pajak.
- Nomor referensi pajak tidak ditampilkan bila belum tercatat dan tervalidasi.
- Data NPWP/NIK pembeli hanya dapat diakses sesuai role yang diizinkan dan tidak ditulis
  ke log browser.

---

## 14. Strategi pembuktian

### Fixture dokumen

Setiap ukuran diuji dengan:

1. Satu item sederhana.
2. Lima item normal.
3. Banyak item hingga multi-halaman.
4. Nama produk dan alamat sangat panjang.
5. Batch dan ED tersedia/tidak tersedia.
6. PPN aktif, tanpa PPN, dan tarif snapshot non-default.
7. Ongkir dan biaya pembayaran.
8. Customer umum, perusahaan, dan instansi.
9. Referensi pengadaan lengkap.
10. Nilai Rupiah besar dan pecahan pembulatan.

### Golden rendering

- Simpan render kanonis A4, A5, dan A6 untuk fixture yang disetujui.
- Bandingkan layout, jumlah halaman, total, dan teks penting pada setiap perubahan renderer.
- Hasil PDF lama dipakai sebagai pembanding data, bukan sebagai batas estetika.
- Perubahan visual yang disengaja harus diperbarui melalui review eksplisit, bukan snapshot
  otomatis tanpa pemeriksaan.

### Kriteria penerimaan desain

1. Nomor nota sama pada A4, A5, dan A6.
2. Total, DPP, PPN, ongkir, dan terbilang identik antarukuran.
3. Preview identik dengan file yang diunduh.
4. A4 memuat identitas dan referensi formal secara utuh.
5. A5 tetap mudah dibaca tanpa menyalin semua metadata A4.
6. A6 tidak mengecilkan teks secara ekstrem untuk memaksakan konten.
7. Semua ukuran menangani multi-halaman tanpa halaman kosong atau tanda tangan terpisah
   tanpa konteks.
8. Field kosong tidak menghasilkan label yatim atau teks teknis.
9. Dokumen tetap terbaca pada cetak hitam-putih.
10. Preview berfungsi pada desktop, tablet, dan ponsel.
11. Nota lama tetap dapat dicetak ulang.
12. Memilih ukuran tidak menulis perubahan finansial atau inventory.

---

## 15. Batas implementasi tahap pertama

Tahap pertama mencakup:

- Model dokumen kanonis untuk output cetak.
- Renderer A4, A5, dan A6.
- Preview PDF aktual.
- Validasi isi sebelum cetak.
- Golden fixtures dan regression test dokumen.
- Penggunaan nomor nota yang sudah ada.

Tahap pertama belum mencakup:

- Pengiriman pesanan ke e-Katalog.
- Integrasi API LKPP.
- Penerbitan Faktur Pajak Coretax/PJAP.
- Tanda tangan elektronik tersertifikasi.
- Penyimpanan file PDF sebagai sumber kebenaran permanen.
- Perubahan perhitungan atau lifecycle Nota Penjualan.

Database hanya boleh diperluas bila implementasi membutuhkan penyimpanan metadata formal
yang tidak tersedia saat ini. Perubahan wajib additive dan tidak melakukan backfill yang
mengubah transaksi historis.

---

## 16. Konsekuensi implementasi

- Perhitungan dokumen perlu diekstrak dari komponen preview dan renderer menjadi satu
  kontrak kanonis.
- `NotaPreview` tidak lagi menjadi tiruan layout PDF; ia menjadi host untuk PDF aktual dan
  panel validasi.
- Renderer perlu memisahkan blok konten dari aturan pagination agar ketiga ukuran memakai
  data yang sama tanpa memaksa komposisi yang sama.
- Status `sudah_dicetak` hanya diperbarui setelah aksi cetak/unduh berhasil, bukan ketika
  preview dibuka.
- Rilis perlu mempertahankan jalur lama di balik feature flag sampai golden parity dan
  pemeriksaan operator selesai.

---

## 17. Keputusan lanjutan sebelum implementation plan

Keputusan berikut tidak menghalangi persetujuan desain, tetapi harus dikunci dalam
implementation plan:

1. Apakah logo PDF memakai versi berwarna atau versi monokrom resmi.
2. Apakah A4 menjadi default berdasarkan tipe customer atau dipilih manual pada setiap
   transaksi.
3. Batas pasti item sebelum preview menyarankan ukuran kertas lebih besar.
4. Metadata formal minimum yang perlu disimpan pada tahap pertama versus ditampilkan setelah
   fase e-Katalog.
5. Masa hidup feature flag renderer lama selama rollout.
