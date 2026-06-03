#!/usr/bin/env node
/**
 * repair-v1165-data-integrity.js
 *
 * v1.16.5 data-integrity repair script.
 *
 * Usage:
 *   node scripts/repair-v1165-data-integrity.js --dry-run   # preview only (default)
 *   node scripts/repair-v1165-data-integrity.js --apply     # execute repairs
 *
 * Repairs:
 *   1. PO item 54: fix duplicate SP receive (received_qty=24→12, fix batch 16)
 *   2. Backfill sales_items.batch_id_snapshot where batch_no_snapshot IS NOT NULL
 *   3. Sync purchase_orders status/stock_received vs items received_qty
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

// ─── Repair 1: Fix PO item 54 duplicate received_qty ────────────────────────
async function repair1(client) {
  log('=== Repair 1: Fix PO item 54 duplicate SP receive ===');

  // Check current state
  const { rows: [item54] } = await client.query(
    'SELECT id, po_id, product_name, qty, received_qty, received_qty_in_unit FROM purchase_order_items WHERE id = 54'
  );
  if (!item54) {
    log('  SKIP: purchase_order_items id=54 not found');
    return;
  }
  log(`  Current: received_qty=${item54.received_qty}, ordered_qty=${item54.qty}, product=${item54.product_name}`);

  const batch16 = (await client.query(
    'SELECT id, qty_current, is_active, batch_no FROM inventory_batches WHERE id = 16'
  )).rows[0];
  log(`  Batch id=16: qty_current=${batch16?.qty_current}, is_active=${batch16?.is_active}, batch_no=${batch16?.batch_no}`);

  const batch15 = (await client.query(
    'SELECT id, qty_current, is_active, batch_no FROM inventory_batches WHERE id = 15'
  )).rows[0];
  log(`  Batch id=15: qty_current=${batch15?.qty_current}, is_active=${batch15?.is_active}, batch_no=${batch15?.batch_no}`);

  if (item54.received_qty !== 24 && batch16?.qty_current !== 12) {
    log('  SKIP: state does not match expected (received_qty=24, batch16.qty_current=12)');
    return;
  }

  if (FLAG === 'apply') {
    // UPDATE received_qty from 24 → 12
    await client.query(
      'UPDATE purchase_order_items SET received_qty = 12, received_qty_in_unit = 12 WHERE id = 54 AND received_qty = 24'
    );
    log('  UPDATE purchase_order_items SET received_qty=12, received_qty_in_unit=12 WHERE id=54');

    // INSERT inventory_mutation for the reversal (out from batch 16)
    const productId = (await client.query(
      'SELECT product_id FROM purchase_order_items WHERE id = 54'
    )).rows[0]?.product_id;
    if (productId) {
      await client.query(
        `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, reference_id, qty_unit, qty_in_unit, notes)
         VALUES ($1, $2, 'out', $3, 'data-repair', $4, 'pcs', $5, $6)`,
        [productId, 16, 12, 54, 12,
         'v1.16.5 repair duplicate SP receive PO-40 item 54']
      );
      log(`  INSERT inventory_mutation: type=out, qty=12, batch_id=16, reference_type=data-repair, reference_id=54`);
    }

    // UPDATE inventory_batches: zero out batch 16
    await client.query(
      "UPDATE inventory_batches SET qty_current = 0, is_active = FALSE WHERE id = 16 AND qty_current = 12"
    );
    log('  UPDATE inventory_batches SET qty_current=0, is_active=false WHERE id=16');
  } else {
    log('  WOULD: UPDATE purchase_order_items SET received_qty=12, received_qty_in_unit=12 WHERE id=54 AND received_qty=24');
    log('  WOULD: INSERT inventory_mutation type=out, qty=12, batch_id=16, reference_type=data-repair, reference_id=54');
    log('  WOULD: UPDATE inventory_batches SET qty_current=0, is_active=false WHERE id=16 AND qty_current=12');
  }

  log('  Repair 1 complete.');
}

// ─── Repair 2: Backfill sales_items.batch_id_snapshot ──────────────────────
async function repair2(client) {
  log('\n=== Repair 2: Backfill sales_items.batch_id_snapshot ===');

  const { rows: unfixed } = await client.query(
    `SELECT COUNT(*) as cnt FROM sales_items
     WHERE batch_id_snapshot IS NULL AND batch_no_snapshot IS NOT NULL`
  );
  log(`  Rows needing backfill: ${unfixed[0].cnt}`);

  if (parseInt(unfixed[0].cnt, 10) === 0) {
    log('  SKIP: no rows to fix');
    return;
  }

  // Step 1: Match by inventory_mutations
  if (FLAG === 'apply') {
    const { rowCount: r1 } = await client.query(`
      UPDATE sales_items si
      SET batch_id_snapshot = m.batch_id
      FROM inventory_mutations m
      WHERE si.batch_id_snapshot IS NULL
        AND si.batch_no_snapshot IS NOT NULL
        AND m.reference_type = 'nota' AND m.type = 'out'
        AND m.reference_id = si.sales_order_id
        AND m.batch_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM inventory_batches b WHERE b.id = m.batch_id AND b.batch_no = si.batch_no_snapshot)
    `);
    log(`  Step 1 (by inventory_mutations): ${r1} rows updated`);
  } else {
    const { rows: preview1 } = await client.query(`
      SELECT COUNT(*) as cnt FROM sales_items si
      WHERE si.batch_id_snapshot IS NULL
        AND si.batch_no_snapshot IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM inventory_mutations m
          WHERE m.reference_type = 'nota' AND m.type = 'out'
            AND m.reference_id = si.sales_order_id
            AND m.batch_id IS NOT NULL
            AND EXISTS (SELECT 1 FROM inventory_batches b WHERE b.id = m.batch_id AND b.batch_no = si.batch_no_snapshot)
        )
    `);
    log(`  WOULD Step 1 (by inventory_mutations): ${preview1[0].cnt} rows`);
  }

  // Step 2: Match by unique active inventory_batches
  if (FLAG === 'apply') {
    const { rowCount: r2 } = await client.query(`
      UPDATE sales_items si
      SET batch_id_snapshot = b.id
      FROM inventory_batches b
      JOIN product_master p ON p.id = b.product_id AND p.is_active = TRUE
      WHERE si.batch_id_snapshot IS NULL
        AND si.batch_no_snapshot IS NOT NULL
        AND LOWER(TRIM(p.name)) = LOWER(TRIM(si.product_name))
        AND b.batch_no = si.batch_no_snapshot
        AND b.is_active = TRUE
        AND (b.expired_date = si.expired_date_snapshot OR (b.expired_date IS NULL AND si.expired_date_snapshot IS NULL))
        AND (SELECT COUNT(*) FROM inventory_batches b2
             WHERE b2.product_id = p.id
               AND b2.batch_no = si.batch_no_snapshot
               AND b2.is_active = TRUE
               AND (b2.expired_date = si.expired_date_snapshot OR (b2.expired_date IS NULL AND si.expired_date_snapshot IS NULL))
        ) = 1
    `);
    log(`  Step 2 (by unique active batch): ${r2} rows updated`);
  } else {
    const { rows: preview2 } = await client.query(`
      SELECT COUNT(*) as cnt FROM sales_items si
      WHERE si.batch_id_snapshot IS NULL
        AND si.batch_no_snapshot IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM inventory_batches b
          JOIN product_master p ON p.id = b.product_id AND p.is_active = TRUE
          WHERE LOWER(TRIM(p.name)) = LOWER(TRIM(si.product_name))
            AND b.batch_no = si.batch_no_snapshot
            AND b.is_active = TRUE
            AND (b.expired_date = si.expired_date_snapshot OR (b.expired_date IS NULL AND si.expired_date_snapshot IS NULL))
            AND (SELECT COUNT(*) FROM inventory_batches b2
                 WHERE b2.product_id = p.id
                   AND b2.batch_no = si.batch_no_snapshot
                   AND b2.is_active = TRUE
                   AND (b2.expired_date = si.expired_date_snapshot OR (b2.expired_date IS NULL AND si.expired_date_snapshot IS NULL))
            ) = 1
        )
    `);
    log(`  WOULD Step 2 (by unique active batch): ${preview2[0].cnt} rows`);
  }

  // Step 3: Print remaining ambiguous rows
  const { rows: remaining } = await client.query(`
    SELECT si.id, si.product_name, si.batch_no_snapshot, si.expired_date_snapshot
    FROM sales_items si
    WHERE si.batch_id_snapshot IS NULL
      AND si.batch_no_snapshot IS NOT NULL
    ORDER BY si.id
  `);
  if (remaining.length > 0) {
    log(`  Step 3: ${remaining.length} rows remain ambiguous (still NULL):`);
    for (const r of remaining) {
      log(`    id=${r.id} product='${r.product_name}' batch_no='${r.batch_no_snapshot}' expired_date='${r.expired_date_snapshot}'`);
    }
  } else {
    log('  Step 3: No remaining ambiguous rows — all resolved.');
  }

  log('  Repair 2 complete.');
}

// ─── Repair 3: Sync purchase_orders status/stock_received ──────────────────
async function repair3(client) {
  log('\n=== Repair 3: Sync purchase_orders status/stock_received ===');

  // Preview: count mismatches
  const { rows: mismatches } = await client.query(`
    SELECT COUNT(*) as cnt FROM (
      SELECT po.id, po.status, po.stock_received,
        (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id) as total_items,
        (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id AND received_qty > 0) as received_items,
        (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id AND received_qty >= qty) as fully_received
      FROM purchase_orders po
      WHERE (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id) > 0
    ) sub
    WHERE NOT (
      (fully_received = total_items AND status = 'received' AND stock_received = TRUE)
      OR (received_items > 0 AND fully_received < total_items AND status = 'partial' AND stock_received = FALSE)
      OR (received_items = 0 AND status = 'sent' AND stock_received = FALSE)
    )
  `);
  log(`  Mismatched PO rows found: ${mismatches[0].cnt}`);

  if (parseInt(mismatches[0].cnt, 10) === 0) {
    log('  SKIP: no mismatches found');
    return;
  }

  // Show details
  const { rows: details } = await client.query(`
    SELECT po.id, po.status, po.stock_received,
      (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id) as total_items,
      (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id AND received_qty > 0) as received_items,
      (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id AND received_qty >= qty) as fully_received
    FROM purchase_orders po
    WHERE (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id) > 0
    ORDER BY po.id
  `);
  for (const d of details) {
    let expectedStatus, expectedStockReceived;
    if (d.fully_received >= d.total_items) {
      expectedStatus = 'received';
      expectedStockReceived = true;
    } else if (d.received_items > 0) {
      expectedStatus = 'partial';
      expectedStockReceived = false;
    } else {
      expectedStatus = 'sent';
      expectedStockReceived = false;
    }
    if (d.status !== expectedStatus || d.stock_received !== expectedStockReceived) {
      log(`  PO id=${d.id}: status=${d.status}→${expectedStatus}, stock_received=${d.stock_received}→${expectedStockReceived} (items=${d.total_items}, received=${d.received_items}, fully=${d.fully_received})`);
    }
  }

  if (FLAG === 'apply') {
    // Bulk UPDATE to 'received'
    const { rowCount: r1 } = await client.query(`
      UPDATE purchase_orders po SET status = 'received', stock_received = TRUE
      WHERE id IN (
        SELECT po_id FROM purchase_order_items
        GROUP BY po_id
        HAVING COUNT(*) = SUM(CASE WHEN received_qty >= qty THEN 1 ELSE 0 END)
      )
      AND (status IS DISTINCT FROM 'received' OR stock_received IS DISTINCT FROM TRUE)
    `);
    log(`  Updated to 'received': ${r1} rows`);

    // Bulk UPDATE to 'partial'
    const { rowCount: r2 } = await client.query(`
      UPDATE purchase_orders po SET status = 'partial', stock_received = FALSE
      WHERE id IN (
        SELECT po_id FROM purchase_order_items
        GROUP BY po_id
        HAVING COUNT(*) > 0
          AND COUNT(*) > SUM(CASE WHEN received_qty = 0 THEN 1 ELSE 0 END)
          AND COUNT(*) > SUM(CASE WHEN received_qty >= qty THEN 1 ELSE 0 END)
      )
      AND (status IS DISTINCT FROM 'partial' OR stock_received IS DISTINCT FROM FALSE)
    `);
    log(`  Updated to 'partial': ${r2} rows`);

    // Bulk UPDATE to 'sent'
    const { rowCount: r3 } = await client.query(`
      UPDATE purchase_orders po SET status = 'sent', stock_received = FALSE
      WHERE id IN (
        SELECT po_id FROM purchase_order_items
        GROUP BY po_id
        HAVING COUNT(*) = SUM(CASE WHEN received_qty = 0 THEN 1 ELSE 0 END)
      )
      AND (status IS DISTINCT FROM 'sent' OR stock_received IS DISTINCT FROM FALSE)
    `);
    log(`  Updated to 'sent': ${r3} rows`);
  } else {
    log('  WOULD: bulk UPDATE purchase_orders status/stock_received (received/partial/sent)');
  }

  log('  Repair 3 complete.');
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  log(`Starting v1.16.5 data-integrity repair (mode: ${FLAG})`);
  log(`DB: ${process.env.DATABASE_URL ? 'Cloud (DATABASE_URL)' : 'Local'}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await repair1(client);
    await repair2(client);
    await repair3(client);

    if (FLAG === 'apply') {
      await client.query('COMMIT');
      log('\n✅ All repairs applied successfully in a single transaction.');
    } else {
      await client.query('ROLLBACK');
      log('\n⚠️  Dry-run only — no changes written. Re-run with --apply to execute.');
    }
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    console.error('\n❌ Repair failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
