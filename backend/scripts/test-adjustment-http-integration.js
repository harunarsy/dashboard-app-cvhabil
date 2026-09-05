/**
 * test-adjustment-http-integration.js
 *
 * STAGING RELEASE GATE, Phase 5 — Actual HTTP/API Integration (18 scenarios).
 *
 * Drives the REAL Express app (supertest) against an ISOLATED PostgreSQL
 * instance and verifies BOTH the HTTP response AND the resulting row state
 * in sales_adjustments / items / settlements / batches / mutations /
 * ledger_entries / sales_audit_log.
 *
 * SAFETY GUARD: same isolated-target gate as the concurrency test.
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
  console.log('═══ Adjustment HTTP/API Integration Test ═══');
  console.log('STATUS: NOT RUN (No isolated local/disposable PostgreSQL test database configured)');
  console.log('SAFETY ENFORCED: Remote/Cloud production database is strictly untouched.\n');
  process.exit(0);
}

// ---- Isolated target only from here on. Plaintext loopback: use DB_HOST branch. ----
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
const adminToken = jwt.sign({ id: 9002, username: 'staging-admin', role: 'admin' }, process.env.JWT_SECRET);
const dir = (r) => r.set('Authorization', `Bearer ${dirToken}`);
const adm = (r) => r.set('Authorization', `Bearer ${adminToken}`);

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ✅ ${name}`);
}

const q = (text, params) => pool.query(text, params);
const countAdjustments = async () => (await q('SELECT COUNT(*)::int AS n FROM sales_adjustments')).rows[0].n;
const batchQty = async (id) => (await q('SELECT qty_current FROM inventory_batches WHERE id=$1', [id])).rows[0].qty_current;

async function cleanSlate() {
  for (const t of [
    'sales_audit_log', 'sales_settlements', 'sales_adjustment_items', 'sales_adjustments',
    'sales_items', 'sales_orders', 'inventory_mutations', 'inventory_batches',
    'product_master', 'ledger_entries',
  ]) {
    await q(`DELETE FROM ${t}`);
  }
}

async function makeProduct({ name, base_unit = 'pcs', pack_unit = null, pack_size = 1 }) {
  const { rows: [p] } = await q(
    `INSERT INTO product_master (name, base_unit, pack_unit, pack_size, is_active) VALUES ($1,$2,$3,$4,TRUE) RETURNING *`,
    [name, base_unit, pack_unit, pack_size],
  );
  return p;
}
async function makeBatch(productId, { batch_no, qty }) {
  const { rows: [b] } = await q(
    `INSERT INTO inventory_batches (product_id, batch_no, qty_current, is_active) VALUES ($1,$2,$3,TRUE) RETURNING *`,
    [productId, batch_no, qty],
  );
  return b;
}
async function makePaidSale({ order_number, total, items }) {
  const { rows: [sale] } = await q(
    `INSERT INTO sales_orders (order_number, customer_name, total, payment_status, paid_at, status, is_deleted)
     VALUES ($1,'Staging Customer',$2,'paid',NOW(),'final',FALSE) RETURNING *`,
    [order_number, total],
  );
  const out = [];
  for (const it of items) {
    const { rows: [row] } = await q(
      `INSERT INTO sales_items (sales_order_id, product_name, qty, unit, unit_price, subtotal, qty_in_unit,
        pack_size_at_sale, batch_id_snapshot, batch_no_snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [sale.id, it.product_name, it.qty, it.unit, it.unit_price, it.qty_in_unit * it.unit_price,
        it.qty_in_unit, it.pack_size_at_sale, it.batch_id, it.batch_no],
    );
    out.push(row);
  }
  return { sale, items: out };
}
const postAdj = (orderId, body, as = dir) => as(request(app).post(`/api/sales/${orderId}/adjustments`)).send(body);

async function run() {
  const target = isolatedTargetOrNull(process.env.TEST_DATABASE_URL);
  console.log('═══ Adjustment HTTP/API Integration Test (18 scenarios) ═══');
  console.log(`Isolated target: host=${target.host} port=${target.port} db=${target.dbName}\n`);
  await cleanSlate();

  const prodPcs = await makeProduct({ name: 'HTTP Kopi Pcs' });
  const prodP12 = await makeProduct({ name: 'HTTP Teh Pack12', pack_unit: 'karton', pack_size: 12 });
  const prodP24 = await makeProduct({ name: 'HTTP Susu Pack24', pack_unit: 'karton', pack_size: 24 });
  const bPcs = await makeBatch(prodPcs.id, { batch_no: 'HTTP-PCS-1', qty: 200 });
  const bP12 = await makeBatch(prodP12.id, { batch_no: 'HTTP-P12-1', qty: 120 });
  const bP24 = await makeBatch(prodP24.id, { batch_no: 'HTTP-P24-1', qty: 240 });

  // ── 1+2. paid sale loose pcs → return loose pcs ──
  const s1 = await makePaidSale({ order_number: 'HTTP-N1', total: 50000, items: [
    { product_name: prodPcs.name, qty: 5, qty_in_unit: 5, unit: 'pcs', unit_price: 10000, pack_size_at_sale: 1, batch_id: bPcs.id, batch_no: bPcs.batch_no },
  ]});
  const bPcsBefore = await batchQty(bPcs.id);
  const r1 = await postAdj(s1.sale.id, { type: 'return', reason: 'HTTP 1', idempotency_key: 'http-1',
    items: [{ direction: 'returned', original_sales_item_id: s1.items[0].id, qty_in_unit: 4, unit: 'pcs', condition: 'saleable' }] });
  assert.strictEqual(r1.status, 201, JSON.stringify(r1.body));
  await check('1-2. return loose pcs → 201; batch +4; refund settlement pending', async () => {
    assert.strictEqual(Number(await batchQty(bPcs.id)), Number(bPcsBefore) + 4);
    const { rows: [it] } = await q(`SELECT qty_base, qty_in_unit FROM sales_adjustment_items WHERE adjustment_id=$1`, [r1.body.adjustment.id]);
    assert.strictEqual(Number(it.qty_base), 4);
    assert.strictEqual(Number(r1.body.refund_amount), 40000);
    const { rows: [st] } = await q(`SELECT type, amount, settlement_status FROM sales_settlements WHERE adjustment_id=$1`, [r1.body.adjustment.id]);
    assert.strictEqual(st.type, 'refund');
    assert.strictEqual(Number(st.amount), 40000);
    assert.strictEqual(st.settlement_status, 'pending');
  });

  // ── 3+4. paid sale 1 pack isi 12 → return 1 pack → +12 ──
  const s2 = await makePaidSale({ order_number: 'HTTP-N2', total: 120000, items: [
    { product_name: prodP12.name, qty: 12, qty_in_unit: 1, unit: 'karton', unit_price: 120000, pack_size_at_sale: 12, batch_id: bP12.id, batch_no: bP12.batch_no },
  ]});
  const bP12Before = await batchQty(bP12.id);
  const r2 = await postAdj(s2.sale.id, { type: 'return', reason: 'HTTP 2', idempotency_key: 'http-2',
    items: [{ direction: 'returned', original_sales_item_id: s2.items[0].id, qty_in_unit: 1, unit: 'karton', condition: 'saleable' }] });
  assert.strictEqual(r2.status, 201, JSON.stringify(r2.body));
  await check('3-4. return 1 pack isi 12 → stock +12 base, qty_base=12', async () => {
    assert.strictEqual(Number(await batchQty(bP12.id)), Number(bP12Before) + 12);
    const { rows: [it] } = await q(`SELECT qty_base, qty_in_unit FROM sales_adjustment_items WHERE adjustment_id=$1`, [r2.body.adjustment.id]);
    assert.strictEqual(Number(it.qty_base), 12);
    assert.strictEqual(Number(it.qty_in_unit), 1);
  });

  // ── 5. exchange pack12 → pack24 ──
  const s3 = await makePaidSale({ order_number: 'HTTP-N3', total: 120000, items: [
    { product_name: prodP12.name, qty: 12, qty_in_unit: 1, unit: 'karton', unit_price: 120000, pack_size_at_sale: 12, batch_id: bP12.id, batch_no: bP12.batch_no },
  ]});
  const p12Before = await batchQty(bP12.id);
  const p24Before = await batchQty(bP24.id);
  const r3 = await postAdj(s3.sale.id, { type: 'exchange', reason: 'HTTP 3', idempotency_key: 'http-3',
    items: [
      { direction: 'returned', original_sales_item_id: s3.items[0].id, qty_in_unit: 1, unit: 'karton', condition: 'saleable' },
      { direction: 'replacement', replacement_batch_id: bP24.id, qty_in_unit: 1, unit: 'karton', unit_price: 200000 },
    ] });
  assert.strictEqual(r3.status, 201, JSON.stringify(r3.body));
  await check('5. exchange pack12→pack24 → +12 / -24, additional_charge 80000', async () => {
    assert.strictEqual(Number(await batchQty(bP12.id)), Number(p12Before) + 12);
    assert.strictEqual(Number(await batchQty(bP24.id)), Number(p24Before) - 24);
    assert.strictEqual(Number(r3.body.additional_charge), 80000);
    assert.strictEqual(Number(r3.body.refund_amount), 0);
  });

  // Each negative scenario gets a FRESH sale fixture so return quota is untouched.
  async function freshPcsSale(tag, qty = 5, price = 10000) {
    const s = await makePaidSale({ order_number: `HTTP-N-${tag}`, total: qty * price, items: [
      { product_name: prodPcs.name, qty, qty_in_unit: qty, unit: 'pcs', unit_price: price, pack_size_at_sale: 1, batch_id: bPcs.id, batch_no: bPcs.batch_no },
    ]});
    return s;
  }
  async function freshPackSale(tag) {
    const s = await makePaidSale({ order_number: `HTTP-N-${tag}`, total: 120000, items: [
      { product_name: prodP12.name, qty: 12, qty_in_unit: 1, unit: 'karton', unit_price: 120000, pack_size_at_sale: 12, batch_id: bP12.id, batch_no: bP12.batch_no },
    ]});
    return s;
  }

  // ── 6. negative replacement price → 400, no row ──
  const s6 = await freshPackSale('6');
  const nBefore6 = await countAdjustments();
  const r6 = await postAdj(s6.sale.id, { type: 'exchange', reason: 'HTTP 6', idempotency_key: 'http-6',
    items: [
      { direction: 'returned', original_sales_item_id: s6.items[0].id, qty_in_unit: 1, unit: 'karton', condition: 'saleable' },
      { direction: 'replacement', replacement_batch_id: bP24.id, qty_in_unit: 1, unit: 'karton', unit_price: -5000 },
    ] });
  await check('6. replacement price negatif → 400, no adjustment row (rollback)', async () => {
    assert.strictEqual(r6.status, 400);
    assert.strictEqual(await countAdjustments(), nBefore6);
  });

  // ── 7. unknown UOM → 400 ──
  const s7 = await freshPackSale('7');
  const r7 = await postAdj(s7.sale.id, { type: 'exchange', reason: 'HTTP 7', idempotency_key: 'http-7',
    items: [
      { direction: 'returned', original_sales_item_id: s7.items[0].id, qty_in_unit: 1, unit: 'karton', condition: 'saleable' },
      { direction: 'replacement', replacement_batch_id: bP24.id, qty_in_unit: 1, unit: 'foobar', unit_price: 200000 },
    ] });
  await check('7. unknown replacement UOM → 400', async () => {
    assert.strictEqual(r7.status, 400);
    assert.match(r7.body.error, /tidak valid/);
  });

  // ── 8. legacy qty_base-only pack → 400 ──
  const s8 = await freshPackSale('8');
  const r8 = await postAdj(s8.sale.id, { type: 'return', reason: 'HTTP 8', idempotency_key: 'http-8',
    items: [{ direction: 'returned', original_sales_item_id: s8.items[0].id, qty_base: 12, unit: 'karton', condition: 'saleable' }] });
  await check('8. legacy qty_base-only pack payload → 400 (fail-safe)', async () => {
    assert.strictEqual(r8.status, 400);
  });

  // ── 9. return qty > sold → 400 ──
  const s9 = await freshPcsSale('9');
  const r9 = await postAdj(s9.sale.id, { type: 'return', reason: 'HTTP 9', idempotency_key: 'http-9',
    items: [{ direction: 'returned', original_sales_item_id: s9.items[0].id, qty_in_unit: 99, unit: 'pcs', condition: 'saleable' }] });
  await check('9. return qty > sold → 400', async () => {
    assert.strictEqual(r9.status, 400);
  });

  // ── 10. insufficient replacement stock → 400 ──
  const s10 = await freshPackSale('10');
  const r10 = await postAdj(s10.sale.id, { type: 'exchange', reason: 'HTTP 10', idempotency_key: 'http-10',
    items: [
      { direction: 'returned', original_sales_item_id: s10.items[0].id, qty_in_unit: 1, unit: 'karton', condition: 'saleable' },
      { direction: 'replacement', replacement_batch_id: bP24.id, qty_in_unit: 999, unit: 'karton', unit_price: 200000 },
    ] });
  await check('10. insufficient replacement stock → 400', async () => {
    assert.strictEqual(r10.status, 400);
  });

  // ── 11. price_difference -50000 → refund 50000 ──
  const s4 = await makePaidSale({ order_number: 'HTTP-N4', total: 500000, items: [
    { product_name: prodPcs.name, qty: 5, qty_in_unit: 5, unit: 'pcs', unit_price: 100000, pack_size_at_sale: 1, batch_id: bPcs.id, batch_no: bPcs.batch_no },
  ]});
  const r11 = await postAdj(s4.sale.id, { type: 'price_difference', reason: 'HTTP 11', idempotency_key: 'http-11', difference_amount: -50000 });
  await check('11. price_difference -50000 → 201 refund 50000 (not blocked by invariant)', async () => {
    assert.strictEqual(r11.status, 201, JSON.stringify(r11.body));
    assert.strictEqual(Number(r11.body.refund_amount), 50000);
  });

  // ── 12. price_difference +50000 → additional charge ──
  const r12 = await postAdj(s4.sale.id, { type: 'price_difference', reason: 'HTTP 12', idempotency_key: 'http-12', difference_amount: 50000 });
  await check('12. price_difference +50000 → 201 additional_charge 50000', async () => {
    assert.strictEqual(r12.status, 201, JSON.stringify(r12.body));
    assert.strictEqual(Number(r12.body.additional_charge), 50000);
  });

  // ── 13. excessive refund → 400 ──
  const r13 = await postAdj(s4.sale.id, { type: 'price_difference', reason: 'HTTP 13', idempotency_key: 'http-13', difference_amount: -999999999 });
  await check('13. excessive price_difference refund → 400', async () => {
    assert.strictEqual(r13.status, 400);
  });

  // ── 13b. NaN / Infinity difference → 400 ──
  const r13b = await postAdj(s4.sale.id, { type: 'price_difference', reason: 'HTTP 13b', idempotency_key: 'http-13b', difference_amount: 'not-a-number' });
  await check('13b. NaN difference_amount → 400', async () => {
    assert.strictEqual(r13b.status, 400);
  });

  // ── 14. same key + same payload → replay ──
  const nBefore14 = await countAdjustments();
  const r14a = await postAdj(s1.sale.id, { type: 'return', reason: 'HTTP 14', idempotency_key: 'http-14-same',
    items: [{ direction: 'returned', original_sales_item_id: s1.items[0].id, qty_in_unit: 1, unit: 'pcs', condition: 'saleable' }] });
  assert.strictEqual(r14a.status, 201, JSON.stringify(r14a.body));
  const r14b = await postAdj(s1.sale.id, { type: 'return', reason: 'HTTP 14', idempotency_key: 'http-14-same',
    items: [{ direction: 'returned', original_sales_item_id: s1.items[0].id, qty_in_unit: 1, unit: 'pcs', condition: 'saleable' }] });
  await check('14. same key + same payload → 200 replay, no second row', async () => {
    assert.strictEqual(r14b.status, 200);
    assert.strictEqual(r14b.body.idempotent_replay, true);
    assert.strictEqual(r14b.body.adjustment.id, r14a.body.adjustment.id);
    assert.strictEqual(await countAdjustments(), nBefore14 + 1);
  });

  // ── 15. same key + different payload → 409 ──
  const r15 = await postAdj(s1.sale.id, { type: 'return', reason: 'HTTP 15 DIFFERENT', idempotency_key: 'http-14-same',
    items: [{ direction: 'returned', original_sales_item_id: s1.items[0].id, qty_in_unit: 1, unit: 'pcs', condition: 'saleable' }] });
  await check('15. same key + different payload → 409', async () => {
    assert.strictEqual(r15.status, 409);
  });

  // ── 16. admin void → 403 ──
  const r16 = await adm(request(app).post(`/api/sales/adjustments/${r1.body.adjustment.id}/void`)).send({ void_reason: 'coba admin' });
  await check('16. admin void → 403', async () => {
    assert.strictEqual(r16.status, 403);
  });

  // ── 17. direktur void tanpa reason → 400 ──
  const r17 = await dir(request(app).post(`/api/sales/adjustments/${r1.body.adjustment.id}/void`)).send({});
  await check('17. direktur void tanpa reason → 400', async () => {
    assert.strictEqual(r17.status, 400);
  });

  // ── 18. direktur void valid → stock reversed + audit ──
  const pcsBeforeVoid = await batchQty(bPcs.id);
  const r18 = await dir(request(app).post(`/api/sales/adjustments/${r1.body.adjustment.id}/void`)).send({ void_reason: 'HTTP 18 staging' });
  await check('18. direktur void valid → stock reversed, audit fields + audit log', async () => {
    assert.strictEqual(r18.status, 200, JSON.stringify(r18.body));
    assert.strictEqual(Number(await batchQty(bPcs.id)), Number(pcsBeforeVoid) - 4, 'returned stock must be taken back');
    const { rows: [adj] } = await q('SELECT status, settlement_status, voided_by, void_reason, voided_at FROM sales_adjustments WHERE id=$1', [r1.body.adjustment.id]);
    assert.strictEqual(adj.status, 'void');
    assert.strictEqual(adj.settlement_status, 'void');
    assert.strictEqual(Number(adj.voided_by), 9001);
    assert.strictEqual(adj.void_reason, 'HTTP 18 staging');
    assert.ok(adj.voided_at, 'voided_at must be set');
    const { rows: [log] } = await q(`SELECT action FROM sales_audit_log WHERE note LIKE $1`, [`%${r1.body.adjustment.adjustment_number}%`]);
    assert.ok(log, 'sales_audit_log must contain the void entry');
    assert.strictEqual(log.action, 'VOID_ADJUSTMENT');
  });

  await cleanSlate();
  console.log(`\n═══ HTTP/API Integration: ${passed} checks PASSED ═══\n`);
}

run().catch(async (err) => {
  console.error(`\nHTTP/API INTEGRATION: FAIL — ${err.message}`);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end().catch(() => {});
});
