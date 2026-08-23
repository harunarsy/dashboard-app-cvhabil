/**
 * test-route-http.js — HTTP integration smoke tests
 * Tests endpoint response shape without writing to prod DB.
 *
 * Run: node scripts/test-route-http.js
 */
// Force test mode so route modules skip import-time schema init (no prod DB writes during smoke test)
process.env.NODE_ENV = 'test';
const path = require('path');
const fs = require('fs');
const { loadRuntimeEnv } = require('../config/runtimeEnv');

loadRuntimeEnv({ baseDir: path.join(__dirname, '..'), context: 'backend/test-route-http', preferDevEnv: true });
const supertest = require('supertest');
const assert = require('assert');

// HTTP smoke tests only validate middleware/route contracts. Keep them fully
// DB-isolated so an accidental route change cannot mutate any environment.
const databasePath = require.resolve('../config/database');
let blockedDbMutations = 0;
const readOnlyQueryMock = async (query) => {
  const sql = typeof query === 'string' ? query : query?.text;
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

// Mock global.io before importing app
global.io = { emit: () => {} };

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
    { method: 'get', url: '/api/insights/customer/1', label: 'GET /api/insights/customer/:id' },
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
