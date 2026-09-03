const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');
const tax = require('../utils/tax');

const fetchStatsData = async (monthQuery) => {
  // v1.43.0: HPP gross-up pakai rate per-batch yang di-snapshot (unit_hpp_ppn_rate),
  // bukan rate global. NULL → fallback PPN_RATE (stok lama 11%).
  const unitHppCostSql = tax.hppSqlForSalesItem('si');

  // v1.58.0: dashboard bisa difilter per bulan (?month=YYYY-MM). Absen/invalid -> bulan berjalan.
  // monthParam divalidasi regex (hanya digit+strip) -> aman disisipkan sbg literal SQL.
  const monthParam = /^\d{4}-\d{2}$/.test(String(monthQuery || "")) ? monthQuery : null;
  const monthStart = monthParam ? `DATE '${monthParam}-01'` : "DATE_TRUNC('month', CURRENT_DATE)";
  const monthEnd = `(${monthStart} + INTERVAL '1 month')`;
  const prevMonthStart = `(${monthStart} - INTERVAL '1 month')`;

  // v1.22.3 (AUDIT-CA-02): semua query independen → jalan paralel via Promise.all.
  const qTotalPenjualan = pool.query(`
    SELECT COALESCE(SUM(total), 0) AS total_penjualan
    FROM sales_orders
    WHERE is_deleted = false
      AND status = 'final'
      AND DATE_TRUNC('month', sale_date) = ${monthStart}
  `);

  const qPrevPenjualan = pool.query(`
    SELECT COALESCE(SUM(total), 0) AS prev_total_penjualan
    FROM sales_orders
    WHERE is_deleted = false
      AND status = 'final'
      AND sale_date >= ${prevMonthStart}
      AND sale_date < ${monthStart}
  `);

  const qTotalLaba = pool.query(`
    SELECT COALESCE(SUM(COALESCE(si.qty_in_unit, si.qty, 0) * (COALESCE(si.unit_price, 0) - ${unitHppCostSql})), 0)
      + COALESCE((
          SELECT SUM(COALESCE(so2.ongkir, 0) - COALESCE(so2.ongkir_cost, 0)
            - CASE WHEN so2.payment_fee_mode = 'absorb' THEN COALESCE(so2.payment_fee, 0) ELSE 0 END)
          FROM sales_orders so2
          WHERE so2.is_deleted = false AND so2.payment_status = 'paid' AND so2.status = 'final'
            AND DATE_TRUNC('month', so2.sale_date) = ${monthStart}
        ), 0) AS total_laba
    FROM sales_orders so
    JOIN sales_items si ON si.sales_order_id = so.id
    WHERE so.is_deleted = false
      AND so.payment_status = 'paid'
      AND so.status = 'final'
      AND DATE_TRUNC('month', so.sale_date) = ${monthStart}
  `);

  const qPrevLaba = pool.query(`
    SELECT COALESCE(SUM(COALESCE(si.qty_in_unit, si.qty, 0) * (COALESCE(si.unit_price, 0) - ${unitHppCostSql})), 0)
      + COALESCE((
          SELECT SUM(COALESCE(so2.ongkir, 0) - COALESCE(so2.ongkir_cost, 0)
            - CASE WHEN so2.payment_fee_mode = 'absorb' THEN COALESCE(so2.payment_fee, 0) ELSE 0 END)
          FROM sales_orders so2
          WHERE so2.is_deleted = false AND so2.payment_status = 'paid' AND so2.status = 'final'
            AND so2.sale_date >= ${prevMonthStart}
            AND so2.sale_date < ${monthStart}
        ), 0) AS prev_total_laba
    FROM sales_orders so
    JOIN sales_items si ON si.sales_order_id = so.id
    WHERE so.is_deleted = false
      AND so.payment_status = 'paid'
      AND so.status = 'final'
      AND so.sale_date >= ${prevMonthStart}
      AND so.sale_date < ${monthStart}
  `);

  const qMarginChannel = pool.query(`
    WITH scoped_items AS (
      SELECT
        CASE
          WHEN LOWER(TRIM(COALESCE(so.channel, ''))) IN ('online', 'offline') THEN LOWER(TRIM(so.channel))
          WHEN so.channel IS NULL OR TRIM(so.channel) = '' THEN 'offline'
          ELSE LOWER(TRIM(so.channel))
        END AS channel,
        so.id AS order_id,
        COALESCE(si.qty_in_unit, si.qty, 0) AS qty,
        COALESCE(si.unit_price, 0) AS unit_price,
        COALESCE(si.unit_hpp, 0) AS unit_hpp,
        ${unitHppCostSql} AS unit_hpp_cost
      FROM sales_orders so
      JOIN sales_items si ON si.sales_order_id = so.id
      WHERE so.is_deleted = false
        AND so.payment_status = 'paid'
        AND so.status = 'final'
        AND DATE_TRUNC('month', so.sale_date) = ${monthStart}
    )
    SELECT
      channel,
      COUNT(DISTINCT order_id) AS order_count,
      COALESCE(SUM(qty * unit_price), 0) AS revenue,
      COALESCE(SUM(qty * (unit_price - unit_hpp_cost)), 0) AS margin,
      CASE
        WHEN COALESCE(SUM(qty * unit_price), 0) > 0
        THEN COALESCE(SUM(qty * (unit_price - unit_hpp_cost)), 0) / SUM(qty * unit_price) * 100
        ELSE 0
      END AS margin_pct
    FROM scoped_items
    GROUP BY channel
    ORDER BY margin DESC
  `);

  const qTopCategory = pool.query(`
    SELECT
      COALESCE(NULLIF(TRIM(pm.category), ''), '(tanpa kategori)') AS category,
      COUNT(DISTINCT so.id) AS order_count,
      COALESCE(SUM(si.qty), 0) AS qty,
      COALESCE(SUM(COALESCE(si.qty_in_unit, si.qty, 0) * COALESCE(si.unit_price, 0)), 0) AS revenue,
      COALESCE(SUM(COALESCE(si.qty_in_unit, si.qty, 0) * (COALESCE(si.unit_price, 0) - ${unitHppCostSql})), 0) AS margin,
      CASE
        WHEN COALESCE(SUM(COALESCE(si.qty_in_unit, si.qty, 0) * COALESCE(si.unit_price, 0)), 0) > 0
        THEN COALESCE(SUM(COALESCE(si.qty_in_unit, si.qty, 0) * (COALESCE(si.unit_price, 0) - ${unitHppCostSql})), 0)
          / SUM(COALESCE(si.qty_in_unit, si.qty, 0) * COALESCE(si.unit_price, 0)) * 100
        ELSE 0
      END AS margin_pct
    FROM sales_orders so
    JOIN sales_items si ON si.sales_order_id = so.id
    LEFT JOIN LATERAL (
      SELECT category
      FROM product_master
      WHERE LOWER(TRIM(name)) = LOWER(TRIM(si.product_name))
      ORDER BY is_active DESC, updated_at DESC NULLS LAST, id DESC
      LIMIT 1
    ) pm ON TRUE
    WHERE so.is_deleted = false
      AND so.payment_status = 'paid'
      AND so.status = 'final'
      AND DATE_TRUNC('month', so.sale_date) = ${monthStart}
    GROUP BY COALESCE(NULLIF(TRIM(pm.category), ''), '(tanpa kategori)')
    ORDER BY margin DESC
    LIMIT 5
  `);

  const qTopCustomer = pool.query(`
    SELECT
      COALESCE(NULLIF(TRIM(customer_name), ''), '(tanpa customer)') AS customer_name,
      COUNT(*) AS nota_count,
      COALESCE(SUM(total), 0) AS spending
    FROM sales_orders
    WHERE is_deleted = false
      AND payment_status = 'paid'
      AND status = 'final'
      AND DATE_TRUNC('month', sale_date) = ${monthStart}
      AND customer_name IS NOT NULL
      AND TRIM(customer_name) != ''
    GROUP BY COALESCE(NULLIF(TRIM(customer_name), ''), '(tanpa customer)')
    ORDER BY spending DESC
    LIMIT 5
  `);

  const qDailyNota = pool.query(`
    SELECT
      DATE(sale_date) AS day,
      COUNT(*) AS nota_count,
      COALESCE(SUM(total), 0) AS total_sales
    FROM sales_orders
    WHERE is_deleted = false
      AND payment_status = 'paid'
      AND status = 'final'
      AND sale_date >= ${monthStart} AND sale_date < ${monthEnd}
    GROUP BY DATE(sale_date)
    ORDER BY day ASC
  `);

  const qActivePo = pool.query(`
    SELECT COUNT(*) AS active_po
    FROM purchase_orders
    WHERE is_deleted = false
      AND status NOT IN ('completed', 'closed', 'cancelled')
  `);

  const qExpiring = pool.query(`
    SELECT COUNT(*) AS expiring_count
    FROM inventory_batches b
    WHERE b.qty_current > 0 AND b.expired_date IS NOT NULL
      AND b.expired_date < CURRENT_DATE + INTERVAL '90 days'
  `);

  const qLowStock = pool.query(`
    SELECT COUNT(*) as low_stock_count FROM (
      SELECT pm.id
      FROM product_master pm
      LEFT JOIN inventory_batches b ON b.product_id = pm.id
      WHERE pm.is_active = TRUE
      GROUP BY pm.id, pm.min_stock
      HAVING COALESCE(SUM(b.qty_current), 0) < pm.min_stock
    ) AS low_stock_items
  `);

  const qStockMove = pool.query(`
    SELECT
      DATE(im.created_at) AS day,
      COALESCE(SUM(CASE WHEN im.type = 'in' THEN im.qty ELSE 0 END), 0) AS in_qty,
      COALESCE(SUM(CASE WHEN im.type = 'out' THEN ABS(im.qty) ELSE 0 END), 0) AS out_qty
    FROM inventory_mutations im
    JOIN product_master pm ON pm.id = im.product_id
      AND pm.code IS NOT NULL AND pm.code != ''
    WHERE im.created_at >= ${monthStart} AND im.created_at < ${monthEnd}
    GROUP BY DATE(im.created_at)
    ORDER BY day ASC
  `);

  const qTotalCustomer = pool.query(`
    SELECT COUNT(*) AS total_customer
    FROM customers
  `);

  const [
    { rows: [{ total_penjualan }] },
    { rows: [{ prev_total_penjualan }] },
    { rows: [{ total_laba }] },
    { rows: [{ prev_total_laba }] },
    { rows: marginByChannelRows },
    { rows: topCategoryRows },
    { rows: topCustomerRows },
    { rows: dailyNotaRows },
    { rows: [{ active_po }] },
    { rows: [{ expiring_count }] },
    { rows: [{ low_stock_count }] },
    { rows: stockMovementRows },
    { rows: [{ total_customer }] },
  ] = await Promise.all([
    qTotalPenjualan, qPrevPenjualan, qTotalLaba, qPrevLaba,
    qMarginChannel, qTopCategory, qTopCustomer, qDailyNota,
    qActivePo, qExpiring, qLowStock, qStockMove, qTotalCustomer,
  ]);
  const lowExpiredTotal = parseInt(expiring_count || 0) + parseInt(low_stock_count || 0);

  return {
    totalPenjualan: parseFloat(total_penjualan),
    prevTotalPenjualan: parseFloat(prev_total_penjualan),
    totalLaba: parseFloat(total_laba),
    prevTotalLaba: parseFloat(prev_total_laba),
    suratPesananAktif: parseInt(active_po),
    stokLowExpired: lowExpiredTotal,
    totalCustomer: parseInt(total_customer),
    marginByChannel: marginByChannelRows.map(row => ({
      channel: row.channel || 'offline',
      label: row.channel === 'online' ? 'Online' : row.channel === 'offline' ? 'Offline' : row.channel || '(tanpa channel)',
      orderCount: parseInt(row.order_count) || 0,
      revenue: parseFloat(row.revenue) || 0,
      margin: parseFloat(row.margin) || 0,
      marginPct: parseFloat(row.margin_pct) || 0
    })),
    topCategoryMargins: topCategoryRows.map(row => ({
      category: row.category || '(tanpa kategori)',
      orderCount: parseInt(row.order_count) || 0,
      qty: parseFloat(row.qty) || 0,
      revenue: parseFloat(row.revenue) || 0,
      margin: parseFloat(row.margin) || 0,
      marginPct: parseFloat(row.margin_pct) || 0
    })),
    topCustomers: topCustomerRows.map(row => ({
      customerName: row.customer_name || '(tanpa customer)',
      notaCount: parseInt(row.nota_count) || 0,
      spending: parseFloat(row.spending) || 0
    })),
    dailyNota30d: dailyNotaRows.map(row => ({
      day: row.day,
      notaCount: parseInt(row.nota_count) || 0,
      totalSales: parseFloat(row.total_sales) || 0
    })),
    stockMovement30d: stockMovementRows.map(row => ({
      day: row.day,
      inQty: parseFloat(row.in_qty) || 0,
      outQty: parseFloat(row.out_qty) || 0
    }))
  };
};

const fetchHeatmapData = async (month) => {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('month param required (YYYY-MM)');
  }
  const { rows } = await pool.query(`
    SELECT
      DATE(sale_date) AS day,
      COUNT(*) AS nota_count,
      COALESCE(SUM(total), 0) AS total_sales
    FROM sales_orders
    WHERE is_deleted = false
      AND status = 'final'
      AND DATE_TRUNC('month', sale_date) = DATE_TRUNC('month', $1::date)
    GROUP BY DATE(sale_date)
    ORDER BY day ASC
  `, [month + '-01']);

  return rows.map(r => ({
    day: r.day,
    notaCount: parseInt(r.nota_count) || 0,
    totalSales: parseFloat(r.total_sales) || 0
  }));
};

// GET /bootstrap?month=YYYY-MM — gabungan stats & heatmap dalam 1 round-trip
router.get('/bootstrap', auth, async (req, res) => {
  try {
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month || ""))
      ? req.query.month
      : new Date().toISOString().slice(0, 7);

    const [stats, heatmap] = await Promise.all([
      fetchStatsData(month),
      fetchHeatmapData(month)
    ]);

    res.json({ stats, heatmap });
  } catch (err) {
    console.error('Dashboard Bootstrap Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET dashboard statistics
router.get('/stats', auth, async (req, res) => {
  try {
    const data = await fetchStatsData(req.query.month);
    res.json(data);
  } catch (err) { 
    console.error('Dashboard Stats Error:', err);
    res.status(500).json({ error: err.message }); 
  }
});

// GET /heatmap?month=YYYY-MM — nota count per day for a full calendar month
router.get('/heatmap', auth, async (req, res) => {
  try {
    const { month } = req.query;
    const data = await fetchHeatmapData(month);
    res.json(data);
  } catch (err) {
    console.error('Heatmap Error:', err);
    const status = err.message.includes('required') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// GET /daily-notas?date=YYYY-MM-DD — nota list for a specific day (for tile click detail)
router.get('/daily-notas', auth, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date param required (YYYY-MM-DD)' });
    }
    const { rows } = await pool.query(`
      SELECT
        so.order_number,
        so.sale_date,
        COALESCE(NULLIF(TRIM(so.customer_name), ''), '(tanpa customer)') AS customer_name,
        so.total,
        so.payment_status,
        so.channel
      FROM sales_orders so
      WHERE so.is_deleted = false
        AND so.status = 'final'
        AND DATE(so.sale_date) = $1::date
      ORDER BY so.created_at ASC
    `, [date]);
    res.json(rows.map(r => ({
      notaNumber: r.order_number,
      saleDate: r.sale_date,
      customerName: r.customer_name,
      total: parseFloat(r.total) || 0,
      paymentStatus: r.payment_status,
      channel: r.channel
    })));
  } catch (err) {
    console.error('Daily Notas Error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
