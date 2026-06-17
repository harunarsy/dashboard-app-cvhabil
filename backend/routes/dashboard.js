const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');
const tax = require('../utils/tax');

// GET dashboard statistics
router.get('/stats', auth, async (req, res) => {
  try {
    // v1.43.0: HPP gross-up pakai rate per-batch yang di-snapshot (unit_hpp_ppn_rate),
    // bukan rate global. NULL → fallback PPN_RATE (stok lama 11%).
    const unitHppCostSql = tax.hppSqlForSalesItem('si');

    // v1.22.3 (AUDIT-CA-02): semua query independen → jalan paralel via Promise.all.
    // Serverless Vercel → Neon Singapore: 13 query serial = 13× RTT di endpoint
    // pertama yang dibuka operator tiap login. SQL tidak berubah.
    // 1. Total Penjualan bln ini
    const qTotalPenjualan = pool.query(`
      SELECT COALESCE(SUM(total), 0) AS total_penjualan
      FROM sales_orders
      WHERE is_deleted = false
        AND status = 'final'
        AND DATE_TRUNC('month', sale_date) = DATE_TRUNC('month', CURRENT_DATE)
    `);

    const qPrevPenjualan = pool.query(`
      SELECT COALESCE(SUM(total), 0) AS prev_total_penjualan
      FROM sales_orders
      WHERE is_deleted = false
        AND status = 'final'
        AND sale_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
        AND sale_date < DATE_TRUNC('month', CURRENT_DATE)
    `);

    // 1b. Laba Kotor bln ini (Paid only) — v1.11.12 fix: pakai HPP inc PPN.
    // SEBELUMNYA: SUM(sales_orders.gross_profit) — formula sales.js pakai (unit_price - unit_hpp),
    // padahal unit_hpp = HNA exc PPN → margin overstate ~11% (PPN masukan = cost yg gak ke-account).
    // SEKARANG: recompute on-the-fly dari sales_items dgn HPP aktual per tax_type batch.
    // Field sales_orders.gross_profit dibiarkan legacy (audit) — gak diapus.
    // v1.21.16: total_laba = margin produk + untung ongkir (ongkir - ongkir_cost),
    // biar konsisten dgn total_penjualan yg sudah termasuk ongkir. Subquery ongkir
    // di-scope independen (per-order, bukan per item-row) supaya tidak terkali jumlah item.
    const qTotalLaba = pool.query(`
      SELECT COALESCE(SUM(COALESCE(si.qty_in_unit, si.qty, 0) * (COALESCE(si.unit_price, 0) - ${unitHppCostSql})), 0)
        + COALESCE((
            SELECT SUM(COALESCE(so2.ongkir, 0) - COALESCE(so2.ongkir_cost, 0)
              - CASE WHEN so2.payment_fee_mode = 'absorb' THEN COALESCE(so2.payment_fee, 0) ELSE 0 END)
            FROM sales_orders so2
            WHERE so2.is_deleted = false AND so2.payment_status = 'paid' AND so2.status = 'final'
              AND DATE_TRUNC('month', so2.sale_date) = DATE_TRUNC('month', CURRENT_DATE)
          ), 0) AS total_laba
      FROM sales_orders so
      JOIN sales_items si ON si.sales_order_id = so.id
      WHERE so.is_deleted = false
        AND so.payment_status = 'paid'
        AND so.status = 'final'
        AND DATE_TRUNC('month', so.sale_date) = DATE_TRUNC('month', CURRENT_DATE)
    `);

    const qPrevLaba = pool.query(`
      SELECT COALESCE(SUM(COALESCE(si.qty_in_unit, si.qty, 0) * (COALESCE(si.unit_price, 0) - ${unitHppCostSql})), 0)
        + COALESCE((
            SELECT SUM(COALESCE(so2.ongkir, 0) - COALESCE(so2.ongkir_cost, 0)
              - CASE WHEN so2.payment_fee_mode = 'absorb' THEN COALESCE(so2.payment_fee, 0) ELSE 0 END)
            FROM sales_orders so2
            WHERE so2.is_deleted = false AND so2.payment_status = 'paid' AND so2.status = 'final'
              AND so2.sale_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
              AND so2.sale_date < DATE_TRUNC('month', CURRENT_DATE)
          ), 0) AS prev_total_laba
      FROM sales_orders so
      JOIN sales_items si ON si.sales_order_id = so.id
      WHERE so.is_deleted = false
        AND so.payment_status = 'paid'
        AND so.status = 'final'
        AND so.sale_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
        AND so.sale_date < DATE_TRUNC('month', CURRENT_DATE)
    `);

    // 1c. Margin by channel bln ini (Paid + Final only) — same formula as total_laba.
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
          AND DATE_TRUNC('month', so.sale_date) = DATE_TRUNC('month', CURRENT_DATE)
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

    // 1d. Top kategori by margin bln ini. Join by product name karena sales_items menyimpan snapshot nama.
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
        AND DATE_TRUNC('month', so.sale_date) = DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY COALESCE(NULLIF(TRIM(pm.category), ''), '(tanpa kategori)')
      ORDER BY margin DESC
      LIMIT 5
    `);

    // 1e. Top customer bulan ini (Paid + Final only)
    const qTopCustomer = pool.query(`
      SELECT
        COALESCE(NULLIF(TRIM(customer_name), ''), '(tanpa customer)') AS customer_name,
        COUNT(*) AS nota_count,
        COALESCE(SUM(total), 0) AS spending
      FROM sales_orders
      WHERE is_deleted = false
        AND payment_status = 'paid'
        AND status = 'final'
        AND DATE_TRUNC('month', sale_date) = DATE_TRUNC('month', CURRENT_DATE)
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
        AND sale_date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(sale_date)
      ORDER BY day ASC
    `);

    // 2. Surat Pesanan Aktif
    const qActivePo = pool.query(`
      SELECT COUNT(*) AS active_po
      FROM purchase_orders
      WHERE is_deleted = false
        AND status NOT IN ('completed', 'closed', 'cancelled')
    `);

    // 3. Stok Low/Expired — COUNT(*) langsung, bukan fetch semua baris lalu rowCount
    const qExpiring = pool.query(`
      SELECT COUNT(*) AS expiring_count
      FROM inventory_batches b
      WHERE b.qty_current > 0 AND b.expired_date IS NOT NULL
        AND b.expired_date < CURRENT_DATE + INTERVAL '90 days'
    `);

    // Using a subquery for low stock to get the count
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
    // 3b. Stock movement 30 hari terakhir — exclude produk tanpa KODE (e.g. ONGKIR test data)
    const qStockMove = pool.query(`
      SELECT
        DATE(im.created_at) AS day,
        COALESCE(SUM(CASE WHEN im.type = 'in' THEN im.qty ELSE 0 END), 0) AS in_qty,
        COALESCE(SUM(CASE WHEN im.type = 'out' THEN ABS(im.qty) ELSE 0 END), 0) AS out_qty
      FROM inventory_mutations im
      JOIN product_master pm ON pm.id = im.product_id
        AND pm.code IS NOT NULL AND pm.code != ''
      WHERE im.created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(im.created_at)
      ORDER BY day ASC
    `);

    // 4. Total Customer
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

    res.json({
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
    });
  } catch (err) { 
    console.error('Dashboard Stats Error:', err);
    res.status(500).json({ error: err.message }); 
  }
});

// GET /heatmap?month=YYYY-MM — nota count per day for a full calendar month
router.get('/heatmap', auth, async (req, res) => {
  try {
    const { month } = req.query; // e.g. "2026-06"
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'month param required (YYYY-MM)' });
    }
    const { rows } = await pool.query(`
      -- Hitung SEMUA nota final (paid + unpaid) agar konsisten dgn panel detail
      -- (/daily-notas juga pakai status='final' tanpa filter payment).
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
    res.json(rows.map(r => ({
      day: r.day,
      notaCount: parseInt(r.nota_count) || 0,
      totalSales: parseFloat(r.total_sales) || 0
    })));
  } catch (err) {
    console.error('Heatmap Error:', err);
    res.status(500).json({ error: err.message });
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
