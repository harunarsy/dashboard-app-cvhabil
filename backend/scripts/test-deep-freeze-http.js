/**
 * Fase 8C — actual Express write routes inside one outer rollback transaction.
 * Route BEGIN/COMMIT pairs are mapped to savepoints by testTransactionPool.
 */
process.env.NODE_ENV = 'test';
process.env.HABIL_ENV_LOADED = '1';
process.env.HABIL_ENV_FILE = 'deep-freeze-injected';
process.env.HABIL_DB_TARGET = 'dev';
process.env.JWT_SECRET = 'deep-freeze-http-secret';
process.env.JWT_EXPIRE = '5m';

// Never inherit a developer/remote database configuration into this suite.
delete process.env.DATABASE_URL;
delete process.env.DB_HOST;
delete process.env.DB_PORT;
delete process.env.DB_NAME;
delete process.env.DB_USER;
delete process.env.DB_PASSWORD;

const assert = require('assert');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const supertest = require('supertest');
const { assertDeepFreezeTarget, runWithRollback } = require('../utils/testTransaction');
const { createTransactionalPoolBridge } = require('../utils/testTransactionPool');

const target = assertDeepFreezeTarget();
const bridge = createTransactionalPoolBridge();
const databasePath = require.resolve('../config/database');
require.cache[databasePath] = {
  id: databasePath,
  filename: databasePath,
  loaded: true,
  exports: bridge.pool,
};

const app = require('../app');
const request = supertest(app);
const verificationPool = new Pool({
  connectionString: target.connectionString,
  ssl: false,
  max: 1,
  connectionTimeoutMillis: 5_000,
});
const adminToken = jwt.sign(
  { id: 9001, username: 'deep-freeze-admin', role: 'admin' },
  process.env.JWT_SECRET,
  { expiresIn: '5m' },
);

let passed = 0;

function logQuery(entry) {
  console.log(`    [Q${entry.index}] ${entry.source}: ${entry.sql}`);
}

async function snapshotCounts(db, tables) {
  const counts = {};
  for (const table of tables) {
    if (!/^[a-z_]+$/.test(table)) throw new Error(`Unsafe table identifier: ${table}`);
    const { rows } = await db.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
    counts[table] = rows[0].count;
  }
  return counts;
}

async function test(name, tables, body, verifyAfterRollback) {
  const before = await snapshotCounts(verificationPool, tables);
  const { queryLog } = await runWithRollback(
    (client) => bridge.withClient(client, () => body(client)),
    { logger: logQuery },
  );
  const after = await snapshotCounts(verificationPool, tables);
  assert.deepStrictEqual(after, before, `${name}: row counts changed after rollback`);
  assert.strictEqual(queryLog.at(-1)?.sql, 'ROLLBACK');
  if (verifyAfterRollback) await verifyAfterRollback();
  passed += 1;
  console.log(`  ✅ ${name} — rollback restored ${JSON.stringify(before)}`);
}

async function runCoverage() {
  console.log('═══ Deep-Freeze HTTP Route Coverage (Fase 8C) ═══\n');

  await test(
    'POST /api/purchase-orders creates header and item',
    ['purchase_orders', 'purchase_order_items'],
    async (client) => {
      const response = await request
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          po_number: 'DF-HTTP-PO-A',
          distributor_name: 'Deep Freeze Distributor',
          order_date: '2026-08-23',
          notes: 'http-route-rollback',
          items: [{
            product_id: 8101,
            product_name: 'Deep Freeze Product',
            qty: 2,
            unit: 'pcs',
            unit_price: 10000,
          }],
        });
      assert.strictEqual(response.status, 201, JSON.stringify(response.body));
      const inside = await client.query(
        `SELECT po.po_number, COUNT(poi.id)::int AS item_count
         FROM purchase_orders po JOIN purchase_order_items poi ON poi.po_id = po.id
         WHERE po.id = $1 GROUP BY po.id`,
        [response.body.id],
      );
      assert.strictEqual(inside.rows[0].po_number, 'DF-HTTP-PO-A');
      assert.strictEqual(inside.rows[0].item_count, 1);
    },
    async () => {
      const row = await verificationPool.query(
        'SELECT 1 FROM purchase_orders WHERE po_number = $1',
        ['DF-HTTP-PO-A'],
      );
      assert.strictEqual(row.rowCount, 0);
    },
  );

  const baselineNota = await verificationPool.query(
    `SELECT so.total, so.notes, si.id AS item_id, si.qty, si.unit_price, b.qty_current
     FROM sales_orders so
     JOIN sales_items si ON si.sales_order_id = so.id
     JOIN inventory_batches b ON b.id = $2
     WHERE so.id = $1`,
    [8301, 8201],
  );
  await test(
    'PUT /api/sales/:id edits nota and resyncs stock',
    ['sales_orders', 'sales_items', 'inventory_batches', 'inventory_mutations', 'customers'],
    async (client) => {
      const response = await request
        .put('/api/sales/8301')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customer_name: 'Deep Freeze Customer',
          customer_address: '',
          customer_phone: '',
          sale_date: '2026-08-23',
          notes: 'http-edited-nota',
          status: 'final',
          payment_method: 'Tunai',
          items: [{
            product_name: 'Deep Freeze Product',
            qty: 2,
            unit: 'pcs',
            unit_price: 16000,
            unit_hpp: 10000,
            unit_hpp_tax_type: 'faktur',
            selected_batch_id: 8201,
            batch_id_snapshot: 8201,
          }],
        });
      assert.strictEqual(response.status, 200, JSON.stringify(response.body));
      const inside = await client.query(
        `SELECT so.total, so.notes, si.qty, si.unit_price, si.batch_id_snapshot, b.qty_current
         FROM sales_orders so
         JOIN sales_items si ON si.sales_order_id = so.id
         JOIN inventory_batches b ON b.id = $2
         WHERE so.id = $1`,
        [8301, 8201],
      );
      assert.strictEqual(Number(inside.rows[0].total), 32000);
      assert.strictEqual(inside.rows[0].notes, 'http-edited-nota');
      assert.strictEqual(inside.rows[0].qty, 2);
      assert.strictEqual(inside.rows[0].batch_id_snapshot, 8201);
      assert.strictEqual(inside.rows[0].qty_current, 48);
    },
    async () => {
      const restored = await verificationPool.query(
        `SELECT so.total, so.notes, si.id AS item_id, si.qty, si.unit_price, b.qty_current
         FROM sales_orders so
         JOIN sales_items si ON si.sales_order_id = so.id
         JOIN inventory_batches b ON b.id = $2
         WHERE so.id = $1`,
        [8301, 8201],
      );
      assert.deepStrictEqual(restored.rows, baselineNota.rows);
    },
  );

  const baselineStock = await verificationPool.query(
    'SELECT qty_current FROM inventory_batches WHERE id = $1',
    [8201],
  );
  await test(
    'POST /api/inventory/stock-out updates stock and mutation',
    ['inventory_batches', 'inventory_mutations'],
    async (client) => {
      const response = await request
        .post('/api/inventory/stock-out')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          product_id: 8101,
          selected_batch_id: 8201,
          qty: 3,
          reference_type: 'deep-freeze-http',
          notes: 'http-stock-out-rollback',
        });
      assert.strictEqual(response.status, 200, JSON.stringify(response.body));
      const batch = await client.query('SELECT qty_current FROM inventory_batches WHERE id = $1', [8201]);
      const mutation = await client.query(
        `SELECT qty FROM inventory_mutations
         WHERE batch_id = $1 AND reference_type = 'deep-freeze-http'`,
        [8201],
      );
      assert.strictEqual(batch.rows[0].qty_current, 47);
      assert.strictEqual(mutation.rows[0].qty, 3);
    },
    async () => {
      const restored = await verificationPool.query('SELECT qty_current FROM inventory_batches WHERE id = $1', [8201]);
      assert.deepStrictEqual(restored.rows, baselineStock.rows);
      const mutation = await verificationPool.query(
        `SELECT 1 FROM inventory_mutations
         WHERE batch_id = $1 AND reference_type = 'deep-freeze-http'`,
        [8201],
      );
      assert.strictEqual(mutation.rowCount, 0);
    },
  );

  const baselineDistributor = await verificationPool.query(
    'SELECT id, name, short_code FROM distributors WHERE id = $1',
    [8401],
  );
  await test(
    'DELETE /api/distributors removes a distributor',
    ['distributors'],
    async (client) => {
      const response = await request
        .delete('/api/distributors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Deep Freeze Distributor' });
      assert.strictEqual(response.status, 200, JSON.stringify(response.body));
      const inside = await client.query('SELECT 1 FROM distributors WHERE id = $1', [8401]);
      assert.strictEqual(inside.rowCount, 0);
    },
    async () => {
      const restored = await verificationPool.query(
        'SELECT id, name, short_code FROM distributors WHERE id = $1',
        [8401],
      );
      assert.deepStrictEqual(restored.rows, baselineDistributor.rows);
    },
  );

  await test(
    'login → authenticated session → logout',
    ['app_users'],
    async () => {
      const login = await request
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'deep-freeze-only' });
      assert.strictEqual(login.status, 200, JSON.stringify(login.body));
      assert.ok(login.body.token);

      const session = await request
        .get('/api/distributors?limit=1')
        .set('Authorization', `Bearer ${login.body.token}`);
      assert.strictEqual(session.status, 200, JSON.stringify(session.body));

      const logout = await request
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${login.body.token}`);
      assert.strictEqual(logout.status, 200, JSON.stringify(logout.body));

      const afterLogout = await request.get('/api/distributors?limit=1');
      assert.strictEqual(afterLogout.status, 401);
    },
  );

  await test(
    'POST /api/inventory/stock-in creates batch and mutation',
    ['inventory_batches', 'inventory_mutations'],
    async (client) => {
      const response = await request
        .post('/api/inventory/stock-in')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          product_id: 8101,
          batch_no: 'DF-HTTP-BATCH',
          expired_date: '2028-08-23',
          qty: 9,
          hna: 11000,
          source_type: 'deep-freeze-http',
          source_ref: 'DF-HTTP-STOCK-IN',
          notes: 'http-batch-rollback',
        });
      assert.strictEqual(response.status, 201, JSON.stringify(response.body));
      const inside = await client.query(
        `SELECT b.qty_current, m.qty AS mutation_qty
         FROM inventory_batches b JOIN inventory_mutations m ON m.batch_id = b.id
         WHERE b.id = $1 AND m.reference_type = 'deep-freeze-http'`,
        [response.body.id],
      );
      assert.strictEqual(inside.rows[0].qty_current, 9);
      assert.strictEqual(inside.rows[0].mutation_qty, 9);
    },
    async () => {
      const batch = await verificationPool.query(
        'SELECT 1 FROM inventory_batches WHERE batch_no = $1',
        ['DF-HTTP-BATCH'],
      );
      assert.strictEqual(batch.rowCount, 0);
    },
  );

  console.log(`\n═══ Results: ${passed} PASSED, 0 FAILED ═══`);
  console.log('All HTTP writes ran on the outer transaction connection and rolled back.');
}

async function run() {
  try {
    await runCoverage();
  } finally {
    await verificationPool.end();
  }
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`FATAL: ${error.message}`);
      process.exit(1);
    });
}

module.exports = { run };
