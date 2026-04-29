const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');

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
    const hashDirektur = await bcrypt.hash('direktur123', 12);
    const hashAdmin    = await bcrypt.hash('admin123', 12);
    await pool.query(
      `INSERT INTO app_users (username, password, display_name, role) VALUES
        ($1, $2, 'Direktur CV Habil', 'direktur'),
        ($3, $4, 'Admin Toko',        'admin')`,
      ['direktur', hashDirektur, 'admin', hashAdmin]
    );
    console.log('[Auth] Seeded default users: direktur / admin');
  }
};
ensureTable().catch(e => console.error('app_users ensureTable:', e));

// ─── Login ──────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM app_users WHERE username = $1 AND is_active = TRUE',
      [username]
    );

    if (!rows.length) {
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
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '15m' }
    );

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
    res.status(500).json({ error: err.message });
  }
});

// ─── Logout ─────────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;