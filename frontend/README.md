# Habil SuperApp Frontend

React 19 frontend dengan Vite 8, Tailwind CSS 4 lokal, React Router 7, dan Vitest 4.

## Persyaratan

- Node.js 20.20.2 atau Node.js 24
- npm 10.x (default) atau Bun 1.4 sebagai package-manager pilot

## Perintah

```bash
npm install
npm run dev       # Vite dev server, default http://localhost:3000
npm test          # Vitest sekali jalan
npm run test:watch
npm run build     # output production: dist/
npm run preview
```

`npm start` tetap menjadi alias untuk Vite dev server.

## Environment

Gunakan `VITE_API_URL` untuk override endpoint API:

```bash
VITE_API_URL=http://localhost:5001/api
```

`REACT_APP_API_URL` masih diterima sementara sebagai alias kompatibilitas deployment lama. Tanpa override, localhost memakai `http://localhost:5001/api` dan deployment memakai `/api` pada origin yang sama.

## Build dan Styling

- Entry HTML: `index.html`
- Entry React: `src/index.js` → `src/main.jsx`
- Vite config: `vite.config.mjs`
- Tailwind/PostCSS: `postcss.config.mjs` dan `src/index.css`
- Output production: `dist/`

Tailwind dibangun lokal; frontend tidak membutuhkan script CDN.
