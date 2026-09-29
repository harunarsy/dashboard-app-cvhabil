/**
 * Jawaban error server yang aman (v1.67.24).
 *
 * Kenapa ada: sebelumnya ~147 titik memakai `res.status(500).json({ error: err.message })`
 * sehingga pesan mentah dari Postgres (nama tabel/kolom/constraint) terkirim ke klien,
 * termasuk ke endpoint publik. Helper ini:
 *   - meneruskan pesan error yang DISENGAJA (punya `statusCode` < 500 — validasi/bisnis)
 *     supaya operator tetap dapat instruksi jelas;
 *   - untuk error tak terduga (500) hanya mencatat detail ke log server, dan mengirim
 *     pesan generik saat production.
 */

const isProduction = () => (process.env.NODE_ENV || 'development') === 'production';

const GENERIC_MESSAGE = 'Terjadi kesalahan server';

// Konflik lock (deadlock / lock_timeout): bukan error internal, tapi juga bukan salah
// user. Dijawab 409 dengan pesan ramah supaya operator tahu harus mencoba lagi.
const LOCK_ERROR_CODES = new Set(['40P01', '55P03']);
const LOCK_MESSAGE = 'Data sedang dipakai proses lain. Coba lagi sebentar.';

// Deteksi error "internal" yang pesannya tidak boleh sampai ke klien:
// - error PostgreSQL (punya kode 5 karakter seperti 42P01 / 23505 / 22P02)
// - error pemrograman Node (TypeError/RangeError/ReferenceError)
const looksInternal = (err) => {
  if (!err) return false;
  const code = String(err.code || '');
  if (/^[0-9A-Z]{5}$/.test(code)) return true;
  return err instanceof TypeError || err instanceof RangeError || err instanceof ReferenceError;
};

// v1.67.24: log terstruktur (JSON satu baris) — mudah dicari & dialertkan di log
// Vercel. Tanpa ini, setelah pesan error di-mask ke user, jejaknya sulit ditelusuri.
const logServerError = (label, err) => {
  let payload;
  try {
    payload = JSON.stringify({
      level: 'error',
      label,
      message: String(err?.message ?? err ?? 'unknown'),
      code: err?.code ?? null,
      stack: String(err?.stack || '').split('\n').slice(0, 5).join(' | ') || null,
    });
  } catch {
    payload = JSON.stringify({ level: 'error', label, message: 'unserializable error' });
  }
  console.error(payload);
};

const sendServerError = (res, err, label = 'server', fallbackStatus = 500) => {
  const explicit = Number(err?.statusCode);
  const hasExplicit = Number.isFinite(explicit) && explicit >= 400 && explicit < 600;
  const internal = looksInternal(err);

  if (LOCK_ERROR_CODES.has(String(err?.code || ''))) {
    logServerError(`${label}:lock`, err);
    return res.status(409).json({ error: LOCK_MESSAGE });
  }

  // Error yang disengaja (validasi/bisnis) → pesannya memang untuk operator.
  if (hasExplicit && explicit < 500) {
    return res.status(explicit).json({ error: String(err?.message || 'Permintaan tidak valid') });
  }

  if (internal) {
    logServerError(label, err);
    return res.status(500).json({
      error: isProduction() ? GENERIC_MESSAGE : String(err?.message || GENERIC_MESSAGE),
    });
  }

  const status = hasExplicit ? explicit : fallbackStatus;
  if (status < 500) {
    return res.status(status).json({ error: String(err?.message || 'Permintaan tidak valid') });
  }

  logServerError(label, err);
  return res.status(status).json({
    error: isProduction() ? GENERIC_MESSAGE : String(err?.message || GENERIC_MESSAGE),
  });
};

module.exports = { sendServerError, logServerError, GENERIC_MESSAGE };
