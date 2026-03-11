const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

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

// GET all distributors
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT name FROM distributors
      UNION
      SELECT DISTINCT distributor_name AS name FROM invoices WHERE distributor_name IS NOT NULL
      ORDER BY name
    `);
    res.json(result.rows.map(r => ({ name: r.name })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADD new distributor
router.post('/', auth, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  try {
    const result = await pool.query(
      'INSERT INTO distributors (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *',
      [name.trim()]
    );
    res.json({ name: result.rows[0].name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RENAME distributor
router.patch('/', auth, async (req, res) => {
  const { oldName, newName } = req.body;
  if (!oldName?.trim() || !newName?.trim()) return res.status(400).json({ error: 'oldName and newName required' });
  try {
    await pool.query('UPDATE distributors SET name = $1 WHERE name = $2', [newName.trim(), oldName.trim()]);
    res.json({ name: newName.trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE distributor by name
router.delete('/', auth, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  try {
    await pool.query('DELETE FROM distributors WHERE name = $1', [name.trim()]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;