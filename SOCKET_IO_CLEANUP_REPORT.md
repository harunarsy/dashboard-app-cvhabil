# Fase 5 — Socket.io Inventory & Cleanup

Tanggal: 2026-08-23

Keputusan bisnis: dashboard tidak memiliki kebutuhan real-time kritis dan repository tidak memiliki consumer Socket.io frontend.

## Inventaris Sebelum Cleanup

| Area | Temuan |
|---|---:|
| Frontend Socket.io client/import/listener | 0 |
| Backend server initialization | 1 (`backend/server.js`) |
| Backend unused imports | 2 (`http` dan `socket.io` di `backend/app.js`) |
| Event emitters | 10 |
| Emitter route | `orders.js` 2, `inventory.js` 4, `invoices.js` 4 |
| HTTP test global mock | 1 |
| Bun compatibility Socket.io contract | 1 |
| Direct dependency | `socket.io@4.8.3` |

Event yang tidak memiliki consumer dalam repository: `orderCreated`, `orderUpdated`, `inventoryBatchUpdated`, `invoiceCreated`, `invoiceUpdated`, dan `invoiceDeleted`.

## Perubahan

- Menghapus inisialisasi Socket.io, connection/disconnect listener, dan `global.io` dari backend.
- Menghapus seluruh 10 emitter tanpa mengubah query, transaksi, response, atau business rule route.
- Menghapus dead `touchedProducts` set yang hanya dipakai untuk emit setelah stock opname.
- Menghapus mock `global.io` dari HTTP smoke.
- Mengganti compatibility check Socket.io dengan HTTP server lifecycle check agar total contract tetap 5.
- Menghapus dependency dan 21 package transitif dari install tree; npm dan Bun lockfile diselaraskan.
- Mengubah dokumentasi arsitektur aktif menjadi REST/HTTP request-response. Catatan rilis lama yang menyebut Socket.io dipertahankan sebagai histori.

## Gate

| Check | Node 20.20.2 | Bun 1.4.0 |
|---|---:|---:|
| HTTP smoke DB-isolated | 14/14; 0 mutating query | 14/14; 0 mutating query |
| Runtime compatibility | 5/5 | 5/5 |
| Route regression read-only | 18/18 | 18/18 |
| DB regression read-only | 15 pass / exact 3 known fail | 15 pass / exact 3 known fail |
| Startup + health + graceful stop | PASS | PASS |
| Frontend regression / build | 19/19 / PASS | Tidak terdampak |

Read-only guard mencetak `transaction_read_only=on` pada seluruh route/DB regression yang terhubung database. Tiga known failures tetap identik: enam duplicate active-batch group, dua PO status mismatch, dan satu active negative-stock batch.

## Runtime Smoke Setelah Cleanup

| Metrik | Node 20.20.2 | Bun 1.4.0 |
|---|---:|---:|
| Startup rata-rata | 201.87 ms | 160.07 ms |
| RSS rata-rata | 88.28 MB | 105.36 MB |
| Health latency rata-rata | 0.383 ms | 0.242 ms |

Node tetap runtime default sesuai keputusan Fase 3. Cleanup ini tidak mengubah keputusan runtime.

## Result

**PASS.** Clean `npm ci` memasang 161 package dan `npm ls` valid; dependency tree Socket.io kosong. Tidak ada initialization, emitter, mock, atau runtime test Socket.io aktif di backend/frontend source. Sistem sekarang secara eksplisit memakai REST/HTTP; freshness data tetap menjadi tanggung jawab fetch/refetch aplikasi.
