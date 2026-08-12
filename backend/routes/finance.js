// Keuangan — hutang (faktur belum lunas) + piutang (nota belum lunas).
// Akses: direktur SAJA. Admin TIDAK boleh — ini data uang selevel Buku Besar,
// dan PATCH /lunas bisa mengubah catatan hutang ke distributor.
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');

// v1.65.7: SEBELUMNYA tiap rute hanya memakai `auth` tanpa roleGuard, sehingga admin
// yang mengetik /finance langsung bisa melihat seluruh hutang-piutang DAN menandai
// faktur lunas. Menyembunyikan menu di sidebar bukan pengamanan. Penjaga dipasang di
// router.use SEBELUM semua rute — jangan pindahkan ke bawah definisi rute mana pun.
router.use(auth, roleGuard('direktur'));

// GET /api/finance/summary — hutang (faktur belum lunas) + piutang (nota belum lunas)
router.get('/summary', async (req, res) => {
  try {
    const [hutangRows, piutangRows] = await Promise.all([
      pool.query(`
        SELECT
          i.invoice_number,
          DATE(i.purchase_date) AS invoice_date,
          COALESCE(NULLIF(TRIM(i.distributor_name), ''), '(tanpa distributor)') AS distributor,
          COALESCE(i.hna_plus_ppn, i.hna_final, 0) AS total_amount,
          i.tax_type,
          i.due_date,
          CASE
            WHEN i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE THEN true
            ELSE false
          END AS is_overdue
        FROM invoices i
        WHERE i.deleted_at IS NULL
          AND (i.is_draft IS NULL OR i.is_draft = FALSE)
          AND COALESCE(i.status, 'Pending') != 'Paid'
        ORDER BY i.due_date ASC NULLS LAST, i.purchase_date ASC
      `),
      pool.query(`
        SELECT
          so.order_number,
          DATE(so.sale_date) AS sale_date,
          COALESCE(NULLIF(TRIM(so.customer_name), ''), '(tanpa customer)') AS customer_name,
          so.total,
          so.channel,
          CASE
            WHEN so.sale_date < CURRENT_DATE - INTERVAL '30 days' THEN true
            ELSE false
          END AS is_overdue
        FROM sales_orders so
        WHERE so.is_deleted = false
          AND so.status = 'final'
          AND so.payment_status != 'paid'
        ORDER BY so.sale_date ASC
      `),
    ]);

    const hutang = hutangRows.rows.map(r => ({
      invoiceNumber: r.invoice_number,
      invoiceDate: r.invoice_date,
      distributor: r.distributor,
      totalAmount: parseFloat(r.total_amount) || 0,
      taxType: r.tax_type,
      dueDate: r.due_date,
      isOverdue: r.is_overdue,
    }));

    const piutang = piutangRows.rows.map(r => ({
      notaNumber: r.order_number,
      saleDate: r.sale_date,
      customerName: r.customer_name,
      total: parseFloat(r.total) || 0,
      channel: r.channel,
      isOverdue: r.is_overdue,
    }));

    res.json({
      hutang,
      piutang,
      totalHutang: hutang.reduce((s, r) => s + r.totalAmount, 0),
      totalPiutang: piutang.reduce((s, r) => s + r.total, 0),
    });
  } catch (err) {
    console.error('Finance summary Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/finance/hutang/:invoiceNumber/lunas — tandai faktur lunas
router.patch('/hutang/:invoiceNumber/lunas', async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    const { rows } = await pool.query(
      `UPDATE invoices SET status = 'Paid', payment_date = COALESCE(payment_date, CURRENT_DATE)
       WHERE invoice_number = $1 AND deleted_at IS NULL
       RETURNING invoice_number, status`,
      [invoiceNumber]
    );
    if (!rows.length) return res.status(404).json({ error: 'Faktur tidak ditemukan' });
    res.json({ message: 'Faktur ditandai lunas', invoice: rows[0] });
  } catch (err) {
    console.error('Finance lunas Error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
