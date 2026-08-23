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

## 4C — Tailwind 4 Lokal

- Vite memakai `@tailwindcss/postcss` dan `@import "tailwindcss"`; utility CSS dibangkitkan saat build, bukan saat runtime.
- Scan source tidak menemukan utility prefix yang dibentuk lewat interpolasi dinamis.
- Universal reset dipindah ke `@layer base` agar utility spacing Tailwind 4 tidak kalah terhadap CSS unlayered.
- Import `@fontsource` dipindah ke bootstrap JavaScript supaya aset font tetap di-resolve dan di-hash oleh bundler; tidak ada URL font unresolved pada build final.
- `mt-2` yang redundant pada tombol login dihapus. Tailwind CDN lama dan Tailwind 4 berbeda dalam implementasi `space-y-5`; perubahan ini menghilangkan double-gap tanpa mengubah geometri akhir.
- Entry Vite tidak lagi memuat `cdn.tailwindcss.com`.
- CRA 5 terbukti mengabaikan config PostCSS eksternal: build selesai tetapi utility lokal tidak terbentuk. Karena itu `public/index.html` mempertahankan CDN hanya sebagai fallback sampai CRA dihapus pada 4D.

### Gate 4C

| Check | Hasil |
|---|---|
| Vite local Tailwind build | PASS — utility dan responsive variant terdeteksi |
| Desktop visual parity vs CDN | PASS — geometri dan computed style elemen kunci sama |
| Mobile 375×812 | PASS — 0 overflow; input 16 px; tombol 48 px |
| Dark mode | PASS — token surface/text berubah sesuai tema |
| Vitest | PASS — 7 file / 16 test |
| CRA fallback | PASS dengan CDN sementara; local PostCSS unsupported |

## 4D — CRA Removal

- `react-scripts`, `web-vitals`, Autoprefixer lama, config ESLint CRA, Browserslist CRA, template `public/index.html`, dan setup Jest lama dihapus.
- `npm start`/`npm run dev` menjalankan Vite; `npm run build` menghasilkan `dist/`; `npm run preview` menyajikan build Vite.
- CI hanya menjalankan satu build frontend default dan tidak lagi menduplikasi jalur CRA/Vite.
- PWA manifest memakai nama Habil SuperApp, `start_url`/`scope` root, dan tidak lagi membawa branding sample CRA.
- `VITE_API_URL` menjadi nama environment utama; `REACT_APP_API_URL` tetap diterima sebagai alias deployment lama melalui config Vite.
- Tidak ada deployment config di repository yang mengunci output ke `build/`; Vercel dapat mendeteksi Vite dan output `dist/`.
- Penghapusan CRA membuang 1.190 package dari install tree. Temuan audit npm turun dari 43 menjadi 6 tanpa menjalankan auto-fix berisiko.

### Gate 4D

| Check | Hasil |
|---|---|
| Cold `npm ci` | PASS — 318 package installed |
| Vitest / Node 20 | PASS — 7 file / 16 test |
| Vitest / Node 24 | PASS — 7 file / 16 test |
| `bun run test` | PASS — 7 file / 16 test |
| Default `npm run build` | PASS — Vite output `dist/` |
| Build / Node 24 dan Bun | PASS — output hash parity |
| Default `npm start` | PASS — root dan SPA deep-link |
| PWA manifest | PASS — Habil branding dan root scope |
| Active Tailwind CDN references | 0 |

## 4E — Impeccable UI Hardening

- Audit teknis lima dimensi menghasilkan skor **14/20 (Good)**; detail evidence dan debt tersisa berada di `UI_UX_AUDIT.md`.
- Form login kini memiliki label programmatik, hubungan error yang dapat dibaca screen reader, initial focus pada field invalid, dan focus ring CSS valid.
- Bahasa dokumen dan microcopy login diselaraskan ke Bahasa Indonesia.
- Modal laporan pada shell kini memiliki dialog semantics, initial focus, Escape close, focus trap, dan focus restore.
- Navigasi aktif memakai `aria-current`; item nonaktif memakai native `disabled`.
- Lima bounce easing dan side-tab sidebar dibersihkan. Tujuh layout transition serta satu side-tab faktur dicatat sebagai debt terpisah karena perbaikannya membutuhkan perubahan layout yang lebih luas.

### Gate 4E

| Check | Hasil |
|---|---|
| Impeccable static detector | 14 → 8 verified debt findings |
| Browser detector desktop/mobile login | PASS — 0 finding |
| Mobile 390×844 | PASS — 0 overflow; input 16 px; target 44–48 px |
| Dark-mode contrast | PASS — 11.99:1 sampai 16.96:1 pada copy utama |
| Keyboard/error semantics | PASS — label, alert linkage, focus, modal Escape/trap |
| Vitest | PASS — 8 file / 19 test |
| Node 20.20.2 / Node 24.19.0 / Bun 1.4 | PASS — test dan production build |
