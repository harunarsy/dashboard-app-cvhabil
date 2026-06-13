const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

router.use(auth);

const toPositiveInt = (value, fallback, max) => {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
};

router.get('/customer/:id', async (req, res) => {
  const customerId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(customerId) || customerId <= 0) {
    return res.status(400).json({ error: 'customer id tidak valid' });
  }

  const limit = toPositiveInt(req.query.limit, 6, 12);

  try {
    const { rows } = await pool.query(
      `
        WITH customer_sales AS (
          SELECT id, sale_date
          FROM sales_orders
          WHERE is_deleted = false
            AND status = 'final'
            AND customer_id = $1
        ),
        item_history AS (
          SELECT
            si.product_name,
            COUNT(DISTINCT cs.id) AS order_count,
            COALESCE(SUM(COALESCE(si.qty_in_unit, si.qty, 0)), 0) AS qty_user_total,
            COALESCE(SUM(COALESCE(si.qty, 0)), 0) AS qty_base_total,
            MAX(cs.sale_date) AS last_order_date,
            (ARRAY_AGG(si.unit ORDER BY cs.sale_date DESC, si.id DESC))[1] AS last_unit,
            (ARRAY_AGG(si.unit_price ORDER BY cs.sale_date DESC, si.id DESC))[1] AS last_unit_price,
            AVG(NULLIF(si.unit_price, 0)) AS avg_unit_price
          FROM customer_sales cs
          JOIN sales_items si ON si.sales_order_id = cs.id
          WHERE NULLIF(TRIM(COALESCE(si.product_name, '')), '') IS NOT NULL
          GROUP BY si.product_name
        )
        SELECT
          ih.product_name,
          ih.order_count,
          ih.qty_user_total,
          ih.qty_base_total,
          ih.last_order_date,
          ih.last_unit,
          ih.last_unit_price,
          ih.avg_unit_price,
          pm.id AS product_id,
          pm.code AS product_code,
          pm.base_unit,
          pm.pack_unit,
          pm.pack_size
        FROM item_history ih
        LEFT JOIN LATERAL (
          SELECT id, code, base_unit, pack_unit, pack_size
          FROM product_master
          WHERE is_active = true
            AND LOWER(TRIM(name)) = LOWER(TRIM(ih.product_name))
          ORDER BY updated_at DESC NULLS LAST, id DESC
          LIMIT 1
        ) pm ON true
        ORDER BY ih.order_count DESC, ih.last_order_date DESC NULLS LAST, ih.product_name ASC
        LIMIT $2
      `,
      [customerId, limit],
    );

    res.json({
      customer_id: customerId,
      usually_buys: rows.map((row) => ({
        product_name: row.product_name,
        product_id: row.product_id,
        product_code: row.product_code,
        order_count: Number(row.order_count) || 0,
        qty_user_total: Number(row.qty_user_total) || 0,
        qty_base_total: Number(row.qty_base_total) || 0,
        last_order_date: row.last_order_date,
        last_unit: row.last_unit,
        last_unit_price: Number(row.last_unit_price) || 0,
        avg_unit_price: Number(row.avg_unit_price) || 0,
        base_unit: row.base_unit,
        pack_unit: row.pack_unit,
        pack_size: Number(row.pack_size) || null,
      })),
    });
  } catch (e) {
    console.error('[insights.customer] failed:', e.message);
    res.status(500).json({ error: 'Gagal memuat insight customer' });
  }
});

module.exports = router;
