# ED fix wave: checkpoint test-first

## Status

- Scope: ketiga Important findings di `2026-09-29-expiry-review.md`.
- Spec, review dan kedua handoff reports sudah dibaca; penyebab F1-F3 ditelusuri ke source existing.
- Tes checkpoint sudah ditulis. **Belum menjalankan test/build; belum ada RED/GREEN terverifikasi.**
- Tidak ada perubahan implementation route atau komponen pada wave ini. Implementasi menunggu controller mengonfirmasi kegagalan yang diharapkan, sesuai instruksi owner.
- Tidak mengakses DB/.env, tidak melakukan operasi git write, tidak memakai subagent.

## Berkas checkpoint

- `backend/test/fixtures/expiry-po.cjs`: row PO/batch in-memory; projection fixture hanya mengembalikan kolom yang dipilih query. `readReceivedPo` menjalankan GET handler PO asli dengan DB boundary diganti sebelum route import, lalu memulihkan module cache. Tidak menjalankan `config/database`.
- `backend/scripts/test-expiry.js`: GET PO dan inventory response, serta PUT sales ownership/identity/history regressions. Existing route harness menerima request overrides untuk params/query GET; tetap mengecek bind count dan undefined params.
- `frontend/src/components/InvoiceList.expiry.test.jsx`: route PO asli → API boundary → komponen InvoiceList asli → input/payload faktur. Tidak mengedit source InvoiceList.
- `frontend/src/components/SalesOrderList.test.jsx`: komponen asli, API boundary mocks, interaksi batch/produk/HPP, assertions atas payload edit.

## Command controller untuk checkpoint RED

Dari root `/Users/harunalrasyid/Projects/dashboard-app`, jalankan keduanya dan kirim output lengkap beserta exit code:

```sh
node backend/scripts/test-expiry.js
```

```sh
TZ=Asia/Jakarta npm --prefix frontend test -- src/components/InvoiceList.expiry.test.jsx src/components/SalesOrderList.test.jsx
```

Suite backend memakai fixture DB in-memory; frontend PO test memakai reader yang sama, bukan API fixture siap pakai yang sudah membawa precision. Tidak perlu DB/migration. Command hanya disediakan untuk controller, belum dieksekusi pada wave ini.

## Targeted fixture cases dan expected RED

| Kasus | Fixture/hasil wajib | Kegagalan yang diharapkan sebelum fix |
| --- | --- | --- |
| F1 PO month projection | Batch 101 `2028-02-29/month`; GET PO `received_batches` membawa pasangan yang sama | Precision tidak ada di SELECT/mapping response |
| F1 inventory available batches | GET `/batches-by-product/10` mengembalikan `2028-02-29/month` | Precision tidak ada di explicit SELECT |
| F1 PO → faktur | SP 321 dibaca route asli; input month `2028-02`; payload canonical `2028-02-29/month` | Form menjadi date/day, nilai input `2028-02-29` |
| F2 legacy no-id, inferred ID | Old item 17 tanpa batch ID, `B-101`, `2027-05-12/NULL` atau `2027-06-30/month`; picker infer 101, intent false; DB batch `2028-01-31/month` | PUT menulis ED/precision current batch, bukan snapshot oldItem |
| F2 legacy tanpa inferred ID/intent | Snapshot asal unik tanpa ID; nomor sama, ED DB berbeda | Control compatibility: historical ED tetap exact |
| F3 two same-product lines | Item 17 batch101; item18 batch102 old `2027-06-30/month`; DB batch102 `2028-02-29/month`; hanya item17 pindah ke102 | Legacy no-ID matching mencuri snapshot18 untuk line1 dan overwrite line2 |
| F3 explicit IDs + reordered rows | IDs numerik/string, baris18 dulu lalu17; ID mengalahkan posisi | Control: line18 historis, line17 actual selection |
| F3 mixed IDs | Line1 tanpa ID, line2 ID18 eksplisit | Fallback tidak boleh mengonsumsi history yang dimiliki explicit ID berikutnya |
| F3 safe legacy/no intent | Dua baris tanpa IDs/flag, jumlah+posisi stabil, line1 ke102 | Batch tujuan tidak boleh dipakai untuk menentukan oldItem |
| F3 count changed ambiguous | Dua old rows, satu new row tanpa ID dengan snapshot tujuan baru | Wajib400; bukan menebak oldItem berdasarkan batch tujuan |
| F3 unique original snapshot | Hapus line1 via client tanpa ID, line2 mempertahankan snapshot asal unik | Control compatibility:200, ED line2 tetap historis |
| Ownership | ID999 dari sale lain/tidak ada, `17junk`,0, ID18 milik produk lain, ID17 duplikat | Wajib400 tanpa COMMIT; current helper jatuh ke fallback |
| Actual selection | Legacy tanpa ID+intent true memilih102, payload ED lama; juga client tanpa ID/flag | Control: snapshot baru berasal DB102 `2028-02-29/month` |
| FE identity/intent | Dua rows kirim IDs17/18; hanya line1 intent true | IDs dan flag hilang dari payload existing |
| FE same/HPP/clear | Batch sama/HPP-only flag false+ED lama; clear picker flag true+EDNULL | Flag belum ditrack |
| FE product auto-selection | Ganti produk ke Produk Baru→batch103 `2028-03-31/month` | Old sales item ID harus dilepas; intent true harus terbawa |
| FE legacy effective precision | Dua batches sama nomor+DATE;101month,102day; old precisionNULL | Hydration existing memilih101month alih-alih102day |
| FE ambiguous legacy lookup | Dua batches bernomor sama, tidak ada exact original date | Existing `.find` memilih arbitrer101; harus synthetic/unresolved, tanpa change intent |

Sebagian compatibility/control tests memang dapat PASS pada baseline. Checkpoint valid jika failure utama sesuai kehilangan precision, identitas/intent atau snapshot yang salah. Import error, selector tidak ditemukan, unexpected query atau fixture/bind error bukan bukti RED yang diinginkan; perbaiki tes sebelum implementasi.

## Rencana setelah controller RED

- [ ] F1: tambahkan precision pada SELECT+mapping PO dan seluruh explicit available-batch projections inventory dalam scope.
- [ ] F2/F3: retain sales_items.id di edit state/payload; hanya ID tervalidasi milik sale+produk asal dapat memilih oldItem. Reserve explicit IDs sebelum fallback; ID invalid/duplikat tidak boleh fallback.
- [ ] Untuk omitted ID, pakai posisi yang benar-benar stabil atau identitas snapshot asal unik; jangan mencocokkan oldItem berdasarkan batch tujuan baru. Ambiguity ditolak400.
- [ ] Pisahkan picker hydration dari intent pengguna. `selected_batch_changed=false` pada edit/hydration/HPP-only/same selection; true hanya product/batch changes, termasuk clear dan auto-selection yang berasal perubahan pengguna. Lepas ID old item jika produk berubah.
- [ ] Audit jalur existing: openEdit, draft hydration, prepareProductItem/addInsightProduct, product auto-FEFO, manual picker, clear picker, HPP refresh dan handleSave. Hindari restructure di luar scope.
- [ ] No-op menulis ED exact+raw precision oldItem; new actual selection menulis DATE+precision current DB. Tidak mengonsumsi histori baris lain.
- [ ] Controller menjalankan GREEN targeted lalu suite relevan. Reports/log baru memuat hasil run bila controller memberikan bukti.

## Bukti statis

Keempat berkas tes/fixture berhasil diparse dengan `vm.Script`/Babel parser tanpa evaluasi module. Ini hanya pemeriksaan sintaks, bukan execution atau bukti behavioral correctness. Checkpoint perlu hasil run controller sebelum code fix.
