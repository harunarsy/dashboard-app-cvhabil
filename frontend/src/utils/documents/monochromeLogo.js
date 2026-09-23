let cachedPromise = null;

// Ambil logo aplikasi lalu ubah ke grayscale via canvas — dokumen resmi
// memakai identitas monokrom (spec §4), dan konversi runtime menghindari
// aset biner baru di repo.
export function getMonochromeLogoDataUrl() {
  if (cachedPromise) return cachedPromise;
  cachedPromise = new Promise((resolve) => {
    if (typeof Image === 'undefined' || typeof document === 'undefined') return resolve(null);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.filter = 'grayscale(1) contrast(1.05)';
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (_) { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = '/logo192.png';
  });
  return cachedPromise;
}
