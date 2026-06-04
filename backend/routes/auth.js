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

// ─── Auto-create users table with role support ──────────────────────────────
const ensureTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      display_name VARCHAR(100),
      role VARCHAR(20) NOT NULL DEFAULT 'admin',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Seed default users if empty
  const { rowCount } = await pool.query('SELECT 1 FROM app_users LIMIT 1');
  if (!rowCount) {
    const hashDirektur = await bcrypt.hash('<password-dihapus-dari-riwayat>', 12);
    const hashAdmin    = await bcrypt.hash('<password-dihapus-dari-riwayat>', 12);
    await pool.query(
      `INSERT INTO app_users (username, password, display_name, role) VALUES
        ($1, $2, 'Direktur CV Habil', 'direktur'),
        ($3, $4, 'Admin Toko',        'admin')`,
      ['direktur', hashDirektur, 'admin', hashAdmin]
    );
    console.log('[Auth] Seeded default users: direktur / admin');
  }
};
if (process.env.NODE_ENV !== 'test') ensureTable().catch(e => console.error('app_users ensureTable:', e));

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
      { expiresIn: process.env.JWT_EXPIRE || '8h' }
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
