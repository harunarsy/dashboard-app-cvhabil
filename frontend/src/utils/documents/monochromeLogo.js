let cachedPromise = null;

// Ambil logo aplikasi lalu ubah ke grayscale via canvas — dokumen resmi
// memakai identitas monokrom (spec §4), dan konversi runtime menghindari
// aset biner baru di repo.
export function getMonochromeLogoDataUrl() {
  if (cachedPromise) return cachedPromise;
  cachedPromise = new Promise((resolve) => {
    if (typeof Image === 'undefined' || typeof document === 'undefined') return resolve(null);
    let settled = false;
    const done = (value) => { if (!settled) { settled = true; resolve(value); } };
    // jsdom tidak pernah memanggil onload/onerror — timeout menjaga promise tidak menggantung.
    const timer = setTimeout(() => done(null), 1500);
    const img = new Image();
    img.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.filter = 'grayscale(1) contrast(1.05)';
        ctx.drawImage(img, 0, 0);
        done(canvas.toDataURL('image/png'));
      } catch (_) { done(null); }
    };
    img.onerror = () => { clearTimeout(timer); done(null); };
    img.src = '/logo192.png';
  });
  return cachedPromise;
}
