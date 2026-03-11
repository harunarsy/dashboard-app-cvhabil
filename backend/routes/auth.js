const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
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
    await pool.query(`
      INSERT INTO app_users (username, password, display_name, role) VALUES
        ('direktur', 'direktur123', 'Direktur CV Habil', 'direktur'),
        ('admin',    'admin123',    'Admin Toko',        'admin')
    `);
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

    if (!rows.length || rows[0].password !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
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