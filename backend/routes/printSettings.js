const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

// ─── Ensure Schema ──────────────────────────────────────────────────────────
const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS print_settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(50) UNIQUE NOT NULL,
        value JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  
  // Default settings
  await pool.query(`
    INSERT INTO print_settings (key, value)
    VALUES ('nota_layout', '{
        "company_name": "CV HABIL SEJAHTERA BERSAMA",
        "address": "Surabaya, Jawa Timur — Indonesia",
        "footer_text": "Dokumen ini dicetak secara otomatis oleh Dashboard CV Habil",
        "show_logo": false
    }')
    ON CONFLICT (key) DO NOTHING
  `);
};
ensureSchema().catch(console.error);

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET all settings
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM print_settings');
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE settings
router.post('/', auth, async (req, res) => {
  const { key, value } = req.body;
  if (!key || !value) return res.status(400).json({ error: 'Key and value required' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO print_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
       RETURNING *`,
      [key, value]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
