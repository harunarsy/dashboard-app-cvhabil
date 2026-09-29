# Task2 frontend ED precision

## Checkpoint
- Controller melaporkan fail-first: WA month text gagal; helper/input belum ada. Tes ProductDrawer terblokir pencarian tombol Batch.
- Fixture ProductDrawer diperbaiki: accessible name React tab memisahkan angka dalam span; matcher menerima whitespace dan menunggu tab Batch(1) setelah fetch selesai. Assertion perilaku ED tidak dihapus.
- Helper ED/input native sudah dibuat; input faktur, stock-in, batch edit/add, penerimaan PO, dan retur loan membawa date + precision.
- Snapshot nota edit/draft tidak ditimpa saat hidrasi; pilihan batch/produk baru membawa precision; status ED berlaku sampai tanggal canonical.
- Preview, PDF legacy/v2, inventory/opname/adjustment, WA memakai formatter ED khusus. Tanggal non-ED tetap tanggal penuh.

## Implementasi dan audit
- `frontend/src/utils/expiry.js`: strict kalender month/day/null, ISO timestamp date prefix, leap-year termasuk century, timezone lokal. Exports utama `formatExpiry`, `expiryDate`, `expiryInputValue`; countdown/FEFO memakai `daysUntilExpiry`/`expiryTimestamp`.
- `frontend/src/components/common/ExpiryInput.jsx`: native month/date, selector berlabel `Presisi ED`, default kosong month, legacy nonempty day, nilai month canonical ditampilkan YYYY-MM, perubahan hanya dari interaksi pengguna. Kontrol memakai token/style existing, target minimum 44px dan flex-wrap agar tabel/modal sempit tetap bisa reflow.
- Input/state/payload: `InvoiceList.jsx`, `InventoryDashboard.jsx`, `inventory/BatchFormModal.jsx`, `PurchaseOrderList.jsx`, `LoanList.jsx`. Metadata nullable legacy dipertahankan pada no-op edit; clear mengirim NULL tanggal + precision. PO duplicate receive line membawa precision lewat spread source; invoice PO-prefill membawa precision dari received batch.
- `SalesOrderList.jsx`: snapshot month/day/null tetap utuh saat edit/draft; pilih batch sama tidak refresh snapshot. Produk baru menghapus snapshot stale dan mengambil date+precision dari batch FEFO. FEFO memilih stok >0 dengan DATE hari ini masih berlaku; tidak fallback ke batch expired/out-of-stock. WA preview memakai pasangan snapshot, termasuk NULL historis.
- Status/display: `InventoryDashboard.jsx`, `inventory/ProductDrawer.jsx`, `inventory/OpnameModal.jsx`, sales/loan batch pickers. Countdown invalid NULL, expired hanya days <0. Nearest expiry memakai `nearest_expiry_precision`, sesuai projection backend yang dibaca.
- Invoice delta: baris stok memakai `expired_before/after` + `expired_before/after_precision`; baris faktur memakai `expired_date_before/after` + `expired_date_precision_before/after` dari kontrak backend.
- ED documents: `common/NotaPreview.jsx`, `generateNotaPDF.js`, `documents/salesDocumentModel.js`, `documents/generateSalesDocumentPDF.js`, `waMessage.js`, `generateInventoryPDF.js`, `generateOpnamePDF.js`, `generateAdjustmentPDF.js`. Grouping legacy/v2 menyertakan precision efektif (NULL legacy = day). Opname PDF projection menyertakan precision. Adjustment memakai original/replacement precision masing-masing.
- Formatter umum non-ED tidak diubah. Preview/PDF legacy menggunakan `formatDateOnly` existing untuk tanggal nota/jatuh tempo agar DATE exact tidak bergeser di timezone negatif. Format tetap tanggal lengkap. Golden fixture legacy tanpa precision tetap day; golden tidak ditulis ulang.
- Audit seluruh `frontend/src` menemukan consumers ED aktif di berkas di atas; kecocokan ED di `Dashboard.jsx` adalah changelog historis, bukan reader/writer aktif.

## Tes yang disiapkan
- `utils/expiry.test.js`, `common/ExpiryInput.test.jsx`, `inventory/ProductDrawer.expiry.test.jsx`: kontrak helper/mode, leap/day-boundary/invalid/timezone dan fixture tab yang diperbaiki.
- `utils/waMessage.test.js`, `utils/dateOnly.test.js`: month/day dan preservasi non-ED (assertions lama tetap ada).
- `utils/expiryDocuments.test.jsx`: grouping dan paritas preview/PDF legacy/v2, inventory/opname/adjustment; non-ED tetap exact.
- `components/SalesOrderList.test.jsx`: edit nota mengirim snapshot day/month/NULL historis meskipun batch terkini berubah. Mock hanya boundary API; komponen nyata tetap dirender.

## Bukti dan batas verifikasi
- Inspeksi statis Babel parser + resolusi relative imports pada 25 source/test files setelah edit terakhir: **0 masalah sintaks/import**. Pencarian residual formatter umum pada ED dan expired `days <= 0` di consumers yang diedit: **0 matches**. Lima lokasi input ED memakai `ExpiryInput`. Ini bukan hasil runtime test atau build.
- Worker tidak menjalankan tests/build/DB/.env/git dan tidak mengedit backend. Fail-first di atas berasal dari laporan controller.
- Controller perlu menguji DOM/interaction, request payload, dan PDF. A6 v2 tetap menggunakan kebijakan layout existing yang menyembunyikan metadata batch/ED bila tidak muat; golden/layout tidak diubah.
- Risiko yang perlu dicermati: backend snapshot preservation pada edit batch sama dan NULL historis harus sesuai payload; client menjaga snapshot tetapi writer backend tetap perlu diverifikasi controller. Verifikasi dark/light/mobile selector dilakukan controller.
- Implementasi frontend dan audit statis siap diserahkan ke controller; status runtime tetap **belum diverifikasi**.

## Commands controller
Working directory: `/Users/harunalrasyid/Projects/dashboard-app/frontend`.

```bash
TZ=America/Los_Angeles npm test -- src/utils/expiry.test.js src/components/common/ExpiryInput.test.jsx src/components/inventory/ProductDrawer.expiry.test.jsx src/utils/waMessage.test.js src/utils/dateOnly.test.js src/utils/expiryDocuments.test.jsx src/components/SalesOrderList.test.jsx
TZ=Asia/Jakarta npm test -- src/utils/expiry.test.js src/components/common/ExpiryInput.test.jsx src/components/inventory/ProductDrawer.expiry.test.jsx src/utils/expiryDocuments.test.jsx
npm test
npm run build
```
