const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');

const LOGIN_LOCK_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILED = 5;
const failedLogins = new Map();

const normalizeUsername = (username) => String(username || '').trim();
const getLoginKey = (username) => normalizeUsername(username).toLowerCase();

const isLoginLocked = (key) => {
  const state = failedLogins.get(key);
  if (!state) return false;
  if (state.lockedUntil > Date.now()) return true;
  failedLogins.delete(key);
  return false;
};

const recordLoginFailure = (key) => {
  const state = failedLogins.get(key) || { count: 0, lockedUntil: 0 };
  const count = state.count + 1;
  failedLogins.set(key, {
    count: count >= LOGIN_MAX_FAILED ? 0 : count,
    lockedUntil: count >= LOGIN_MAX_FAILED ? Date.now() + LOGIN_LOCK_WINDOW_MS : 0,
  });
};

const clearLoginFailure = (key) => {
  failedLogins.delete(key);
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

  if (isLoginLocked(loginKey)) {
    return res.status(429).json({ error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM app_users WHERE username = $1 AND is_active = TRUE',
      [normalizedUsername]
    );

    if (!rows.length) {
      recordLoginFailure(loginKey);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = rows[0];
    // Dual-mode: try bcrypt first, fallback to plaintext for existing unhashed passwords
    let passwordValid = false;
    const stored = user.password;
    if (stored.startsWith('$2')) {
      passwordValid = await bcrypt.compare(password, stored);
    } else {
      // Plaintext — validate then re-hash for migration
      passwordValid = stored === password;
      if (passwordValid) {
        const hashed = await bcrypt.hash(password, 12);
        await pool.query('UPDATE app_users SET password = $1 WHERE id = $2', [hashed, user.id]);
      }
    }
    if (!passwordValid) {
      recordLoginFailure(loginKey);
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

    clearLoginFailure(loginKey);

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
