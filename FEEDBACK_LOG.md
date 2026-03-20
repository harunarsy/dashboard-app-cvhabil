# Feedback Log

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
