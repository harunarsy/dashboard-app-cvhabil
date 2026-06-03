#!/usr/bin/env node
/**
 * health-check-prod.js — v1.17.6
 *
 * Production health guardrail script. Runs read-only SELECT checks
 * to flag data anomalies before they become production issues.
 *
 * Usage:
 *   node scripts/health-check-prod.js               # read-only (default)
 *   node scripts/health-check-prod.js --read-only    # explicit read-only
 *   node scripts/health-check-prod.js --json         # JSON output
 *
 * Exit codes:
 *   0  All PASS / no FAIL checks
 *   1  At least one FAIL check found
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── CLI flags ───────────────────────────────────────────────────────────────
const FLAGS = new Set(process.argv.slice(2));
const OUTPUT_JSON = FLAGS.has('--json');
const READ_ONLY = FLAGS.has('--read-only') || !FLAGS.has('--json'); // default

// ─── DB connection ───────────────────────────────────────────────────────────
let envFile = '.env';
try {
  const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  if (currentBranch === 'dev' && fs.existsSync(path.join(__dirname, '../.env.dev'))) {
    envFile = '.env.dev';
  }
} catch (_) { /* ignore */ }

require('dotenv').config({ path: path.join(__dirname, '../', envFile) });
const { Pool } = require('pg');

const config = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
  : {
      user: process.env.DB_USER || 'dashboard_user',
      password: process.env.DB_PASSWORD || 'test_password_123',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT, 10) || 5432,
      database: process.env.DB_NAME || 'dashboard_db',
    };
config.max = 5;
config.idleTimeoutMillis = 10000;
config.connectionTimeoutMillis = 10000;

const pool = new Pool(config);

// ─── Result accumulator ──────────────────────────────────────────────────────
const results = [];

function pass(checkName) {
  results.push({ check: checkName, status: 'PASS', detail: null });
}

function fail(checkName, detail) {
  results.push({ check: checkName, status: 'FAIL', detail });
}

function report(checkName, detail) {
  results.push({ check: checkName, status: 'REPORT', detail });
}

// ─── Checks ──────────────────────────────────────────────────────────────────

/** 1. purchase_order_items received_qty > qty (over-received) */
async function check1(client) {
  const label = 'PO items over-received (received_qty > qty)';
  const { rows } = await client.query(`
    SELECT id, po_id, product_name, qty, received_qty
    FROM purchase_order_items
    WHERE received_qty > qty
    ORDER BY id
  `);
  if (rows.length === 0) {
    pass(label);
  } else {
    fail(label, rows.map(r => `id=${r.id} po_id=${r.po_id} product='${r.product_name}' qty=${r.qty} received=${r.received_qty}`));
  }
}

/** 2. Negative inventory_batches qty_current */
async function check2(client) {
  const label = 'Negative inventory batches (qty_current < 0)';
  const { rows } = await client.query(`
    SELECT id, product_id, batch_no, qty_current, is_active
    FROM inventory_batches
    WHERE qty_current < 0
    ORDER BY id
  `);
  if (rows.length === 0) {
    pass(label);
  } else {
    fail(label, rows.map(r => `id=${r.id} product_id=${r.product_id} batch='${r.batch_no}' qty=${r.qty_current} active=${r.is_active}`));
  }
}

/** 3. sales_items missing batch_id_snapshot where batch_no_snapshot IS NOT NULL */
async function check3(client) {
  const label = 'Sales items missing batch_id_snapshot';
  const { rows } = await client.query(`
    SELECT si.id, si.sales_order_id, si.product_name, si.batch_no_snapshot, si.expired_date_snapshot
    FROM sales_items si
    WHERE si.batch_id_snapshot IS NULL
      AND si.batch_no_snapshot IS NOT NULL
    ORDER BY si.id
  `);
  if (rows.length === 0) {
    pass(label);
  } else {
    fail(label, rows.map(r => `id=${r.id} so_id=${r.sales_order_id} product='${r.product_name}' batch_no='${r.batch_no_snapshot}'`));
  }
}

/** 4. PO status mismatch (status != derived from items) */
async function check4(client) {
  const label = 'PO status mismatch';
  const { rows } = await client.query(`
    SELECT po.id, po.status, po.stock_received,
      (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id) AS total_items,
      (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id AND received_qty > 0) AS received_items,
      (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id AND received_qty >= qty) AS fully_received
    FROM purchase_orders po
    WHERE (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id) > 0
      AND po.is_deleted = FALSE
    ORDER BY po.id
  `);

  const mismatches = [];
  for (const r of rows) {
    let expectedStatus, expectedStockReceived;
    if (r.fully_received >= r.total_items) {
      expectedStatus = 'received';
      expectedStockReceived = true;
    } else if (r.received_items > 0) {
      expectedStatus = 'partial';
      expectedStockReceived = false;
    } else {
      expectedStatus = 'sent';
      expectedStockReceived = false;
    }
    if (r.status !== expectedStatus || r.stock_received !== expectedStockReceived) {
      mismatches.push(`id=${r.id} status=${r.status}→${expectedStatus} stock_received=${r.stock_received}→${expectedStockReceived} (items=${r.total_items} received=${r.received_items} fully=${r.fully_received})`);
    }
  }

  if (mismatches.length === 0) {
    pass(label);
  } else {
    fail(label, mismatches);
  }
}

/** 5. Duplicate active batches (same product_id + batch_no + expired_date) */
async function check5(client) {
  const label = 'Duplicate active batches';
  const { rows } = await client.query(`
    SELECT b.product_id, p.name AS product_name, b.batch_no, b.expired_date,
      COUNT(*) AS cnt,
      ARRAY_AGG(b.id ORDER BY b.id) AS batch_ids
    FROM inventory_batches b
    JOIN product_master p ON p.id = b.product_id
    WHERE b.is_active = TRUE
    GROUP BY b.product_id, p.name, b.batch_no, b.expired_date
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
  `);
  if (rows.length === 0) {
    pass(label);
  } else {
    fail(label, rows.map(r => `product_id=${r.product_id} product='${r.product_name}' batch_no='${r.batch_no}' expired='${r.expired_date}' count=${r.cnt} ids=${r.batch_ids}`));
  }
}

/** 6. Orphan inventory_mutations (batch_id not null but no matching batch) */
async function check6(client) {
  const label = 'Orphan inventory mutations (batch_id without batch)';
  const { rows } = await client.query(`
    SELECT m.id, m.product_id, m.batch_id, m.type, m.qty, m.reference_type, m.reference_id
    FROM inventory_mutations m
    WHERE m.batch_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM inventory_batches b WHERE b.id = m.batch_id)
    ORDER BY m.id
  `);
  if (rows.length === 0) {
    pass(label);
  } else {
    fail(label, rows.map(r => `id=${r.id} product_id=${r.product_id} batch_id=${r.batch_id} type=${r.type} qty=${r.qty} ref=${r.reference_type}:${r.reference_id}`));
  }
}

/** 7. Deleted sales with active stock mutations (report only, no fix) */
async function check7(client) {
  const label = 'Deleted sales with active stock mutations (REPORT ONLY)';
  const { rows } = await client.query(`
    SELECT so.id, so.order_number, so.customer_name, so.status, so.is_deleted,
      m.id AS mutation_id, m.type, m.qty, m.batch_id, m.created_at AS mutation_date
    FROM sales_orders so
    JOIN inventory_mutations m ON m.reference_type = 'nota' AND m.reference_id = so.id
    WHERE so.is_deleted = TRUE
    ORDER BY so.id, m.id
  `);
  if (rows.length === 0) {
    pass(label);
  } else {
    // Group by sales order
    const grouped = {};
    for (const r of rows) {
      const key = `SO id=${r.id} number='${r.order_number}' customer='${r.customer_name}'`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(`mut_id=${r.mutation_id} type=${r.type} qty=${r.qty} batch_id=${r.batch_id}`);
    }
    const reportLines = Object.entries(grouped).map(([so, muts]) => `${so}: [${muts.join('; ')}]`);
    report(label, reportLines);
  }
}

/** 8. Invoice items hpp_inc_ppn suspicious (per-unit mismatch, report only) */
async function check8(client) {
  const label = 'Invoice items hpp_inc_ppn per-unit mismatch (REPORT ONLY)';
  const { rows } = await client.query(`
    SELECT ii.id, ii.invoice_id, ii.product_name, ii.quantity, ii.unit_price,
      ii.hpp_inc_ppn, ii.hpp_inc_ppn AS total_hpp,
      ROUND(ii.hpp_inc_ppn / NULLIF(ii.quantity, 0), 2) AS computed_per_unit,
      ROUND(ii.unit_price, 2) AS unit_price_rounded
    FROM invoice_items ii
    WHERE ii.quantity > 0
      AND ii.hpp_inc_ppn IS NOT NULL
      AND ii.hpp_inc_ppn > 0
      AND ABS(ii.hpp_inc_ppn / ii.quantity - ii.unit_price) > 0.02
    ORDER BY ii.id
  `);
  if (rows.length === 0) {
    pass(label);
  } else {
    report(label, rows.map(r =>
      `id=${r.id} invoice_id=${r.invoice_id} product='${r.product_name}' qty=${r.quantity} unit_price=${r.unit_price} hpp_inc_ppn=${r.hpp_inc_ppn} computed_per_unit=${r.computed_per_unit}`
    ));
  }
}

// ─── Output formatters ───────────────────────────────────────────────────────

function outputText() {
  console.log(`[HEALTH] Running ${results.length} checks...\n`);
  let hasFail = false;
  for (const r of results) {
    const prefix = `[HEALTH] ${r.check}...`;
    if (r.status === 'PASS') {
      console.log(`${prefix} ✅ PASS`);
    } else if (r.status === 'FAIL') {
      console.log(`${prefix} ❌ FAIL`);
      for (const d of (r.detail || [])) {
        console.log(`  → ${d}`);
      }
      hasFail = true;
    } else if (r.status === 'REPORT') {
      console.log(`${prefix} 📋 REPORT`);
      for (const d of (r.detail || [])) {
        console.log(`  → ${d}`);
      }
    }
  }
  console.log(`\n[HEALTH] Summary: ${results.filter(r => r.status === 'PASS').length} PASS, ${results.filter(r => r.status === 'FAIL').length} FAIL, ${results.filter(r => r.status === 'REPORT').length} REPORT`);
  return hasFail ? 1 : 0;
}

function outputJson() {
  const summary = {
    timestamp: new Date().toISOString(),
    mode: READ_ONLY ? 'read-only' : 'full',
    total: results.length,
    passed: results.filter(r => r.status === 'PASS').length,
    failed: results.filter(r => r.status === 'FAIL').length,
    reports: results.filter(r => r.status === 'REPORT').length,
    checks: results.map(r => ({
      check: r.check,
      status: r.status,
      detail: r.detail,
    })),
  };
  console.log(JSON.stringify(summary, null, 2));
  return summary.failed > 0 ? 1 : 0;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  let exitCode = 0;
  const start = Date.now();

  const client = await pool.connect();
  try {
    // BEGIN read-only transaction to guard against accidental writes
    await client.query('BEGIN');
    await client.query('SET TRANSACTION READ ONLY');

    const checks = [check1, check2, check3, check4, check5, check6, check7, check8];
    for (const fn of checks) {
      try {
        await fn(client);
      } catch (err) {
        results.push({ check: fn.name || 'unknown', status: 'ERROR', detail: [err.message] });
      }
    }

    await client.query('ROLLBACK'); // rollback read-only tx (no-op, but clean)
    exitCode = OUTPUT_JSON ? outputJson() : outputText();
  } catch (err) {
    console.error(OUTPUT_JSON
      ? JSON.stringify({ error: err.message, timestamp: new Date().toISOString() })
      : `[HEALTH] ❌ Fatal error: ${err.message}`
    );
    exitCode = 1;
  } finally {
    client.release();
    await pool.end();
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    if (!OUTPUT_JSON) console.log(`[HEALTH] Completed in ${elapsed}s`);
    process.exit(exitCode);
  }
}

main().catch(err => {
  console.error(`[HEALTH] Unhandled error: ${err.message}`);
  process.exit(1);
});
