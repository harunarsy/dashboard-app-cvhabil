# Visual QA Baseline — v1.21.6

Tanggal audit: 2026-06-08

## Scope

Audit manual/browser dilakukan pada light + dark mode untuk:

- `/login`
- `/dashboard`
- `/sales`
- `/invoices`
- `/orders`
- `/inventory`
- `/customers`
- `TasksKanban` di `/dashboard`  
  - Catatan: tidak ada route `/tasks` terpisah di `frontend/src/App.js`, jadi tasks divalidasi lewat section dashboard.
- `/print-settings`

Viewport yang dicek:

- 375 px
- 768 px
- 1280 px Arc/default desktop
- 1440 px desktop lebar

## Ringkasan Hasil

| Area | Coverage | Status | Catatan |
|---|---:|---|---|
| Login | 375 / 768 / 1440 | Pass | Tidak ada clipping, form dan footer tetap terbaca di light/dark. |
| Dashboard | 375 / 768 / 1280 / 1440 | Pass | Sidebar, KPI, chart, task board, dan quick actions tetap fit. |
| Sales | 1440 | Pass | Shell, filter, table, dan empty state tetap readable. |
| Invoices | 1440 | Pass | Panel dan table shell tetap solid dan tidak overflow. |
| Orders | 1440 | Pass | Surface tetap readable, tidak ada efek glass/pink yang mengganggu. |
| Inventory | 375 / 768 / 1440 | Pass | Tidak ada horizontal overflow; table scroll tetap di dalam shell. |
| Customers | 375 / 768 / 1440 | Pass | Search/sort/list state tetap fit di mobile dan desktop. |
| Tasks | 375 / 768 / 1280 / 1440 via Dashboard | Pass | Kanban tetap berada di dalam panel dashboard; tidak ada route terpisah. |
| Print Settings | 375 / 1440 | Pass | Form dan live preview tetap terbaca, tidak ada clipping. |

## Temuan

### P0 broken flow

- Tidak ditemukan.

### P1 unreadable/blocking

- Tidak ditemukan.

### P2 layout/overflow

- Tidak ditemukan.

### P3 polish

- Dashboard menampilkan modal release `Apa yang Baru?` dan onboarding tour pada sesi baru. Keduanya dismissable lewat CTA resmi (`Siap, Gas!` dan `Skip Tour`) dan tidak menghalangi flow setelah ditutup.

## Catatan Verifikasi

- Inventory 375 dark dan Customers 1440 dark sudah dicek visual; keduanya tetap readable dan `scrollWidth` tetap sama dengan viewport.
- `document.documentElement.scrollWidth <= window.innerWidth + 1` terpenuhi pada sampel yang dicek.
- Tidak ada indikasi clipping pada mobile 375 atau pada desktop 1280/1440 untuk shell utama.

