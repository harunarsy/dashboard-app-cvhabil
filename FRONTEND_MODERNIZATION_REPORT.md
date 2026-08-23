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
