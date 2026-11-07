// Metrik tipografi PDF dokumen penjualan/pesanan.
// Satu sumber kebenaran untuk ukuran huruf + tinggi baris, supaya jarak antar
// blok di renderer tidak lagi ditebak per ukuran kertas.
//
// Aturan produk: dokumen cetak memakai 12pt untuk teks isi. Teks pelengkap
// (NPWP, alamat, catatan, footer) 10pt, footer kecil 8pt. Tidak ada lagi
// pengecilan otomatis huruf demi memaksa muat satu halaman.

export const PDF_FONT = {
  body: 12,
  meta: 10,
  micro: 8,
};

// 1pt = 0.3528mm. Faktor 1.25 = jarak baris nyaman untuk teks cetak.
const MM_PER_PT = 0.3528;
const LINE_FACTOR = 1.25;

export const lineHeightMm = (pt = PDF_FONT.body, factor = LINE_FACTOR) => pt * MM_PER_PT * factor;

// Tinggi satu blok teks yang sudah di-wrap (dalam mm), tanpa padding.
export const textBlockHeightMm = (lineCount, pt = PDF_FONT.body, factor = LINE_FACTOR) =>
  Math.max(0, lineCount) * lineHeightMm(pt, factor);

// Tinggi dasar huruf (cap height) dalam mm, dipakai untuk menaruh baseline.
export const baselineOffsetMm = (pt = PDF_FONT.body) => pt * MM_PER_PT;
