'use strict';

/**
 * v1.68.0 — audit integritas data nota/faktur/stok.
 *
 * Usage:
 *   node scripts/audit-data-integrity.js
 *
 * Exit code 0 = semua sehat (warnings boleh ada).
 * Exit code 1 = ada FAIL (data yang bisa merusak laba/tampilan).
 *
 * Dipakai setelah migrasi constraint, setelah import massal, atau sebelum
 * tutup buku. Semua cek memakai aturan yang sama dengan aplikasi:
 *   uang  = COALESCE(qty_in_unit, qty) x harga
 *   gp    = total - sum(qty_jual x hpp x (1,11 jika faktur)) - fee - ongkir_cost
 */

require('dotenv').config();
const pool = require('../config/database');

const R = (n) => Number(n).toLocaleString('id-ID');

const CHECKS = [
  {
    level: 'FAIL',
    label: 'Nota: subtotal != qty_in_unit x harga',
    sql: `SELECT COUNT(*)::int AS n FROM sales_items i
          JOIN sales_orders o ON o.id = i.sales_order_id
          WHERE o.is_deleted = FALSE AND i.qty_in_unit IS NOT NULL
            AND ABS(i.qty_in_unit * i.unit_price - i.subtotal) > 1`,
  },
  {
    level: 'FAIL',
    label: 'Nota: qty base != qty_in_unit x pack (satuan karton/box)',
    sql: `SELECT COUNT(*)::int AS n FROM sales_items i
          JOIN sales_orders o ON o.id = i.sales_order_id
          WHERE o.is_deleted = FALSE AND i.qty_in_unit IS NOT NULL
            AND i.unit IS NOT NULL AND LOWER(i.unit) <> 'pcs'
            AND i.pack_size_at_sale > 1
            AND ABS(i.qty - i.qty_in_unit * i.pack_size_at_sale) > 0.01`,
  },
  {
    level: 'FAIL',
    label: 'Nota: qty/nilai negatif',
    sql: `SELECT COUNT(*)::int AS n FROM sales_items i
          JOIN sales_orders o ON o.id = i.sales_order_id
          WHERE o.is_deleted = FALSE AND (i.qty <= 0 OR i.unit_price < 0 OR i.subtotal < 0)`,
  },
  {
    level: 'FAIL',
    label: 'Nota: gp != rumus (qty_jual x hpp + fee + ongkir_cost)',
    sql: `WITH x AS (
            SELECT o.id, o.total, o.gross_profit, o.payment_fee, o.ongkir_cost,
              SUM(COALESCE(i.qty_in_unit, i.qty) * i.unit_hpp
                  * (CASE WHEN i.unit_hpp_tax_type = 'faktur' THEN 1.11 ELSE 1 END)) AS cost
            FROM sales_orders o
            JOIN sales_items i ON i.sales_order_id = o.id
            WHERE o.is_deleted = FALSE
            GROUP BY o.id, o.total, o.gross_profit, o.payment_fee, o.ongkir_cost)
          SELECT COUNT(*)::int AS n FROM x
          WHERE ABS(gross_profit - (total - cost - COALESCE(payment_fee,0) - COALESCE(ongkir_cost,0))) > 1`,
  },
  {
    level: 'FAIL',
    label: 'Stok batch negatif',
    sql: 'SELECT COUNT(*)::int AS n FROM inventory_batches WHERE qty_current < 0',
  },
  {
    level: 'FAIL',
    label: 'Faktur: quantity != qty_in_unit x pack (satuan non-pcs)',
    sql: `SELECT COUNT(*)::int AS n FROM invoice_items
          WHERE qty_in_unit IS NOT NULL AND unit IS NOT NULL AND LOWER(unit) <> 'pcs'
            AND pack_size_at_invoice > 1
            AND ABS(quantity - qty_in_unit * pack_size_at_invoice) > 0.01`,
  },
  {
    level: 'WARN',
    label: 'Nota: item HPP 0 (laba overstate)',
    sql: `SELECT COUNT(*)::int AS n FROM sales_items i
          JOIN sales_orders o ON o.id = i.sales_order_id
          WHERE o.is_deleted = FALSE AND COALESCE(i.unit_hpp, 0) = 0 AND i.subtotal > 0`,
  },
  {
    level: 'WARN',
    label: 'Batch aktif stok > 0 tapi HNA 0',
    sql: `SELECT COUNT(*)::int AS n FROM inventory_batches
          WHERE is_active = TRUE AND qty_current > 0 AND COALESCE(hna, 0) = 0`,
  },
  {
    level: 'WARN',
    label: 'Faktur: total item != qty x hna (indikasi diskon/salah input)',
    sql: `SELECT COUNT(*)::int AS n FROM invoice_items
          WHERE hna_times_qty IS NOT NULL AND hna IS NOT NULL AND quantity IS NOT NULL
            AND COALESCE(disc_nominal, 0) = 0
            AND ABS(hna_times_qty - hna * qty_in_unit) > GREATEST(1, quantity * 0.01)`,
  },
];

(async () => {
  let fail = 0;
  let warn = 0;
  try {
    console.log('=== AUDIT INTEGRITAS DATA ===\n');
    for (const check of CHECKS) {
      const { rows } = await pool.query(check.sql);
      const n = rows[0].n;
      const tag = n === 0 ? 'OK   ' : check.level.padEnd(5);
      if (n > 0 && check.level === 'FAIL') fail += n;
      if (n > 0 && check.level === 'WARN') warn += n;
      console.log(`${tag} ${check.label}: ${n}`);
    }

    const { rows: totals } = await pool.query(
      `SELECT COUNT(*)::int AS nota, SUM(total) AS omzet, SUM(gross_profit) AS laba
         FROM sales_orders WHERE is_deleted = FALSE`,
    );
    console.log(`\nTotal: ${totals[0].nota} nota | omzet Rp ${R(totals[0].omzet)} | laba Rp ${R(totals[0].laba)}`);
    console.log(`\n${fail === 0 ? 'PASS' : 'GAGAL'} — FAIL ${fail} baris, WARN ${warn} baris`);
    if (fail > 0) process.exitCode = 1;
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
