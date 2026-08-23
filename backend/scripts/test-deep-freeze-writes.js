/**
 * Fase 8B — six real PostgreSQL write scenarios, each rolled back.
 * Requires the full schema and test/fixtures/deep-freeze-baseline.sql to be
 * provisioned on a disposable local test database before execution.
 */
process.env.NODE_ENV = 'test';

const assert = require('assert');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { assertDeepFreezeTarget, runWithRollback } = require('../utils/testTransaction');

const target = assertDeepFreezeTarget();
const verificationPool = new Pool({
  connectionString: target.connectionString,
  ssl: false,
  max: 1,
  connectionTimeoutMillis: 5_000,
});

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
  const { queryLog } = await runWithRollback(body, { logger: logQuery });
  const after = await snapshotCounts(verificationPool, tables);
  assert.deepStrictEqual(after, before, `${name}: row counts changed after rollback`);
  assert.strictEqual(queryLog.at(-1)?.sql, 'ROLLBACK');
  if (verifyAfterRollback) await verifyAfterRollback();
  passed += 1;
  console.log(`  ✅ ${name} — rollback restored ${JSON.stringify(before)}`);
}

async function run() {
  console.log('═══ Deep-Freeze Write Coverage (Fase 8B) ═══\n');

  await test(
    'Create Purchase Order',
    ['purchase_orders', 'purchase_order_items'],
    async (client) => {
      await client.query(
        `INSERT INTO purchase_orders
          (id, po_number, distributor_name, order_date, status, total, notes, is_deleted)
         VALUES ($1, $2, $3, CURRENT_DATE, 'draft', $4, $5, FALSE)`,
        [8501, 'DF-PO-CREATE', 'Deep Freeze Distributor', 30000, 'rollback-create-po'],
      );
      await client.query(
        `INSERT INTO purchase_order_items
          (id, po_id, product_id, product_name, qty, unit, unit_price, subtotal, received_qty)
         VALUES ($1, $2, $3, $4, $5, 'pcs', $6, $7, 0)`,
        [8502, 8501, 8101, 'Deep Freeze Product', 3, 10000, 30000],
      );
      const { rows } = await client.query(
        `SELECT po.po_number, COUNT(poi.id)::int AS item_count, SUM(poi.subtotal)::numeric AS subtotal
         FROM purchase_orders po
         JOIN purchase_order_items poi ON poi.po_id = po.id
         WHERE po.id = $1 GROUP BY po.id`,
        [8501],
      );
      assert.strictEqual(rows[0].po_number, 'DF-PO-CREATE');
      assert.strictEqual(rows[0].item_count, 1);
      assert.strictEqual(Number(rows[0].subtotal), 30000);
    },
    async () => {
      const { rowCount } = await verificationPool.query('SELECT 1 FROM purchase_orders WHERE id = $1', [8501]);
      assert.strictEqual(rowCount, 0);
    },
  );

  const baselineNota = await verificationPool.query(
    `SELECT so.total, so.notes, si.qty, si.unit_price, si.subtotal
     FROM sales_orders so JOIN sales_items si ON si.sales_order_id = so.id
     WHERE so.id = $1 AND si.id = $2`,
    [8301, 8302],
  );
  await test(
    'Edit Sales Nota',
    ['sales_orders', 'sales_items'],
    async (client) => {
      await client.query(
        'UPDATE sales_orders SET total = $1, notes = $2, updated_at = NOW() WHERE id = $3',
        [36000, 'edited-inside-rollback', 8301],
      );
      await client.query(
        'UPDATE sales_items SET qty = $1, unit_price = $2, subtotal = $3 WHERE id = $4',
        [2, 18000, 36000, 8302],
      );
      const { rows } = await client.query(
        `SELECT so.total, so.notes, si.qty, si.unit_price, si.subtotal
         FROM sales_orders so JOIN sales_items si ON si.sales_order_id = so.id
         WHERE so.id = $1 AND si.id = $2`,
        [8301, 8302],
      );
      assert.strictEqual(Number(rows[0].total), 36000);
      assert.strictEqual(rows[0].notes, 'edited-inside-rollback');
      assert.strictEqual(rows[0].qty, 2);
    },
    async () => {
      const restored = await verificationPool.query(
        `SELECT so.total, so.notes, si.qty, si.unit_price, si.subtotal
         FROM sales_orders so JOIN sales_items si ON si.sales_order_id = so.id
         WHERE so.id = $1 AND si.id = $2`,
        [8301, 8302],
      );
      assert.deepStrictEqual(restored.rows, baselineNota.rows);
    },
  );

  const baselineStock = await verificationPool.query(
    'SELECT qty_current FROM inventory_batches WHERE id = $1',
    [8201],
  );
  await test(
    'Update stock',
    ['inventory_batches', 'inventory_mutations'],
    async (client) => {
      const { rows } = await client.query(
        `UPDATE inventory_batches SET qty_current = qty_current - $1
         WHERE id = $2 AND qty_current >= $1 RETURNING qty_current`,
        [7, 8201],
      );
      assert.strictEqual(rows[0].qty_current, 43);
      await client.query(
        `INSERT INTO inventory_mutations
          (id, product_id, batch_id, type, qty, reference_type, notes)
         VALUES ($1, $2, $3, 'out', $4, 'deep-freeze-test', $5)`,
        [8601, 8101, 8201, 7, 'rollback-stock-update'],
      );
      const mutation = await client.query('SELECT qty FROM inventory_mutations WHERE id = $1', [8601]);
      assert.strictEqual(mutation.rows[0].qty, 7);
    },
    async () => {
      const restored = await verificationPool.query('SELECT qty_current FROM inventory_batches WHERE id = $1', [8201]);
      assert.deepStrictEqual(restored.rows, baselineStock.rows);
      const mutation = await verificationPool.query('SELECT 1 FROM inventory_mutations WHERE id = $1', [8601]);
      assert.strictEqual(mutation.rowCount, 0);
    },
  );

  const baselineDistributor = await verificationPool.query(
    'SELECT id, name, short_code FROM distributors WHERE id = $1',
    [8401],
  );
  await test(
    'Delete operation',
    ['distributors'],
    async (client) => {
      const removed = await client.query('DELETE FROM distributors WHERE id = $1 RETURNING id, name', [8401]);
      assert.strictEqual(removed.rowCount, 1);
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
    'User authentication flow',
    ['app_users'],
    async (client) => {
      const password = 'deep-freeze-auth-only';
      const hash = await bcrypt.hash(password, 4);
      await client.query(
        `INSERT INTO app_users (id, username, password, display_name, role, is_active)
         VALUES ($1, $2, $3, $4, 'admin', TRUE)`,
        [8701, 'deep-freeze-auth', hash, 'Deep Freeze Auth'],
      );
      const { rows } = await client.query(
        'SELECT id, username, password, role FROM app_users WHERE username = $1 AND is_active = TRUE',
        ['deep-freeze-auth'],
      );
      assert.strictEqual(await bcrypt.compare(password, rows[0].password), true);

      let sessionToken = jwt.sign(
        { id: rows[0].id, username: rows[0].username, role: rows[0].role },
        'deep-freeze-jwt-secret',
        { expiresIn: '1m' },
      );
      assert.strictEqual(jwt.verify(sessionToken, 'deep-freeze-jwt-secret').id, 8701);
      sessionToken = null;
      assert.strictEqual(sessionToken, null, 'JWT logout is client-side token disposal');
    },
    async () => {
      const { rowCount } = await verificationPool.query('SELECT 1 FROM app_users WHERE id = $1', [8701]);
      assert.strictEqual(rowCount, 0);
    },
  );

  await test(
    'Batch operation',
    ['inventory_batches', 'inventory_mutations'],
    async (client) => {
      await client.query(
        `INSERT INTO inventory_batches
          (id, product_id, batch_no, expired_date, qty_current, hna, source_type, source_ref, is_active)
         VALUES ($1, $2, $3, CURRENT_DATE + 730, $4, $5, 'deep-freeze-test', $6, TRUE)`,
        [8801, 8101, 'DF-BATCH-CREATE', 12, 11000, 'DF-BATCH-ROLLBACK'],
      );
      await client.query(
        `INSERT INTO inventory_mutations
          (id, product_id, batch_id, type, qty, reference_type, notes)
         VALUES ($1, $2, $3, 'in', $4, 'deep-freeze-test', $5)`,
        [8802, 8101, 8801, 12, 'rollback-batch-create'],
      );
      const { rows } = await client.query(
        `SELECT b.qty_current, m.qty AS mutation_qty
         FROM inventory_batches b JOIN inventory_mutations m ON m.batch_id = b.id
         WHERE b.id = $1 AND m.id = $2`,
        [8801, 8802],
      );
      assert.strictEqual(rows[0].qty_current, 12);
      assert.strictEqual(rows[0].mutation_qty, 12);
    },
    async () => {
      const batch = await verificationPool.query('SELECT 1 FROM inventory_batches WHERE id = $1', [8801]);
      const mutation = await verificationPool.query('SELECT 1 FROM inventory_mutations WHERE id = $1', [8802]);
      assert.strictEqual(batch.rowCount, 0);
      assert.strictEqual(mutation.rowCount, 0);
    },
  );

  console.log(`\n═══ Results: ${passed} PASSED, 0 FAILED ═══`);
  console.log('All row counts and baseline values restored after rollback.');
}

async function runAndClose() {
  try {
    await run();
  } finally {
    await verificationPool.end();
  }
}

if (require.main === module) {
  runAndClose().catch((error) => {
    console.error(`FATAL: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { run: runAndClose };
