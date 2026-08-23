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
  const { rows } = await verificationPool.query('SELECT COUNT(*)::int AS count FROM distributors');
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
        `INSERT INTO distributors
          (id, name, short_code, salesman_name, salesman_phone)
         VALUES ($1, $2, $3, $4, $5)`,
        [810001, 'Wrapper Success Probe', 'WSP', 'Wrapper Test', '080000000002'],
      );
      const { rows } = await client.query(
        'SELECT COUNT(*)::int AS count FROM distributors WHERE id = $1',
        [810001],
      );
      assert.strictEqual(rows[0].count, 1);
      return rows[0].count;
    }, { logger: logQuery });

    assert.strictEqual(result.value, 1);
    assert.ok(result.queryLog.some((entry) => entry.sql.startsWith('INSERT INTO distributors')));
    assert.strictEqual(result.queryLog.at(-1).sql, 'ROLLBACK');
    assert.strictEqual(await countProbeRows(), baseline);
  });

  await test('exception path still rolls back', async () => {
    const intentional = new Error('intentional test-body failure');
    await assert.rejects(
      runWithRollback(async (client) => {
        await client.query(
          `INSERT INTO distributors
            (id, name, short_code, salesman_name, salesman_phone)
           VALUES ($1, $2, $3, $4, $5)`,
          [810002, 'Wrapper Exception Probe', 'WEP', 'Wrapper Test', '080000000003'],
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
          `INSERT INTO distributors
            (id, name, short_code, salesman_name, salesman_phone)
           VALUES ($1, $2, $3, $4, $5)`,
          [810003, 'Wrapper Timeout Probe', 'WTP', 'Wrapper Test', '080000000004'],
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

async function runAndClose() {
  try {
    await run();
  } finally {
    await verificationPool.end();
  }
}

if (require.main === module) {
  runAndClose()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`FATAL: ${error.message}`);
      process.exit(1);
    });
}

module.exports = { run: runAndClose };
