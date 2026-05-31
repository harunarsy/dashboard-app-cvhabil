# AUDIT REPORT v1.12.2

P0 CRITICAL (1 item)
1. `backend/routes/invoices.js:152-175` — Draft invoice autosave masih global, bukan per user
   Risiko: satu user bisa menimpa draft user lain, dan `clearDraft` sekarang menghapus semua draft sekaligus. Ini bisa bikin data input yang belum disimpan hilang saat dua akun aktif bareng.
   Fix: tag draft dengan `req.user.id` di `draft_data.__meta.owner_id`, lalu scope `GET /draft`, `POST /draft`, dan `DELETE /draft/clear` hanya ke draft milik user aktif. Legacy draft lama bisa di-claim sekali lalu dipindah ke owner baru.

P1 STABILITY (0 items)

P2 PERFORMANCE (1 item)
1. `backend/routes/dashboard.js:87-93` + lookup product master di `backend/routes/sales.js:211`, `backend/routes/purchaseOrders.js:150/200/267`, `backend/routes/invoices.js:254/430`
   Risiko: lookup nama produk pakai case-insensitive scan tanpa index functional, jadi query hot-path makin lambat seiring katalog membesar.
   Fix: tambah index functional di `product_master` untuk `LOWER(TRIM(name))`, lalu samakan predicate lookup ke bentuk normalisasi yang sama.

P3 CLEANLINESS (1 item)
1. `backend/routes/invoices.js:208` — Note audit log overwrite kehilangan konteks
   Risiko: argumen note dikirim sebagai argumen ekstra, jadi masuk `null` dan catatan "Overwrite via POST" tidak pernah tersimpan.
   Fix: kirim note sebagai parameter ke-5 yang benar.

P4 SECURITY (1 item)
1. `backend/routes/settings.js:56-133` — Endpoint settings/counters terbuka tanpa auth
   Risiko: caller anonim bisa baca dan ubah counter nomor faktur/SP serta ambang profitabilitas. Ini membuka jalan ke manipulasi data operasional dan financial settings.
   Fix: tambahkan `auth` untuk seluruh router settings, lalu validasi payload counter (`doc_type`, `last_number`, `is_locked`) sebelum update.

P5 A11y/UX (0 items)
