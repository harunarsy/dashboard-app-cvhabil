# Node 24 LTS Migration Report

**Status:** PASS  
**Default runtime:** Node.js `24.19.0` LTS  
**Package manager:** npm `10.9.9` (default), Bun `1.4.0` (parallel pilot)  
**Tanggal:** 23 Agustus 2026

## Keputusan

Node 24.19.0 menjadi runtime default untuk development, manifest, dan CI. Node 20 tidak lagi berada dalam supported engine range atau CI karena sudah EOL pada 24 Maret 2026. Bun tidak dipromosikan menjadi runtime default; status pilot paralelnya tidak berubah.

Referensi resmi: [Node.js release status](https://nodejs.org/en/about/previous-releases) dan [Node.js 24.19.0 LTS](https://nodejs.org/en/blog/release).

## Perubahan

- `.nvmrc` dan `.node-version`: `24.19.0`.
- `frontend/package.json` dan `backend/package.json`: `node >=24.19.0 <25`.
- CI frontend/backend: Node `24.19.0` sebagai satu-satunya runtime wajib.
- README dan product contract diselaraskan ke Node 24 LTS.
- npm lockfile disinkronkan kembali dengan engines baru; audit tetap 0 advisory.

## Regression Gate Node 24.19.0

| Area | Hasil |
|---|---:|
| Frontend Vitest | 9 file / 23 test lulus |
| Frontend production build | PASS; warning chunk 529.37 kB tetap terbuka untuk Fase 7C |
| Backend compatibility | 5 / 5 |
| Smart-Assistant contract | 5 / 5 |
| Pricing engine | 38 / 38 |
| HTTP read-only smoke | 17 / 17; 0 mutating query/DDL attempt |
| Route regression | 18 / 18; `transaction_read_only=on` |
| Live Smart-Assistant | 8 / 8 bounded; `transaction_read_only=on` |
| DB regression | 15 pass / 3 known failures, persis baseline |
| Startup/health/graceful shutdown | PASS pada port smoke 5017 |

## Database Safety

Seluruh pemeriksaan DB Fase 7B memakai guard read-only dan membuktikan `transaction_read_only=on` sebelum query. Tidak ada DML, DDL, migration, atau perubahan row count yang dijalankan.

## Rollback

Revert commit Fase 7B untuk mengembalikan pin Node 20 dan CI dual-lane. Tidak ada perubahan database atau kontrak API dalam fase ini.
