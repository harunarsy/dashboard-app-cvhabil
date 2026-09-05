/**
 * test-adjustment-rollback.js
 *
 * STAGING RELEASE GATE, Phase 6 — Transaction Failure / Rollback Test.
 *
 * Proves atomicity on the ISOLATED database:
 *  A. Rejected adjustment creation leaves zero rows/mutations (validation rollback).
 *  B. Rejected void on a confirmed settlement leaves state byte-identical.
 *  C. GENUINE mid-transaction fault injection: a temporary trigger aborts the
 *     sales_settlements INSERT *after* the adjustment row, items, stock
 *     mutations and batch updates were already written. The route must
 *     ROLLBACK everything (no orphan adjustment, batches untouched).
 *     The trigger is dropped in a finally block; disposable DB only.
 *
 * SAFETY GUARD: same isolated-target gate as the other staging scripts.
 * Prints NOT RUN + exit 0 when the safe environment is absent.
 */

const assert = require('assert');

const CLOUD_PATTERNS = [
  'neon.tech', 'supabase.co', 'supabase.com', 'amazonaws.com', 'rds.amazonaws.com',
  'cloudsql', 'azure.com', 'database.windows.net', 'aivencloud.com', 'elephantsql.com',
  'render.com', 'railway.app', 'planetscale', 'cockroachcloud', 'timescale.cloud',
];

function isolatedTargetOrNull(rawUrl) {
  if (!rawUrl) return null;
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = (u.hostname || '').toLowerCase();
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') return null;
  const lowered = rawUrl.toLowerCase();
  if (CLOUD_PATTERNS.some((p) => lowered.includes(p))) return null;
  const dbName = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (!/(staging|test|ci)/i.test(dbName)) return null;
  return { host: u.hostname, port: u.port || '5432', dbName };
}

const isSafeTestEnv =
  process.env.NODE_ENV === 'test' &&
  process.env.ALLOW_DEEP_FREEZE_WRITES === 'true' &&
  !!isolatedTargetOrNull(process.env.TEST_DATABASE_URL);

if (!isSafeTestEnv) {
  console.log('═══ Adjustment Rollback Test ═══');
  console.log('STATUS: NOT RUN (No isolated local/disposable PostgreSQL test database configured)');
  console.log('SAFETY ENFORCED: Remote/Cloud production database is strictly untouched.\n');
  process.exit(0);
}

const isolatedUrl = new URL(process.env.TEST_DATABASE_URL);
delete process.env.DATABASE_URL;
process.env.DB_HOST = isolatedUrl.hostname;
process.env.DB_PORT = isolatedUrl.port || '5432';
process.env.DB_NAME = decodeURIComponent(isolatedUrl.pathname.replace(/^\//, ''));
process.env.DB_USER = decodeURIComponent(isolatedUrl.username || 'postgres');
if (isolatedUrl.password) process.env.DB_PASSWORD = decodeURIComponent(isolatedUrl.password);
process.env.HABIL_ENV_LOADED = '1';
process.env.HABIL_ENV_FILE = 'injected';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'staging-gate-test-secret';

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../app');

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 5 });
const dirToken = jwt.sign({ id: 9001, username: 'staging-direktur', role: 'direktur' }, process.env.JWT_SECRET);
const dir = (r) => r.set('Authorization', `Bearer ${dirToken}`);

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ✅ ${name}`);
}
const q = (text, params) => pool.query(text, params);

async function cleanSlate() {
  for (const t of [
    'sales_audit_log', 'sales_settlements', 'sales_adjustment_items', 'sales_adjustments',
    'sales_items', 'sales_orders', 'inventory_mutations', 'inventory_batches',
    'product_master', 'ledger_entries',
  ]) {
    await q(`DELETE FROM ${t}`);
  }
}

async function fixtureSale(tag) {
  const { rows: [p] } = await q(
    `INSERT INTO product_master (name, base_unit, is_active) VALUES ($1,'pcs',TRUE) RETURNING *`, [`RB Kopi ${tag}`]);
  const { rows: [b] } = await q(
    `INSERT INTO inventory_batches (product_id, batch_no, qty_current, is_active) VALUES ($1,$2,100,TRUE) RETURNING *`,
    [p.id, `RB-B-${tag}`]);
  const { rows: [sale] } = await q(
    `INSERT INTO sales_orders (order_number, customer_name, total, payment_status, paid_at, status, is_deleted)
     VALUES ($1,'RB Customer',50000,'paid',NOW(),'final',FALSE) RETURNING *`, [`RB-NOTA-${tag}`]);
  const { rows: [item] } = await q(
    `INSERT INTO sales_items (sales_order_id, product_name, qty, unit, unit_price, subtotal, qty_in_unit,
      pack_size_at_sale, batch_id_snapshot, batch_no_snapshot)
     VALUES ($1,$2,5,'pcs',10000,50000,5,1,$3,$4) RETURNING *`,
    [sale.id, p.name, b.id, b.batch_no]);
  return { p, b, sale, item };
}

async function run() {
  const target = isolatedTargetOrNull(process.env.TEST_DATABASE_URL);
  console.log('═══ Adjustment Rollback Test ═══');
  console.log(`Isolated target: host=${target.host} port=${target.port} db=${target.dbName}\n`);
  await cleanSlate();

  // ── A. rejected creation → zero side effects ──
  const fa = await fixtureSale('A');
  const bQtyBeforeA = (await q('SELECT qty_current FROM inventory_batches WHERE id=$1', [fa.b.id])).rows[0].qty_current;
  const rA = await dir(request(app).post(`/api/sales/${fa.sale.id}/adjustments`)).send({
    type: 'exchange', reason: 'RB A', idempotency_key: 'rb-a-key',
    items: [
      { direction: 'returned', original_sales_item_id: fa.item.id, qty_in_unit: 2, unit: 'pcs', condition: 'saleable' },
      { direction: 'replacement', replacement_batch_id: fa.b.id, qty_in_unit: 1, unit: 'pcs', unit_price: -1 },
    ],
  });
  await check('A. rejected create → 400 + zero rows, zero mutations, batch untouched', async () => {
    assert.strictEqual(rA.status, 400);
    assert.strictEqual((await q(`SELECT COUNT(*)::int AS n FROM sales_adjustments WHERE idempotency_key='rb-a-key'`)).rows[0].n, 0);
    assert.strictEqual((await q('SELECT COUNT(*)::int AS n FROM sales_adjustment_items')).rows[0].n, 0);
    assert.strictEqual((await q('SELECT COUNT(*)::int AS n FROM sales_settlements')).rows[0].n, 0);
    assert.strictEqual((await q('SELECT COUNT(*)::int AS n FROM inventory_mutations')).rows[0].n, 0);
    assert.strictEqual(Number((await q('SELECT qty_current FROM inventory_batches WHERE id=$1', [fa.b.id])).rows[0].qty_current), Number(bQtyBeforeA));
  });

  // ── B. void-after-settle rejected → state identical ──
  const fb = await fixtureSale('B');
  const rB = await dir(request(app).post(`/api/sales/${fb.sale.id}/adjustments`)).send({
    type: 'return', reason: 'RB B', idempotency_key: 'rb-b-key',
    items: [{ direction: 'returned', original_sales_item_id: fb.item.id, qty_in_unit: 2, unit: 'pcs', condition: 'saleable' }],
  });
  assert.strictEqual(rB.status, 201);
  const adjB = rB.body.adjustment.id;
  const sB = await dir(request(app).post(`/api/sales/adjustments/${adjB}/settle`)).send({});
  assert.strictEqual(sB.status, 200);
  const stateBefore = JSON.stringify(await q('SELECT status, settlement_status FROM sales_adjustments WHERE id=$1', [adjB]).then((r) => r.rows[0]))
    + JSON.stringify((await q('SELECT settlement_status, ledger_entry_id FROM sales_settlements WHERE adjustment_id=$1', [adjB])).rows)
    + (await q(`SELECT COUNT(*)::int AS n FROM ledger_entries WHERE reference_type='sale-adjustment' AND reference_id=$1`, [adjB])).rows[0].n
    + (await q('SELECT qty_current FROM inventory_batches WHERE id=$1', [fb.b.id])).rows[0].qty_current;
  const rVoid = await dir(request(app).post(`/api/sales/adjustments/${adjB}/void`)).send({ void_reason: 'must fail' });
  await check('B. void-after-settle → 409 + state byte-identical (ledger kept, no reversal)', async () => {
    assert.strictEqual(rVoid.status, 409);
    const stateAfter = JSON.stringify(await q('SELECT status, settlement_status FROM sales_adjustments WHERE id=$1', [adjB]).then((r) => r.rows[0]))
      + JSON.stringify((await q('SELECT settlement_status, ledger_entry_id FROM sales_settlements WHERE adjustment_id=$1', [adjB])).rows)
      + (await q(`SELECT COUNT(*)::int AS n FROM ledger_entries WHERE reference_type='sale-adjustment' AND reference_id=$1`, [adjB])).rows[0].n
      + (await q('SELECT qty_current FROM inventory_batches WHERE id=$1', [fb.b.id])).rows[0].qty_current;
    assert.strictEqual(stateAfter, stateBefore, 'state must be unchanged by rejected void');
    assert.strictEqual((await q(`SELECT COUNT(*)::int AS n FROM inventory_mutations WHERE reference_type='sale-adjustment-void' AND reference_id=$1`, [adjB])).rows[0].n, 0);
  });

  // ── C. mid-transaction fault injection via temporary trigger ──
  // The trigger aborts the settlement INSERT, which the route executes AFTER the
  // adjustment row, items, batch updates and stock mutations — all inside ONE
  // transaction. A correct implementation rolls everything back.
  const fc = await fixtureSale('C');
  const bQtyBeforeC = (await q('SELECT qty_current FROM inventory_batches WHERE id=$1', [fc.b.id])).rows[0].qty_current;
  await q(`CREATE OR REPLACE FUNCTION stg_abort_settlement() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'STG injected mid-transaction failure'; END; $$ LANGUAGE plpgsql`);
  await q(`CREATE TRIGGER stg_abort_settlement_trg BEFORE INSERT ON sales_settlements
           FOR EACH ROW EXECUTE FUNCTION stg_abort_settlement()`);
  let rFault;
  try {
    rFault = await dir(request(app).post(`/api/sales/${fc.sale.id}/adjustments`)).send({
      type: 'return', reason: 'RB C fault', idempotency_key: 'rb-c-fault-key',
      items: [{ direction: 'returned', original_sales_item_id: fc.item.id, qty_in_unit: 2, unit: 'pcs', condition: 'saleable' }],
    });
  } finally {
    await q(`DROP TRIGGER IF EXISTS stg_abort_settlement_trg ON sales_settlements`);
    await q(`DROP FUNCTION IF EXISTS stg_abort_settlement()`);
  }
  await check('C. mid-transaction INSERT failure → 500 + FULL rollback (no orphan rows, stock intact)', async () => {
    assert.strictEqual(rFault.status, 500, `expected 500, got ${rFault.status}: ${JSON.stringify(rFault.body)}`);
    assert.strictEqual((await q(`SELECT COUNT(*)::int AS n FROM sales_adjustments WHERE idempotency_key='rb-c-fault-key'`)).rows[0].n, 0, 'orphan adjustment row must not exist');
    assert.strictEqual((await q(`SELECT COUNT(*)::int AS n FROM sales_adjustment_items sai JOIN sales_adjustments sa ON sa.id=sai.adjustment_id WHERE sa.idempotency_key='rb-c-fault-key'`)).rows[0].n, 0);
    assert.strictEqual((await q(`SELECT COUNT(*)::int AS n FROM sales_settlements WHERE sales_order_id=$1`, [fc.sale.id])).rows[0].n, 0);
    assert.strictEqual(Number((await q('SELECT qty_current FROM inventory_batches WHERE id=$1', [fc.b.id])).rows[0].qty_current), Number(bQtyBeforeC), 'batch stock must be untouched');
  });

  await cleanSlate();
  console.log(`\n═══ Rollback Test: ${passed} checks PASSED ═══\n`);
}

run().catch(async (err) => {
  console.error(`\nROLLBACK TEST: FAIL — ${err.message}`);
  try {
    await pool.query(`DROP TRIGGER IF EXISTS stg_abort_settlement_trg ON sales_settlements`);
    await pool.query(`DROP FUNCTION IF EXISTS stg_abort_settlement()`);
  } catch {}
  process.exitCode = 1;
}).finally(async () => {
  await pool.end().catch(() => {});
});
