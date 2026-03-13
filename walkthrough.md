# Log Capaian Bisnis HABIL SUPERAPP (v1.3.5-stable)

Dokumen ini mencatat peluncuran fitur PIC pada Tugas, optimasi pool database, dan sinkronisasi versi global.

---

## 1. Optimalisasi & Penugasan Tugas (v1.3.3) 🚀

- **Database Pool Consolidation**: Penyelesaian isu "MaxClients reached" dengan menyatukan seluruh koneksi database ke pool terpusat.
- **PIC Assignment**: Setiap tugas sekarang dapat ditautkan ke penanggung jawab (PIC: Harun/Fivin/Admin) menggunakan dropdown `react-select`.
- **UI Consistency**: Sinkronisasi total label versi global dan pembersihan sisa-sisa string v1.2.6 yang tertinggal.
- **Sidebar Universal**: Nama menu "Pengaturan Cetak" diperpendek menjadi "Pengaturan" untuk kemudahan navigasi.

## 2. Papan Kanban Pro (v1.3.2) 📋

- **Fitur**: Papan Kanban interaktif untuk memantau tugas operasional (Backlog, To Do, Doing, Done).
- **Desain**: Menggunakan Apple Human Interface Guidelines (Glassmorphism, backdrop-blur, rounded-2xl) untuk tampilan premium.
- **Fungsionalitas Pro**:
  - **Task Edit Modal**: Klik kartu untuk mengubah detail tugas.
  - **History Log**: Pantau jejak audit (kapan status berubah/tugas dibuat) di dalam modal detail.
  - **Trash Drop-Zone**: Area "Move to Trash" di bagian bawah untuk menghapus tugas secara aman.
  - **Scrollable Stacks**: Layout kolom yang rapi (max 3 kartu terlihat) dengan scroll internal.
  - **Backend Support**: API terintegrasi dengan tabel `task_history` dan fitur soft-delete (`is_deleted`).

## 2. Standardisasi Engineering (IDE Audit) 🛠️

- **IDE Extensions**: Pemasangan ESLint, markdownlint, Git History, dan SQLTools sebagai standar wajib (Protocol #5).
- **Sanitasi Kode**: Pembersihan skrip migrasi sementara dan perbaikan bug data type pada kolom tanggal (`due_date`).
- **Dokumentasi**: Pembersihan 'Shadow Metadata' dan sinkronisasi format `SUPERAPP_BRAIN.md`.

## 3. Keamanan & Stabilitas 🔒

- **Secret Leak Protection**: Audit global koneksi database dan pengalihan seluruh kredensial ke variabel lingkungan (Environment Variables).
- **SSL Flexibility**: Backend sekarang secara otomatis mendeteksi lingkungan (Local vs Vercel) untuk mode koneksi database yang tepat.

---

## 📸 Bukti Hasil (Verification)

- **Akses Cepat**: Layout baru satu baris yang ringkas di Dashboard.
- **Catatan Developer**: Dipindahkan ke *popup modal* dengan efek blur yang diperhalus (transparian).
- **Kanban Board**: Muncul otomatis di Dashboard utama dengan dukungan *drag-and-drop*.

![Refined Dashboard Recording](file:///Users/harunalrasyid/.gemini/antigravity/brain/cf4549cf-c7c0-4e03-8824-ccbe87b98d86/dashboard_ui_refinement_verify_1773424122717.webp)
*Dokumentasi visual UI Dashboard yang telah diperhalus dan fitur Kanban.*

---

## Status Terakhir

- **Versi**:### v1.3.3-standard · 2026-03-14
- **Status**: Stable
- **Feat**: Database Connection Pool & Kanban PIC
- **Log**: Consolidated DB pools to fix "MaxClients" error. Added PIC field to tasks. Global version sync.

### v1.3.2-standard · 2026-03-14
- **Status**: Stable
- **Fix**: Month Filter Synchronization
- **Log**: Unified `rekapMonth` and `selectedMonth` to ensure UI consistency.

### v1.3.0-standard · 2026-03-14
- **Status**: Stable
- **Refinement**: Invoice HPP & Audit Metadata
- **Log**: HPP Robustness, "Input Date" Visibility, Back-Population Migration.

#### Verifikasi Visual
![Invoice Metadata & HPP Verify](/Users/harunalrasyid/.gemini/antigravity/brain/cf4549cf-c7c0-4e03-8824-ccbe87b98d86/invoice_hpp_metadata_verification_1773426576827.png)

````carousel
![Video Rekaman Verifikasi UI](/Users/harunalrasyid/.gemini/antigravity/brain/cf4549cf-c7c0-4e03-8824-ccbe87b98d86/invoice_v130_verify_1773426451775.webp)
````
