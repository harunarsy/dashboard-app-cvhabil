const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');

const LOGIN_MAX_FAILED = 5;

const normalizeUsername = (username) => String(username || '').trim();
const getLoginKey = (username) => normalizeUsername(username).toLowerCase();

// v1.67.24: lockout dipindah dari memori proses ke tabel login_attempts supaya
// tetap berlaku lintas instance serverless & tidak hilang saat cold start.
// Semua helper dibuat "best effort": kalau tabel belum ada (migration belum jalan),
// login TIDAK boleh ikut gagal — hanya proteksi tambahannya yang tidak aktif.
const isLoginLocked = async (key) => {
  if (!key) return false;
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM login_attempts
       WHERE login_key = $1 AND locked_until IS NOT NULL AND locked_until > NOW()`,
      [key]
    );
    return rows.length > 0;
  } catch (err) {
    console.error('[auth] cek lockout gagal (diabaikan):', err.message);
    return false;
  }
};

const recordLoginFailure = async (key) => {
  if (!key) return;
  try {
    await pool.query(
      `INSERT INTO login_attempts (login_key, failed_count, first_failed_at, updated_at)
       VALUES ($1, 1, NOW(), NOW())
       ON CONFLICT (login_key) DO UPDATE SET
         failed_count = CASE
           WHEN login_attempts.first_failed_at < NOW() - INTERVAL '15 minutes' THEN 1
           ELSE login_attempts.failed_count + 1 END,
         first_failed_at = CASE
           WHEN login_attempts.first_failed_at < NOW() - INTERVAL '15 minutes' THEN NOW()
           ELSE login_attempts.first_failed_at END,
         updated_at = NOW()`,
      [key]
    );
    await pool.query(
      `UPDATE login_attempts
       SET locked_until = NOW() + INTERVAL '15 minutes'
       WHERE login_key = $1 AND failed_count >= $2
         AND first_failed_at >= NOW() - INTERVAL '15 minutes'
         AND (locked_until IS NULL OR locked_until < NOW())`,
      [key, LOGIN_MAX_FAILED]
    );
  } catch (err) {
    console.error('[auth] catat kegagalan login gagal (diabaikan):', err.message);
  }
};

const clearLoginFailure = async (key) => {
  if (!key) return;
  try {
    await pool.query('DELETE FROM login_attempts WHERE login_key = $1', [key]);
    // v1.67.24: buang baris basi (mis. percobaan atas username yang tidak ada) supaya
    // tabel tidak menumpuk. Hanya jalan saat ada login sukses — biaya sangat kecil.
    await pool.query(`DELETE FROM login_attempts WHERE updated_at < NOW() - INTERVAL '1 day'`);
  } catch (err) {
    console.error('[auth] reset catatan login gagal (diabaikan):', err.message);
  }
};

const getServerError = (err) => (
  process.env.NODE_ENV === 'production' ? 'Terjadi kesalahan server' : err.message
);

// ─── Login ──────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const normalizedUsername = normalizeUsername(username);
  const loginKey = getLoginKey(username);

  if (!normalizedUsername || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  if (await isLoginLocked(loginKey)) {
    return res.status(429).json({ error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM app_users WHERE username = $1 AND is_active = TRUE',
      [normalizedUsername]
    );

    if (!rows.length) {
      await recordLoginFailure(loginKey);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = rows[0];
    // v1.67.24: hash plaintext legacy tidak lagi diterima — tidak boleh ada jalur
    // login tanpa bcrypt (perbandingan plaintext juga tidak konstan waktunya).
    const stored = String(user.password || '');
    if (!stored.startsWith('$2')) {
      console.error(`[auth] akun "${user.username}" menyimpan password non-bcrypt — login ditolak, password perlu di-reset`);
      await recordLoginFailure(loginKey);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const passwordValid = await bcrypt.compare(password, stored);
    if (!passwordValid) {
      await recordLoginFailure(loginKey);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'habil-dev-secret');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is required');
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      jwtSecret,
      // Sesi login 4 jam (keputusan owner, 19 Jun 2026) — operator gak cepat ke-logout
      // saat lagi nginput. Override via env JWT_EXPIRE kalau perlu diperketat lagi.
      { expiresIn: process.env.JWT_EXPIRE || '4h' }
    );

    await clearLoginFailure(loginKey);

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        role: user.role,
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: getServerError(err) });
  }
});

// ─── Logout ─────────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
