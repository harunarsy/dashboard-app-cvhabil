// v1.43.0 — apply per-batch/faktur PPN rate schema to PROD (idempotent) + inspect.
// Usage: node scripts/v143_ppn_per_batch.js          (inspect + DDL only, NO data writes)
//        node scripts/v143_ppn_per_batch.js --apply   (also set Nescafe batch 110 + faktur = 12%)
require('dotenv').config(); // backend/.env carries prod DATABASE_URL
const pool = require('../config/database'); // reuse app pool (TLS config centralised)
const APPLY = process.argv.includes('--apply');

(async () => {
  try {
    // 1) DDL idempotent
    await pool.query(`ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS ppn_rate DECIMAL(5,4) DEFAULT 0.11`);
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS ppn_rate DECIMAL(5,4) DEFAULT 0.11`);
    await pool.query(`ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS unit_hpp_ppn_rate DECIMAL(5,4)`);
    console.log('✓ DDL applied (idempotent)');

    // 2) verify columns
    const cols = await pool.query(`
      SELECT table_name, column_name, data_type, column_default
      FROM information_schema.columns
      WHERE (table_name='inventory_batches' AND column_name='ppn_rate')
         OR (table_name='invoices' AND column_name='ppn_rate')
         OR (table_name='sales_items' AND column_name='unit_hpp_ppn_rate')
      ORDER BY table_name, column_name`);
    console.log('\n=== COLUMNS ===');
    console.table(cols.rows);

    // 3) distribution of batch ppn_rate
    const dist = await pool.query(`SELECT ppn_rate, COUNT(*) n, SUM(qty_current) qty FROM inventory_batches GROUP BY ppn_rate ORDER BY ppn_rate`);
    console.log('\n=== batch ppn_rate distribution ===');
    console.table(dist.rows);

    // 4) batch 110 (Nescafe) detail
    const b110 = await pool.query(`
      SELECT b.id, b.product_id, pm.name, b.batch_no, b.expired_date, b.qty_current,
             b.hna, b.tax_type, b.ppn_rate, b.source_type, b.source_ref, b.created_at
      FROM inventory_batches b LEFT JOIN product_master pm ON pm.id=b.product_id
      WHERE b.id=110`);
    console.log('\n=== batch 110 ===');
    console.table(b110.rows);

    // 5) Nescafe batches (by name) — to confirm which batches are nescafe
    const nes = await pool.query(`
      SELECT b.id, pm.name, b.batch_no, b.qty_current, b.hna, b.tax_type, b.ppn_rate, b.source_ref, b.created_at
      FROM inventory_batches b JOIN product_master pm ON pm.id=b.product_id
      WHERE pm.name ILIKE '%nescafe%' ORDER BY b.id DESC`);
    console.log('\n=== Nescafe batches ===');
    console.table(nes.rows);

    // 6) recent batches (last 45 days) — candidates for 12%
    const recent = await pool.query(`
      SELECT b.id, pm.name, b.batch_no, b.qty_current, b.hna, b.tax_type, b.ppn_rate, b.source_ref, b.created_at::date
      FROM inventory_batches b LEFT JOIN product_master pm ON pm.id=b.product_id
      WHERE b.created_at >= CURRENT_DATE - INTERVAL '45 days'
      ORDER BY b.created_at DESC LIMIT 40`);
    console.log('\n=== batches created last 45 days ===');
    console.table(recent.rows);

    if (APPLY) {
      // Set Nescafe batch 110 → 12% + its faktur. source_ref = invoice-<id>.
      const upd = await pool.query(`UPDATE inventory_batches SET ppn_rate=0.12 WHERE id=110 RETURNING id, ppn_rate, source_ref`);
      console.log('\n✓ batch 110 set 12%:', upd.rows);
      // propagate to its faktur header if source_ref like invoice-<id>
      const ref = upd.rows[0]?.source_ref || '';
      const m = /invoice-(\d+)/.exec(ref);
      if (m) {
        const inv = await pool.query(`UPDATE invoices SET ppn_rate=0.12 WHERE id=$1 RETURNING id, invoice_number, ppn_rate`, [m[1]]);
        console.log('✓ faktur set 12%:', inv.rows);
      }
    } else {
      console.log('\n(DRY — no data writes. Re-run with --apply to set batch 110 = 12%.)');
    }
  } catch (e) {
    console.error('ERR', e.message);
  } finally {
    await pool.end();
  }
})();
