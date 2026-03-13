const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

// ─── Auto-create tables ─────────────────────────────────────────────────────
const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_orders (
      id SERIAL PRIMARY KEY,
      order_number VARCHAR(50) UNIQUE NOT NULL,
      customer_id INT,
      customer_name VARCHAR(150) NOT NULL,
      customer_address TEXT,
      sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
      total DECIMAL(15,2) DEFAULT 0,
      payment_method VARCHAR(20) DEFAULT 'Tunai',
      payment_details TEXT,
      status VARCHAR(20) DEFAULT 'draft',
      pdf_status VARCHAR(20) DEFAULT 'belum_dicetak',
      notes TEXT,
      is_deleted BOOLEAN DEFAULT FALSE,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sales_items (
      id SERIAL PRIMARY KEY,
      sales_order_id INT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
      product_name VARCHAR(255) NOT NULL,
      qty INT NOT NULL DEFAULT 1,
      unit VARCHAR(30) DEFAULT 'pcs',
      unit_price DECIMAL(15,2) NOT NULL DEFAULT 0,
      subtotal DECIMAL(15,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_sales_orders_date ON sales_orders(sale_date DESC);
    CREATE INDEX IF NOT EXISTS idx_sales_orders_customer ON sales_orders(customer_name);
    CREATE INDEX IF NOT EXISTS idx_sales_items_order ON sales_items(sales_order_id);
  `);
};
ensureSchema().catch(e => console.error('sales ensureSchema:', e));

const generateOrderNumber = async (client) => {
  const { rows } = await client.query(
    "UPDATE document_counters SET last_number = last_number + 1 WHERE doc_type = 'NOTA' RETURNING prefix, last_number"
  );
  if (!rows.length) {
    // Fallback if counter missing
    const today = new Date();
    const prefix = `NT${String(today.getFullYear()).slice(-2)}${String(today.getMonth() + 1).padStart(2, '0')}`;
    return `${prefix}0001`;
  }
  return `${rows[0].prefix}${rows[0].last_number.toString().padStart(4, '0')}`;
};

// GET all (excluding soft-deleted)
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, COALESCE(json_agg(i ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
       FROM sales_orders s
       LEFT JOIN sales_items i ON i.sales_order_id = s.id
       WHERE s.is_deleted = FALSE
       GROUP BY s.id
       ORDER BY s.sale_date DESC, s.id DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single
router.get('/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, COALESCE(json_agg(i ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
       FROM sales_orders s
       LEFT JOIN sales_items i ON i.sales_order_id = s.id
       WHERE s.id = $1
       GROUP BY s.id`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Nota not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create
router.post('/', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { customer_id, customer_name, customer_address, sale_date, notes, items, payment_method, payment_details, order_number: manualOrderNumber } = req.body;
    if (!customer_name?.trim()) return res.status(400).json({ error: 'Nama customer wajib diisi' });
    if (!items?.length) return res.status(400).json({ error: 'Minimal 1 produk diperlukan' });

    const orderNumber = manualOrderNumber ? manualOrderNumber : await generateOrderNumber(client);
    let total = 0;
    items.forEach(it => { total += (it.qty || 1) * (it.unit_price || 0); });

    const { rows } = await client.query(
      `INSERT INTO sales_orders (order_number, customer_id, customer_name, customer_address, sale_date, total, notes, payment_method, payment_details, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [orderNumber, customer_id || null, customer_name.trim(), customer_address || '', sale_date || new Date(), total, notes || '', payment_method || 'Tunai', payment_details || '', req.user?.id || null]
    );
    const order = rows[0];

    for (const it of items) {
      const subtotal = (it.qty || 1) * (it.unit_price || 0);
      await client.query(
        `INSERT INTO sales_items (sales_order_id, product_name, qty, unit, unit_price, subtotal)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [order.id, it.product_name, it.qty || 1, it.unit || 'pcs', it.unit_price || 0, subtotal]
      );
    }

    await client.query('COMMIT');

    // ─── Auto Stock-Out (FEFO): Nota Penjualan → Inventory ──────────────
    // Only deduct stock when order is created (draft orders don't deduct)
    for (const it of items) {
      // Find product in product_master by name
      const { rows: [product] } = await pool.query(
        'SELECT id FROM product_master WHERE LOWER(name) = LOWER($1) AND is_active = TRUE LIMIT 1',
        [it.product_name]
      );
      if (product && (it.qty || 0) > 0) {
        // FEFO: deduct from batches ordered by expired_date ASC
        const { rows: batches } = await pool.query(
          `SELECT * FROM inventory_batches WHERE product_id = $1 AND qty_current > 0
           ORDER BY expired_date ASC NULLS LAST`, [product.id]
        );
        let remaining = it.qty || 0;
        for (const batch of batches) {
          if (remaining <= 0) break;
          const deduct = Math.min(batch.qty_current, remaining);
          await pool.query('UPDATE inventory_batches SET qty_current = qty_current - $1 WHERE id = $2', [deduct, batch.id]);
          await pool.query(
            `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, reference_id, notes)
             VALUES ($1, $2, 'out', $3, 'nota', $4, $5)`,
            [product.id, batch.id, deduct, order.id, `Stok keluar FEFO dari nota ${orderNumber}`]
          );
          remaining -= deduct;
        }
      }
    }

    // Return the full order with items
    const result = await pool.query(
      `SELECT s.*, COALESCE(json_agg(i ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
       FROM sales_orders s LEFT JOIN sales_items i ON i.sales_order_id = s.id
       WHERE s.id = $1 GROUP BY s.id`, [order.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT update
router.put('/:id', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { customer_id, customer_name, customer_address, sale_date, notes, items, status, payment_method, payment_details } = req.body;
    if (!customer_name?.trim()) return res.status(400).json({ error: 'Nama customer wajib diisi' });
    if (!items?.length) return res.status(400).json({ error: 'Minimal 1 produk diperlukan' });

    let total = 0;
    items.forEach(it => { total += (it.qty || 1) * (it.unit_price || 0); });

    const { rowCount } = await client.query(
      `UPDATE sales_orders SET customer_id=$1, customer_name=$2, customer_address=$3, sale_date=$4, total=$5, notes=$6, status=$7, payment_method=$8, payment_details=$9, updated_at=NOW()
       WHERE id=$10 AND is_deleted=FALSE`,
      [customer_id || null, customer_name.trim(), customer_address || '', sale_date || new Date(), total, notes || '', status || 'draft', payment_method || 'Tunai', payment_details || '', req.params.id]
    );
    if (!rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Nota not found' }); }

    // Replace items
    await client.query('DELETE FROM sales_items WHERE sales_order_id = $1', [req.params.id]);
    for (const it of items) {
      const subtotal = (it.qty || 1) * (it.unit_price || 0);
      await client.query(
        `INSERT INTO sales_items (sales_order_id, product_name, qty, unit, unit_price, subtotal)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.params.id, it.product_name, it.qty || 1, it.unit || 'pcs', it.unit_price || 0, subtotal]
      );
    }

    await client.query('COMMIT');
    const result = await pool.query(
      `SELECT s.*, COALESCE(json_agg(i ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
       FROM sales_orders s LEFT JOIN sales_items i ON i.sales_order_id = s.id
       WHERE s.id = $1 GROUP BY s.id`, [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE (soft)
router.delete('/:id', auth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'UPDATE sales_orders SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1 AND is_deleted = FALSE', [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Nota not found' });
    res.json({ message: 'Nota deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH pdf status
router.patch('/:id/pdf-status', auth, async (req, res) => {
  const { pdf_status } = req.body;
  if (!pdf_status) return res.status(400).json({ error: 'pdf_status required' });
  try {
    const { rowCount } = await pool.query(
      'UPDATE sales_orders SET pdf_status = $1, updated_at = NOW() WHERE id = $2 AND is_deleted = FALSE',
      [pdf_status, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Nota not found' });
    res.json({ message: 'Status PDF diperbarui' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
