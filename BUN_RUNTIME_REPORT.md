# Fase 3 — Backend Bun Runtime Pilot

> Historical note: Socket.io compatibility below was measured during Fase 3. Socket.io was removed in Fase 5 (`v1.66.18-stable`) after repository-wide verification found no frontend consumer.

Tanggal: 2026-08-23  
Branch: `codex/bun-modernization-audit`  
Runtime pembanding: Node.js `v20.20.2` dan Bun `1.4.0`

## Keputusan

Bun dipertahankan sebagai **runtime pilot paralel**. Script Node tetap menjadi default dan tidak dihapus. Tidak ditemukan incompatibility fungsional, tetapi Bun belum layak menggantikan Node secara default karena penggunaan memorinya pada smoke benchmark lokal lebih tinggi sekitar 24%.

## Compatibility Matrix

| Area | Node 20 | Bun 1.4 | Hasil |
|---|---:|---:|---|
| Express 5 + CORS + Helmet | Pass | Pass | Parity |
| JWT sign/verify | Pass | Pass | Parity |
| `pg` Pool API | Pass | Pass | Parity |
| PostgreSQL read-only route test | Pass | Pass | 18/18; `transaction_read_only=on` |
| DB regression read-only | 15 pass / 3 known fail | 15 pass / 3 known fail | Baseline sama persis |
| HTTP route smoke | Pass | Pass | 14/14; 0 mutating query attempt |
| Socket.io attach/close | Pass | Pass | Parity |
| XLSX write/read | Pass | Pass | Parity |
| Startup + `/api/health` + graceful shutdown | Pass | Pass | Parity |

Tiga known DB failures tetap: 6 duplicate active batch groups, 2 PO status mismatch, dan 1 negative stock. Tidak ada regression baru dan tidak ada query write/DDL yang dijalankan.

## Benchmark Lokal

Tiga putaran per runtime, masing-masing 25 request serial ke `/api/health`.

| Metrik | Node 20.20.2 | Bun 1.4.0 | Delta Bun |
|---|---:|---:|---:|
| Startup rata-rata | 211.08 ms | 208.55 ms | -1.2% |
| RSS rata-rata | 91.13 MB | 113.07 MB | +24.1% |
| Health latency rata-rata | 0.400 ms | 0.257 ms | -35.8% |
| Health p95 rata-rata | 0.643 ms | 0.461 ms | -28.3% |

Benchmark ini adalah smoke microbenchmark lokal tanpa workload bisnis dan tanpa koneksi DB saat startup. Angkanya cukup untuk mendeteksi regression besar, bukan dasar tunggal keputusan produksi.

## Perubahan

- Menambah script paralel `start:bun`, `test-db:bun`, `test-route:bun`, `test-http:bun`, dan `test-compat:bun`.
- Menambah `backend/scripts/test-bun-compatibility.js` untuk compatibility contract lintas runtime.
- Menambah `backend/scripts/benchmark-runtime.js` untuk perbandingan startup, RSS, dan health latency yang reproducible.
- Script `start` dan seluruh jalur Node lama tetap utuh.

## Gate Fase 3

**PASS untuk pilot paralel; NO-GO untuk mengganti runtime default.** Lanjut ke modernisasi frontend dengan Node sebagai fallback resmi.
