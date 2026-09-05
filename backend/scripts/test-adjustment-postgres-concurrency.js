/**
 * test-adjustment-postgres-concurrency.js
 *
 * STAGING RELEASE GATE, Phase 4 — Real PostgreSQL Concurrency Integration Test.
 *
 * Exercises the REAL route handlers (POST settle / POST void) concurrently
 * through supertest against app.js, backed by an ISOLATED PostgreSQL instance.
 * Each raced request runs in its own server-side pool client (= independent
 * DB connection) and serializes on SELECT ... FOR UPDATE of sales_adjustments.
 *
 * SAFETY GUARD:
 * - Requires NODE_ENV=test, ALLOW_DEEP_FREEZE_WRITES=true, and TEST_DATABASE_URL
 *   pointing at 127.0.0.1/localhost with a staging|test|ci database name.
 * - Rejects any cloud-provider substring.
 * - If the safe environment is not present, prints NOT RUN and exits 0,
 *   so the default `npm test` stays offline-green.
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
  console.log('═══ Real PostgreSQL Concurrency Integration Test ═══');
  console.log('STATUS: NOT RUN (No isolated local/disposable PostgreSQL test database configured)');
  console.log('SAFETY ENFORCED: Remote/Cloud production database is strictly untouched.');
  console.log('To run against a disposable local DB:');
  console.log('  NODE_ENV=test ALLOW_DEEP_FREEZE_WRITES=true TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/habil_staging_test node scripts/test-adjustment-postgres-concurrency.js\n');
  process.exit(0);
}

// ---- From here on, only an explicitly-approved isolated target is used. ----
// NOTE: the app pool forces TLS whenever DATABASE_URL is set, but the isolated
// instance is plaintext loopback-only. Use the DB_HOST branch (no TLS) instead.
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
const auth = (r) => r.set('Authorization', `Bearer ${dirToken}`);

let passed = 0;
async function step(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ✅ ${name}`);
}

async function cleanSlate() {
  // FK-safe delete order; sequences untouched; app_users/seed data preserved.
  for (const t of [
    'sales_audit_log', 'sales_settlements', 'sales_adjustment_items', 'sales_adjustments',
    'sales_items', 'sales_orders', 'inventory_mutations', 'inventory_batches',
    'product_master', 'ledger_entries',
  ]) {
    await pool.query(`DELETE FROM ${t}`);
  }
}

async function makeProduct({ name, base_unit = 'pcs', pack_unit = null, pack_size = 1 }) {
  const { rows: [p] } = await pool.query(
    `INSERT INTO product_master (name, base_unit, pack_unit, pack_size, is_active)
     VALUES ($1,$2,$3,$4,TRUE) RETURNING *`,
    [name, base_unit, pack_unit, pack_size],
  );
  return p;
}

async function makeBatch(productId, { batch_no, qty }) {
  const { rows: [b] } = await pool.query(
    `INSERT INTO inventory_batches (product_id, batch_no, qty_current, is_active)
     VALUES ($1,$2,$3,TRUE) RETURNING *`,
    [productId, batch_no, qty],
  );
  return b;
}

async function makePaidSale({ order_number, customer_name = 'Staging Customer', total, items }) {
  const { rows: [sale] } = await pool.query(
    `INSERT INTO sales_orders (order_number, customer_name, total, payment_status, paid_at, status, is_deleted)
     VALUES ($1,$2,$3,'paid',NOW(),'final',FALSE) RETURNING *`,
    [order_number, customer_name, total],
  );
  const outItems = [];
  for (const it of items) {
    const { rows: [row] } = await pool.query(
      `INSERT INTO sales_items
        (sales_order_id, product_name, qty, unit, unit_price, subtotal, qty_in_unit,
         pack_size_at_sale, batch_id_snapshot, batch_no_snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [sale.id, it.product_name, it.qty, it.unit, it.unit_price, it.qty_in_unit * it.unit_price,
        it.qty_in_unit, it.pack_size_at_sale, it.batch_id, it.batch_no],
    );
    outItems.push(row);
  }
  return { sale, items: outItems };
}

async function postAdjustment(orderId, body) {
  return request(app).post(`/api/sales/${orderId}/adjustments`).use(auth).send(body);
}

async function snapshotState(adjustmentId) {
  const { rows: [adj] } = await pool.query('SELECT id, status, settlement_status, voided_by, void_reason FROM sales_adjustments WHERE id=$1', [adjustmentId]);
  const { rows: st } = await pool.query('SELECT id, settlement_status, ledger_entry_id, amount FROM sales_settlements WHERE adjustment_id=$1 ORDER BY id', [adjustmentId]);
  const { rows: led } = await pool.query(`SELECT COUNT(*)::int AS n FROM ledger_entries WHERE reference_type='sale-adjustment' AND reference_id=$1`, [adjustmentId]);
  const { rows: mut } = await pool.query(
    `SELECT reference_type, COUNT(*)::int AS n FROM inventory_mutations WHERE reference_id=$1 AND reference_type IN ('sale-adjustment','sale-adjustment-void') GROUP BY reference_type`,
    [adjustmentId],
  );
  const { rows: batches } = await pool.query('SELECT id, batch_no, qty_current FROM inventory_batches ORDER BY id');
  return { adj, settlements: st, ledgerCount: led[0].n, mutations: mut, batches };
}

async function run() {
  const target = isolatedTargetOrNull(process.env.TEST_DATABASE_URL);
  console.log('═══ Real PostgreSQL Concurrency Integration Test ═══');
  console.log(`Isolated target: host=${target.host} port=${target.port} db=${target.dbName}\n`);

  // ── Fixture: one loose-pcs product + one pack product ──
  await cleanSlate();
  const prodPcs = await makeProduct({ name: 'STG Kopi Pcs' });
  const batchSale = await makeBatch(prodPcs.id, { batch_no: 'STG-SALE-1', qty: 100 });
  const batchRepl = await makeBatch(prodPcs.id, { batch_no: 'STG-REPL-1', qty: 50 });

  // ══ A. settle vs settle ══
  console.log('── A. settle vs settle (real concurrent POSTs) ──');
  const { sale: saleA, items: [itemA] } = await makePaidSale({
    order_number: 'STG-NOTA-A', total: 100000,
    items: [{ product_name: prodPcs.name, qty: 10, qty_in_unit: 10, unit: 'pcs', unit_price: 10000, pack_size_at_sale: 1, batch_id: batchSale.id, batch_no: batchSale.batch_no }],
  });
  const resA = await postAdjustment(saleA.id, {
    type: 'return', reason: 'Staging A', idempotency_key: `stg-a-${Date.now()}`,
    items: [{ direction: 'returned', original_sales_item_id: itemA.id, qty_in_unit: 4, unit: 'pcs', condition: 'saleable' }],
  });
  assert.strictEqual(resA.status, 201, `setup adjustment A failed: ${JSON.stringify(resA.body)}`);
  const adjA = resA.body.adjustment.id;
  console.log('  before:', JSON.stringify((await snapshotState(adjA)).adj));

  const [s1, s2] = await Promise.allSettled([
    request(app).post(`/api/sales/adjustments/${adjA}/settle`).use(auth).send({}),
    request(app).post(`/api/sales/adjustments/${adjA}/settle`).use(auth).send({}),
  ]);
  const codesA = [s1.value?.status, s2.value?.status].sort();
  assert.deepStrictEqual(codesA, [200, 409], `expected exactly one 200 + one 409, got ${codesA}`);
  await step('A1. settle vs settle → exactly 1 success + 1 conflict (409)', async () => {});
  const afterA = await snapshotState(adjA);
  console.log('  after: ', JSON.stringify(afterA.adj));
  assert.strictEqual(afterA.adj.settlement_status, 'confirmed');
  assert.strictEqual(afterA.settlements.length, 1);
  assert.strictEqual(afterA.settlements[0].settlement_status, 'confirmed');
  assert.ok(afterA.settlements[0].ledger_entry_id, 'confirmed settlement must link a ledger entry');
  assert.strictEqual(afterA.ledgerCount, 1, 'exactly one ledger entry (no duplicate financial side effect)');
  await step('A2. ledger exactly 1 entry, settlement confirmed once', async () => {});

  // ══ B. void vs void ══
  console.log('── B. void vs void (real concurrent POSTs) ──');
  const { sale: saleB, items: [itemB] } = await makePaidSale({
    order_number: 'STG-NOTA-B', total: 100000,
    items: [{ product_name: prodPcs.name, qty: 10, qty_in_unit: 10, unit: 'pcs', unit_price: 10000, pack_size_at_sale: 1, batch_id: batchSale.id, batch_no: batchSale.batch_no }],
  });
  const replBeforeB = (await pool.query('SELECT qty_current FROM inventory_batches WHERE id=$1', [batchRepl.id])).rows[0].qty_current;
  const resB = await postAdjustment(saleB.id, {
    type: 'exchange', reason: 'Staging B', idempotency_key: `stg-b-${Date.now()}`,
    items: [
      { direction: 'returned', original_sales_item_id: itemB.id, qty_in_unit: 4, unit: 'pcs', condition: 'saleable' },
      { direction: 'replacement', replacement_batch_id: batchRepl.id, qty_in_unit: 2, unit: 'pcs', unit_price: 10000 },
    ],
  });
  assert.strictEqual(resB.status, 201, `setup adjustment B failed: ${JSON.stringify(resB.body)}`);
  const adjB = resB.body.adjustment.id;
  const origMutB = (await snapshotState(adjB)).mutations.find((m) => m.reference_type === 'sale-adjustment');
  console.log('  before:', JSON.stringify((await snapshotState(adjB)).adj), `origMutations=${origMutB.n}`);

  const [v1, v2] = await Promise.allSettled([
    request(app).post(`/api/sales/adjustments/${adjB}/void`).use(auth).send({ void_reason: 'race-1' }),
    request(app).post(`/api/sales/adjustments/${adjB}/void`).use(auth).send({ void_reason: 'race-2' }),
  ]);
  const codesB = [v1.value?.status, v2.value?.status].sort();
  assert.deepStrictEqual(codesB, [200, 409], `expected exactly one 200 + one 409, got ${codesB}`);
  await step('B1. void vs void → exactly 1 success + 1 conflict (409)', async () => {});
  const afterB = await snapshotState(adjB);
  console.log('  after: ', JSON.stringify(afterB.adj));
  assert.strictEqual(afterB.adj.status, 'void');
  assert.ok(afterB.adj.voided_by, 'voided_by must be populated');
  assert.ok(afterB.adj.void_reason, 'void_reason must be populated');
  const voidMutB = afterB.mutations.find((m) => m.reference_type === 'sale-adjustment-void');
  assert.strictEqual(voidMutB.n, origMutB.n, 'stock reversal must happen exactly once (one void-mutation per original mutation)');
  const replAfterB = (await pool.query('SELECT qty_current FROM inventory_batches WHERE id=$1', [batchRepl.id])).rows[0].qty_current;
  assert.strictEqual(Number(replAfterB), Number(replBeforeB), 'replacement batch stock must be fully restored exactly once');
  await step('B2. reversal exactly once, stock restored, audit fields populated', async () => {});

  // ══ C. settle vs void ══
  console.log('── C. settle vs void (real concurrent POSTs) ──');
  const { sale: saleC, items: [itemC] } = await makePaidSale({
    order_number: 'STG-NOTA-C', total: 100000,
    items: [{ product_name: prodPcs.name, qty: 10, qty_in_unit: 10, unit: 'pcs', unit_price: 10000, pack_size_at_sale: 1, batch_id: batchSale.id, batch_no: batchSale.batch_no }],
  });
  const replBeforeC = (await pool.query('SELECT qty_current FROM inventory_batches WHERE id=$1', [batchRepl.id])).rows[0].qty_current;
  const resC = await postAdjustment(saleC.id, {
    type: 'exchange', reason: 'Staging C', idempotency_key: `stg-c-${Date.now()}`,
    items: [
      { direction: 'returned', original_sales_item_id: itemC.id, qty_in_unit: 4, unit: 'pcs', condition: 'saleable' },
      { direction: 'replacement', replacement_batch_id: batchRepl.id, qty_in_unit: 2, unit: 'pcs', unit_price: 10000 },
    ],
  });
  assert.strictEqual(resC.status, 201, `setup adjustment C failed: ${JSON.stringify(resC.body)}`);
  const adjC = resC.body.adjustment.id;
  const replAfterPostC = (await pool.query('SELECT qty_current FROM inventory_batches WHERE id=$1', [batchRepl.id])).rows[0].qty_current;
  console.log('  before:', JSON.stringify((await snapshotState(adjC)).adj));

  const [w1, w2] = await Promise.allSettled([
    request(app).post(`/api/sales/adjustments/${adjC}/settle`).use(auth).send({}),
    request(app).post(`/api/sales/adjustments/${adjC}/void`).use(auth).send({ void_reason: 'race-void' }),
  ]);
  const codesC = [w1.value?.status, w2.value?.status].sort();
  assert.deepStrictEqual(codesC, [200, 409], `expected exactly one 200 + one 409, got ${codesC}`);
  await step('C1. settle vs void → exactly one transition wins + one 409', async () => {});
  const afterC = await snapshotState(adjC);
  console.log('  after: ', JSON.stringify(afterC.adj));
  const voidMutC = afterC.mutations.find((m) => m.reference_type === 'sale-adjustment-void');
  if (afterC.adj.settlement_status === 'confirmed') {
    // CASE 1: settle won — no stock reversal, one ledger entry.
    assert.strictEqual(afterC.ledgerCount, 1, 'settle-wins: exactly one ledger entry');
    assert.strictEqual(voidMutC, undefined, 'settle-wins: NO stock reversal allowed');
    assert.strictEqual(afterC.adj.status, 'posted', 'settle-wins: adjustment stays posted');
    const replFinal = (await pool.query('SELECT qty_current FROM inventory_batches WHERE id=$1', [batchRepl.id])).rows[0].qty_current;
    assert.strictEqual(Number(replFinal), Number(replAfterPostC), 'settle-wins: replacement stock stays deducted');
    console.log('  outcome: SETTLE won — ledger=1, no reversal, stock deducted. No mixed state.');
  } else {
    // CASE 2: void won — full reversal, no ledger.
    assert.strictEqual(afterC.adj.status, 'void', 'void-wins: adjustment must be void');
    assert.strictEqual(afterC.settlements[0].settlement_status, 'void', 'void-wins: pending settlement must be void');
    assert.strictEqual(afterC.ledgerCount, 0, 'void-wins: NO ledger entry allowed');
    assert.ok(voidMutC && voidMutC.n > 0, 'void-wins: reversal mutations must exist');
    const replFinal = (await pool.query('SELECT qty_current FROM inventory_batches WHERE id=$1', [batchRepl.id])).rows[0].qty_current;
    assert.strictEqual(Number(replFinal), Number(replBeforeC), 'void-wins: replacement stock fully restored');
    console.log('  outcome: VOID won — reversal present, ledger=0, stock restored. No mixed state.');
  }
  await step('C2. winner state fully consistent, no mixed state', async () => {});

  await cleanSlate();
  console.log(`\n═══ Real PostgreSQL Concurrency: ${passed} checks PASSED ═══\n`);
}

run().catch(async (err) => {
  console.error(`\nREAL POSTGRES CONCURRENCY: FAIL — ${err.message}`);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end().catch(() => {});
});
