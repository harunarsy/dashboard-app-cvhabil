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
  // Backend hanya mengizinkan origin port 3000 (port CRA milik v1); Vite pakai
  // 5173, jadi preflight dari localhost:5173 ditolak -> HTTP 500 dan login
  // selalu gagal padahal kredensialnya benar. Diverifikasi dgn curl:
  //   Origin localhost:5173             -> 500
  //   Origin habil-dashboard.vercel.app -> 204
  // Proxy ini membuat browser bicara ke localhost:5173 saja, lalu Vite yang
  // meneruskan ke backend dari sisi server — tidak ada CORS sama sekali.
  // Backend produksi TIDAK diubah.
  server: {
    proxy: {
      '/api': {
        target: 'https://habil-backend.vercel.app',
        changeOrigin: true,
        secure: true,
        // WAJIB: proxy meneruskan header Origin (localhost:5173) apa adanya,
        // dan backend tetap menolaknya -> 500. Backend mengizinkan permintaan
        // TANPA Origin (`if (!origin || allowed.includes(origin))`), dan hop
        // proxy ini memang server-ke-server sehingga Origin tidak relevan.
        // Diverifikasi dgn curl memakai kredensial palsu:
        //   dgn Origin localhost:5173 -> 500 (ditolak CORS)
        //   tanpa Origin             -> 401 (tembus, cuma password salah)
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin');
          });
        },
      },
    },
  },
})
