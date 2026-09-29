# ED bulan/tahun dan tanggal lengkap

## Persetujuan dan tujuan
Owner mengizinkan 29 Sep 2026: implementasi menyeluruh, perubahan database bila perlu, commit lokal dan push produksi/main Vercel tanpa menunggu konfirmasi tambahan. ED tanggal lengkap existing wajib tetap utuh. Desain ini melaksanakan permintaan tersebut.

## Kontrak
- Dua presisi: `month` dan `day`. Kosong tetap `NULL`, tidak mengarang tanggal.
- Input `YYYY-MM` dipetakan backend menjadi DATE hari terakhir bulan kalender, termasuk Februari kabisat, dengan precision `month`.
- Input `YYYY-MM-DD` atau timestamp legacy mempertahankan tanggal sumber dengan precision `day` jika metadata tidak tersedia. DATE legacy tidak dibulatkan atau di-backfill.
- `month` bersama DATE canonical harus tetap dibaca sebagai bulan. Precision invalid, tanggal mustahil dan pasangan month/DATE bukan akhir bulan ditolak 400.
- Nama metadata: `expired_date_precision` untuk inventory/invoice; `expired_date_snapshot_precision` untuk sales/loan; `original_expired_date_precision` dan `replacement_expired_date_precision` untuk adjustment.
- Metadata nullable additive. Nilai NULL pada data lama dibaca sebagai `day` bila tanggal ada, tanpa menulis ulang data historis.
- ED berlaku sampai hari ED termasuk hari terakhir bulan. Expired mulai hari sesudahnya; FEFO tetap berdasarkan DATE canonical. Tanggal non-ED tidak berubah.

## Input dan dokumen
Komponen input reusable menawarkan Bulan/tahun dan Tanggal lengkap. Membuka edit memakai presisi tersimpan, tanggal lama tetap day. Pergantian mode hanya aksi pengguna eksplisit. Payload membawa DATE/input + precision secara konsisten di faktur, stock-in, edit batch, penerimaan PO dan retur pinjaman batch baru.

Seluruh daftar, picker, preview nota, PDF legacy/v2, PDF inventory/opname/adjustment dan WA menggunakan formatter ED khusus: month tampil `Sep 2027`, day tampil tanggal penuh. Tanggal faktur/jatuh tempo menggunakan formatter tanggal biasa. Grouping dokumen menyertakan precision agar day akhir bulan tidak tergabung dengan month. Snapshot ED dan precision disalin bersama; membuka edit/draft tidak mengganti snapshot historis bila batch tidak diganti.

## Backend dan delta
Normalizer ED khusus dipakai setiap writer. Delta invoice membawa precision dalam normalisasi, comparison, hash preview, before/after, write item/batch, dan audit JSON. Identitas batch tetap ID, tidak merge otomatis berdasarkan bulan. Lookup legacy tanggal lengkap dipertahankan. Loan conversion, retur/replacement, batch karantina membawa metadata.

## Database dan rilis
Migration additive berikutnya pada registry existing menambah enam kolom precision pada lima tabel, tanpa pembulatan/backfill DATE existing. Backup sebelum migration; transaksi migration dan verifikasi kolom serta invariansi tanggal lama. Deploy hanya sesudah verifikasi regresi dan review. Rilis `v1.67.22-stable` dari baseline `4e97c70`, sync versi memakai checker. Stage hanya berkas fitur dan log, hindari user work existing.

## Verifikasi
Test kontrak month/day/null/invalid/leap-year; no-op edit legacy day; precision-only delta; snapshot loan→sales/adjustment; input mode dengan nilai legacy dan month; paritas PDF/preview/WA; batas expired hari ini/esok; date non-ED tetap exact. Jalankan FE test/build, backend test, checker dan diff-check. Verifikasi DB transaksi rollback pada penulisan month/day, lalu produksi health/version/assets setelah push.
