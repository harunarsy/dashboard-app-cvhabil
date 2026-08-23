# Fase 4 — Frontend Modernization

Tanggal: 2026-08-23  
Strategi: staged, reversible, dan parity-gated

## 4A — Vite Parallel

- CRA tetap menjadi jalur default melalui `npm start`, `npm run build`, dan `npm test`.
- Vite tersedia paralel melalui `npm run dev:vite`, `npm run build:vite`, dan `npm run preview:vite`.
- Output CRA tetap `build/`; output Vite dipisah ke `dist/`.
- Bootstrap bersama dipindah ke `main.jsx`; hanya dua source produksi yang benar-benar berisi JSX (`App` dan `AuthContext`) memakai ekstensi `.jsx`. Entry `src/index.js` tetap dipertahankan untuk CRA.
- `REACT_APP_API_URL` tetap didukung pada pilot; `VITE_API_URL` menjadi alias baru.
- Tailwind CDN belum dilepas pada tahap ini. Pemindahan styling dilakukan setelah parity Vite terbukti.

### Gate 4A

| Check | Hasil |
|---|---|
| CRA test | PASS — 7 suite / 16 test |
| CRA production build | PASS |
| Vite build via Node 20/npm | PASS — 2.801 modul, 681 ms |
| Vite build via Bun 1.4 | PASS — 2.801 modul, 662 ms |
| Vite preview root + `/dashboard` SPA fallback | PASS |
| Static manifest served | PASS |

Vite memperingatkan adanya chunk di atas 500 kB, terutama Three.js. Ini pre-existing bundle characteristic dan bukan parity blocker; optimasi chunk dicatat untuk audit performa, bukan dicampur ke migrasi build tool.

## 4B — Vitest

- Test runner default dipindah dari Jest milik `react-scripts` ke Vitest 4 dengan environment JSDOM.
- Lima file test yang berisi JSX memakai ekstensi `.jsx`; dua test utility tanpa JSX tetap `.js`.
- Mock dikonversi ke `vi` dan bentuk ESM eksplisit. Mock Proxy untuk Lucide dihapus agar test merender komponen ikon asli.
- `mockReset` dan `clearMocks` dipertahankan untuk menjaga isolasi antartest.
- `jsdom@29` dipilih karena masih mendukung baseline Node 20.20.2; major terbaru membutuhkan runtime yang lebih baru.

### Gate 4B

| Check | Hasil |
|---|---|
| Vitest / Node 20 | PASS — 7 file / 16 test |
| Vitest / Node 24 | PASS — 7 file / 16 test |
| `bun run test` | PASS — 7 file / 16 test |
| CI test command | `npm test` tanpa flag Jest/CRA |

Setup test menyediakan Web Storage double eksplisit agar JSDOM deterministik ketika script diluncurkan melalui Node maupun Bun. Setup Jest lama belum dihapus karena CRA build masih dipertahankan sampai gate removal 4D.
