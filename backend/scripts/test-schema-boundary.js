const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const backendDir = path.join(__dirname, '..');
const routesDir = path.join(backendDir, 'routes');
const migrationScript = path.join(__dirname, 'migrate.js');
const expectedMigrationIds = [
  '20260823_001_auth',
  '20260823_002_inventory',
  '20260823_003_sales',
  '20260823_004_invoices',
  '20260823_005_purchase_orders',
  '20260823_006_distributors',
  '20260823_007_loans',
  '20260823_008_settings',
  '20260823_009_product_catalog',
  '20260823_010_customers',
  '20260823_011_price_list',
  '20260823_012_marketplace',
  '20260823_013_online_store',
  '20260823_014_print_settings',
  '20260823_015_bug_reports',
  '20260823_016_ledger',
  '20260823_017_tax',
  '20260905_018_sales_adjustments',
  '20260905_019_sales_adjustments_void_audit',
  '20260911_020_invoice_delta_edit',
  '20260911_021_invoice_edit_event_retention',
];

let passed = 0;
const test = async (name, fn) => {
  await fn();
  passed += 1;
  console.log(`  ✅ ${name}`);
};

const routeFiles = fs.readdirSync(routesDir)
  .filter((file) => file.endsWith('.js'))
  .sort();

(async () => {
  console.log('═══ Schema Boundary Tests ═══\n');

  await test('Route modules contain no DDL or import-time schema initializer', () => {
    const violations = [];
    const ddlPattern = /\b(?:CREATE\s+(?:TABLE|INDEX|UNIQUE\s+INDEX)|ALTER\s+TABLE|DROP\s+(?:TABLE|INDEX)|setval\s*\()/i;
    const initializerPattern = /\bensure(?:Schema|Table)\b|\brunOnce\b/;
    for (const file of routeFiles) {
      const source = fs.readFileSync(path.join(routesDir, file), 'utf8');
      if (ddlPattern.test(source) || initializerPattern.test(source)) violations.push(file);
    }
    assert.deepStrictEqual(violations, [], `Schema logic remains in routes: ${violations.join(', ')}`);
  });

  await test('Explicit migration registry is complete and ordered', () => {
    const { listRouteSchemaMigrations } = require('../migrations/routeSchemas');
    assert.deepStrictEqual(listRouteSchemaMigrations(), expectedMigrationIds);
  });

  await test('Missing baseline relations fail before any migration step', async () => {
    const { assertBaselineSchema } = require('../migrations/routeSchemas');
    await assert.rejects(
      () => assertBaselineSchema({
        query: async () => ({
          rows: [
            { required_name: 'invoices', relation: 'public.invoices' },
            { required_name: 'invoice_items', relation: null },
          ],
        }),
      }),
      /Missing baseline schema relation\(s\): invoice_items/,
    );
  });

  await test('Untracked legacy schema is rejected before any DDL or data migration', async () => {
    const { runRouteSchemaMigrations } = require('../migrations/routeSchemas');
    const statements = [];
    const db = {
      async query(sql, params = []) {
        const normalized = String(sql).replace(/\s+/g, ' ').trim();
        statements.push(normalized);
        if (normalized.includes('FROM unnest($1::text[]) AS required(required_name)')) {
          return {
            rows: params[0].map((name) => ({ required_name: name, relation: `public.${name}` })),
          };
        }
        if (normalized.includes("to_regclass('public.schema_migrations')")) {
          return { rows: [{ relation: null }] };
        }
        return { rows: [] };
      },
    };
    await assert.rejects(() => runRouteSchemaMigrations(db), /Untracked legacy schema detected/);
    assert.ok(!statements.some((sql) => /CREATE TABLE IF NOT EXISTS schema_migrations/i.test(sql)));
    assert.ok(!statements.some((sql) => /UPDATE sales_orders|INSERT INTO app_users/i.test(sql)));
  });

  await test('Legacy bootstrap verifies schema, records baseline, and applies delta migrations only', async () => {
    const {
      bootstrapLegacySchemaMigrations,
      LEGACY_BASELINE_MIGRATION_IDS,
      LEGACY_REQUIRED_COLUMNS,
      LEGACY_REQUIRED_RELATIONS,
    } = require('../migrations/routeSchemas');
    const statements = [];
    const appliedIds = new Set();
    let trackerExists = false;
    const db = {
      async query(sql, params = []) {
        const normalized = String(sql).replace(/\s+/g, ' ').trim();
        statements.push(normalized);
        if (normalized.includes('FROM unnest($1::text[]) AS required(required_name)')) {
          return {
            rows: params[0].map((name) => ({ required_name: name, relation: `public.${name}` })),
          };
        }
        if (normalized.includes('FROM information_schema.columns')) {
          return {
            rows: LEGACY_REQUIRED_COLUMNS.map(([table_name, column_name]) => ({ table_name, column_name })),
          };
        }
        if (normalized.includes("to_regclass('public.schema_migrations')")) {
          return { rows: [{ relation: trackerExists ? 'schema_migrations' : null }] };
        }
        if (normalized === 'SELECT id FROM schema_migrations') {
          return { rows: [...appliedIds].map((id) => ({ id })) };
        }
        if (/CREATE TABLE IF NOT EXISTS schema_migrations/i.test(normalized)) {
          trackerExists = true;
          return { rows: [] };
        }
        if (normalized.startsWith('INSERT INTO schema_migrations (id) SELECT unnest')) {
          for (const id of params[0]) appliedIds.add(id);
          return { rows: [] };
        }
        if (normalized === 'INSERT INTO schema_migrations (id) VALUES ($1)') {
          appliedIds.add(params[0]);
          return { rows: [] };
        }
        return { rows: [] };
      },
    };
    const result = await bootstrapLegacySchemaMigrations(db, { logger: { log: () => {} } });
    assert.deepStrictEqual(result.baselineRecorded, LEGACY_BASELINE_MIGRATION_IDS);
    assert.deepStrictEqual(result.applied, [
      '20260911_020_invoice_delta_edit',
      '20260911_021_invoice_edit_event_retention',
    ]);
    assert.strictEqual(appliedIds.size, LEGACY_BASELINE_MIGRATION_IDS.length + 2);
    assert.ok(!statements.some((sql) => /UPDATE sales_orders|INSERT INTO app_users/i.test(sql)));
    assert.ok(!statements.some((sql) => /CREATE TABLE IF NOT EXISTS marketplace_stores/i.test(sql)));
    assert.ok(statements.some((sql) => /ADD COLUMN IF NOT EXISTS line_key/i.test(sql)));
    assert.strictEqual(LEGACY_REQUIRED_RELATIONS.length > 0, true);
  });

  await test('Legacy bootstrap fails before writes when required schema is missing', async () => {
    const { bootstrapLegacySchemaMigrations } = require('../migrations/routeSchemas');
    const statements = [];
    const db = {
      async query(sql, params = []) {
        const normalized = String(sql).replace(/\s+/g, ' ').trim();
        statements.push(normalized);
        if (normalized.includes('FROM unnest($1::text[]) AS required(required_name)')) {
          return { rows: [{ required_name: 'invoices', relation: 'public.invoices' }] };
        }
        if (normalized.includes('FROM information_schema.columns')) return { rows: [] };
        return { rows: [] };
      },
    };
    await assert.rejects(() => bootstrapLegacySchemaMigrations(db), /Legacy schema verification failed/);
    assert.ok(!statements.some((sql) => /CREATE TABLE IF NOT EXISTS schema_migrations/i.test(sql)));
  });

  await test('Neon operator SQL is transactional, guarded, and delta-only', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, 'neon_bootstrap_legacy_invoice_delta.sql'),
      'utf8',
    );
    assert.match(sql, /^BEGIN;/m);
    assert.match(sql, /SET LOCAL lock_timeout = '10s'/);
    assert.match(sql, /SET LOCAL statement_timeout = '4min'/);
    assert.match(sql, /pg_advisory_xact_lock\(hashtext\('habil_route_schema_migrations'\)\)/);
    assert.match(sql, /Legacy bootstrap refused: missing relations/);
    assert.match(sql, /Legacy bootstrap refused: missing columns/);
    assert.match(sql, /\('invoice_items', 'batch_number'\)/);
    assert.ok(!sql.includes("('invoice_items', 'batch_no')"));
    assert.match(sql, /ADD COLUMN IF NOT EXISTS line_key/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS invoice_edit_events/);
    assert.match(sql, /DROP CONSTRAINT IF EXISTS invoice_edit_events_invoice_id_fkey/);
    assert.match(sql, /COMMIT;/);
    assert.ok(!/UPDATE\s+(?:invoices|invoice_items|inventory_mutations|inventory_batches|sales_orders)/i.test(sql));
    assert.ok(!/DELETE\s+FROM/i.test(sql));
  });

  await test('Migration registry executes once against a database mock', async () => {
    const { runRouteSchemaMigrations } = require('../migrations/routeSchemas');
    const appliedIds = new Set();
    const legacyIds = new Set();
    const statements = [];
    let trackerExists = false;
    const db = {
      async query(sql, params = []) {
        const normalized = String(sql).replace(/\s+/g, ' ').trim();
        statements.push(normalized);
        if (normalized.includes('FROM unnest($1::text[]) AS required(required_name)')) {
          return {
            rows: params[0].map((name) => ({ required_name: name, relation: `public.${name}` })),
            rowCount: params[0].length,
          };
        }
        if (normalized === 'SELECT id FROM schema_migrations') {
          return { rows: [...appliedIds].map((id) => ({ id })), rowCount: appliedIds.size };
        }
        if (normalized.includes("to_regclass('public.schema_migrations')")) {
          return { rows: [{ relation: trackerExists ? 'schema_migrations' : null }], rowCount: 1 };
        }
        if (/CREATE TABLE IF NOT EXISTS schema_migrations/i.test(normalized)) {
          trackerExists = true;
          return { rows: [], rowCount: 0 };
        }
        if (normalized === 'INSERT INTO schema_migrations (id) VALUES ($1)') {
          appliedIds.add(params[0]);
          return { rows: [], rowCount: 1 };
        }
        if (normalized === 'SELECT 1 FROM app_users LIMIT 1') {
          return { rows: [{ '?column?': 1 }], rowCount: 1 };
        }
        if (normalized === 'SELECT 1 FROM schema_meta WHERE key = $1') {
          return {
            rows: legacyIds.has(params[0]) ? [{ '?column?': 1 }] : [],
            rowCount: legacyIds.has(params[0]) ? 1 : 0,
          };
        }
        if (normalized.startsWith('INSERT INTO schema_meta (key) VALUES')) {
          legacyIds.add(params[0]);
          return { rows: [], rowCount: 1 };
        }
        if (normalized.includes("to_regclass('public.product_master')")) {
          return { rows: [{ exists: 'public.product_master' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
    };
    const logger = { log: () => {} };

    const first = await runRouteSchemaMigrations(db, { logger, allowUntrackedSchema: true });
    assert.deepStrictEqual(first.applied, expectedMigrationIds);
    assert.deepStrictEqual(first.skipped, []);
    assert.strictEqual(appliedIds.size, expectedMigrationIds.length);
    assert.ok(statements.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS product_master')));
    assert.ok(statements.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS marketplace_store_files')));
    assert.ok(statements.some((sql) => sql.includes("UPDATE sales_orders SET status = 'final'")));

    const beforeSecondRun = statements.length;
    const second = await runRouteSchemaMigrations(db, { logger });
    assert.deepStrictEqual(second.applied, []);
    assert.deepStrictEqual(second.skipped, expectedMigrationIds);
    const secondRunStatements = statements.slice(beforeSecondRun);
    assert.strictEqual(
      secondRunStatements.filter((sql) => sql.startsWith('INSERT INTO schema_migrations')).length,
      0,
    );
  });

  await test('Migration list/dry-run path performs no database connection', () => {
    const result = spawnSync(process.execPath, [migrationScript, '--list'], {
      cwd: backendDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://blocked:blocked@should-not-connect.invalid/db',
      },
      timeout: 30_000,
    });
    assert.strictEqual(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(expectedMigrationIds[0]));
    assert.ok(result.stdout.includes(expectedMigrationIds.at(-1)));
    assert.ok(!`${result.stdout}${result.stderr}`.includes('[DB] Attempting'));
  });

  await test('NODE_ENV=test hard-blocks migration before database loading', () => {
    const result = spawnSync(process.execPath, [migrationScript], {
      cwd: backendDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ALLOW_SCHEMA_MIGRATION: 'true',
        MIGRATION_TARGET_CONFIRM: 'should-not-connect.invalid',
        DATABASE_URL: 'postgresql://blocked:blocked@should-not-connect.invalid/db',
      },
      timeout: 30_000,
    });
    assert.notStrictEqual(result.status, 0);
    assert.ok(`${result.stdout}${result.stderr}`.includes('disabled when NODE_ENV=test'));
    assert.ok(!`${result.stdout}${result.stderr}`.includes('[DB] Attempting'));
  });

  await test('Exact-host confirmation is required before database loading', () => {
    const result = spawnSync(process.execPath, [migrationScript], {
      cwd: backendDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'development',
        HABIL_ENV_LOADED: '1',
        HABIL_ENV_FILE: 'schema-boundary-test',
        HABIL_DB_TARGET: 'dev',
        DATABASE_URL: '',
        DB_HOST: 'localhost',
        ALLOW_SCHEMA_MIGRATION: 'true',
        MIGRATION_TARGET_CONFIRM: '',
      },
      timeout: 30_000,
    });
    assert.notStrictEqual(result.status, 0);
    assert.ok(`${result.stdout}${result.stderr}`.includes('MIGRATION_TARGET_CONFIRM=localhost'));
    assert.ok(!`${result.stdout}${result.stderr}`.includes('[DB] Attempting'));
  });

  await test('Runner keeps transactional controls and advisory serialization', () => {
    const source = fs.readFileSync(migrationScript, 'utf8');
    for (const required of [
      "client.query('BEGIN')",
      "client.query('SHOW transaction_read_only')",
      'pg_advisory_xact_lock',
      "client.query('COMMIT')",
      "client.query('ROLLBACK')",
      "SET LOCAL lock_timeout = '10s'",
      "SET LOCAL statement_timeout = '4min'",
    ]) {
      assert.ok(source.includes(required), `Missing migration safety control: ${required}`);
    }
    assert.ok(
      source.indexOf('assertTargetIsConfirmed()') < source.indexOf("require('../config/database')"),
      'Target confirmation must occur before the database pool is loaded',
    );
  });

  await test('Development app import attempts zero database statements', () => {
    process.env.NODE_ENV = 'development';
    process.env.HABIL_ENV_LOADED = '1';
    process.env.HABIL_ENV_FILE = 'schema-boundary-test';
    process.env.HABIL_DB_TARGET = 'dev';
    process.env.DB_HOST = 'localhost';
    delete process.env.DATABASE_URL;

    const statements = [];
    const databasePath = require.resolve('../config/database');
    const query = async (sql) => {
      statements.push(String(typeof sql === 'string' ? sql : sql?.text || '').trim());
      return { rows: [], rowCount: 0 };
    };
    require.cache[databasePath] = {
      id: databasePath,
      filename: databasePath,
      loaded: true,
      exports: {
        query,
        connect: async () => ({ query, release: () => {} }),
        on: () => {},
      },
    };

    const app = require('../app');
    assert.strictEqual(typeof app, 'function');
    assert.deepStrictEqual(statements, []);
  });

  console.log(`\n${passed} schema boundary checks passed.`);
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
