const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

const ensureTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_catalog (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};
ensureTable().catch(console.error);

// GET all products (catalog + from invoice_items), with limit + q search
router.get('/', auth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 1000, 2000);
    const q = req.query.q?.trim();
    let whereClause = '';
    const params = [];
    let idx = 1;
    if (q) {
      whereClause = `WHERE name ILIKE $${idx}`;
      params.push(`%${q}%`);
      idx++;
    }
    const result = await pool.query(`
      SELECT name FROM product_catalog
      ${whereClause ? whereClause.replace('name', 'product_catalog.name') : ''}
      UNION
      SELECT DISTINCT product_name AS name FROM invoice_items WHERE product_name IS NOT NULL AND product_name != ''
      ${whereClause ? `AND product_name ILIKE $${idx - 1}` : ''}
      ORDER BY name
      LIMIT $${idx}
    `, q ? [`%${q}%`, limit] : [limit]);
    res.json(result.rows.map(r => ({ name: r.name })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADD new product
router.post('/', auth, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  try {
    const result = await pool.query(
      'INSERT INTO product_catalog (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *',
      [name.trim()]
    );
    res.json({ name: result.rows[0].name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE product by name
router.delete('/', auth, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  try {
    await pool.query('DELETE FROM product_catalog WHERE name = $1', [name.trim()]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH — rename product (catalog + product_master + invoice_items)
router.patch('/', auth, async (req, res) => {
  const { oldName, newName } = req.body;
  if (!oldName || !newName) return res.status(400).json({ error: 'oldName and newName required' });
  try {
    await pool.query('UPDATE product_catalog SET name=$1 WHERE name=$2', [newName, oldName]);
    await pool.query('UPDATE product_master SET name=$1 WHERE name=$2', [newName, oldName]);
    await pool.query('UPDATE invoice_items SET product_name=$1 WHERE product_name=$2', [newName, oldName]);
    res.json({ success: true, oldName, newName });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
