# Feedback Log

## [2026-08-29] - Invoice Reconciliation: DATE & Multi-Unit Form Boundary
- **PostgreSQL DATE bergeser satu hari di boundary aplikasi**: hasil read-only pada invoice `INVSB1260800500` menunjukkan database menyimpan tanggal `2026-08-05`/`2026-08-26`, sementara UI menampilkan `04/08/2026`/`25/08/2026`. `pg` default mem-parse OID 1082 sebagai JavaScript `Date`; serialisasi UTC kemudian dapat mundur satu hari.
- **Edit form memakai qty basis, bukan qty satuan faktur**: loader edit/duplikasi membaca `invoice_items.quantity`, padahal untuk unit pack nilai yang diketik operator tersimpan di `qty_in_unit`. Contoh 4 karton dengan pack size 60 dapat terbaca 240 karton.
- **Bukti kasus `INVSB1260800500`**: snapshot read-only menunjukkan invoice id `275` berisi Strawberry Jam qty 12, sedangkan dokumen sumber `IMG_3116.HEIC` berisi NFDM qty 1 dan Diabtx qty 120. Invoice kemudian sudah masuk Trash dan mutasi pembatalan membuat stok salah kembali neto 0.
- **Keputusan keselamatan**: guard perubahan produk/qty/harga setelah stock posting dipertahankan. Generic stock rebuild ditolak karena blast radius-nya tidak sebanding. Koreksi kasus ini memakai alur resmi Trash → permanent delete → create ulang, dengan precondition dan post-verification hanya untuk invoice id `275`.
- **Pre-merge review blocker**: setelah backend mengirim `DATE` literal, tiga countdown inventory masih memakai `new Date('YYYY-MM-DD')` (UTC) dan dapat meleset satu hari. Merge ditahan sampai seluruh consumer expired-date memakai parser kalender lokal dan memiliki regression test.

## [2026-08-23] - Modernization Phase 0 Hard Stop
- **Import HTTP smoke mencoba DDL database**: saat `backend/scripts/test-route-http.js` mengimpor aplikasi, `backend/routes/marketplace.js` langsung menjalankan `ensureSchema()` tanpa guard `NODE_ENV=test`.
- **Query yang dicoba**: beberapa `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, dan `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` pada tabel marketplace.
- **Proteksi berhasil**: test memakai DB mock fail-closed; query diblokir sebelum koneksi PostgreSQL dibuat. Tidak ada database write atau schema change yang terjadi.
- **Dampak**: strict read-only roadmap memasuki HARD STOP sebelum DB regression baseline dijalankan.
- **Perbaikan minimal**: `ensureSchema()` tidak dijalankan ketika `NODE_ENV=test`; seluruh Phase 0 kemudian diulang dan HTTP smoke membuktikan nol mutating-query attempt. Schema lifecycle jangka panjang tetap dicatat untuk dipindahkan ke migration/deployment step eksplisit, tetapi tidak dikerjakan pada fase ini.

## [2026-08-18] - v1.66.8 Data Integrity
- **Batch pilihan pada Edit Nota tertimpa batch lama ketika HPP sama**: pada `HSB-NOTA-2608032`, form mengirim batch `26Q1102GU`, `26T0205GU`, dan `26R2004GU`, tetapi setelah disimpan data berubah menjadi `26T0205GU`, `26Q1102GU`, dan `26T0205GU`.
- **Akar masalah**: `PUT /sales/:id` menulis ulang snapshot batch lama dengan pencocokan `produk + satuan + HPP`. Kombinasi ini tidak unik karena batch berbeda dapat memiliki HPP yang sama.
- **Perbaikan**: snapshot hasil resolusi `selected_batch_id` dari setiap baris edit menjadi otoritatif; tidak ada lagi pemulihan snapshot berdasarkan HPP. Tidak ada perbaikan data manual: operator cukup membuka dan menyimpan ulang nota setelah deploy untuk menjalankan transaksi normal aplikasi.

## [2026-05-30] - Investigation
- **Faktur Pembelian gagal dibuat — missing column `stock_received`**: UI menampilkan error `column "stock_received" does not exist` saat membuat Faktur Pembelian yang terhubung ke Surat Pesanan. Root cause awal: backend membaca/menulis `purchase_orders.stock_received` untuk mencegah stok dobel, tetapi schema guard `ensureSchema()` di `backend/routes/purchaseOrders.js` belum menjamin kolom tersebut ada di DB existing. Fix harus menambah `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS stock_received BOOLEAN DEFAULT FALSE` sebelum query yang memakai kolom itu.

## [2026-03-20] - v1.3.36-stable
- Perbaikan UI untuk UX penolakan Duplikat ID di frontend dengan intercept `err.code` 23505.
- Update Release array array Dashboard agar sejalan dengan Changelog.

## [2026-03-20] - v1.3.35-stable
- Perbaikan sinkronisasi dan manajemen counter Auto pada database untuk menanggulangi collision sequence saat user memasukkan ID manual yang nilainya melampaui rentetan antrean otomatis SP maupun Nota.

## [2026-03-20] - v1.3.34-stable
- Perbaikan "duplicate key value violates unique constraint" pada tabel `purchase_order_items`, `sales_items`, dan `invoice_items`.
- Sinkronisasi manual sequence ID database dengan nilai MAX(id) real di tabel.

## [2026-03-20] - v1.3.33-stable
- Perbaikan sinkronisasi penomoran dokumen di frontend dengan backend pada mode Auto.
- UI Split Number Field untuk mencegah manipulasi prefix oleh user.

## [2026-03-20] - v1.3.32-stable
- Duplicate key pada pembuatan `purchase_orders` telah diperbaiki karena mismatch counter di `document_counters`. (Counter SP reset to 75).
- UI Toggle `Auto/Manual` untuk penomoran SP dan Nota dipindahkan dari Settings ke modal pembuatan surat masing-masing sesuai mock-up design.
- Bug fixing diselesaikan lewat API backend dan State modal frontend.
