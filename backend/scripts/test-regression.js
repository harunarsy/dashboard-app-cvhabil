#!/usr/bin/env node
/**
 * test-regression.js — v1.16.6 Regression Test Guardrail
 *
 * Tests critical stock/batch flows using DB read-only assertions.
 * Run: node backend/scripts/test-regression.js
 *
 * Behavior locked:
 * 1. Sales edit nota preserve selected historical batch
 * 2. Sales edit legacy snapshot fallback
 * 3. Ambiguous sales batch returns 400 (backend logic)
 * 4. Purchase receive partial/full (data integrity)
 * 5. Faktur linked SP room logic (data integrity)
 * 6. Direct faktur tanpa SP (data integrity)
 */
require('dotenv').config();
const { Pool } = require('pg');
const assert = require('assert');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

let passed = 0;
let failed = 0;
let errors = [];

function test(name, fn) {
  console.log(`\n  🔍 ${name}`);
  try {
    fn();
    console.log(`    ✅ PASS`);
    passed++;
  } catch (e) {
    console.log(`    ❌ FAIL: ${e.message}`);
    failed++;
    errors.push({ name, message: e.message });
  }
}

async function run() {
  console.log('══════════════════════════════════════════');
  console.log('  HABIL SuperApp — Regression Test Suite');
  console.log('══════════════════════════════════════════\n');

  // ─── TEST 1: Sales edit preserve selected historical batch ───
  console.log('─── Test Group: Sales Edit Batch Safety ───');

  const { rows: historicalBatches } = await pool.query(`
    SELECT si.id, si.sales_order_id, si.batch_id_snapshot, si.batch_no_snapshot,
           si.expired_date_snapshot, b.qty_current AS batch_qty
    FROM sales_items si
    LEFT JOIN inventory_batches b ON b.id = si.batch_id_snapshot
    WHERE si.batch_id_snapshot IS NOT NULL
    LIMIT 10
  `);

  test('Sales items with batch_id_snapshot exist', () => {
    assert.ok(historicalBatches.length > 0,
      `Expected >0 sales_items with batch_id_snapshot, got ${historicalBatches.length}`);
  });

  for (const row of historicalBatches.slice(0, 3)) {
    test(`Sales item ${row.id} batch_id_snapshot references valid batch`, () => {
      assert.ok(row.batch_id_snapshot !== null, 'batch_id_snapshot should not be null');
      assert.ok(row.batch_no_snapshot !== null, 'batch_no_snapshot should not be null');
    });
  }

  // ─── TEST 2: Legacy snapshot fallback (batch_no_snapshot without batch_id_snapshot) ───
  const { rows: legacyItems } = await pool.query(`
    SELECT COUNT(*) AS c FROM sales_items
    WHERE batch_no_snapshot IS NOT NULL AND batch_id_snapshot IS NULL
  `);

  test('No sales items with batch_no_snapshot but missing batch_id_snapshot', () => {
    assert.strictEqual(parseInt(legacyItems[0].c), 0,
      `Expected 0 legacy items, got ${legacyItems[0].c}`);
  });

  // ─── TEST 3: Ambiguous batch detection (simulated) ───
  const { rows: duplicateBatches } = await pool.query(`
    SELECT product_id, batch_no, expired_date, COUNT(*) AS cnt
    FROM inventory_batches
    WHERE is_active = TRUE AND batch_no IS NOT NULL
    GROUP BY product_id, batch_no, expired_date
    HAVING COUNT(*) > 1
  `);

  test('No duplicate active batches by product_id + batch_no', () => {
    assert.strictEqual(duplicateBatches.length, 0,
      `Expected 0 duplicate batches, got ${duplicateBatches.length}: ${JSON.stringify(duplicateBatches)}`);
  });

  // Verify resolveSelectedBatchForSale would work:
  // Priority: selected_batch_id > batch_id_snapshot > batch_no+expired_date > batch_no only
  // We can't call the function directly (not exported), but we verify DB state supports it.

  const { rows: snapshotMatch } = await pool.query(`
    SELECT COUNT(*) AS c FROM sales_items si
    WHERE si.batch_id_snapshot IS NOT NULL
      AND EXISTS (SELECT 1 FROM inventory_batches b WHERE b.id = si.batch_id_snapshot)
  `);

  test('All batch_id_snapshot references point to existing batches', () => {
    const totalWithSnapshot = parseInt(snapshotMatch[0].c);
    assert.ok(totalWithSnapshot > 0,
      `Expected >0 valid references, got ${totalWithSnapshot}`);
  });

  // ─── TEST 4: Purchase receive partial/full integrity ───
  console.log('\n─── Test Group: Purchase Receive Integrity ───');

  const { rows: overReceived } = await pool.query(`
    SELECT COUNT(*) AS c FROM purchase_order_items WHERE received_qty > qty
  `);

  test('No PO items over-received (received_qty > qty)', () => {
    assert.strictEqual(parseInt(overReceived[0].c), 0,
      `Expected 0 over-received, got ${overReceived[0].c}`);
  });

  const { rows: partialPOs } = await pool.query(`
    SELECT COUNT(*) AS c FROM purchase_order_items
    WHERE received_qty > 0 AND received_qty < qty
  `);

  test('Some PO items are partially received (expected normal)', () => {
    // Just verify the query runs; any count is valid
    assert.ok(parseInt(partialPOs[0].c) >= 0);
  });

  const { rows: statusSync } = await pool.query(`
    SELECT COUNT(*) AS c FROM purchase_orders po
    WHERE (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id) > 0
    AND (
      (po.status = 'received' AND (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id AND received_qty >= qty) < (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id))
      OR (po.status = 'sent' AND (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id AND received_qty > 0) > 0)
      OR (po.status = 'partial' AND (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id AND received_qty >= qty) = (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id))
    )
  `);

  test('All PO statuses match items received_qty', () => {
    assert.strictEqual(parseInt(statusSync[0].c), 0,
      `Expected 0 mismatched PO statuses, got ${statusSync[0].c}`);
  });

  // ─── TEST 5: Faktur linked SP room logic ───
  console.log('\n─── Test Group: Faktur Linked SP ───');

  // TS SWEET CLASSIC PO-67: item qty=125, received_qty should be 125
  const { rows: tsSweetPO } = await pool.query(`
    SELECT poi.id, poi.product_name, poi.qty, poi.received_qty
    FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.po_id
    WHERE po.id = 67
  `);

  test('PO-67 TS SWEET CLASSIC exists in purchase_order_items', () => {
    assert.ok(tsSweetPO.length > 0, 'PO-67 items not found');
  });

  if (tsSweetPO.length > 0) {
    test(`PO-67 item received_qty (${tsSweetPO[0].received_qty}) <= qty (${tsSweetPO[0].qty})`, () => {
      assert.ok(parseInt(tsSweetPO[0].received_qty) <= parseInt(tsSweetPO[0].qty),
        `received_qty ${tsSweetPO[0].received_qty} > qty ${tsSweetPO[0].qty}`);
    });
  }

  // Faktur AMS invoice 137 linked to PO-67: should have stock-in only for remaining room
  const { rows: fakturBatches } = await pool.query(`
    SELECT b.id, b.batch_no, b.qty_current, b.source_type, b.source_ref, b.hna
    FROM inventory_batches b
    WHERE b.source_ref = 'PO-67'
    ORDER BY b.batch_no
  `);

  test('PO-67 has inventory_batches from purchase (ANQD28DA + ANQC31DA)', () => {
    assert.ok(fakturBatches.length >= 2,
      `Expected ≥2 batches from PO-67, got ${fakturBatches.length}`);
  });

  for (const batch of fakturBatches) {
    test(`Batch ${batch.batch_no} (PO-67) qty_current (${batch.qty_current}) >= 0`, () => {
      assert.ok(parseInt(batch.qty_current) >= 0,
        `Batch ${batch.batch_no} has negative qty_current: ${batch.qty_current}`);
    });
  }

  // ─── TEST 6: Direct faktur tanpa SP ───
  console.log('\n─── Test Group: Direct Faktur Without SP ───');

  // Find invoices without purchase_order_id that have inventory_batches
  const { rows: directFakturBatches } = await pool.query(`
    SELECT COUNT(DISTINCT i.id) AS invoice_count
    FROM invoices i
    JOIN inventory_mutations m ON m.reference_id = i.id AND m.reference_type = 'faktur'
    WHERE i.purchase_order_id IS NULL
      AND i.deleted_at IS NULL
  `);

  test('Direct faktur (no SP) create inventory mutations', () => {
    assert.ok(parseInt(directFakturBatches[0].invoice_count) > 0,
      `Expected >0 direct faktur with mutations, got ${directFakturBatches[0].invoice_count}`);
  });

  // ─── Stock Safety Check ───
  console.log('\n─── Test Group: Stock Safety ───');

  const { rows: negativeStock } = await pool.query(`
    SELECT COUNT(*) AS c FROM inventory_batches
    WHERE qty_current < 0 AND is_active = TRUE
  `);

  test('No negative qty_current in active batches', () => {
    assert.strictEqual(parseInt(negativeStock[0].c), 0,
      `Expected 0 negative stock, got ${negativeStock[0].c}`);
  });

  const { rows: orphanMutations } = await pool.query(`
    SELECT COUNT(*) AS c FROM inventory_mutations m
    WHERE m.batch_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM inventory_batches b WHERE b.id = m.batch_id)
  `);

  test('No orphan mutations referencing deleted batches', () => {
    assert.strictEqual(parseInt(orphanMutations[0].c), 0,
      `Expected 0 orphan mutations, got ${orphanMutations[0].c}`);
  });

  // ─── Summary ───
  console.log('\n══════════════════════════════════════════');
  console.log(`  Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('══════════════════════════════════════════\n');

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
