/**
 * Fase 8D — explicit rollback verification and row-count safety net.
 * Requires the disposable schema and deep-freeze baseline fixture.
 * This test executes DML only inside runWithRollback(); it executes no DDL.
 */
process.env.NODE_ENV = 'test';

const assert = require('assert');
const { Pool } = require('pg');
const {
  assertDeepFreezeTarget,
  assertRollbackRestored,
  runWithRollback,
} = require('../utils/testTransaction');

const target = assertDeepFreezeTarget();
const verificationPool = new Pool({
  connectionString: target.connectionString,
  ssl: false,
  max: 1,
  connectionTimeoutMillis: 5_000,
});

function logQuery(entry) {
  console.log(`    [Q${entry.index}] ${entry.source}: ${entry.sql}`);
}

async function countDistributors() {
  const { rows } = await verificationPool.query(
    'SELECT COUNT(*)::int AS count FROM distributors',
  );
  return rows[0].count;
}

async function run() {
  console.log('═══ Deep-Freeze Safety Net (Fase 8D) ═══\n');

  const baselineCount = await countDistributors();
  const { queryLog } = await runWithRollback(async (client) => {
    await client.query(
      `INSERT INTO distributors
        (id, name, short_code, salesman_name, salesman_phone)
       VALUES ($1, $2, $3, $4, $5)`,
      [8503, 'Deep Freeze Safety Dummy', 'DFS', 'Safety Probe', '080000000001'],
    );

    const { rows } = await client.query(
      'SELECT id, name FROM distributors WHERE id = $1',
      [8503],
    );
    assert.deepStrictEqual(rows, [{ id: 8503, name: 'Deep Freeze Safety Dummy' }]);
    console.log('  ✅ Dummy row visible inside the transaction');
  }, { logger: logQuery });

  assert.strictEqual(queryLog.at(-1)?.sql, 'ROLLBACK');
  const afterRollbackCount = await countDistributors();
  assertRollbackRestored(
    baselineCount,
    afterRollbackCount,
    'explicit dummy rollback row count',
  );

  const { rowCount } = await verificationPool.query(
    'SELECT 1 FROM distributors WHERE id = $1',
    [8503],
  );
  assert.strictEqual(rowCount, 0, 'ROLLBACK FAILED: dummy row remains after rollback');
  console.log(`  ✅ Dummy row absent after rollback; count restored to ${baselineCount}`);
  console.log('  ✅ DDL during safety-net test: 0 (guarded by transaction wrapper)');
  console.log('\n═══ Results: 1 PASSED, 0 FAILED ═══');
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
