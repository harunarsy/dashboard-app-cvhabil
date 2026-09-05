# Feedback Log

## [2026-09-05] - Staging Gate: Void 500 via CONCAT Untyped Parameter
- **Seluruh void adjustment gagal HTTP 500** pada staging gate PostgreSQL terisolasi: `could not determine data type of parameter $2`.
- **Akar masalah**: `POST /sales/adjustments/:adjustmentId/void` memakai `notes = CONCAT(COALESCE(notes, ''), ' | void adjustment: ', $2)`; PostgreSQL tidak dapat menginfer tipe `$2` di dalam `CONCAT`.
- **Dampak**: tanpa fix, setiap void di production akan 500 setelah stok reversal ditulis — transaksi di-rollback penuh sehingga tidak ada korupsi, tetapi void tidak pernah bisa sukses.
- **Tindakan**: cast eksplisit `$2::text` (satu baris, `backend/routes/sales.js`). Seluruh gate diulang hijau: konkurensi 6/6, HTTP 17/17, rollback 3/3. Tidak ada production database yang tersentuh selama investigasi.

## [2026-09-05] - Sales Adjustment Quantity Mismatch
- **Adjustment nyata `ADJ-260905-0002` sudah dipost di production saat uji UI.** Nota asal `HSB-NOTA-2609003` menerima retur 3 pcs Tropicana Slim Kecap Manis 200 ml batch `ANPF03VB` senilai Rp87.000, tetapi replacement yang terpost adalah 10 pcs batch `ANQD02VB` senilai Rp325.000.
- **Dampak finansial saat ini:** adjustment mencatat additional charge Rp238.000 dan settlement masih `pending`; tidak ada ledger entry yang dibuat.
- **Dampak stok saat ini:** nota sementara `HSB-NOTA-2609014` sudah soft-deleted, batch `ANQD02VB` kembali 10 lalu adjustment mengeluarkan 10 sehingga stok batch kembali 0. Batch asal `ANPF03VB` bertambah 3 dan kini tercatat stok aktif 6.
- **Target bisnis yang sebelumnya dijelaskan:** retur 3 pcs, replacement 3 pcs @Rp32.500, tambahan bayar seharusnya Rp10.500, sisa 7 pcs batch `ANQD02VB` kembali inventory. Status kondisi retur perlu dikonfirmasi karena user menyebut ED; jika expired, 3 pcs tidak boleh kembali ke stok aktif.
- **Tindakan:** Koreksi telah dilakukan. Adjustment salah (ADJ-260905-0002) di-void secara atomic (mengembalikan stok). Lalu diposting adjustment baru 3-for-3 (Kecap 200ml) dengan retur kondisi 'expired'. Batch asal (ANPF03VB) tidak ditambah stok aktif, namun dibuatkan batch quarantine. Stok pengganti (ANQD02VB) dipotong 3 pcs, sisa 7 pcs. Customer dikenakan additional charge Rp10.500 (pending settlement).

## [2026-09-05] - Paid Sale Return/Exchange Audit
- **HSB-NOTA-2609003** ditemukan sebagai nota final/lunas dengan total `Rp1.968.000`, `paid_at` tersimpan sebagai 2 September 2026 waktu lokal, dan item Tropicana Slim Kecap Manis 200 ml qty 3 pada batch `ANPF03VB` (ED 03 Desember 2026). Audit dilakukan read-only; tidak ada data diubah.
- **HSB-NOTA-2609014** memiliki dua baris historis: id `382` sudah soft-deleted dan id `383` masih aktif. Baris aktif berstatus final/unpaid, berisi Tropicana Slim Kecap Manis 200 ml qty 10 pada batch `ANQD02VB`, sehingga bukan draft kosong di database.
- Faktur `4844989` adalah invoice id `295`, status Pending, berisi 10 pcs produk yang sama pada batch `ANQD02VB`. Mutasi `faktur` sudah memasukkan 10 pcs dan mutasi `nota` aktif id `383` sudah mengeluarkan 10 pcs; stok batch saat audit `0`.
- **Risiko:** memindahkan item dari nota `2609014` atau mengedit nota lunas `2609003` melalui PUT biasa dapat mengubah/menghapus histori mutasi dan membuat pembayaran, stok, serta dokumen tidak konsisten.
- **Tindakan:** tidak ada write production. Implementasi adjustment/return wajib memakai transaksi append-only dan harus meminta konfirmasi bisnis khusus untuk nota aktif `2609014` sebelum posting.

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

## [2026-08-23] - Current State Audit / Data Integrity
- **Backend regression suite gagal (15 pass, 3 fail)** saat audit read-only terhadap DB `dev`.
- **6 grup batch aktif duplikat** berdasarkan `product_id + batch_no + expired_date`: product IDs `2` (`ANQD28DA`, `ANQE21CA`), `5` (`26A0068DVA0`), `16` (`5324022771`), `17` (`26Q2702GU`), dan `24` (`51360017A1`).
- **2 status PO tidak sinkron**: `HSB-SP-2607005` dan `HSB-SP-2607006` berstatus `sent`, sementara `received_qty = qty` dan `stock_received = TRUE`.
- **1 batch aktif memiliki stok negatif**: batch ID `108`, product ID `3` (Tropicana Slim Diabtx 150 sachet), batch `FNQC10BB`, `qty_current = -38`, source `invoice-186`.
- **Tindakan audit**: temuan dicatat tanpa perbaikan data atau code karena scope saat ini hanya pemindaian dan laporan Current State Project.

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
