// Task 16 (spec §10): lazy pdf.js loader — pdfjs-dist must stay out of the main bundle.
// The worker is imported with `?url` so Vite emits it as a separate asset.
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let pdfjsPromise = null;

export function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist')
      .then((lib) => {
        lib.GlobalWorkerOptions.workerSrc = workerSrc;
        return lib;
      })
      .catch((err) => {
        // Jangan racuni cache: "Coba lagi" di panel preview harus bisa memuat ulang.
        pdfjsPromise = null;
        throw err;
      });
  }
  return pdfjsPromise;
}
