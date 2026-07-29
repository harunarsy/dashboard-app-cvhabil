// v1.65.1: modul PDF dimuat dinamis (code-splitting). Sesudah deploy versi baru,
// nama berkas chunk berubah — tab yang masih terbuka sejak sebelum deploy meminta
// berkas lama yang sudah tidak ada → "Loading chunk NNN failed". Satu-satunya obat
// adalah muat ulang halaman. Dilakukan otomatis SEKALI saja (dijaga sessionStorage)
// supaya tidak pernah jadi lingkaran reload kalau penyebabnya ternyata bukan deploy.
const RELOAD_FLAG = 'habil_chunk_reloaded';

const isChunkError = (err) => {
  const msg = String(err?.message || '');
  return (
    err?.name === 'ChunkLoadError' ||
    /Loading chunk \S+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  );
};

export async function importWithReload(loader) {
  try {
    const mod = await loader();
    try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* mode privat */ }
    return mod;
  } catch (err) {
    if (!isChunkError(err)) throw err;
    let already = false;
    try { already = sessionStorage.getItem(RELOAD_FLAG) === '1'; } catch { /* mode privat */ }
    if (already) {
      throw new Error('Versi aplikasi baru saja diperbarui, tapi halaman gagal dimuat ulang. Tutup lalu buka kembali halaman ini.');
    }
    try { sessionStorage.setItem(RELOAD_FLAG, '1'); } catch { /* mode privat */ }
    window.location.reload();
    // jangan lanjutkan alur pemanggil — halaman sedang dimuat ulang
    return new Promise(() => {});
  }
}
