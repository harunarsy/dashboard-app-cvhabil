#!/usr/bin/env node

const path = require('path');
const {
  describeDbTarget,
  ensureDbTargetSafety,
  loadRuntimeEnv,
} = require('../config/runtimeEnv');
const {
  listRouteSchemaMigrations,
  runRouteSchemaMigrations,
} = require('../migrations/routeSchemas');

const args = new Set(process.argv.slice(2));

const printMigrationList = () => {
  console.log('Schema migrations (execution order):');
  for (const id of listRouteSchemaMigrations()) console.log(`- ${id}`);
};

const assertExecutionIsExplicit = () => {
  if (process.env.NODE_ENV === 'test') {
    throw new Error('Schema migration is disabled when NODE_ENV=test');
  }
  if (process.env.ALLOW_SCHEMA_MIGRATION !== 'true') {
    throw new Error('Set ALLOW_SCHEMA_MIGRATION=true to enable schema migration');
  }
};

const assertTargetIsConfirmed = () => {
  ensureDbTargetSafety({
    context: 'backend/schema-migration',
    allowProdLocal: false,
    allowProdSmoke: false,
  });
  const target = describeDbTarget();
  if (!target.host) {
    throw new Error('Cannot identify database hostname; migration refused');
  }
  if (process.env.MIGRATION_TARGET_CONFIRM !== target.host) {
    throw new Error(
      `Set MIGRATION_TARGET_CONFIRM=${target.host} to confirm the exact database host`,
    );
  }
  const logicalTarget = (process.env.HABIL_DB_TARGET || '').trim().toLowerCase();
  if (logicalTarget === 'audit' || logicalTarget === 'prod-smoke') {
    throw new Error(`HABIL_DB_TARGET=${logicalTarget} is read-only; migration refused`);
  }
  return target;
};

const main = async () => {
  if (args.has('--list') || args.has('--dry-run')) {
    printMigrationList();
    return;
  }

  assertExecutionIsExplicit();
  loadRuntimeEnv({
    baseDir: path.join(__dirname, '..'),
    context: 'backend/schema-migration',
    preferDevEnv: true,
  });
  const target = assertTargetIsConfirmed();

  // Load the pool only after every non-DB safety gate has passed.
  const pool = require('../config/database');
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL lock_timeout = '10s'`);
    await client.query(`SET LOCAL statement_timeout = '4min'`);
    const { rows: [mode] } = await client.query('SHOW transaction_read_only');
    if (mode?.transaction_read_only === 'on') {
      throw new Error('Database transaction is read-only; schema migration cannot run');
    }
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext('habil_route_schema_migrations'))`,
    );

    console.log(`[Migration] confirmed host ${target.host}`);
    const result = await runRouteSchemaMigrations(client);
    await client.query('COMMIT');
    committed = true;
    console.log(
      `[Migration] complete: ${result.applied.length} applied, ${result.skipped.length} skipped`,
    );
  } finally {
    if (!committed) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error(`[Migration] rollback failed: ${rollbackError.message}`);
      }
    }
    client.release();
    await pool.end();
  }
};

main().catch((error) => {
  console.error(`[Migration] refused/failed: ${error.message}`);
  process.exitCode = 1;
});
