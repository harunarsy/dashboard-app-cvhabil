# 📋 Rencana Migrasi Database: Neon.tech ke Supabase

Dokumen perencanaan dan benchmark migrasi PostgreSQL HABIL SuperApp dari Neon.tech ke Supabase.

---

## 1. Analisis Risiko & Fakta Lapangan

- **Driver**: Aplikasi menggunakan `pg` standar via `pg.Pool`. Tidak ada keterikatan ke Neon SDK atau Prisma/Drizzle.
- **Kompatibilitas**: Schema & SQL standar PostgreSQL 17, kompatibel dengan Supabase.
- **Catatan Historis**: Aplikasi sebelumnya pernah pindah dari Supabase Free Tier ke Neon karena latency Supabase Free tinggi saat serverless cold start.
- **Risiko Utama**:
  1. *Schema drift*: Skrip migrasi lokal tidak mencakup 100% kolom di database live (contoh: `tasks`, kolom COD pada `invoice_items`). **Wajib dump langsung dari live Neon**, bukan build dari DDL repo.
  2. *Sequence out-of-sync*: Nilai sequence SERIAL pasca restore wajib di-resync (`setval`) agar INSERT nota/customer/produk tidak tabrakan (error duplicate key).
  3. *Connection pooling*: Vercel serverless wajib pakai Supavisor Transaction Pooler (`port 6543`) di Supabase.

---

## 2. Fase Eksekusi

### Fase 1: Baseline Performa (Pra-Migrasi)
- Ukur latency p50/p95 endpoint berat: `/api/dashboard/stats`, `/api/sales`, `/api/invoices`, `/api/inventory`.
- Cek region Vercel function vs region Neon (keduanya wajib Singapore `sin1` / `ap-southeast-1`).
- Identifikasi apakah lag berasal dari:
  - Cold start Vercel
  - Neon auto-suspend / compute wakeup (~1.5-3 detik)
  - Network round-trip (13 serial queries vs 1 batch query)
  - Missing index pada filter tanggal `DATE_TRUNC`.

#### Benchmark Awal - 02 September 2026

Benchmark dijalankan dari Mac lokal dengan dataset hasil clone yang sama. Semua workload hanya
`SELECT`, 30 iterasi per query, pool berisi satu koneksi, dan timeout 10 detik. Angka di bawah
adalah median/p50 warm round-trip, bukan waktu eksekusi SQL murni.

| Workload | Neon pooler 5432 | Supabase session 5432 | Supabase transaction 6543 |
|---|---:|---:|---:|
| `SELECT 1` | 55,0 ms | 50,8 ms | 50,1 ms |
| Auth lookup | 55,2 ms | 50,3 ms | 54,5 ms |
| Dashboard sales | 59,6 ms | 55,3 ms | 57,1 ms |
| Inventory FEFO | 60,6 ms | 56,3 ms | 59,9 ms |
| Sales list | 60,7 ms | 56,5 ms | 61,2 ms |
| Ledger summary | 59,5 ms | 55,4 ms | 59,9 ms |

Cold connect berada sekitar 379 ms pada Neon pooler, 374 ms pada Supabase session, dan 398 ms
pada Supabase transaction dalam putaran tersebut. `EXPLAIN ANALYZE` menunjukkan eksekusi SQL
server-side sekitar 0,05-0,34 ms; mayoritas latency berasal dari round-trip jaringan/connection
pooler. Supabase unggul tipis sekitar 7-15% pada warm read, belum cukup menjadi bukti bahwa
cutover wajib dilakukan. P95 juga perlu diukur dari Vercel region aktual sebelum keputusan final.

### Fase 2: Setup Target Supabase
- Buat project Supabase di region **Singapore (`ap-southeast-1`)**.
- Gunakan minimal tier Pro untuk performa setara/lebih tinggi (compute tidak auto-pause).
- Kunci `public` Data API jika tidak dipakai (aplikasi murni akses via Express backend).

### Fase 3: Rehearsal Dump & Restore (Uji Coba Staging)
1. Dump dari Neon direct endpoint (`port 5432`, bukan `-pooler`):
   ```bash
   pg_dump "$NEON_DIRECT_URL" --format=custom --no-owner --no-privileges --file=neon_backup.dump
   ```
2. Restore ke Supabase staging endpoint:
   ```bash
   pg_restore --no-owner --no-privileges --schema=public -d "$SUPABASE_URL" neon_backup.dump
   ```
   Jangan gunakan `--clean`, `--if-exists`, atau perintah `DROP DATABASE`. Target staging
   harus diverifikasi kosong/terisolasi terlebih dahulu; restore produksi dilakukan hanya
   dalam maintenance window dengan backup dan rollback plan.
3. Resync sequence:
   ```sql
   SELECT setval('sales_orders_id_seq', (SELECT MAX(id) FROM sales_orders));
   SELECT setval('invoices_id_seq', (SELECT MAX(id) FROM invoices));
   SELECT setval('customers_id_seq', (SELECT MAX(id) FROM customers));
   SELECT setval('product_master_id_seq', (SELECT MAX(id) FROM product_master));
   SELECT setval('inventory_batches_id_seq', (SELECT MAX(id) FROM inventory_batches));
   SELECT setval('inventory_mutations_id_seq', (SELECT MAX(id) FROM inventory_mutations));
   SELECT setval('tasks_id_seq', (SELECT MAX(id) FROM tasks));
   ```
4. Jalankan `VACUUM ANALYZE`.

### Fase 4: Audit Parity & Integritas
- Cocokkan jumlah baris per tabel antara Neon vs Supabase.
- Jalankan suite regression test & health check: `node backend/scripts/health-check-prod.js`.
- Verifikasi mutasi stok, saldo buku besar, dan total penjualan.

### Fase 5: Benchmark A/B
- Jalankan test beban dan ukur response time Vercel -> Neon vs Vercel -> Supabase.
- Keputusan *GO / NO-GO*: Migrasi hanya dilanjutkan jika Supabase terbukti minimal 25% lebih cepat dan stabil.

### Fase 6: Cutover Produksi (Maintenance Window: 30 Menit)
1. Pasang maintenance flag di frontend.
2. Final sync dump & restore.
3. Update environment variable `DATABASE_URL` di Vercel Dashboard ke Supabase Pooler (`port 6543`).
4. Redeploy backend Vercel.
5. Smoke test create nota, faktur, mutasi stok, dan login.
6. Buka maintenance flag.

### Fase 7: Rollback Plan
- Neon dipertahankan dalam mode **read-only** minimal 7 hari.
- Jika ada masalah kritis sebelum write terjadi di Supabase: kembalikan `DATABASE_URL` Vercel ke Neon.

---
Dokumen dibuat: 02 September 2026.
