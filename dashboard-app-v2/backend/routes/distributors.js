const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

// Ensure distributors table exists
const ensureTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS distributors (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};
ensureTable().catch(console.error);

// GET all distributors (gabungan dari tabel distributors + invoices)
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT name FROM distributors
      UNION
      SELECT DISTINCT distributor_name AS name FROM invoices WHERE distributor_name IS NOT NULL
      ORDER BY name
    `);
    const distributors = result.rows.map(row => ({ name: row.name }));
    res.json(distributors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADD new distributor - simpan ke tabel distributors
router.post('/', auth, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });

  try {
    const result = await pool.query(
      'INSERT INTO distributors (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *',
      [name.trim()]
    );
    res.json({ name: result.rows[0].name, message: 'Distributor added successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;