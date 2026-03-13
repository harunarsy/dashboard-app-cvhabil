const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

const ensureTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS distributors (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL,
      short_code VARCHAR(50),
      salesman_name VARCHAR(150),
      salesman_phone VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE distributors ADD COLUMN IF NOT EXISTS short_code VARCHAR(50);
    ALTER TABLE distributors ADD COLUMN IF NOT EXISTS salesman_name VARCHAR(150);
    ALTER TABLE distributors ADD COLUMN IF NOT EXISTS salesman_phone VARCHAR(50);
    
    CREATE TABLE IF NOT EXISTS product_distributors (
      id SERIAL PRIMARY KEY,
      product_id INT NOT NULL,
      distributor_id INT NOT NULL REFERENCES distributors(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(product_id, distributor_id)
    );
    
    -- Auto-migrate old distributors from invoices to the distributors table
    INSERT INTO distributors (name)
    SELECT DISTINCT distributor_name FROM invoices WHERE distributor_name IS NOT NULL
    ON CONFLICT (name) DO NOTHING;
  `);
};
ensureTable().catch(console.error);

// GET all distributors
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM distributors ORDER BY name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADD new distributor
router.post('/', auth, async (req, res) => {
  const { name, short_code, salesman_name, salesman_phone } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  try {
    const result = await pool.query(
      `INSERT INTO distributors (name, short_code, salesman_name, salesman_phone) 
       VALUES ($1, $2, $3, $4) 
       ON CONFLICT (name) DO UPDATE SET 
         short_code = EXCLUDED.short_code,
         salesman_name = EXCLUDED.salesman_name,
         salesman_phone = EXCLUDED.salesman_phone
       RETURNING *`,
      [name.trim(), short_code || null, salesman_name || null, salesman_phone || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE distributor by name
router.delete('/', auth, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  try {
    // Check if distributor is used in invoices or purchase orders
    const { rowCount: invoiceCount } = await pool.query(
      'SELECT 1 FROM invoices WHERE distributor_name = $1 AND deleted_at IS NULL LIMIT 1', [name.trim()]
    );
    const { rowCount: poCount } = await pool.query(
      'SELECT 1 FROM purchase_orders WHERE distributor_name = $1 AND is_deleted = FALSE LIMIT 1', [name.trim()]
    );
    if (invoiceCount > 0 || poCount > 0) {
      return res.status(400).json({ error: `Distributor "${name}" masih dipakai di transaksi. Tidak bisa dihapus.` });
    }
    await pool.query('DELETE FROM distributors WHERE name = $1', [name.trim()]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH — rename distributor
router.patch('/', auth, async (req, res) => {
  const { oldName, newName } = req.body;
  if (!oldName?.trim() || !newName?.trim()) return res.status(400).json({ error: 'oldName dan newName wajib diisi' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Update distributor master list
    const { rows } = await client.query(
      `UPDATE distributors 
       SET name = $1, short_code = $3, salesman_name = $4, salesman_phone = $5 
       WHERE name = $2 RETURNING *`, 
      [newName.trim(), oldName.trim(), req.body.short_code || null, req.body.salesman_name || null, req.body.salesman_phone || null]
    );
    // Cascade: update all invoices referencing old name
    await client.query('UPDATE invoices SET distributor_name = $1 WHERE distributor_name = $2', [newName.trim(), oldName.trim()]);
    // Cascade: update all purchase orders referencing old name
    await client.query('UPDATE purchase_orders SET distributor_name = $1 WHERE distributor_name = $2', [newName.trim(), oldName.trim()]);
    await client.query('COMMIT');
    res.json({ success: true, oldName: oldName.trim(), newName: newName.trim(), data: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

module.exports = router;