const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');
const XLSX = require('xlsx');
const tax = require('../utils/tax');

// GET /api/reports/monthly?month=YYYY-MM — download Excel laporan bulanan
router.get('/monthly', auth, async (req, res) => {
  try {
    const { month } = req.query;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'month param required (YYYY-MM)' });
    }
    const startDate = month + '-01';
    // v1.43.0: HPP gross-up pakai rate per-batch yang di-snapshot, bukan global.
    const unitHppCostSql = tax.hppSqlForSalesItem('si');

    const [notaRows, fakturRows, summaryRows] = await Promise.all([
      // Nota Penjualan
      pool.query(`
        SELECT
          so.order_number,
          DATE(so.sale_date) AS tanggal,
          COALESCE(NULLIF(TRIM(so.customer_name), ''), '(tanpa customer)') AS customer,
          so.channel,
          so.payment_status,
          COALESCE(so.ongkir, 0) AS ongkir,
          so.total,
          COALESCE(SUM(COALESCE(si.qty_in_unit, si.qty, 0) * (${unitHppCostSql})), 0) AS total_hpp
        FROM sales_orders so
        LEFT JOIN sales_items si ON si.sales_order_id = so.id
        WHERE so.is_deleted = false
          AND so.status = 'final'
          AND DATE_TRUNC('month', so.sale_date) = DATE_TRUNC('month', $1::date)
        GROUP BY so.id, so.order_number, so.sale_date, so.customer_name,
                 so.channel, so.payment_status, so.ongkir, so.total
        ORDER BY so.sale_date ASC, so.order_number ASC
      `, [startDate]),

      // Faktur Pembelian
      pool.query(`
        SELECT
          i.invoice_number,
          DATE(i.purchase_date) AS tanggal,
          COALESCE(NULLIF(TRIM(i.distributor_name), ''), '(tanpa distributor)') AS distributor,
          i.tax_type,
          COALESCE(i.hna_plus_ppn, i.hna_final, 0) AS total_amount,
          i.status
        FROM invoices i
        WHERE i.deleted_at IS NULL
          AND (i.is_draft IS NULL OR i.is_draft = FALSE)
          AND DATE_TRUNC('month', i.purchase_date) = DATE_TRUNC('month', $1::date)
        ORDER BY i.purchase_date ASC, i.invoice_number ASC
      `, [startDate]),

      // Ringkasan
      pool.query(`
        SELECT
          COUNT(DISTINCT so.id) AS total_nota,
          COUNT(DISTINCT CASE WHEN so.payment_status = 'paid' THEN so.id END) AS nota_lunas,
          COALESCE(SUM(CASE WHEN so.payment_status = 'paid' THEN COALESCE(si.qty_in_unit, si.qty, 0) * COALESCE(si.unit_price, 0) ELSE 0 END), 0) AS total_penjualan,
          COALESCE(SUM(CASE WHEN so.payment_status = 'paid' THEN COALESCE(si.qty_in_unit, si.qty, 0) * (${unitHppCostSql}) ELSE 0 END), 0) AS total_hpp
        FROM sales_orders so
        LEFT JOIN sales_items si ON si.sales_order_id = so.id
        WHERE so.is_deleted = false
          AND so.status = 'final'
          AND DATE_TRUNC('month', so.sale_date) = DATE_TRUNC('month', $1::date)
      `, [startDate]),
    ]);

    const summary = summaryRows.rows[0];
    const totalPenjualan = parseFloat(summary.total_penjualan) || 0;
    const totalHpp = parseFloat(summary.total_hpp) || 0;
    const totalLaba = totalPenjualan - totalHpp;

    const wb = XLSX.utils.book_new();

    // Sheet 1: Ringkasan
    const ringkasanData = [
      ['Laporan Bulanan HABIL', '', ''],
      ['Bulan:', month, ''],
      ['', '', ''],
      ['Metrik', 'Nilai', ''],
      ['Total Nota', parseInt(summary.total_nota) || 0, ''],
      ['Nota Lunas', parseInt(summary.nota_lunas) || 0, ''],
      ['Total Penjualan (Lunas)', totalPenjualan, ''],
      ['Total HPP', totalHpp, ''],
      ['Laba Kotor', totalLaba, ''],
      ['Margin (%)', totalPenjualan > 0 ? ((totalLaba / totalPenjualan) * 100).toFixed(2) + '%' : '0%', ''],
    ];
    const wsRingkasan = XLSX.utils.aoa_to_sheet(ringkasanData);
    XLSX.utils.book_append_sheet(wb, wsRingkasan, 'Ringkasan');

    // Sheet 2: Nota Penjualan
    const notaHeader = ['No. Nota', 'Tanggal', 'Customer', 'Channel', 'Status Bayar', 'Subtotal', 'Ongkir', 'Total', 'HPP', 'Laba'];
    const notaSheetData = [notaHeader, ...notaRows.rows.map(r => {
      const total = parseFloat(r.total) || 0;
      const hpp = parseFloat(r.total_hpp) || 0;
      const ongkir = parseFloat(r.ongkir) || 0;
      return [
        r.order_number,
        r.tanggal instanceof Date ? r.tanggal.toISOString().slice(0, 10) : String(r.tanggal).slice(0, 10),
        r.customer,
        r.channel || 'offline',
        r.payment_status === 'paid' ? 'Lunas' : 'Belum Lunas',
        total - ongkir,
        ongkir,
        total,
        hpp,
        total - hpp,
      ];
    })];
    const wsNota = XLSX.utils.aoa_to_sheet(notaSheetData);
    XLSX.utils.book_append_sheet(wb, wsNota, 'Nota Penjualan');

    // Sheet 3: Faktur Pembelian
    const fakturHeader = ['No. Faktur', 'Tanggal', 'Distributor', 'Tipe', 'Total', 'Status Bayar'];
    const fakturSheetData = [fakturHeader, ...fakturRows.rows.map(r => [
      r.invoice_number,
      r.tanggal instanceof Date ? r.tanggal.toISOString().slice(0, 10) : String(r.tanggal).slice(0, 10),
      r.distributor,
      r.tax_type === 'nota' ? 'Nota' : 'Faktur PPN',
      parseFloat(r.total_amount) || 0,
      r.status === 'Paid' ? 'Lunas' : 'Belum Lunas',
    ])];
    const wsFaktur = XLSX.utils.aoa_to_sheet(fakturSheetData);
    XLSX.utils.book_append_sheet(wb, wsFaktur, 'Faktur Pembelian');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `HABIL_Laporan_${month}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    console.error('Reports monthly Error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
