// Golden render expectations — diisi SETELAH render aktual diperiksa manual
// (spec §14: bukan snapshot otomatis tanpa pemeriksaan).
//
// Catatan review (dump A4 22 Sep 2026):
// - single-item: blok formal "Ditagihkan kepada" tidak dirender (tanpa data
//   legal & alamat tagihan == alamat kirim); dipakai blok ringkas "Kepada Yth:".
// - many-items-multipage: 2 halaman — 10 baris di halaman 1, 10 baris + tail di
//   halaman 2 (aturan seimbang planTableSplit), header lanjutan di halaman 2.
// - ppn-excluded: baris DPP/PPN disembunyikan, GRAND TOTAL tetap Rp 500.000.
// - instansi-formal: dua kolom pihak + 7 referensi pengadaan + referensi faktur
//   pajak dalam satu halaman.
// - no-batch-meta: tanpa baris metadata Batch/ED (semua snapshot kosong).
//
// Catatan review A5 (dump + PNG 23 Sep 2026, profil compact landscape):
// - Header: identitas + judul satu baris horizontal; barcode berdampingan
//   dengan baris nomor/tanggal/status (bukan menumpuk di bawahnya).
// - Customer dan referensi pengadaan tampil berdampingan dua kolom; referensi
//   dibatasi 2 entri (instansi-formal: Sumber + No. Pesanan Platform; No. PO/SP
//   dan Referensi Faktur Pajak tidak dirender di A5).
// - Tabel: baris metadata Batch/ED dicetak font 5 pt di bawah nama barang.
// - Tail: DPP/PPN/ongkir/grand total rata kanan; terbilang + rekening/termin
//   rata kiri pada band yang sama.
// - Tanda tangan dua area: "Penerima," dan "Hormat kami," (tanpa "Pemeriksa,").
// - Kepadatan: 1-5 item muat satu halaman; 20 item (many-items) 2 halaman —
//   11 baris di halaman 1, 9 baris + tail di halaman 2.
//
// Catatan review A6 (dump + baca posisi teks 23 Sep 2026, profil operasional landscape):
// - Header satu band (2 baris): identitas + judul di baris atas; NPWP/telepon
//   (5 pt) di kiri, barcode 34×5 mm + "No:" + tanggal di kanan. Tanpa
//   subtitel "SALES INVOICE", tanpa Jatuh Tempo/Status (spec §8: identitas,
//   judul, nomor, tanggal saja) — di luar cakupan nota operasional.
// - Barcode 34×5 mm: CODE128 "HSB-NOTA-2609001" = 189 modul → X-dimension
//   0,18 mm (7,1 mil), di atas legacy A6 26 mm (5,4 mil) dan tetap terbaca
//   scanner meja pada jarak dekat.
// - Customer ringkas: "Kepada Yth:" + nama, lalu instansi (governmentAgency),
//   telepon, dan satu nilai `Ref:` (prioritas No. Pesanan Platform → No. PO/SP
//   → No. Kontrak/SPK → No. Paket → Sumber). Tidak ada blok dua kolom.
// - Tabel 5 kolom: No | Nama Barang | Qty (satuan digabung, mis. "12 pcs") |
//   Harga Satuan | Jumlah — tanpa kolom Satuan dan Diskon.
// - batchMetaMode 'fit' (aturan deterministik): baris Batch/ED dipakai HANYA
//   bila seluruh tabel + meta masih muat di atas area tail satu halaman
//   (bound tailTableEndY). Hasil review: meta tampil di single-item,
//   ppn-excluded, ppn-rate-snapshot-12, ongkir-and-fee, large-rounded-amounts;
//   meta dilepas di five-items, long-names, instansi-formal, dan many-items —
//   tanpa pelepasan itu tabel pecah ke halaman 2 (five-items: endY 59,5 mm >
//   batas 53,3 mm) padahal satu halaman masih muat tanpa meta.
// - Tail satu band: terbilang + metode/rekening/termin di kiri; DPP+PPN
//   diringkas SATU baris ("DPP: … · PPN 11%: …") dan GRAND TOTAL 9 pt bold di
//   kanan. Ketentuan tetap dirender (paritas legacy A6); catatan dibatasi 2
//   baris (matriks §9).
// - Dua tanda tangan: "Penerima," + "Hormat kami,".
// - many-items 2 halaman: halaman 2 membawa "FAKTUR PENJUALAN - Lanjutan",
//   nomor nota, "Kepada: <customer>", 10 baris + tail — tidak ada halaman
//   khusus tanda tangan. 9/10 fixture lain 1 halaman (legacy A6: 2-3 halaman
//   untuk five-items/long-names/instansi-formal/many-items).
export const SALES_DOCUMENT_GOLDEN = {
  'single-item': {
    A4: {
      pages: 1,
      mustContain: [
        'FAKTUR PENJUALAN',
        'SALES INVOICE',
        'HSB-NOTA-2609001',
        'Toko Sehat',
        'Produk Nutrisi Vanila 174 g',
        'Batch: 26T0506GU · ED: 02 Des 2027',
        'GRAND TOTAL: Rp 72.000',
        'Terbilang: Tujuh Puluh Dua Ribu Rupiah',
        'Halaman 1 dari 1',
      ],
    },
    A5: {
      pages: 1,
      mustContain: [
        'FAKTUR PENJUALAN',
        'SALES INVOICE',
        'HSB-NOTA-2609001',
        'Kepada Yth:',
        'Toko Sehat',
        'Produk Nutrisi Vanila 174 g',
        'Batch: 26T0506GU · ED: 02 Des 2027',
        'GRAND TOTAL: Rp 72.000',
        'Terbilang: Tujuh Puluh Dua Ribu Rupiah',
        'Rekening: BCA 5603004174 a/n CV HABIL SEJAHTERA BERSAMA',
        'Penerima,',
        'Hormat kami,',
        'Halaman 1 dari 1',
      ],
      mustNotContain: ['Pemeriksa,', 'Ditagihkan kepada', 'Referensi Faktur Pajak'],
    },
    A6: {
      pages: 1,
      mustContain: [
        'FAKTUR PENJUALAN',
        'HSB-NOTA-2609001',
        'NPWP: 93.813.949.0-609.000',
        'Kepada Yth:',
        'Toko Sehat',
        '0812-0000-0001',
        '1 pcs',
        'Batch: 26T0506GU · ED: 02 Des 2027',
        'DPP: Rp 64.865 · PPN 11%: Rp 7.135',
        'GRAND TOTAL: Rp 72.000',
        'Terbilang: Tujuh Puluh Dua Ribu Rupiah',
        'Rekening: BCA 5603004174 a/n CV HABIL SEJAHTERA BERSAMA',
        'Ketentuan',
        'Penerima,',
        'Hormat kami,',
        'Halaman 1 dari 1',
      ],
      mustNotContain: [
        'SALES INVOICE',
        'Pemeriksa,',
        'Ditagihkan kepada',
        'Referensi Pengadaan',
        'Referensi Faktur Pajak',
        'Jatuh Tempo:',
        'Status:',
      ],
    },
  },
  'five-items': {
    A4: {
      pages: 1,
      mustContain: [
        'HSB-NOTA-2609002',
        'Apotek Keluarga Sehat',
        'Masker KF94 4 Ply',
        'GRAND TOTAL: Rp 1.926.000',
        'Terbilang: Satu Juta Sembilan Ratus Dua Puluh Enam Ribu Rupiah',
        'Halaman 1 dari 1',
      ],
    },
    A5: {
      pages: 1,
      mustContain: [
        'HSB-NOTA-2609002',
        'Apotek Keluarga Sehat',
        'Masker KF94 4 Ply',
        'Batch: 26T0610MK · ED: 01 Mar 2029',
        'GRAND TOTAL: Rp 1.926.000',
        'Terbilang: Satu Juta Sembilan Ratus Dua Puluh Enam Ribu Rupiah',
        'Halaman 1 dari 1',
      ],
    },
    A6: {
      pages: 1,
      mustContain: [
        'HSB-NOTA-2609002',
        'Apotek Keluarga Sehat',
        '12 pcs',
        '3 botol',
        '4 pack',
        'DPP: Rp 1.735.135 · PPN 11%: Rp 190.865',
        'GRAND TOTAL: Rp 1.926.000',
        'Terbilang: Satu Juta Sembilan Ratus Dua Puluh Enam Ribu Rupiah',
        'Halaman 1 dari 1',
      ],
      // Aturan 'fit': tabel + meta tidak muat di atas tail satu halaman
      // (endY 59,5 mm > batas 53,3 mm), jadi meta Batch/ED dilepas.
      mustNotContain: ['Batch:', 'Pemeriksa,'],
    },
  },
  'many-items-multipage': {
    A4: {
      pages: 2,
      mustContain: [
        'HSB-NOTA-2609003',
        'Gudang Farmasi Sehat Sentosa',
        'Vitamin C 500 mg',
        'Sarung Tangan Latex M',
        'FAKTUR PENJUALAN - Lanjutan',
        'Halaman 1 dari 2',
        'Halaman 2 dari 2',
        'GRAND TOTAL: Rp 3.261.000',
      ],
    },
    A5: {
      pages: 2,
      mustContain: [
        'HSB-NOTA-2609003',
        'Gudang Farmasi Sehat Sentosa',
        'Vitamin C 500 mg',
        'Sarung Tangan Latex M',
        'FAKTUR PENJUALAN - Lanjutan',
        'Halaman 1 dari 2',
        'Halaman 2 dari 2',
        'GRAND TOTAL: Rp 3.261.000',
        'Penerima,',
        'Hormat kami,',
      ],
    },
    A6: {
      pages: 2,
      mustContain: [
        'HSB-NOTA-2609003',
        'Gudang Farmasi Sehat Sentosa',
        'Vitamin C 500 mg',
        'Sarung Tangan Latex M',
        'FAKTUR PENJUALAN - Lanjutan',
        'Kepada: Gudang Farmasi Sehat Sentosa',
        'Halaman 1 dari 2',
        'Halaman 2 dari 2',
        'GRAND TOTAL: Rp 3.261.000',
        'Penerima,',
        'Hormat kami,',
      ],
      // 20 baris: meta tidak muat (aturan 'fit'), 10 baris + tail di halaman 2.
      mustNotContain: ['Batch:'],
    },
  },
  'long-names': {
    A4: {
      pages: 1,
      mustContain: [
        'HSB-NOTA-2609004',
        'PT Sentra Niaga Kesehatan Nusantara Cabang Surabaya',
        'Kelurahan Pradah Kalikendal',
        'Premium Kemasan Botol 500 ml Rasa Original',
        'Ongkir: Rp 20.000',
        'GRAND TOTAL: Rp 1.080.000',
        'Terbilang: Satu Juta Delapan Puluh Ribu Rupiah',
      ],
    },
    A5: {
      pages: 1,
      mustContain: [
        'HSB-NOTA-2609004',
        'PT Sentra Niaga Kesehatan Nusantara Cabang Surabaya',
        'Kelurahan Pradah Kalikendal',
        'Rasa Original',
        'Ongkir: Rp 20.000',
        'GRAND TOTAL: Rp 1.080.000',
        'Terbilang: Satu Juta Delapan Puluh Ribu Rupiah',
      ],
    },
    A6: {
      pages: 1,
      mustContain: [
        'HSB-NOTA-2609004',
        'PT Sentra Niaga Kesehatan Nusantara Cabang Surabaya',
        'Rasa Original',
        'Ongkir: Rp 20.000',
        'GRAND TOTAL: Rp 1.080.000',
        'Terbilang: Satu Juta Delapan Puluh Ribu Rupiah',
      ],
      mustNotContain: ['Batch:'],
    },
  },
  'no-batch-meta': {
    A4: {
      pages: 1,
      mustContain: [
        'HSB-NOTA-2609005',
        'Warung Sehat Barokah',
        'Vitamin C 500 mg',
        'Vitamin B Complex',
        'GRAND TOTAL: Rp 220.000',
        'Terbilang: Dua Ratus Dua Puluh Ribu Rupiah',
      ],
    },
    A5: {
      pages: 1,
      mustContain: [
        'HSB-NOTA-2609005',
        'Warung Sehat Barokah',
        'Vitamin C 500 mg',
        'Vitamin B Complex',
        'GRAND TOTAL: Rp 220.000',
        'Terbilang: Dua Ratus Dua Puluh Ribu Rupiah',
      ],
      mustNotContain: ['Batch:'],
    },
    A6: {
      pages: 1,
      mustContain: [
        'HSB-NOTA-2609005',
        'Warung Sehat Barokah',
        '2 pcs',
        'GRAND TOTAL: Rp 220.000',
        'Terbilang: Dua Ratus Dua Puluh Ribu Rupiah',
      ],
      mustNotContain: ['Batch:'],
    },
  },
  'ppn-excluded': {
    A4: {
      pages: 1,
      mustContain: [
        'HSB-NOTA-2609006',
        'Koperasi Warga Makmur',
        'GRAND TOTAL: Rp 500.000',
        'Terbilang: Lima Ratus Ribu Rupiah',
      ],
    },
    A5: {
      pages: 1,
      mustContain: [
        'HSB-NOTA-2609006',
        'Koperasi Warga Makmur',
        'GRAND TOTAL: Rp 500.000',
        'Terbilang: Lima Ratus Ribu Rupiah',
      ],
      mustNotContain: ['DPP:'],
    },
    A6: {
      pages: 1,
      mustContain: [
        'HSB-NOTA-2609006',
        'Koperasi Warga Makmur',
        'Batch: 26T0901BO · ED: 31 Mar 2027',
        'GRAND TOTAL: Rp 500.000',
        'Terbilang: Lima Ratus Ribu Rupiah',
      ],
      mustNotContain: ['DPP:', 'PPN '],
    },
  },
  'ppn-rate-snapshot-12': {
    A4: {
      pages: 1,
      mustContain: [
        'HSB-NOTA-2609007',
        'Klinik Utama Sehat Bersama',
        'PPN 12%: Rp 120.000',
        'GRAND TOTAL: Rp 1.120.000',
      ],
    },
    A5: {
      pages: 1,
      mustContain: [
        'HSB-NOTA-2609007',
        'Klinik Utama Sehat Bersama',
        'PPN 12%: Rp 120.000',
        'GRAND TOTAL: Rp 1.120.000',
      ],
    },
    A6: {
      pages: 1,
      mustContain: [
        'HSB-NOTA-2609007',
        'Klinik Utama Sehat Bersama',
        'DPP: Rp 1.000.000 · PPN 12%: Rp 120.000',
        'GRAND TOTAL: Rp 1.120.000',
      ],
    },
  },
  'ongkir-and-fee': {
    A4: {
      pages: 1,
      mustContain: [
        'HSB-NOTA-2609008',
        'Jatuh Tempo: 27 Sep 2026',
        'Ongkir: Rp 25.000',
        'Biaya Lain: Rp 2.500',
        'Termin: 7 hari',
        'GRAND TOTAL: Rp 527.500',
      ],
    },
    A5: {
      pages: 1,
      mustContain: [
        'HSB-NOTA-2609008',
        'Jatuh Tempo: 27 Sep 2026',
        'Ongkir: Rp 25.000',
        'Biaya Lain: Rp 2.500',
        'Termin: 7 hari',
        'GRAND TOTAL: Rp 527.500',
      ],
    },
    A6: {
      pages: 1,
      mustContain: [
        'HSB-NOTA-2609008',
        'Ongkir: Rp 25.000',
        'Biaya Lain: Rp 2.500',
        'Termin: 7 hari',
        'GRAND TOTAL: Rp 527.500',
      ],
      // Spec §8: header A6 hanya identitas, judul, nomor, tanggal.
      mustNotContain: ['Jatuh Tempo:'],
    },
  },
  'instansi-formal': {
    A4: {
      pages: 1,
      mustContain: [
        'HSB-NOTA-2609009',
        'Ditagihkan kepada',
        'Dikirim kepada',
        'RSUD Dr. Soetomo',
        'NPWP/NIK: 01.234.567.8-609.000',
        'Referensi Pengadaan',
        'Sumber: e-Katalog',
        'No. PO/SP: PO/SP/001/IX/2026',
        'Referensi Faktur Pajak',
        'Nomor: 010.002-26.00000123',
        'GRAND TOTAL: Rp 5.500.000',
      ],
    },
    A5: {
      pages: 1,
      mustContain: [
        'HSB-NOTA-2609009',
        'Kepada Yth:',
        'RSUD Dr. Soetomo',
        'Referensi',
        'Sumber: e-Katalog',
        'No. Pesanan Platform: EK-LKPP-2026-0915-001',
        'GRAND TOTAL: Rp 5.500.000',
      ],
      mustNotContain: [
        'Ditagihkan kepada',
        'Dikirim kepada',
        'No. PO/SP',
        'Referensi Faktur Pajak',
        'Pemeriksa,',
      ],
    },
    A6: {
      pages: 1,
      mustContain: [
        'HSB-NOTA-2609009',
        'Kepada Yth:',
        'RSUD Dr. Soetomo',
        'Instansi: Dinas Kesehatan Provinsi Jawa Timur',
        '031-5501000',
        'Ref: EK-LKPP-2026-0915-001',
        'GRAND TOTAL: Rp 5.500.000',
      ],
      // Satu nilai Ref: saja — nomor PO/SP dan referensi pajak tidak dirender.
      mustNotContain: [
        'Ditagihkan kepada',
        'Dikirim kepada',
        'Referensi Pengadaan',
        'Referensi Faktur Pajak',
        'No. PO/SP',
        'Pemeriksa,',
        'Batch:',
      ],
    },
  },
  'large-rounded-amounts': {
    A4: {
      pages: 1,
      mustContain: [
        'HSB-NOTA-2609010',
        'Jasa Kalibrasi Alat',
        'GRAND TOTAL: Rp 1.234.568',
        'Terbilang: Satu Juta Dua Ratus Tiga Puluh Empat Ribu Lima Ratus Enam Puluh Delapan Rupiah',
      ],
    },
    A5: {
      pages: 1,
      mustContain: [
        'HSB-NOTA-2609010',
        'Jasa Kalibrasi Alat',
        'GRAND TOTAL: Rp 1.234.568',
        'Terbilang: Satu Juta Dua Ratus Tiga Puluh Empat Ribu Lima Ratus Enam Puluh Delapan Rupiah',
      ],
    },
    A6: {
      pages: 1,
      mustContain: [
        'HSB-NOTA-2609010',
        'Jasa Kalibrasi Alat',
        'Rp 4.568',
        'Batch: 26T0912JK · ED: 31 Okt 2027',
        'GRAND TOTAL: Rp 1.234.568',
        'Terbilang: Satu Juta Dua Ratus Tiga Puluh Empat Ribu Lima Ratus Enam Puluh Delapan',
      ],
    },
  },
};
