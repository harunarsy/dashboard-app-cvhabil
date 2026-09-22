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
  },
};
