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

// PATCH — rename distributor
router.patch('/', auth, async (req, res) => {
  const { oldName, newName } = req.body;
  if (!oldName || !newName) return res.status(400).json({ error: 'oldName and newName required' });
  try {
    // Update distributor master list
    await pool.query(`UPDATE distributor_master SET name=$1 WHERE name=$2`, [newName, oldName]);
    // Update all invoices referencing old name
    await pool.query(`UPDATE invoices SET distributor_name=$1 WHERE distributor_name=$2`, [newName, oldName]);
    res.json({ success: true, oldName, newName });
  } catch (err) { res.status(500).json({ error: err.message }); }
});