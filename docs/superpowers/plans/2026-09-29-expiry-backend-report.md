# Task 1 backend handoff (29 Sep 2026)

## Status dan bukti

- Controller mengonfirmasi RED sebelum implementasi: `node backend/scripts/test-expiry.js` gagal pada month dengan `expired_date tidak valid. Gunakan format YYYY-MM-DD.`
- Implementasi backend dan tambahan regresi ditulis. Belum ada klaim GREEN: worker tidak menjalankan test/build, mengakses DB/.env, melakukan stage/commit/push, atau memakai subagent.
- Pemeriksaan statis: 13 berkas JS yang diubah berhasil diparse menggunakan `vm.Script` tanpa evaluasi; `backend/package.json` berhasil diparse dan memiliki test-expiry pada test/unit.
- Inspeksi statis 14 INSERT VALUES inventory/invoice/sales/loan/adjustment menemukan jumlah kolom dan VALUES sejajar (termasuk INSERT opname tanpa ED existing). Ini bukan eksekusi SQL; bind ke schema sebenarnya masih memerlukan verifikasi controller.
- Berkas produksi backend lain diperiksa untuk `expired_date`: dashboard/insights hanya agregat/DATE filter, marketplace hanya FEFO HNA. Tidak ada writer ED tambahan di luar lima route dan delta service yang ditemukan pada source runtime backend.
- Migration 023 hanya ditulis, belum diaplikasikan. Deploy aplikasi membutuhkan keenam kolom terlebih dahulu lewat controller/runner existing.

## Follow-up worker: failure adjustment (29 Sep 2026, siap diverifikasi controller)

- Bukti controller sebelum follow-up: `node backend/scripts/test-expiry.js`, 36 pass / 1 fail. Adjustment menghasilkan HTTP 500 dengan `Undefined bind: INSERT INTO sales_adjustment_items ... $22`; assertion mengharapkan 201 pada baris 583.
- Akar sumber: normalized replacement tidak memiliki `conditionReason`, tetapi INSERT mengikat `item.conditionReason` langsung ke `$14` (`condition_reason`, nullable). Mock menolak undefined sebelum query. Driver terpasang `backend/node_modules/pg/lib/utils.js:44-47` membuktikan `val == null` dikonversi SQL NULL; failure ini tidak membuktikan PostgreSQL produksi mengembalikan 500. Nullable column diperiksa di `backend/migrations/routeSchemas.js:999-1000`.
- Perbaikan `backend/routes/sales.js:903,948-954`: replacement memiliki `conditionReason: null`; nullable foreign-key/condition/source/snapshot binds memakai `?? null`. Required adjustment ID, product name, quantity, price, amount, direction tetap diikat langsung, tanpa fallback yang menyembunyikan data hilang.
- Assertion fixture tetap menolak undefined dan kini memeriksa required identity serta NULL pada sisi snapshot yang tidak berlaku. Tidak ada hasil test pasca-fix; worker tidak menjalankan test/build/DB/.env atau operasi git write.

### Temuan audit dan perbaikan tambahan

1. `backend/services/invoiceDeltaService.js:727-731,741-744`: metadata item unposted memiliki `batch_id: null`, sama dengan batch destination baru. Equality lama mengambil metadata baris lain untuk preview ED batch baru. Lookup kini hanya untuk batch ID existing. Preview quantity+metadata juga memakai `after_batch_number`, sesuai batch yang akan dipersist, bukan nomor lama dari bucket.
2. `backend/routes/sales.js:1336,1413-1415`: historical item langsung ditandai terpakai setelah matching, termasuk saat batch berubah. Sebelumnya item yang pindah batch masih tersedia untuk matching baris berikutnya sehingga historical snapshot bisa dipakai ulang. Unchanged batch mempertahankan precision raw legacy NULL serta DATE historis; selected batch baru mengambil DATE+precision actual batch. Nullable batch ID/text binds dibuat explicit NULL.
3. `backend/routes/invoices.js:525-527`: synthetic `legacy-line-<id>` dari GET faktur di-match ke row yang belum memiliki stored line_key. Fallback posisi+nama hanya berlaku ketika payload tidak membawa ID/line_key. Baris baru dengan line_key eksplisit tidak lagi mewarisi ED/precision baris lama pada posisi sama.
4. `backend/routes/loans.js:182,242,348-349`: nullable batch text, historical tax/rate dan batch snapshot ID/text menggunakan `?? null`. Required product/order identity tetap bind langsung. DATE+precision berasal dari selected batch atau loan snapshot sesuai jalur, tanpa membaca ulang batch pada conversion.

### Hasil review kontrak dan SQL

- Full legacy DATE tetap literal di `normalizeExpiry`; timestamp string mempertahankan tanggal prefix tanpa pergeseran zona waktu. `config/database.js:2-4` memasang parser OID 1082 yang mengembalikan DATE literal (`utils/pgDate.js`), sehingga source produksi tidak mengandalkan Date object mock.
- Migration 023 tetap enam nullable TEXT/CHECK tanpa DEFAULT, UPDATE, backfill atau perubahan DATE. Read JSON `SELECT *`/`json_agg(item)` membawa metadata; explicit projections pada inventory, sales FEFO/adjustment dan PO/loan writers ditelusuri.
- Inventory no-op/HNA-only dan batch-number-only tidak menulis ulang ED snapshot nota. PUT nota unchanged menjaga raw precision legacy NULL. Loan conversion dan adjustment retur menggunakan tanggal historical, bukan tanggal batch yang sudah dikoreksi; snapshot baru menggunakan precision efektif day/month.
- Precision-only delta tetap metadata batch existing tanpa batch/product qty delta atau revaluasi HNA jika harga unchanged. Preview, state/request hash, line/metadata before-after, item/batch write, audit dan edit-event membawa precision. Metadata item tanpa stock tidak mengarang batch.
- Pemeriksaan AST read-only: 297 query dengan fixed bind arrays memiliki jumlah bind sesuai placeholder tertinggi; 4 query memakai spread ditinjau manual. `itemDbValues` berisi 23 elemen + ID/invoice ID = 24; formal sales snapshot spread mempertahankan alignment existing. Ke-14 INSERT VALUES item/batch memiliki jumlah kolom sejajar VALUES, termasuk literal `source_type` dan qty=0. Quarantine INSERT SELECT: 12 kolom sesuai 12 projection, precision disalin dari batch source. Tidak ada fallback `params.map(undefined→null)` yang menyembunyikan required binds.
- Pemeriksaan terakhir: 13 berkas JS diparse `vm.Script` tanpa evaluasi; backend/report `git diff --check` bersih. Ini pemeriksaan statis, bukan behavioral test atau SQL execution.
- Regresi ditulis di `backend/scripts/test-expiry.js`: preview destination terpisah dari unposted metadata, qty+metadata preview, apply precision-only dua arah (item/batch/audit/event, tanpa qty mutation), invoice synthetic key/legacy posisi/new-key, sales legacy day snapshot NULL dan historical-item reuse, loan nullable legacy snapshot, adjustment legacy day vs month serta optional NULL.

### Status handoff

- Perubahan follow-up belum di-commit. Branch dikonfirmasi `feat/expiry-month-year`.
- Bukti behavioral terakhir tetap hasil controller **36 pass / 1 fail sebelum follow-up**, bukan hasil sesudah perbaikan.
- Controller perlu menjalankan ulang `node backend/scripts/test-expiry.js`, lalu suite backend. Verifikasi SQL nyata/migration tetap diperlukan sebelum deployment.

## Berkas dan titik perubahan

### `backend/utils/expiry.js:6,32` (baru)

```js
normalizeExpiry(value, precision) // { date: string|null, precision: day|month|null }
normalizeExpiryEdit(value, precision, currentValue, currentPrecision)
```

- Kalender Gregorian literal, termasuk aturan century kabisat; month menghasilkan DATE akhir bulan.
- Full DATE/timestamp mempertahankan tanggal sumber. Timestamp divalidasi bentuk ISO serta jam/menit/detik, tanpa konversi zona waktu atas string.
- Invalid DATE/precision/pasangan month non-akhir-bulan menghasilkan `code=INVALID_DATE`, `status=400`, `statusCode=400`.
- Kosong menghapus DATE dan precision. DATE legacy tanpa metadata dibaca day.
- Edit DATE canonical sama dengan precision omitted/null menjaga precision existing. Month input eksplisit tetap month; day eksplisit merupakan mode switch.

### `backend/migrations/routeSchemas.js:1176-1198`

Migration `20260929_023_expiry_precision` terdaftar setelah 022:

```js
['inventory_batches', ['expired_date_precision']],
['invoice_items', ['expired_date_precision']],
['sales_items', ['expired_date_snapshot_precision']],
['loan_items', ['expired_date_snapshot_precision']],
['sales_adjustment_items', ['original_expired_date_precision', 'replacement_expired_date_precision']]
```

Enam nullable TEXT tanpa DEFAULT/backfill/UPDATE. Setiap kolom mendapat CHECK NULL atau IN day/month, idempotent dengan pg_constraint+conrelid. Transaksi dimiliki runner existing, bukan route import.

### `backend/routes/inventory.js:33,265,421,468`

- Latest-batch dan nearest-expiry projections membawa precision; opname-template membawa `b.expired_date_precision`.
- Stock-in menormalisasi sebelum INSERT, menyimpan precision pada bind $8.
- Edit batch memuat precision lama, mempertahankan ED/metadata bila omitted atau unchanged, mencatat precision-only dalam batch audit.
- Sinkronisasi nota yang sudah ada tetap mengikuti koreksi identitas batch existing. DATE+precision hanya diubah ketika ED/precision sungguh berubah. Koreksi batch number saja menjaga ED snapshot historis:

```sql
expired_date_snapshot = CASE WHEN $5 THEN $2::date ELSE expired_date_snapshot END,
expired_date_snapshot_precision = CASE WHEN $5 THEN $4::text ELSE expired_date_snapshot_precision END
```

### `backend/routes/invoices.js:500,514,520,1059,1145,1244,1316,1498,1532`

- Canonical invoice item comparison dan explicit SELECT menyertakan precision.
- `normalizeInvoiceExpiries` menangani POST overwrite dan PUT sebelum write, mencocokkan id/line_key lalu legacy posisi+nama bila tidak ada identitas.
- Item INSERT create/rewrite: precision di $24. Batch auto-stock-in: precision di $12.
- Legacy metadata patch menulis precision item/batch; lookup DATE sumber legacy tetap exact.
- INVALID_DATE create/update menjadi HTTP 400; delta route memakai handling INVALID_DATE existing.

### `backend/routes/purchaseOrders.js:333,391`

Semua ED penerimaan divalidasi sebelum write pertama dalam transaksi, termasuk sebelum fallback pembuatan product. Inventory batch menyimpan DATE canonical dan precision $10. INVALID_DATE menjadi 400.

### `backend/routes/sales.js:68,96,126,488,828-829,893,942-962,1231,1337,1394,1407`

- Snapshot input divalidasi pada item validation; selected batch ID invalid tidak jatuh diam-diam ke FEFO.
- Batch lookup DATE legacy dipertahankan. Jika precision tersedia pada lookup nama+DATE, precision ikut membatasi hasil.
- Create/FEFO dan edit selected-batch projections membawa precision. Sales item INSERT append precision $15 tanpa menggeser HPP/PPN bind.
- PUT membaca historical items sebelum DELETE. Matching memakai item ID/product+unit+batch, tidak memakai HPP. Identitas batch sama menjaga historical batch text, DATE dan precision. Batch berganti mengambil metadata aktual batch terpilih.
- Matching lama ambigu tanpa identitas/exact snapshot ditolak 400, bukan memilih HPP yang kebetulan sama.
- Adjustment returned memakai snapshot original sales item, replacement memakai actual inventory batch. INSERT adjustment item append precision $21/$22; optional fields dikirim NULL, bukan undefined.
- Quarantine batch INSERT SELECT menyalin `expired_date_precision` batch sumber bersama DATE, HNA dan pajak.

### `backend/routes/loans.js:87,178,212,240,307,345-351`

- Loan item creation menyalin actual selected batch DATE+precision ($13).
- Semua input ED new-batch return divalidasi sebelum item writes, menulis inventory precision $9.
- Loan conversion memvalidasi snapshot sebelum order dibuat, menyalin historical loan DATE+precision ke sales item ($15); tidak mengambil ulang ED batch dan tidak memotong stok lagi.
- INVALID_DATE menghasilkan 400 pada create/return/convert.

### `backend/services/invoiceDeltaService.js:32,130,235,255,459,527,728,829,851,1060-1108,1192-1230,1361`

- `optionalDbDate`: month hanya untuk `expired_date` atau label existing `Expired Date ...`. Invoice/due/payment date boundary tetap parser lama.
- Request hash mengikat precision dan menyamakan omitted/undefined/null metadata legacy.
- Snapshot hash item/batch memakai precision efektif; NULL/undefined state lama konsisten day bila DATE ada.
- Current/next lines dan ownership membawa precision. Alignment edit menjaga month tersimpan saat precision tidak dikirim.
- Metadata precision-only diteruskan ke preview, item/batch write, before/after line changes, audit JSON dan edit event after snapshot.
- Preview quantity+metadata combined memakai after ED dari metadata change, termasuk clear.
- Item persistence precision $23, invoice_id/current id $24; batch destination precision $11; batch metadata precision $4.
- Apply validates all next ED/metadata sebelum write pertama. Metadata-only baris tanpa stock ownership tetap dapat mengubah item tanpa mengarang batch.

### `backend/utils/invoiceDelta.js:74,111,250-317,327-336,353-402`

- Normalize next ED bersama precision; Date object ditangani pada date normalization.
- Precision adalah bagian comparison. Same DATE day↔month merupakan metadata change pada batch existing, termasuk mode move (tidak perlu memindahkan qty).
- Multi-owned-batch metadata correction tetap fail-closed karena target ambigu.
- Bucket/destination dan line before/after metadata menyertakan precision. Empty ED menghapus precision.
- Existing unposted line tidak menghasilkan stok baru; precision-only tetap terdeteksi sebagai metadata item.

### Test dan package

- `backend/scripts/test-expiry.js` diperluas: strict helper/null/invalid/century leap, canonical-month omission, legacy no-op, precision delta, state/request hash, migration no UPDATE, stock-in bind, inventory snapshot preservation, PO/invoice invalid before writes, loan return/conversion, sales unchanged-vs-selected batch, adjustment+quarantine propagation.
- `backend/scripts/test-expiry.js:354` route fixtures mengganti hanya DB boundary in-memory sebelum import; tidak menjalankan config/database. Seluruh route invokes memeriksa placeholder max/bind count dan undefined binds.
- `backend/scripts/test-invoice-delta-confirmation.js:32`: update item ID pindah dari params[22] ke params[23] mengikuti bind baru.
- `backend/scripts/test-invoice-delta-safety.js:89,145`: source contract disesuaikan untuk appended precision dan canonical line DATE persistence.
- `backend/scripts/test-schema-boundary.js:32`: expected registry memasukkan 023.
- `backend/package.json:10-11`: test-expiry ditambahkan di awal `test` dan `test:unit`.
- `test-sales-insert-contract.js` tidak diubah: kontrak INSERT sales_orders tidak berubah, metadata baru berada di sales_items. Controller tetap menjalankannya untuk memeriksa regresi.

## Pemeriksaan controller yang diperlukan

Jalankan dari root repository:

```sh
node backend/scripts/test-expiry.js
npm --prefix backend test
```

Controller telah menjalankan test-expiry sebelum follow-up dan memperoleh 36 pass / 1 fail adjustment. Belum ada hasil execution pasca-follow-up. Bila fixture route perlu disesuaikan, periksa failure aktual (bukan mengubah assertion ED agar menerima output salah).

Periksa SQL terhadap target schema memakai runner resmi dan transaksi rollback setelah backup:

1. Enam kolom/CHECK dan invariansi DATE historis; tidak ada backfill.
2. Month/day stock-in, PO receive, invoice create/edit/delta metadata-only; konfirmasi bind count dengan DB driver sebenarnya.
3. Preview hash berubah bila precision state berubah; stale preview ditolak. Preview/confirm request omitted/null metadata legacy konsisten.
4. Nota edit mempertahankan historical ED bila batch sama; pergantian selected_batch_id mengambil actual DATE+precision walau HPP sama.
5. Loan convert/return serta adjustment return/replacement/quarantine precision terlihat dalam JSON hasil read.

## Concerns dan perilaku yang perlu diketahui

- Semua execute test/build/DB/migration/check-version tetap controller-only. Syntax parsing bukan bukti behavioral test lulus.
- Setelah helper baru, format timestamp malformed yang dahulu lolos prefix parser ED sekarang ditolak 400. Non-ED parser tidak berubah.
- Data lama metadata NULL tetap nullable di DB sampai jalur edit menulis row; normalisasi read/planner memaknai DATE sebagai day. Migration tidak mengubah satu pun tanggal lama.
- Route JSON `SELECT *`/`json_agg(item)` membawa kolom nullable baru as-is; consumer harus menerapkan fallback day ketika metadata NULL. Explicit ED projections telah ditambahkan pada lima route.
- Inventory direct batch identity correction existing memang menyinkron nota terkait. Kini HNA-only/no-op dan batch-number-only tidak menimpa historical ED precision; koreksi ED eksplisit tetap memperbarui pasangan snapshot.
- Nota PUT tetap menggunakan reverse-old/apply-new stock workflow existing. Matching historical ED tidak berbasis HPP; ambiguous duplicate rows membutuhkan item ID atau exact snapshot. Uji payload UI nyata yang tidak membawa ID.
- FEFO multi-batch nota masih memakai snapshot satu batch pertama sesuai model existing. Fitur ini tidak mengubah alokasi multi-batch menjadi beberapa sales lines.
- Precision-only metadata terhadap invoice ownership multi-batch tetap ditolak sebagai mapping ambigu; tidak mengubah semua batch diam-diam.
- Snapshot hash format berubah additive sehingga preview lama sebelum deploy perlu dibuat ulang. Ini diperlukan untuk sensitivitas metadata baru.
