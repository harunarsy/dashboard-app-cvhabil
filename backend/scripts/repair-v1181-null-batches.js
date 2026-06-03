#!/usr/bin/env node
/**
 * repair-v1181-null-batches.js
 *
 * v1.18.1: repair duplicate active inventory_batches with NULL batch_no and NULL expired_date.
 *
 * Prod scenario: invoice items without proper batch_number get blanket batch_no=NULL.
 * Over time, multiple invoices for the same product create duplicate NULL-batch rows,
 * which inflates stock counts.
 *
 * Usage:
 *   node scripts/repair-v1181-null-batches.js            # dry-run (default)
 *   node scripts/repair-v1181-null-batches.js --apply    # execute repairs
 *
 * Logic per product_id group (WHERE is_active=TRUE, batch_no IS NULL, expired_date IS NULL):
 *   - Exactly 1 row with qty_current > 0 → keep it; deactivate rest (qty_current=0)
 *   - Multiple rows with qty_current > 0 → MANUAL_REVIEW (skip auto-repair)
 *   - All qty_current = 0          → keep lowest id; deactivate rest
 *
 * Wrapped in a single transaction.
 */

const { Pool } = require('pg');
require('dotenv').config();

const FLAG = process.argv.includes('--apply') ? 'apply' : 'dry-run';

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
  : {
      user: process.env.DB_USER || 'dashboard_user',
      password: process.env.DB_PASSWORD || 'test_password_123',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT, 10) || 5432,
      database: process.env.DB_NAME || 'dashboard_db',
    };
poolConfig.max = 5;
poolConfig.idleTimeoutMillis = 10000;
poolConfig.connectionTimeoutMillis = 10000;

const pool = new Pool(poolConfig);

function log(...args) {
  console.log(`[${FLAG === 'apply' ? 'APPLY' : 'DRY-RUN'}]`, ...args);
}

async function main() {
  log(`Starting v1.18.1 null-batch repair (mode: ${FLAG})`);
  log(`DB: ${process.env.DATABASE_URL ? 'Cloud (DATABASE_URL)' : 'Local'}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ─── Find all product groups with duplicate null batches ──────────────────
    const { rows: groups } = await client.query(`
      SELECT product_id, COUNT(*) as cnt,
             ARRAY_AGG(id ORDER BY qty_current DESC, id ASC) as ids,
             ARRAY_AGG(qty_current ORDER BY qty_current DESC, id ASC) as qtys
      FROM inventory_batches
      WHERE is_active = TRUE
        AND batch_no IS NULL
        AND expired_date IS NULL
      GROUP BY product_id
      HAVING COUNT(*) > 1
      ORDER BY product_id
    `);

    log(`Found ${groups.length} product groups with duplicate null batches.\n`);

    if (groups.length === 0) {
      log('Nothing to repair.');
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
      process.exit(0);
    }

    let autoFixed = 0;
    let manualReview = 0;
    const manualDetails = [];

    for (const g of groups) {
      const ids = g.ids;       // ordered by qty_current DESC then id ASC
      const qtys = g.qtys;
      const productId = g.product_id;

      const positiveIdx = qtys.findIndex(q => q > 0);
      const positiveCount = qtys.filter(q => q > 0).length;

      if (positiveCount > 1) {
        // ─── MANUAL_REVIEW: multiple rows have qty_current > 0 ──────────────
        manualReview++;
        const details = ids.map((id, i) => `  id=${id} qty_current=${qtys[i]}`);
        manualDetails.push(`product_id=${productId} (${positiveCount} positive out of ${ids.length}):\n${details.join('\n')}`);
        log(`SKIP product_id=${productId}: ${positiveCount} rows with qty>0 — MANUAL_REVIEW`);
        continue;
      }

      // Exactly 0 or 1 positive rows — safe to auto-repair
      let keepId;
      if (positiveIdx === -1) {
        // All qty_current = 0 → keep lowest id
        keepId = Math.min(...ids);
      } else {
        // Exactly 1 positive → keep that one
        keepId = ids[positiveIdx];
      }

      const deactivateIds = ids.filter(id => id !== keepId);

      if (FLAG === 'apply') {
        await client.query(
          'UPDATE inventory_batches SET qty_current = 0, is_active = FALSE WHERE id = ANY($1::int[])',
          [deactivateIds]
        );
      }

      log(`OK   product_id=${productId}: keep id=${keepId} (qty=${qtys[ids.indexOf(keepId)]}), deactivate [${deactivateIds.join(', ')}]`);
      autoFixed++;
    }

    if (FLAG === 'apply') {
      await client.query('COMMIT');
      log(`\n=== APPLY COMPLETE ===`);
      log(`Auto-repaired: ${autoFixed} product groups`);
      log(`Manual review needed: ${manualReview} product groups`);
    } else {
      await client.query('ROLLBACK');
      log(`\n=== DRY-RUN COMPLETE (no changes written) ===`);
      log(`Would auto-repair: ${autoFixed} product groups`);
      log(`Manual review needed: ${manualReview} product groups`);
    }

    if (manualDetails.length > 0) {
      log(`\n=== MANUAL REVIEW REQUIRED for ${manualReview} groups ===`);
      for (const d of manualDetails) {
        log(d);
      }
    }

    if (manualReview > 0) {
      log(`\n⚠️  ${manualReview} product group(s) require manual review before --apply.`);
      log('   These have multiple rows with qty_current > 0 — cannot auto-resolve.');
    }

    client.release();
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    console.error('\n❌ Repair failed:', err.message);
    client.release();
    await pool.end();
    process.exit(1);
  }

  await pool.end();
}

main();
