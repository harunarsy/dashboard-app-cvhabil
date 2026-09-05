/**
 * test-route-http.js — HTTP integration smoke tests
 * Tests endpoint response shape without writing to prod DB.
 *
 * Run: node scripts/test-route-http.js
 */
// Force deterministic test behavior. Schema changes now live behind the explicit
// migration runner and route imports must remain side-effect free in every mode.
process.env.NODE_ENV = 'test';
const deepFreezeMode = process.env.DEEP_FREEZE_MODE === 'true';

if (deepFreezeMode) {
  process.env.HABIL_ENV_LOADED = '1';
  process.env.HABIL_ENV_FILE = 'deep-freeze-injected';
  require('./test-deep-freeze-http').run()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`FATAL: ${error.message}`);
      process.exit(1);
    });
} else {
const path = require('path');
const fs = require('fs');
const { loadRuntimeEnv } = require('../config/runtimeEnv');

loadRuntimeEnv({ baseDir: path.join(__dirname, '..'), context: 'backend/test-route-http', preferDevEnv: true });
const supertest = require('supertest');
const assert = require('assert');
const jwt = require('jsonwebtoken');

// HTTP smoke tests only validate middleware/route contracts. Keep them fully
// DB-isolated so an accidental route change cannot mutate any environment.
const databasePath = require.resolve('../config/database');
let blockedDbMutations = 0;
const dbStatements = [];
const readOnlyQueryMock = async (query) => {
  const sql = typeof query === 'string' ? query : query?.text;
  const normalized = String(sql || '').trim();
  dbStatements.push(normalized);
  if (/^show\s+transaction_read_only$/i.test(normalized)) {
    return { rows: [{ transaction_read_only: 'on' }], rowCount: 1 };
  }
  if (/^(begin\s+read\s+only|rollback)$/i.test(normalized)) {
    return { rows: [], rowCount: 0 };
  }
  if (sql && !/^\s*(select|show|with)\b/i.test(sql)) {
    blockedDbMutations += 1;
    throw new Error(`[DB Read-Only Guard] HTTP smoke blocked query: ${sql.split(/\s+/)[0]}`);
  }
  return { rows: [], rowCount: 0 };
};

require.cache[databasePath] = {
  id: databasePath,
  filename: databasePath,
  loaded: true,
  exports: {
    query: readOnlyQueryMock,
    connect: async () => ({ query: readOnlyQueryMock, release: () => {} }),
    on: () => {},
  },
};

const app = require('../app');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

async function run() {
  console.log('═══ HTTP Route Smoke Tests ═══\n');

  const request = supertest(app);

  await test('Sales edit preserves explicit batch selection when HPP is equal', async () => {
    const salesSource = fs.readFileSync(
      path.join(__dirname, '..', 'routes', 'sales.js'),
      'utf8'
    );

    assert.ok(
      !salesSource.includes('const { rows: oldSnapRows }'),
      'Sales edit must not restore snapshots from old rows matched by HPP'
    );
    assert.ok(
      !salesSource.includes('AND ABS(COALESCE(unit_hpp,0) - $9) < 0.005'),
      'Sales edit must not match batch snapshots by product/unit/HPP'
    );
    assert.ok(
      salesSource.includes('resolveSelectedBatchForSale(client, product.id, it)'),
      'Sales edit must retain explicit selected-batch resolution'
    );
  });

  // 1. Health endpoint (no DB)
  await test('/api/health returns 200', async () => {
    const res = await request.get('/api/health');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.status);
    assert.ok(res.body.timestamp);
  });

  await test('/api/health/db returns database reachability', async () => {
    const res = await request.get('/api/health/db');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'Database reachable');
    assert.strictEqual(typeof res.body.latencyMs, 'number');
  });

  // 2. 404 for unknown routes
  await test('unknown route returns 404', async () => {
    const res = await request.get('/api/nonexistent');
    assert.strictEqual(res.status, 404);
    assert.ok(res.body.error);
  });

  // 3. Auth required endpoints return 401 without token
  for (const { method, url, label } of [
    { method: 'get', url: '/api/invoices', label: 'GET /api/invoices' },
    { method: 'get', url: '/api/sales', label: 'GET /api/sales' },
    { method: 'get', url: '/api/purchase-orders', label: 'GET /api/purchase-orders' },
    { method: 'get', url: '/api/inventory/products', label: 'GET /api/inventory/products' },
    { method: 'get', url: '/api/distributors', label: 'GET /api/distributors' },
    { method: 'get', url: '/api/customers', label: 'GET /api/customers' },
    { method: 'get', url: '/api/dashboard/bootstrap', label: 'GET /api/dashboard/bootstrap' },
    { method: 'patch', url: '/api/sales/1/notes', label: 'PATCH /api/sales/:id/notes' },
    { method: 'get', url: '/api/sales/1/adjustments', label: 'GET /api/sales/:id/adjustments' },
    { method: 'post', url: '/api/sales/adjustments/1/void', label: 'POST /api/sales/adjustments/:id/void' },
    { method: 'get', url: '/api/insights/customer/1', label: 'GET /api/insights/customer/:id' },
    { method: 'post', url: '/api/ai/recommendations', label: 'POST /api/ai/recommendations' },
  ]) {
    await test(`${label} returns 401 without auth`, async () => {
      const res = await request[method](url);
      assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
      assert.ok(res.body.error, 'Response should have error message');
    });
  }

  // 4. Login rate limiter
  await test('auth/login path exists', async () => {
    const res = await request.post('/api/auth/login').send({ username: 'test', password: 'test' });
    // 401 is expected (wrong credentials), not 404
    assert.notStrictEqual(res.status, 404, 'Route should exist');
  });

  await test('Smart-Assistant enforces authz and a proven read-only transaction', async () => {
    process.env.JWT_SECRET ||= 'http-smoke-test-secret';
    const adminToken = jwt.sign(
      { id: 1, username: 'smoke-admin', role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '5m' },
    );
    const before = dbStatements.length;
    const res = await request
      .post('/api/ai/recommendations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ scope: 'overview', limit: 4 });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.assistant?.name, 'Habil Smart-Assistant');
    assert.strictEqual(res.body.assistant?.mode, 'rule_based');
    assert.strictEqual(res.body.meta?.data_boundary, 'authenticated_read_only');
    assert.ok(Array.isArray(res.body.recommendations));
    const assistantStatements = dbStatements.slice(before);
    assert.ok(assistantStatements.includes('BEGIN READ ONLY'));
    assert.ok(assistantStatements.includes('SHOW transaction_read_only'));
    assert.ok(assistantStatements.includes('ROLLBACK'));
    assert.ok(
      assistantStatements.every((sql) =>
        /^(begin\s+read\s+only|rollback|select|show|with)\b/i.test(sql),
      ),
      'Assistant may only execute transaction control or read statements',
    );
  });

  await test('Smart-Assistant rejects the pajak role', async () => {
    const token = jwt.sign(
      { id: 2, username: 'smoke-pajak', role: 'pajak' },
      process.env.JWT_SECRET,
      { expiresIn: '5m' },
    );
    const res = await request
      .post('/api/ai/recommendations')
      .set('Authorization', `Bearer ${token}`)
      .send({ scope: 'overview' });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error?.code, 'FORBIDDEN');
  });

  // 5. Response shape: array endpoints
  // Note: these will likely return 401 or error without DB
  // This test validates the route mounts correctly (not 404)
  for (const { url, label } of [
    { url: '/api/invoices?limit=1', label: 'GET /api/invoices?limit=1' },
    { url: '/api/sales?limit=1', label: 'GET /api/sales?limit=1' },
  ]) {
    await test(`${label} route mounted (not 404)`, async () => {
      const res = await request.get(url);
      // Route exists (401=no auth) — must NOT be 404 (unmounted) or 500 (crash)
      assert.ok(res.status !== 404 && res.status !== 500,
        `Route ${url} should be mounted (not 404 or 500), got ${res.status}`);
    });
  }

  await test('No mutating DB query attempted during import or HTTP smoke', async () => {
    assert.strictEqual(blockedDbMutations, 0, `Blocked ${blockedDbMutations} mutating DB query attempt(s)`);
  });

  // ─── Summary ───
  console.log(`\n═══ Results: ${passed} PASSED, ${failed} FAILED ═══\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
}
