const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

// ─── Ensure Schema ──────────────────────────────────────────────────────────
const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS print_settings (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR(50) UNIQUE NOT NULL,
        setting_value JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  
  // Default settings
  await pool.query(`
    INSERT INTO print_settings (setting_key, setting_value)
    VALUES ('nota_layout', '{
        "company_name": "CV HABIL SEJAHTERA BERSAMA",
        "address": "Surabaya, Jawa Timur — Indonesia",
        "footer_text": "Dokumen ini dicetak secara otomatis oleh Dashboard CV Habil",
        "show_logo": false
    }')
    ON CONFLICT (setting_key) DO NOTHING
  `);
};
ensureSchema().catch(console.error);

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET all settings — normalize setting_value (handle string from DB/driver)
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT setting_key, setting_value FROM print_settings');
    const settings = {};
    rows.forEach(r => {
      let val = r.setting_value;
      if (typeof val === 'string') {
        try { val = JSON.parse(val); } catch (_) { /* keep string */ }
      }
      settings[r.setting_key] = val;
    });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE single setting
router.post('/', auth, async (req, res) => {
  const { key, value } = req.body;
  if (!key || !value) return res.status(400).json({ error: 'Key and value required' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO print_settings (setting_key, setting_value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = NOW()
       RETURNING *`,
      [key, value]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// BULK UPDATE settings
router.post('/bulk', auth, async (req, res) => {
  const settings = req.body;
  if (!settings || typeof settings !== 'object') return res.status(400).json({ error: 'Settings object required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const results = [];
    for (const [key, value] of Object.entries(settings)) {
      const jsonVal = typeof value === 'string' ? value : JSON.stringify(value);
      const { rows } = await client.query(
        `INSERT INTO print_settings (setting_key, setting_value, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2::jsonb, updated_at = NOW()
         RETURNING *`,
        [key, jsonVal]
      );
      results.push(rows[0]);
    }
    
    await client.query('COMMIT');
    res.json({ success: true, count: results.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
