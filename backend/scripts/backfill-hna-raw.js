// One-time backfill: product_master.hna → RAW HNA dari latest active batch
// Run: node backend/scripts/backfill-hna-raw.js
//
// Konvensi v1.8.0:
//   product_master.hna   = RAW HNA per pcs (after disc, EXC PPN)
//   inventory_batches.hna = RAW HNA per pcs (same convention)
//   HPP inc PPN dihitung di display layer: hna × 1.11
//
// Strategy:
//   Untuk tiap produk yang punya active batch, sync product_master.hna ke
//   batch terbaru (latest created_at). Skip produk tanpa batch (biarkan).
//   Log perubahan untuk audit.

require('dotenv').config();
const pool = require('../config/database');

async function backfill() {
  const client = await pool.connect();
  let updated = 0, skipped = 0, unchanged = 0;
  const changes = [];

  try {
    await client.query('BEGIN');

    const { rows: products } = await client.query(`
      SELECT id, code, name, hna AS current_hna
      FROM product_master
      WHERE is_active = TRUE
      ORDER BY id
    `);

    for (const p of products) {
      const { rows: batches } = await client.query(`
        SELECT hna, batch_no, created_at
        FROM inventory_batches
        WHERE product_id = $1 AND is_active = TRUE AND qty_current > 0
        ORDER BY created_at DESC
        LIMIT 1
      `, [p.id]);

      if (!batches.length) {
        skipped++;
        continue;
      }

      const batchHna = parseFloat(batches[0].hna) || 0;
      const currentHna = parseFloat(p.current_hna) || 0;

      if (Math.abs(batchHna - currentHna) < 0.01) {
        unchanged++;
        continue;
      }

      await client.query(
        'UPDATE product_master SET hna = $1, updated_at = NOW() WHERE id = $2',
        [batchHna, p.id]
      );

      changes.push({
        id: p.id,
        code: p.code,
        name: p.name,
        before: currentHna,
        after: batchHna,
        delta: batchHna - currentHna,
        source_batch: batches[0].batch_no,
      });
      updated++;
    }

    await client.query('COMMIT');

    console.log('\n=== BACKFILL HNA RAW REPORT ===\n');
    console.log(`Total produk aktif:  ${products.length}`);
    console.log(`Updated:             ${updated}`);
    console.log(`Unchanged (match):   ${unchanged}`);
    console.log(`Skipped (no batch):  ${skipped}\n`);

    if (changes.length) {
      console.log('--- CHANGES ---');
      changes.forEach(c => {
        console.log(
          `[${c.id}] ${c.code || '-'} ${c.name}\n` +
          `  before: Rp ${c.before.toLocaleString('id-ID')}\n` +
          `  after:  Rp ${c.after.toLocaleString('id-ID')}\n` +
          `  delta:  ${c.delta > 0 ? '+' : ''}${c.delta.toLocaleString('id-ID')} (batch: ${c.source_batch || '-'})\n`
        );
      });
    }
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Backfill error:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

backfill();
