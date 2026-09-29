const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');
const { sendServerError } = require('../utils/serverError');
const roleGuard = require('../middleware/roleGuard');

// Metadata legal customer — string kosong dinormalkan ke NULL supaya renderer
// bisa menyembunyikan field yang tidak diisi.
const emptyToNull = (value) => {
  const text = String(value ?? '').trim();
  return text ? text : null;
};

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
    sendServerError(res, err, 'customers');
  }
});

// GET by id
router.get('/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Customer not found' });
    res.json(rows[0]);
  } catch (err) {
    sendServerError(res, err, 'customers');
  }
});

// POST create
router.post('/', auth, async (req, res) => {
  const { name, address, phone, type, npwp, nik, entity_type, billing_address, shipping_address, pic_name, pic_position, work_unit } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nama customer wajib diisi' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO customers (name, address, phone, type, npwp, nik, entity_type, billing_address, shipping_address, pic_name, pic_position, work_unit) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *',
      [name.trim(), address || '', phone || '', type || 'offline', emptyToNull(npwp), emptyToNull(nik), emptyToNull(entity_type), emptyToNull(billing_address), emptyToNull(shipping_address), emptyToNull(pic_name), emptyToNull(pic_position), emptyToNull(work_unit)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    sendServerError(res, err, 'customers');
  }
});

// PUT update
router.put('/:id', auth, async (req, res) => {
  const { name, address, phone, type, npwp, nik, entity_type, billing_address, shipping_address, pic_name, pic_position, work_unit } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nama customer wajib diisi' });
  try {
    const { rows } = await pool.query(
      'UPDATE customers SET name=$1, address=$2, phone=$3, type=$4, npwp=$5, nik=$6, entity_type=$7, billing_address=$8, shipping_address=$9, pic_name=$10, pic_position=$11, work_unit=$12, updated_at=NOW() WHERE id=$13 RETURNING *',
      [name.trim(), address || '', phone || '', type || 'offline', emptyToNull(npwp), emptyToNull(nik), emptyToNull(entity_type), emptyToNull(billing_address), emptyToNull(shipping_address), emptyToNull(pic_name), emptyToNull(pic_position), emptyToNull(work_unit), req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Customer not found' });
    res.json(rows[0]);
  } catch (err) {
    sendServerError(res, err, 'customers');
  }
});

// DELETE
router.delete('/:id', auth, roleGuard('direktur', 'admin'), async (req, res) => {
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
    sendServerError(res, err, 'customers');
  }
});

module.exports = router;
