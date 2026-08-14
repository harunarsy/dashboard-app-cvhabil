import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // @habil/core dipasang via file:../core (symlink) — Vite tidak mem-pre-bundle
  // paket linked secara default, padahal dist-nya CommonJS. Tanpa include ini,
  // dev server (ESM native) gagal resolve named export ("does not provide an
  // export named ..."). Build produksi (rollup) tidak kena masalah ini.
  optimizeDeps: {
    include: ['@habil/core'],
  },
})
