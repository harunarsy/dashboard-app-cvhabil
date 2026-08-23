# Dependency Security Report

**Tanggal:** 23 Agustus 2026  
**Scope:** Fase 7A — frontend dan backend

## Hasil

| Pemeriksaan | Sebelum | Sesudah |
|---|---:|---:|
| Frontend `npm audit` | 6 advisory (1 moderate, 5 high) | 0 |
| Backend `npm audit` | 1 high | 0 |

## Perubahan terverifikasi

| Paket | Sebelum | Sesudah | Alasan |
|---|---:|---:|---|
| `axios` | 1.16.1 resolved | 1.19.0 | Menutup advisory Axios dan menaikkan `form-data` ke 4.0.6. |
| `react-router-dom` / `react-router` | 7.13.1 | 7.18.2 | Menutup advisory redirect, XSS, CSRF, deserialisasi, dan DoS. |
| `dompurify` (transitif `jspdf`) | 3.4.7 | 3.4.14 | Menutup advisory sanitasi DOM. |
| `xlsx` | npm registry 0.18.5 | SheetJS resmi 0.20.3 | npm registry tidak menyediakan rilis patched; dependency dipin ke tarball CDN resmi SheetJS beserta integrity hash di lockfile. |
| `@testing-library/user-event` | 13.5.0 production dependency | 14.6.6 dev dependency | Upgrade major sesuai fungsi testing-only. |

Sumber distribusi SheetJS: [dokumentasi instalasi resmi](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).

## Dead weight

- `three`, `vanta`, hook WebGL, canvas background, dan seluruh prop/runtime logic terkait telah dihapus. Penggantinya adalah gradient CSS statis tanpa animasi.
- `@habil/core` tidak ada di manifest, lockfile, maupun dependency tree; tidak ada paket yang perlu dihapus atau workspace yang perlu diperbaiki.
- `web-vitals` sudah tidak ada sejak pipeline CRA dihapus. Paket tidak ditambahkan kembali karena tidak memiliki consumer.

## Verifikasi

- Frontend Node 20: 9 file / 23 test lulus; production build lulus.
- Frontend Bun 1.4: 9 file / 23 test lulus; production build lulus.
- Backend Node 20 dan Bun 1.4: masing-masing 5/5 compatibility check lulus, termasuk XLSX write/read round-trip.
- Marketplace XLSX parser/filler 0.20.3: parse, edit harga/stok, write, dan read round-trip lulus.
- Route regression DB-independent 15/15 dan HTTP read-only smoke 17/17 lulus; 0 mutating query/DDL attempt.
- Build masih mencatat satu chunk `OnlineStoreDashboard` sebesar 529.37 kB. Ini menjadi input eksplisit Fase 7C, bukan disembunyikan dengan menaikkan warning limit.

