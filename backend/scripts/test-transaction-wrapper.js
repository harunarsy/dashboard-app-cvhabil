/**
 * Real rollback verification for backend/utils/testTransaction.js.
 * The disposable fixture table must be provisioned before this script runs;
 * this test executes no DDL.
 */
process.env.NODE_ENV = 'test';

const assert = require('assert');
const { Pool } = require('pg');
const {
  assertDeepFreezeTarget,
  assertSafeTestQuery,
  runWithRollback,
} = require('../utils/testTransaction');

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

async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ✅ ${name}`);
}

async function countProbeRows() {
  const { rows } = await verificationPool.query('SELECT COUNT(*)::int AS count FROM phase8_transaction_probe');
  return rows[0].count;
}

async function run() {
  console.log('═══ Deep-Freeze Transaction Wrapper Tests ═══\n');
  const baseline = await countProbeRows();

  await test('target is local, explicit, and test-named', async () => {
    assert.ok(['localhost', '127.0.0.1', '::1'].includes(target.hostname));
    assert.match(target.databaseName, /test|ci/i);
    assert.throws(
      () => assertDeepFreezeTarget('postgresql://blocked@remote.neon.tech/habil_test'),
      (error) => error.code === 'REMOTE_TEST_DATABASE_BLOCKED',
    );
    assert.throws(
      () => assertDeepFreezeTarget('postgresql://blocked@127.0.0.1/habil_production'),
      (error) => error.code === 'UNSAFE_TEST_DATABASE_NAME',
    );
  });

  await test('successful body observes its write before real rollback', async () => {
    const result = await runWithRollback(async (client) => {
      await client.query(
        'INSERT INTO phase8_transaction_probe (id, note) VALUES ($1, $2)',
        [810001, 'success-path'],
      );
      const { rows } = await client.query(
        'SELECT COUNT(*)::int AS count FROM phase8_transaction_probe WHERE id = $1',
        [810001],
      );
      assert.strictEqual(rows[0].count, 1);
      return rows[0].count;
    }, { logger: logQuery });

    assert.strictEqual(result.value, 1);
    assert.ok(result.queryLog.some((entry) => entry.sql.startsWith('INSERT INTO phase8_transaction_probe')));
    assert.strictEqual(result.queryLog.at(-1).sql, 'ROLLBACK');
    assert.strictEqual(await countProbeRows(), baseline);
  });

  await test('exception path still rolls back', async () => {
    const intentional = new Error('intentional test-body failure');
    await assert.rejects(
      runWithRollback(async (client) => {
        await client.query(
          'INSERT INTO phase8_transaction_probe (id, note) VALUES ($1, $2)',
          [810002, 'exception-path'],
        );
        throw intentional;
      }, { logger: logQuery }),
      (error) => error === intentional && error.queryLog.at(-1).sql === 'ROLLBACK',
    );
    assert.strictEqual(await countProbeRows(), baseline);
  });

  await test('test body cannot run DDL or control the outer transaction', async () => {
    assert.throws(
      () => assertSafeTestQuery('CREATE TABLE forbidden_probe (id integer)'),
      (error) => error.code === 'TEST_DDL_BLOCKED',
    );
    assert.throws(
      () => assertSafeTestQuery('COMMIT'),
      (error) => error.code === 'TEST_TRANSACTION_CONTROL_BLOCKED',
    );
  });

  await test('timeout closes the transaction and leaves no row', async () => {
    await assert.rejects(
      runWithRollback(async (client) => {
        await client.query(
          'INSERT INTO phase8_transaction_probe (id, note) VALUES ($1, $2)',
          [810003, 'timeout-path'],
        );
        await new Promise((resolve) => setTimeout(resolve, 60));
      }, { timeoutMs: 25, logger: logQuery }),
      (error) => error.code === 'TEST_TIMEOUT' && error.queryLog.at(-1).sql === 'ROLLBACK',
    );
    assert.strictEqual(await countProbeRows(), baseline);
  });

  console.log(`\n═══ Results: ${passed} PASSED, 0 FAILED ═══`);
  console.log(`Rollback baseline preserved: ${baseline} rows`);
}

run()
  .catch((error) => {
    console.error(`FATAL: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await verificationPool.end();
  });
