# Upcoming Features Rules

Dokumen ini wajib dibaca saat setiap agent melakukan version bump atau menambah fitur baru.

## Tujuan

Popup **Changelog & Roadmap** harus jujur: fitur yang sudah shipped tidak boleh tetap muncul sebagai upcoming, dan fitur yang belum matang tidak boleh ditulis terlalu umum.

## Checklist Setiap Rilis

1. Cek `frontend/src/components/Dashboard.jsx` bagian `RELEASES` dan `upcoming`.
2. Jika fitur baru sudah shipped, hapus atau persempit item terkait di `upcoming`.
3. Jika fitur baru hanya sebagian shipped, ubah wording upcoming agar menyebut gap yang masih nyata.
4. Setiap rilis, AI menambah 1-3 rekomendasi upcoming baru hasil observasi codebase/feedback/bug report. Jika `upcoming` menipis karena banyak yang shipped, WAJIB diisi ulang — jangan biarkan kosong.
5. Jangan pakai wording marketing kosong seperti "AI canggih" tanpa definisi behavior, data, dan halaman target.

## Status Roadmap Saat Ini (per v1.34.0 — 15 Juni 2026)

SHIPPED (sudah di RELEASES, JANGAN munculkan lagi sebagai upcoming):

- ✅ **Export Excel laporan bulanan** — shipped v1.29.0.
- ✅ **Finance hutang/piutang** — shipped v1.29.0 (payroll karyawan masih belum).
- ✅ **Saran Restock (insight stok rule-based)** — live di Inventory (velocity blend 30d×0.7 + 31–90d×0.3 + days-left; akurasi diverifikasi vs data nyata di v1.34.0).
- ✅ **Estimasi berat paket nota** — shipped v1.31.0.

UPCOMING aktif (sinkron dengan array `upcoming` di Dashboard.jsx):

- **Notifikasi otomatis stok menipis** (high) — pakai data velocity restock yang sudah ada.
- **Ongkir otomatis dari berat paket** (medium) — lanjutan fitur estimasi berat.
- **Scanner Barcode/QR** (medium) — percepat input stok & nota.
- **Penggajian (Payroll) Karyawan** (low).
- **TypeScript Migration** (low) — refactor besar, jangan digabung hotfix transaksi.

## Aturan Implementasi

- Setiap fitur upcoming yang menjadi shipped harus dipindahkan ke `RELEASES[0].changes`.
- Entry lama di `RELEASES` tidak boleh ditimpa.
- Untuk fitur rule-based/statistik, jelaskan sumber data dan batasannya.
- Untuk fitur finansial/stok, tambahkan acceptance test yang membuktikan tidak mengubah HNA/HPP/PPN, FEFO, batch, atau PDF nota.
