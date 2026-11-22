'use strict';

/**
 * v1.68.0 — constraint integritas qty/harga nota & faktur.
 *
 * Latar belakang: bug berulang "qty pcs x harga karton" merusak tampilan
 * (Qty 120 karton, margin 12x) dan pernah membuat perbaikan manual salah arah.
 * Constraint ini menolak baris yang subtotalnya tidak sama dengan qty x harga,
 * dan baris satuan karton yang qty base-nya tidak sama dengan qty x pack.
 *
 * Aturan kolom (lihat routes/sales.js POST):
 *   sales_items.qty          = qty base (pcs)
 *   sales_items.qty_in_unit  = qty satuan jual (karton/pcs)  <- dipakai semua uang
 *   sales_items.subtotal     = qty_in_unit x unit_price
 *   sales_items.quantity ... (tidak ada)
 *   invoice_items.quantity   = qty base (pcs)
 *   invoice_items.qty_in_unit= qty satuan beli
 *
 * Idempotent: aman dijalankan berulang. Berhenti kalau ada data lama yang
 * melanggar (supaya tidak menambah constraint di atas data rusak).
 *
 * Usage: node scripts/migrate-integrity-constraints.js [--apply]
 */

require('dotenv').config();
const pool = require('../config/database');

const APPLY = process.argv.includes('--apply');

const CONSTRAINTS = [
  {
    table: 'sales_items',
    name: 'sales_items_chk_subtotal',
    sql: 'CHECK (qty_in_unit IS NULL OR ABS(qty_in_unit * unit_price - subtotal) <= 1)',
  },
  {
    table: 'sales_items',
    name: 'sales_items_chk_pack_qty',
    sql: `CHECK (
      qty_in_unit IS NULL OR unit IS NULL OR LOWER(unit) = 'pcs'
      OR pack_size_at_sale IS NULL OR pack_size_at_sale <= 1
      OR ABS(qty - qty_in_unit * pack_size_at_sale) <= 0.01
    )`,
  },
  {
    table: 'sales_items',
    name: 'sales_items_chk_qty_positive',
    sql: 'CHECK (qty > 0)',
  },
  {
    table: 'invoice_items',
    name: 'invoice_items_chk_pack_qty',
    sql: `CHECK (
      qty_in_unit IS NULL OR unit IS NULL OR LOWER(unit) = 'pcs'
      OR pack_size_at_invoice IS NULL OR pack_size_at_invoice <= 1
      OR ABS(quantity - qty_in_unit * pack_size_at_invoice) <= 0.01
    )`,
  },
  {
    table: 'invoice_items',
    name: 'invoice_items_chk_qty_positive',
    sql: 'CHECK (quantity > 0)',
  },
];

const PREFLIGHT = [
  {
    label: 'sales_items: subtotal != qty_in_unit x unit_price',
    sql: `SELECT COUNT(*)::int AS n FROM sales_items
          WHERE qty_in_unit IS NOT NULL
            AND ABS(qty_in_unit * unit_price - subtotal) > 1`,
  },
  {
    label: 'sales_items: qty != qty_in_unit x pack (satuan non-pcs)',
    sql: `SELECT COUNT(*)::int AS n FROM sales_items
          WHERE qty_in_unit IS NOT NULL AND unit IS NOT NULL AND LOWER(unit) <> 'pcs'
            AND pack_size_at_sale > 1
            AND ABS(qty - qty_in_unit * pack_size_at_sale) > 0.01`,
  },
  {
    label: 'sales_items: qty <= 0',
    sql: 'SELECT COUNT(*)::int AS n FROM sales_items WHERE qty <= 0',
  },
  {
    label: 'invoice_items: quantity != qty_in_unit x pack (satuan non-pcs)',
    sql: `SELECT COUNT(*)::int AS n FROM invoice_items
          WHERE qty_in_unit IS NOT NULL AND unit IS NOT NULL AND LOWER(unit) <> 'pcs'
            AND pack_size_at_invoice > 1
            AND ABS(quantity - qty_in_unit * pack_size_at_invoice) > 0.01`,
  },
  {
    label: 'invoice_items: quantity <= 0',
    sql: 'SELECT COUNT(*)::int AS n FROM invoice_items WHERE quantity <= 0',
  },
];

(async () => {
  try {
    let blocked = false;
    console.log('=== PREFLIGHT ===');
    for (const check of PREFLIGHT) {
      const { rows } = await pool.query(check.sql);
      const n = rows[0].n;
      console.log(`${n === 0 ? 'OK  ' : 'FAIL'} ${check.label}: ${n}`);
      if (n > 0) blocked = true;
    }

    if (blocked) {
      console.error('\nDibatalkan: masih ada data yang melanggar. Perbaiki dulu, lalu jalankan ulang.');
      process.exitCode = 1;
      return;
    }

    console.log(`\n=== ${APPLY ? 'APPLY' : 'DRY-RUN'} ===`);
    for (const c of CONSTRAINTS) {
      const { rows } = await pool.query(
        'SELECT 1 FROM pg_constraint WHERE conrelid = $1::regclass AND conname = $2',
        [c.table, c.name],
      );
      if (rows.length) {
        console.log(`SKIP ${c.name} (sudah ada)`);
        continue;
      }
      if (!APPLY) {
        console.log(`PLAN ADD ${c.table} ${c.name}`);
        continue;
      }
      await pool.query(`ALTER TABLE ${c.table} ADD CONSTRAINT ${c.name} ${c.sql}`);
      console.log(`ADD  ${c.name}`);
    }

    const { rows: finalRows } = await pool.query(
      `SELECT conrelid::regclass::text AS tabel, conname
         FROM pg_constraint
        WHERE conname = ANY($1)
        ORDER BY 1,2`,
      [CONSTRAINTS.map((c) => c.name)],
    );
    console.log('\n=== TERPASANG ===');
    for (const r of finalRows) console.log(`${r.tabel}: ${r.conname}`);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
