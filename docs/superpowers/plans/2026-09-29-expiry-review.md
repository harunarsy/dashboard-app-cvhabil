# Independent review: ED dual precision

Tanggal: 29 September 2026.
Baseline/HEAD: `4e97c700232873f9bec41fa35b0f91e0cabdcfcb`.
Target: perubahan working tree backend/frontend, termasuk helper/component/test baru.

## Verdict

**REQUEST CHANGES. Belum siap merge/deploy: 3 temuan Important, tidak ada temuan Critical.** Normalisasi dan jalur writer utama membawa precision dengan benar, tetapi proyeksi PO menghilangkan makna month dan dua jalur edit nota masih dapat mengganti snapshot historis tanpa perubahan batch oleh pengguna pada baris tersebut.

Review ini inspeksi statis independen terhadap spec, plan, kedua handoff report, diff terhadap HEAD, dan consumers terkait. Backend suite serta frontend 302/302 dan build adalah bukti dari controller yang diberikan dalam penugasan, bukan eksekusi reviewer. Tidak menjalankan test/build, mengakses DB/.env, mengubah git, atau memakai subagent. Migration 023 belum diaplikasikan; invariansi data produksi belum diverifikasi. Satu-satunya berkas yang ditulis reviewer adalah laporan ini.

## Important findings

### 1. Precision hilang di explicit projections; penerimaan PO menjadi faktur day

**Lokasi utama:** `backend/routes/purchaseOrders.js:160-181`; consumer `frontend/src/components/InvoiceList.jsx:641-650,1107-1108`.

```js
// purchaseOrders.js:160
SELECT b.id, b.product_id, b.batch_no, b.expired_date, b.qty_current,
       b.source_qty_value, b.source_qty_unit, b.hna, b.is_active,
// purchaseOrders.js:172-176
batchesByProductId[b.product_id].push({
  id: b.id,
  batch_no: b.batch_no,
  expired_date: b.expired_date,
  qty_current: b.qty_current,
// InvoiceList.jsx:649-650
expired_date: batch.expired_date || '',
expired_date_precision: batch.expired_date_precision ?? null,
```

**Repro/penalaran konkret:** terima SP dengan ED `2028-02`/`month`. Writer receive menyimpan `2028-02-29`/`month` (`purchaseOrders.js:391-394`). GET detail SP memilih DATE tanpa precision, kemudian object `received_batches` juga tidak menyertakannya. Pilih SP sebagai sumber faktur: frontend mengisi `2028-02-29`/`null`, membuka mode Tanggal lengkap, dan mengirim pasangan tersebut. `normalizeInvoiceExpiries` untuk faktur baru mengartikannya sebagai `day` (`invoices.js:528-532`). Faktur persisten akhirnya menyatakan **29 Feb 2028**, sedangkan batch penerimaan menyatakan **Feb 2028**. Pengguna tidak pernah mengganti mode.

**Proyeksi lain yang juga kehilangan precision:** `backend/routes/inventory.js:848-856`:

```sql
SELECT id, batch_no, expired_date, qty_current, hna,
       COALESCE(tax_type, 'faktur') AS tax_type,
       COALESCE(ppn_rate, ...) AS ppn_rate,
```

GET `/inventory/batches-by-product/:productId` mengirim canonical DATE month tanpa metadata. Endpoint diekspos oleh `frontend/src/services/api.js:324`; saat ini komponen picker memakai `getProductBatches` yang SELECT `*`, sehingga tidak menyimpulkan semua picker aktif rusak. Namun kontrak response endpoint ini tetap membuang precision, bertentangan dengan persyaratan seluruh projections/picker.

**Perbaikan:** tambahkan precision pada SELECT detail PO **dan** mapping `received_batches`, serta explicit SELECT available-batches. Verifikasi response asli menuju prefill/payload faktur, bukan fixture API yang sudah berisi precision.

**Spec:** baris 16, 18, 21; plan Task 1 mewajibkan propagasi pada explicit projections.

### 2. Hidrasi legacy tanpa batch ID dianggap sebagai pergantian batch saat no-op edit

**Lokasi:** `frontend/src/components/SalesOrderList.jsx:1331-1357,1478-1479`; `backend/routes/sales.js:1337-1346,1399-1415`.

```js
// SalesOrderList.jsx:1339-1343,1356
if (!matchedBatch && item.batch_no_snapshot) {
  matchedBatch = batches.find((b) => b.batch_no === item.batch_no_snapshot);
}
_selected_batch_id: matchedBatch.id,
// SalesOrderList.jsx:1478-1479
selected_batch_id: i._selected_batch_id || null,
batch_id_snapshot: i._selected_batch_id || null,
// sales.js:1337-1341
const requestedBatch = it.selected_batch_id || it.batch_id_snapshot;
const batchChanged = Boolean(requestedBatch
  ? String(requestedBatch) !== String(oldItem?.batch_id_snapshot)
  : requestedNo && requestedNo !== oldItem?.batch_no_snapshot);
```

**Repro/penalaran konkret:** nota legacy mempunyai `batch_id_snapshot=NULL`, `batch_no_snapshot='B-LAMA'`, ED `2027-05-12`, precision NULL. Satu batch aktif bernomor sama sekarang mempunyai ID 101 dan ED `2028-02-29`/`month`. Buka edit lalu simpan tanpa mengganti batch. Lookup nama frontend memasang `_selected_batch_id=101`, sementara ED form masih historis. Payload mengirim ID 101 sebagai pilihan dan snapshot batch. Backend membandingkan `101` dengan batch ID lama `NULL`, sehingga `batchChanged=true`, tidak mempertahankan historical item, dan menulis ED aktual **2028-02-29/month**. Tanggal lama **2027-05-12/day** hilang hanya akibat buka/simpan edit.

Kasus ini juga berlaku ketika nomor+DATE masih sama tetapi precision batch sudah berubah: ID hasil lookup tetap dianggap pilihan baru. Dua batch dengan nomor/DATE sama dan precision berbeda juga tidak dibedakan oleh pencarian frontend `find` di baris 1333-1336.

**Perbaikan:** bedakan ID untuk hidrasi/picker dari aksi pergantian batch eksplisit. Bawa identitas item lama dan snapshot lama ke backend; no-op legacy tidak boleh disimpulkan sebagai pergantian batch hanya karena lookup memperoleh ID. Fallback nama+DATE perlu mempertimbangkan precision efektif dan menangani hasil ambigu.

**Mengapa suite yang dibaca tidak menutup kasus ini:** regresi frontend `SalesOrderList.test.jsx:147` menggunakan `batch_id_snapshot: 10`; regresi backend edit juga memakai ID batch lama (`test-expiry.js:661-669`). Itu bukan round-trip legacy tanpa ID.

**Spec:** baris 9, 12, 18, 27: full legacy day exact dan snapshot historis terlindungi saat edit/no-op.

### 3. ID sales item dibuang frontend; ganti batch satu baris dapat memakai histori baris lain

**Lokasi:** `frontend/src/components/SalesOrderList.jsx:1287-1300,1476-1485`; `backend/routes/sales.js:96-106,1335-1346,1399-1415`.

```js
// SalesOrderList.jsx:1288-1300: editItems dibangun tanpa i.id
order.items.map((i) => ({
  product_name: i.product_name,
  // qty/unit/HPP dan snapshot, tetapi tidak ada id
  _selected_batch_id: i.batch_id_snapshot || null,
  expired_date_snapshot_precision: i.expired_date_snapshot_precision ?? null,
}))
// sales.js:98-102
const byId = productRows.find((old) => item.id != null && String(old.id) === String(item.id));
if (byId) return byId;
const sameBatch = productRows.filter((old) => item.batch_id_snapshot
  && String(old.batch_id_snapshot) === String(item.batch_id_snapshot));
if (sameBatch.length === 1) return sameBatch[0];
```

**Repro/penalaran konkret:** satu nota punya dua baris produk/unit sama: item 17 memakai batch 101, item 18 memakai batch 102 dengan snapshot `2027-06-30/month`. Batch 102 kemudian dikoreksi melalui delta faktur menjadi `2028-02-29/month`; delta mengubah batch tanpa mengubah snapshot nota, sehingga kondisi ini sah. Buka edit dan ubah **hanya baris pertama** dari batch 101 ke 102.

Frontend tidak membawa ID item 17/18 dan mengirim `batch_id_snapshot=102` untuk kedua baris. Pada baris pertama, `historicalSaleItem` memilih **item 18** karena `sameBatch.length===1`, lalu menandainya terpakai. `batchChanged` menjadi false dan ED baris pertama dibekukan ke snapshot item 18 (`2027-06-30/month`), bukan ED aktual batch pilihan. Pada baris kedua yang tidak diubah pengguna, item 18 sudah terpakai; pencocokan batch 102 tidak menemukan historical item lagi, sehingga baris kedua memperoleh ED aktual `2028-02-29/month`. Snapshot baris yang seharusnya tetap historis tertimpa, dan baris yang benar-benar berganti batch memperoleh histori baris lain.

Ini kesalahan identitas/ownership, bukan masalah formatter. Backend tests mengirim `{ ...old, selected_batch_id }` dengan `old.id` (`test-expiry.js:661,669`), sedangkan payload komponen nyata membuang ID tersebut.

**Perbaikan:** pertahankan `sales_items.id` dari API di state dan payload edit; bedakan identitas baris asal dari batch tujuan. Matching fallback tidak boleh mengonsumsi histori baris lain berdasarkan ID batch tujuan yang baru dipilih. Jalur tanpa ID perlu menolak ambiguity atau memakai identitas snapshot asal yang terpisah.

**Spec:** baris 18, 21, 27; plan Task 2: snapshot refresh hanya saat batch berubah pada baris yang bersangkutan.

## Kepatuhan spec dan kualitas kode yang ditelusuri

| Area | Hasil inspeksi statis |
| --- | --- |
| Month canonical EOM, leap/century, day/timestamp legacy, invalid/null | `backend/utils/expiry.js:6-28` memvalidasi kalender dan pasangan month/EOM; prefix tanggal timestamp dipertahankan. Helper frontend memisahkan format ED dari tanggal biasa. |
| Migration additive | `routeSchemas.js:1176-1198`: enam nullable TEXT/CHECK pada lima tabel, tanpa DEFAULT/UPDATE/backfill DATE. Registry/runner existing tetap dipakai. Belum diverifikasi lewat DB karena migration belum dijalankan. |
| Writers stock-in, invoice, PO receive, loan return | DATE dan precision dinormalisasi bersama sebelum write; errors INVALID_DATE diarahkan ke 400. PO reader masih gagal pada F1. |
| Invoice delta precision-only | Normalisasi, comparison, metadata before/after, request/state hash, preview, item/batch write, audit/edit-event membawa precision. Precision-only memakai metadata existing batch, tidak membuat qty delta; multi-batch ownership ambigu diblokir. |
| SQL alignment | Inspeksi INSERT VALUES pada item/batch/loan/adjustment dan delta menunjukkan kolom, placeholder, serta bind precision sejajar. INSERT SELECT karantina menyalin DATE dan precision batch sumber. Ini inspeksi SQL, bukan eksekusi PostgreSQL. |
| Projections/correlated joins | Products latest/nearest LATERAL dan opname-template membawa precision; sales/loans/adjustments `json_agg` atas row penuh membawa kolom baru. PO received-batches dan available-batches kehilangan precision (F1). |
| Loan conversion dan adjustments | Loan conversion mengambil DATE/precision loan snapshot, bukan membaca ulang batch. Adjustment retur mengambil original sales snapshot, replacement mengambil batch pilihan; karantina menyalin precision batch sumber. |
| Inventory edit/no-op | HNA-only/no-op tidak menyinkron ulang ED nota; batch-number-only memakai CASE untuk menjaga ED/precision historis. Koreksi ED/precision eksplisit tetap menjalankan sinkronisasi nota existing sebagaimana dijelaskan handoff. |
| Sales edit, legacy/fallback, duplicate-product rows | Jalur ID batch+item yang stabil menjaga snapshot; round-trip komponen nyata gagal pada F2/F3. |
| Frontend input/payload | Lima lokasi ED memakai `ExpiryInput`; initial month/day, mode eksplisit, clear DATE+precision, edit month canonical dan legacy day ditelusuri. Prefill PO gagal karena response menghilangkan metadata (F1). |
| Dokumen/PDF/model/WA | Preview, legacy/v2 PDF, inventory/opname/adjustment PDF dan WA memakai `formatExpiry`. Grouping legacy/v2 memasukkan precision, NULL legacy dianggap day. Loan PDF mapping membawa precision. Hidrasi draft dan WA memberi prioritas snapshot yang ada, termasuk NULL, daripada batch terkini. |
| Expired/non-ED | ED hari ini masih valid (`days < 0` untuk expired, backend `>= CURRENT_DATE`); FEFO tetap canonical DATE. Tanggal nota/jatuh tempo memakai formatter tanggal biasa, bukan formatter month ED. |

Pemisahan helper ED dari tanggal umum dan penggunaan migration additive sesuai desain. Kekurangan kualitas utama adalah identitas edit tersebar antara `_selected_batch_id`, `batch_id_snapshot`, dan lookup historical tanpa ID item yang stabil, serta kontrak response SQL yang tidak diverifikasi end-to-end. Ketiganya menghasilkan kegagalan konkret di atas; laporan ini tidak menambahkan temuan style atau dugaan.

## Keputusan tindak lanjut

Perbaiki F1-F3 sebelum melanjutkan migration/rilis. Controller perlu memverifikasi response PO month ke payload faktur, no-op nota legacy tanpa batch ID, dan edit dua baris produk sama ketika hanya satu batch diganti. Bukti suite/build sebelumnya tidak mencakup round-trip SQL/projection dan identitas frontend ini.
