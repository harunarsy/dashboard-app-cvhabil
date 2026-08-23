# Bundle Optimization Report

**Status:** PASS

**Fase:** 7C

**Runtime:** Node.js 24.19.0 LTS

**Tanggal:** 23 Agustus 2026

## Baseline

Vite menghasilkan warning karena chunk `OnlineStoreDashboard` berukuran **529.37 kB** minified (**169.42 kB gzip**). Route tersebut sudah memakai `React.lazy`, tetapi `MarketplaceProductTab` masih mengimpor SheetJS secara statis. Akibatnya parser workbook ikut diunduh ketika route dibuka walaupun user belum melakukan upload/download Excel.

## Implementasi

- Import statis `marketplaceTemplate` dihapus dari `MarketplaceProductTab`.
- Modul workbook dimuat melalui cached dynamic `import()` hanya pada aksi upload atau download file.
- Label platform yang ringan dipisahkan dari modul workbook agar render halaman tidak menarik SheetJS.
- Warning limit Vite tidak dinaikkan dan tidak ada dependency yang dihapus untuk menyamarkan ukuran.
- Dua regression test ditambahkan untuk parse serta write/read workbook Shopee pada SheetJS 0.20.3.

## Hasil Build

| Chunk | Sebelum | Sesudah | Perubahan |
|---|---:|---:|---:|
| `OnlineStoreDashboard` | 529.37 kB | 40.47 kB | -488.90 kB (-92.36%) |
| Workbook on-demand | tergabung di route | 489.21 kB / 159.84 kB gzip | hanya dimuat saat aksi file |
| Chunk terbesar | 529.37 kB | 489.21 kB | di bawah gate 500 kB |

Build Node 24 dan Bun tidak lagi menghasilkan warning chunk >500 kB.

## Verifikasi

- Node 24.19.0: 10 file / 25 Vitest test lulus; production build lulus tanpa warning ukuran chunk.
- Bun 1.4.0: 10 file / 25 Vitest test lulus; production build lulus tanpa warning ukuran chunk.
- Workbook contract: deteksi platform, parse produk, update harga/stok, write, dan read-back lulus.
- Tidak ada perubahan backend, database, endpoint, atau business rule.
