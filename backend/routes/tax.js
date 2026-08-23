// Pajak — Rekap PPN + penandaan PPN keluaran per nota (v1.57.0).
// Akses: direktur + konsultan pajak (role 'pajak'). Admin TIDAK boleh (sensitif,
// selevel Buku Besar). Sistem tidak memutuskan klasifikasi pajak — konsultan/direktur
// yang menandai nota mana yang dikecualikan dari PPN keluaran, tercatat siapa & kapan.
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const tax = require('../utils/tax');


router.use(auth, roleGuard('direktur', 'pajak'));

const monthRange = (month) => {
  // month 'YYYY-MM' → [start, startNext)
  const m = /^(\d{4})-(\d{2})$/.exec(String(month || ''));
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  if (mo < 1 || mo > 12) return null;
  const start = `${m[1]}-${m[2]}-01`;
  const next = mo === 12 ? `${y + 1}-01-01` : `${m[1]}-${String(mo + 1).padStart(2, '0')}-01`;
  return [start, next];
};

// Porsi produk kena PPN per nota = total − ongkir − fee pass_on (mirror breakdown PDF).
// DPP = porsi/(1+rate); PPN = porsi − DPP. Rate default 11% (konsisten nota PDF).
const PPN_OUT_RATE = tax.PPN_RATE;
const productPortionSql = `
  GREATEST(0, COALESCE(s.total,0) - COALESCE(s.ongkir,0)
    - CASE WHEN s.payment_fee_mode = 'pass_on' THEN COALESCE(s.payment_fee,0) ELSE 0 END)`;

// GET /summary?month=YYYY-MM — rekap PPN keluaran vs masukan + breakdown sumber-nota
router.get('/summary', async (req, res) => {
  const range = monthRange(req.query.month);
  if (!range) return res.status(400).json({ error: 'Parameter month wajib format YYYY-MM' });
  try {
    const { rows: [out] } = await pool.query(
      `SELECT
         COUNT(*)::int AS nota_count,
         COUNT(*) FILTER (WHERE COALESCE(s.ppn_excluded, FALSE))::int AS excluded_count,
         COALESCE(SUM(CASE WHEN NOT COALESCE(s.ppn_excluded, FALSE) THEN ${productPortionSql} ELSE 0 END), 0) AS taxable_gross,
         COALESCE(SUM(CASE WHEN COALESCE(s.ppn_excluded, FALSE) THEN ${productPortionSql} ELSE 0 END), 0) AS excluded_gross
       FROM sales_orders s
       WHERE s.is_deleted = FALSE AND s.status = 'final'
         AND s.sale_date >= $1 AND s.sale_date < $2`,
      range
    );
    const taxableGross = parseFloat(out.taxable_gross) || 0;
    const dpp = taxableGross / (1 + PPN_OUT_RATE);
    const ppnKeluaran = taxableGross - dpp;

    // Pajak masukan: faktur pembelian ber-PPN (tax_type faktur) bulan tsb.
    const { rows: [inn] } = await pool.query(
      `SELECT COUNT(*)::int AS invoice_count,
              COALESCE(SUM(COALESCE(ppn_masukan, 0)), 0) AS ppn_masukan
       FROM invoices
       WHERE deleted_at IS NULL AND COALESCE(is_draft, FALSE) = FALSE
         AND COALESCE(tax_type, 'faktur') = 'faktur'
         AND purchase_date >= $1 AND purchase_date < $2`,
      range
    );

    // Omzet barang SUMBER-NOTA (beli tanpa faktur pajak → tidak ada kredit masukan):
    // dari snapshot sales_items.unit_hpp_tax_type='nota' pada nota taxable bulan tsb.
    const { rows: [src] } = await pool.query(
      `SELECT COALESCE(SUM(COALESCE(si.qty_in_unit, si.qty, 0) * COALESCE(si.unit_price, 0)), 0) AS nota_sourced_gross
       FROM sales_items si
       JOIN sales_orders s ON s.id = si.sales_order_id
       WHERE s.is_deleted = FALSE AND s.status = 'final'
         AND NOT COALESCE(s.ppn_excluded, FALSE)
         AND s.sale_date >= $1 AND s.sale_date < $2
         AND COALESCE(si.unit_hpp_tax_type, 'faktur') = 'nota'`,
      range
    );
    const notaSourcedGross = parseFloat(src.nota_sourced_gross) || 0;
    const notaSourcedPpn = notaSourcedGross - notaSourcedGross / (1 + PPN_OUT_RATE);

    const ppnMasukan = parseFloat(inn.ppn_masukan) || 0;
    res.json({
      month: req.query.month,
      rate: PPN_OUT_RATE,
      keluaran: {
        nota_count: out.nota_count,
        excluded_count: out.excluded_count,
        taxable_gross: Math.round(taxableGross),
        dpp: Math.round(dpp),
        ppn: Math.round(ppnKeluaran),
        excluded_gross: Math.round(parseFloat(out.excluded_gross) || 0),
      },
      masukan: {
        invoice_count: inn.invoice_count,
        ppn: Math.round(ppnMasukan),
      },
      kurang_bayar: Math.round(ppnKeluaran - ppnMasukan),
      nota_sourced: {
        gross: Math.round(notaSourcedGross),
        ppn_beban: Math.round(notaSourcedPpn),
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /notas?month=YYYY-MM — daftar nota + status penandaan (buat konsultan menandai)
router.get('/notas', async (req, res) => {
  const range = monthRange(req.query.month);
  if (!range) return res.status(400).json({ error: 'Parameter month wajib format YYYY-MM' });
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.order_number, s.sale_date, s.customer_name, s.total,
              COALESCE(s.ongkir,0) AS ongkir,
              ${productPortionSql} AS product_portion,
              COALESCE(s.ppn_excluded, FALSE) AS ppn_excluded,
              s.ppn_marked_by, s.ppn_marked_at,
              EXISTS (SELECT 1 FROM sales_items si WHERE si.sales_order_id = s.id
                      AND COALESCE(si.unit_hpp_tax_type,'faktur') = 'nota') AS has_nota_sourced_item
       FROM sales_orders s
       WHERE s.is_deleted = FALSE AND s.status = 'final'
         AND s.sale_date >= $1 AND s.sale_date < $2
       ORDER BY s.sale_date ASC, s.id ASC`,
      range
    );
    const items = rows.map((r) => {
      const portion = parseFloat(r.product_portion) || 0;
      const dpp = portion / (1 + PPN_OUT_RATE);
      return {
        ...r,
        product_portion: Math.round(portion),
        dpp: Math.round(dpp),
        ppn: Math.round(portion - dpp),
      };
    });
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /notas/:id/ppn { excluded } — tandai nota masuk/keluar PPN keluaran.
// Tercatat siapa yang menandai + kapan (audit).
router.patch('/notas/:id/ppn', async (req, res) => {
  const excluded = req.body?.excluded === true;
  try {
    const { rows: [row] } = await pool.query(
      `UPDATE sales_orders
       SET ppn_excluded = $1, ppn_marked_by = $2, ppn_marked_at = NOW(), updated_at = NOW()
       WHERE id = $3 AND is_deleted = FALSE
       RETURNING id, order_number, ppn_excluded, ppn_marked_by, ppn_marked_at`,
      [excluded, req.user?.username || String(req.user?.id || 'unknown'), req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Nota tidak ditemukan' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /export?month=YYYY-MM — CSV rekap per nota (bahan lapor / kertas kerja konsultan)
router.get('/export', async (req, res) => {
  const range = monthRange(req.query.month);
  if (!range) return res.status(400).json({ error: 'Parameter month wajib format YYYY-MM' });
  try {
    const { rows } = await pool.query(
      `SELECT s.order_number, s.sale_date, s.customer_name, s.total,
              COALESCE(s.ongkir,0) AS ongkir, ${productPortionSql} AS product_portion,
              COALESCE(s.ppn_excluded, FALSE) AS ppn_excluded, s.ppn_marked_by
       FROM sales_orders s
       WHERE s.is_deleted = FALSE AND s.status = 'final'
         AND s.sale_date >= $1 AND s.sale_date < $2
       ORDER BY s.sale_date ASC, s.id ASC`,
      range
    );
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      ['No Nota', 'Tanggal', 'Customer', 'Total', 'Ongkir', 'Porsi Produk', 'DPP', 'PPN', 'Masuk PPN Keluaran', 'Ditandai Oleh'].join(';'),
    ];
    rows.forEach((r) => {
      const portion = parseFloat(r.product_portion) || 0;
      const dpp = portion / (1 + PPN_OUT_RATE);
      lines.push([
        esc(r.order_number),
        esc(String(r.sale_date).slice(0, 10)),
        esc(r.customer_name),
        Math.round(parseFloat(r.total) || 0),
        Math.round(parseFloat(r.ongkir) || 0),
        Math.round(portion),
        Math.round(dpp),
        Math.round(portion - dpp),
        r.ppn_excluded ? 'TIDAK' : 'YA',
        esc(r.ppn_marked_by || ''),
      ].join(';'));
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="rekap-ppn-${req.query.month}.csv"`);
    res.send('﻿' + lines.join('\n'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
