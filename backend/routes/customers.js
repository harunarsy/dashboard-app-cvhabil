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
  // Index for search-by-name
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_customers_name_lc ON customers (LOWER(name))`);
  // Sync sequence to MAX(id) to prevent duplicate key after data migration
  await pool.query(`
    SELECT setval('customers_id_seq', COALESCE((SELECT MAX(id) FROM customers), 0) + 1, false)
  `);
};
if (process.env.NODE_ENV !== 'test') ensureTable().catch(e => console.error('customers ensureTable:', e));

// GET all (with aggregate sales metadata + limit + q search)
router.get('/', auth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 1000, 2000);
    const q = req.query.q?.trim();
    let customerFilter = '';
    const params = [];
    let idx = 1;
    if (q) {
      // Search by name or phone using LOWER for index match
      customerFilter = `WHERE (LOWER(c.name) LIKE LOWER($${idx}) OR c.phone ILIKE $${idx})`;
      params.push(`%${q}%`);
      idx++;
    }
    const { rows } = await pool.query(`
      SELECT
        c.*,
        COALESCE(agg.total_orders, 0)::int AS total_orders,
        COALESCE(agg.total_spent, 0)::numeric AS total_spent,
        agg.last_sale_date
      FROM customers c
      LEFT JOIN (
        SELECT
          COALESCE(customer_id, NULL) AS customer_id,
          customer_name,
          COUNT(*) AS total_orders,
          SUM(total) AS total_spent,
          MAX(sale_date) AS last_sale_date
        FROM sales_orders
        WHERE COALESCE(is_deleted, FALSE) = FALSE
        GROUP BY customer_id, customer_name
      ) agg ON (agg.customer_id = c.id OR (agg.customer_id IS NULL AND agg.customer_name = c.name))
      ${customerFilter}
      ORDER BY c.name ASC
      LIMIT $${idx}
    `, [...params, limit]);
    // Karena 1 customer bisa punya 2 baris (matched by id DAN matched by name fallback), merge:
    const merged = {};
    for (const r of rows) {
      if (!merged[r.id]) merged[r.id] = { ...r, total_orders: 0, total_spent: 0, last_sale_date: null };
      merged[r.id].total_orders += parseInt(r.total_orders) || 0;
      merged[r.id].total_spent = (parseFloat(merged[r.id].total_spent) || 0) + (parseFloat(r.total_spent) || 0);
      if (r.last_sale_date && (!merged[r.id].last_sale_date || new Date(r.last_sale_date) > new Date(merged[r.id].last_sale_date))) {
        merged[r.id].last_sale_date = r.last_sale_date;
      }
    }
    res.json(Object.values(merged).sort((a, b) => a.name.localeCompare(b.name)));
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
    const { rows: activeOrders } = await pool.query(
      "SELECT 1 FROM sales_orders WHERE customer_name = (SELECT name FROM customers WHERE id = $1) AND payment_status != 'paid' LIMIT 1",
      [req.params.id]
    );
    if (activeOrders.length) {
      return res.status(400).json({ error: 'Customer masih punya nota yang belum lunas. Selesaikan pembayaran terlebih dahulu.' });
    }
    const { rowCount } = await pool.query('DELETE FROM customers WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Customer not found' });
    res.json({ message: 'Customer deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
