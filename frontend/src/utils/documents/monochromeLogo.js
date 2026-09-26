let cachedPromise = null;

// Mark H resmi dari Figma tetap biru sebagai satu-satunya aksen identitas.
// Rasterisasi runtime diperlukan karena jsPDF menerima PNG/JPEG, bukan SVG.
export function getMonochromeLogoDataUrl() {
  if (cachedPromise) return cachedPromise;
  cachedPromise = new Promise((resolve) => {
    if (typeof Image === 'undefined' || typeof document === 'undefined') return resolve(null);
    let settled = false;
    const done = (value) => {
      if (!settled) {
        settled = true;
        if (!value) cachedPromise = null; // fallback teks saja; preview berikutnya dapat mencoba ulang
        resolve(value);
      }
    };
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
        ctx.drawImage(img, 0, 0);
        done(canvas.toDataURL('image/png'));
      } catch (_) { done(null); }
    };
    img.onerror = () => { clearTimeout(timer); done(null); };
    img.src = '/habil-mark.svg';
  });
  return cachedPromise;
}
