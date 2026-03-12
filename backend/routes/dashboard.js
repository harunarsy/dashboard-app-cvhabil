const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

// GET dashboard statistics
router.get('/stats', auth, async (req, res) => {
  try {
    // 1. Total Penjualan bln ini
    const { rows: [{ total_penjualan }] } = await pool.query(`
      SELECT COALESCE(SUM(total), 0) AS total_penjualan 
      FROM sales_orders 
      WHERE is_deleted = false 
        AND status = 'final' 
        AND DATE_TRUNC('month', sale_date) = DATE_TRUNC('month', CURRENT_DATE)
    `);

    // 2. Surat Pesanan Aktif
    const { rows: [{ active_po }] } = await pool.query(`
      SELECT COUNT(*) AS active_po 
      FROM purchase_orders 
      WHERE is_deleted = false 
        AND status NOT IN ('completed', 'closed', 'cancelled')
    `);

    // 3. Stok Low/Expired
    const { rowCount: expiringCount } = await pool.query(`
      SELECT b.id
      FROM inventory_batches b
      WHERE b.qty_current > 0 AND b.expired_date IS NOT NULL
        AND b.expired_date < CURRENT_DATE + INTERVAL '90 days'
    `);
    
    // Using a subquery for low stock to get the count
    const { rows: [{ low_stock_count }] } = await pool.query(`
      SELECT COUNT(*) as low_stock_count FROM (
        SELECT pm.id
        FROM product_master pm
        LEFT JOIN inventory_batches b ON b.product_id = pm.id
        WHERE pm.is_active = TRUE
        GROUP BY pm.id, pm.min_stock
        HAVING COALESCE(SUM(b.qty_current), 0) < pm.min_stock
      ) AS low_stock_items
    `);
    const lowExpiredTotal = parseInt(expiringCount || 0) + parseInt(low_stock_count || 0);

    // 4. Total Customer
    const { rows: [{ total_customer }] } = await pool.query(`
      SELECT COUNT(*) AS total_customer 
      FROM customers
    `);

    res.json({
      totalPenjualan: parseFloat(total_penjualan),
      suratPesananAktif: parseInt(active_po),
      stokLowExpired: lowExpiredTotal,
      totalCustomer: parseInt(total_customer)
    });
  } catch (err) { 
    console.error('Dashboard Stats Error:', err);
    res.status(500).json({ error: err.message }); 
  }
});

module.exports = router;
