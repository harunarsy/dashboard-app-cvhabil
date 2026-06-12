# Upcoming Features Rules

Dokumen ini wajib dibaca saat setiap agent melakukan version bump atau menambah fitur baru.

## Tujuan

Popup **Changelog & Roadmap** harus jujur: fitur yang sudah shipped tidak boleh tetap muncul sebagai upcoming, dan fitur yang belum matang tidak boleh ditulis terlalu umum.

## Checklist Setiap Rilis

1. Cek `frontend/src/components/Dashboard.jsx` bagian `RELEASES` dan `upcoming`.
2. Jika fitur baru sudah shipped, hapus atau persempit item terkait di `upcoming`.
3. Jika fitur baru hanya sebagian shipped, ubah wording upcoming agar menyebut gap yang masih nyata.
4. Tambahkan 1-3 rekomendasi upcoming baru hanya bila ada dasar dari feedback user, bug report, atau roadmap teknis.
5. Jangan pakai wording marketing kosong seperti "AI canggih" tanpa definisi behavior, data, dan halaman target.

## Status Roadmap Saat Ini

- **Export Excel laporan bulanan profesional**: sebagian export PDF/CSV sudah ada, tetapi rekap bulanan terpadu Excel/PDF untuk Nota, Faktur, PPN, margin, dan inventory belum penuh.
- **Halaman Finance & Karyawan**: belum ada modul khusus payroll, hutang/piutang lanjutan, dan kontrol finance.
- **Predictive Restocking (Mini AI)**: belum ada insight velocity 60 hari + days-left di Inventory.
- **TypeScript Migration**: belum dimulai; ini refactor besar, jangan digabung dengan hotfix transaksi.

## Aturan Implementasi

- Setiap fitur upcoming yang menjadi shipped harus dipindahkan ke `RELEASES[0].changes`.
- Entry lama di `RELEASES` tidak boleh ditimpa.
- Untuk fitur rule-based/statistik, jelaskan sumber data dan batasannya.
- Untuk fitur finansial/stok, tambahkan acceptance test yang membuktikan tidak mengubah HNA/HPP/PPN, FEFO, batch, atau PDF nota.
