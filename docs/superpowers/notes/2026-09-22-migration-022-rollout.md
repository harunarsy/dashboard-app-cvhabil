# Rollout Migrasi 022 — Sales Document Legal (Rilis v1.67.19-stable)

**Tanggal:** 23 September 2026
**Konteks:** Fase 2 Official Sales Documents — branch `feat/official-sales-documents`, **belum di-push dan belum dideploy**
**Status migrasi:** `20260922_022_sales_document_legal` **belum dijalankan di database mana pun**
**Flag renderer:** `documents_renderer_v2` masih `false` (seed) — A5/A6 tetap memakai renderer lama; `terima`/`pinjaman` tetap jalur lama

> Dokumen ini adalah hasil audit kode (read-only). Semua perintah di bawah **untuk dijalankan manual oleh Harun**, bukan oleh agen.

---

## 1. Isi migrasi 022

Definisi: `backend/migrations/routeSchemas.js` (`20260922_022_sales_document_legal`). Sifat: **additive saja** — tanpa backfill, tanpa menyentuh baris transaksi historis.

| Tabel | Kolom baru |
|---|---|
| `customers` (8) | `npwp`, `nik`, `entity_type`, `billing_address`, `shipping_address`, `pic_name`, `pic_position`, `work_unit` |
| `sales_orders` (20) | `buyer_npwp`, `buyer_nik`, `buyer_entity_type`, `buyer_email`, `buyer_pic_name`, `buyer_pic_position`, `buyer_work_unit`, `billing_address`, `shipping_address`, `procurement_source`, `platform_order_number`, `purchase_order_number`, `package_number`, `contract_number`, `procurement_method`, `government_agency`, `ppn_rate` (DEFAULT 0.11), `tax_invoice_status`, `tax_invoice_number`, `tax_invoice_date` |
| `print_settings` | Seed NPWP ke `nota_layout` **hanya bila belum ada** (`setting_value ? 'npwp'`); insert flag `documents_renderer_v2` = `{"enabled": false}` (`ON CONFLICT DO NOTHING`) |

Semua `ADD COLUMN IF NOT EXISTS` — aman dijalankan ulang, aman terhadap baris lama (kolom terisi `NULL` / default).

---

## 2. Audit penulis kolom baru (verifikasi kode, per 23 Sep 2026)

| Penulis kolom baru | Lokasi | Dampak bila deploy sebelum migrasi |
|---|---|---|
| `INSERT INTO sales_orders` (46 kolom) | `backend/routes/sales.js:372` | Buat nota gagal: `column "buyer_npwp" ... does not exist` |
| `UPDATE sales_orders` ($25-$44) | `backend/routes/sales.js:1226` | Simpan perubahan nota gagal |
| `INSERT INTO customers` (12 kolom) | `backend/routes/customers.js:82` | Tambah customer gagal |
| `UPDATE customers` (12 kolom) | `backend/routes/customers.js:97` | Edit customer gagal |

Aman tanpa migrasi (hanya baca / kolom lama):

- GET sales (`s.*`) dan GET customers (`c.*`) — hanya baca; `s.*`/`c.*` otomatis mengembalikan kolom yang ada saja, jadi tidak error bila kolom baru belum dibuat.
- `backend/routes/loans.js:321` — `INSERT INTO sales_orders` dengan daftar kolom eksplisit lama (`order_number`, `customer_id`, `customer_name`, `customer_address`, `customer_phone`, `sale_date`, `total`, `gross_profit`, `notes`, `payment_method`, `created_by`, `channel`, `due_date`, `payment_terms`, `est_weight_gram`, `status`, `source_loan_id`).
- `backend/routes/tax.js:144` — `UPDATE sales_orders` hanya `ppn_excluded`/`ppn_marked_by`/`ppn_marked_at`.
- Semua `UPDATE` lain di `sales.js` (gross_profit, est_weight_gram, notes, is_deleted, pdf_status, payment_status/paid_at) dan `customers.js` (phone) — kolom lama semua.

---

## 3. Prasyarat urutan deploy

```text
1) Migrasi 022 dieksekusi (izin Harun + backup)
2) Backend
3) Frontend
```

**Tidak ada jendela aman untuk backend lebih dulu.** Backend versi baru langsung menulis kolom legal/pengadaan pada create/edit nota dan customer; bila migrasi belum jalan, endpoint tersebut gagal. Migrasi lebih dulu aman karena additive dan diabaikan kode lama.

---

## 4. Verifikasi read-only (manual, untuk Harun — jangan dijalankan agen)

```bash
cd backend && npm run migrate:schema:list          # tanpa koneksi DB; 022 harus terakhir
node backend/scripts/check-db.js                    # health check read-only
# SQL read-only (manual, bukan oleh agen):
# SELECT column_name FROM information_schema.columns
#  WHERE table_name IN ('sales_orders','customers')
#    AND column_name IN ('buyer_npwp','ppn_rate','government_agency','tax_invoice_number','npwp','work_unit')
#  ORDER BY table_name, column_name;
# SELECT setting_key, (setting_value ? 'npwp') AS has_npwp FROM print_settings
#  WHERE setting_key IN ('nota_layout','documents_renderer_v2');
```

Ekspektasi hasil setelah migrasi:

- 6 baris kolom: `customers.npwp`, `customers.work_unit`, `sales_orders.buyer_npwp`, `sales_orders.government_agency`, `sales_orders.ppn_rate`, `sales_orders.tax_invoice_number`.
- `nota_layout` → `has_npwp = true` (seed NPWP); `documents_renderer_v2` → baris ada, `has_npwp = false`.
- `migrate:schema:list` menampilkan `20260922_022_sales_document_legal` sebagai id terakhir.

---

## 5. Rollback

- Kolom additive **tidak perlu di-drop** untuk rollback aplikasi — kode lama mengabaikannya. Cukup deploy ulang backend/frontend versi sebelumnya (`v1.67.18-stable`).
- Flag `documents_renderer_v2` tetap `false`, jadi tidak ada cutover renderer yang perlu dibalik.
- **Jangan drop kolom tanpa backup.** Bila benar-benar harus, lakukan setelah backup penuh dan dengan izin eksplisit.

---

## 6. Cakupan rilis v1.67.19-stable (konteks)

- Perbaikan: preservasi kunci `nota_layout` saat simpan Pengaturan Cetak (npwp/email tidak lagi terhapus), PPN 0%/tarif pecahan sesuai snapshot, judul per ukuran (A4 "Faktur Penjualan", A5/A6 "Nota Penjualan").
- Fitur: preview PDF aktual di modal Opsi Cetak (canvas + toolbar + jumlah halaman; blob yang sama untuk unduh/cetak) dan panel validasi sebelum cetak.
- Yang **belum** berubah: flag `documents_renderer_v2` tetap `false` (A5/A6 renderer lama), `terima`/`pinjaman` jalur lama, panel "Preview Live" di form tetap HTML draft, cutover A5/A6 menyusul.

### Checklist verifikasi visual manual (Harun)

1. Buka nota → Opsi Cetak → preview PDF aktual muncul (loading → halaman tampil); ganti A4/A5/A6 → preview ter-render ulang; zoom/`Fit`/navigasi halaman berfungsi; unduh & cetak memakai dokumen yang sama dengan preview.
2. Nota dengan PPN 0% → dokumen menampilkan "PPN 0%"; nota dengan tarif 11,5% → "PPN 11,5%" (bukan 12%).
3. Pengaturan Cetak → ubah satu field → simpan → muat ulang → pastikan `npwp`/`email`/kunci lain tidak hilang.
4. Nota A4 tanpa nama/alamat customer atau nominal tidak konsisten → tombol unduh/cetak terkunci dan alasan tampil di panel validasi.
