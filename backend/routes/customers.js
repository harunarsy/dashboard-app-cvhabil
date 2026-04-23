const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

// ─── Auto-create table ──────────────────────────────────────────────────────
const ensureTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      address TEXT,
      phone VARCHAR(30),
      type VARCHAR(30) DEFAULT 'offline',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Sync sequence to MAX(id) to prevent duplicate key after data migration
  await pool.query(`
    SELECT setval('customers_id_seq', COALESCE((SELECT MAX(id) FROM customers), 0) + 1, false)
  `);
};
ensureTable().catch(e => console.error('customers ensureTable:', e));

// GET all
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM customers ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET by id
router.get('/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Customer not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create
router.post('/', auth, async (req, res) => {
  const { name, address, phone, type } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nama customer wajib diisi' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO customers (name, address, phone, type) VALUES ($1, $2, $3, $4) RETURNING *',
      [name.trim(), address || '', phone || '', type || 'offline']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update
router.put('/:id', auth, async (req, res) => {
  const { name, address, phone, type } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nama customer wajib diisi' });
  try {
    const { rows } = await pool.query(
      'UPDATE customers SET name=$1, address=$2, phone=$3, type=$4, updated_at=NOW() WHERE id=$5 RETURNING *',
      [name.trim(), address || '', phone || '', type || 'offline', req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Customer not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE
router.delete('/:id', auth, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM customers WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Customer not found' });
    res.json({ message: 'Customer deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
