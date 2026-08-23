/**
 * DB-independent contract tests for the deterministic Smart-Assistant engine.
 */
process.env.NODE_ENV = 'test';

const assert = require('assert');
const path = require('path');
const {
  buildProductHealthItems,
  buildRestockItems,
} = require('../utils/insightRules');
const {
  buildSmartAssistantResponse,
  resolveScope,
} = require('../services/smartAssistantEngine');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`  ❌ ${name}: ${error.message}`);
    failed += 1;
  }
}

async function run() {
  console.log('═══ Smart-Assistant Contract Tests ═══\n');

  await test('Restock rule preserves weighted 30/90-day velocity and 21-day gate', () => {
    const items = buildRestockItems([
      { product_id: 1, name: 'A', stock: 10, pcs30: 60, pcs90: 120, base_unit: 'pcs' },
      { product_id: 2, name: 'B', stock: 200, pcs30: 30, pcs90: 60, base_unit: 'pcs' },
    ]);
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].product_id, 1);
    assert.strictEqual(items[0].velocity_per_day, 1.7);
    assert.strictEqual(items[0].days_left, 6);
  });

  await test('Product-health extraction keeps the established weighted score', () => {
    const [item] = buildProductHealthItems([
      {
        product_id: 1,
        name: 'Produk sehat',
        stock: 50,
        pcs90: 50,
        rev90: 1000,
        margin90: 250,
        rev30: 600,
        rev_prev30: 400,
        ed_qty: 0,
      },
    ]);
    assert.strictEqual(item.score, 80);
    assert.strictEqual(item.grade, 'A');
  });

  await test('Intent routing is deterministic and bounded to supported scopes', () => {
    assert.strictEqual(resolveScope('stok apa yang perlu dibeli?', undefined), 'inventory');
    assert.strictEqual(resolveScope('customer lama belum order', undefined), 'customers');
    assert.strictEqual(resolveScope('cek omzet minggu ini', undefined), 'sales');
    assert.strictEqual(resolveScope('', undefined), 'overview');
  });

  await test('Response is transparent, evidence-backed, and output-bounded', () => {
    const response = buildSmartAssistantResponse(
      {
        restock: Array.from({ length: 15 }, (_, index) => ({
          product_id: index + 1,
          name: `Produk ${index + 1}`,
          stock: 2,
          base_unit: 'pcs',
          velocity_per_day: 1,
          days_left: 2,
        })),
        dormant: [],
        weekly: null,
      },
      { requestedScope: 'inventory', limit: 12, now: new Date('2026-08-23T00:00:00.000Z') },
    );

    assert.strictEqual(response.assistant.name, 'Habil Smart-Assistant');
    assert.strictEqual(response.assistant.mode, 'rule_based');
    assert.match(response.assistant.disclosure, /Rule-based/);
    assert.strictEqual(response.meta.data_boundary, 'authenticated_read_only');
    assert.strictEqual(response.recommendations.length, 12);
    assert.ok(response.recommendations.every((item) => item.reason && item.evidence.length));
  });

  await test('Read-only transaction proves mode before exposing query access', async () => {
    const databasePath = require.resolve('../config/database');
    const helperPath = require.resolve('../utils/readOnlyTransaction');
    const statements = [];
    let released = false;
    let readOnlyMode = 'on';
    const client = {
      query: async (query) => {
        const sql = typeof query === 'string' ? query : query.text;
        statements.push(sql.trim());
        if (/^SHOW transaction_read_only$/i.test(sql.trim())) {
          return { rows: [{ transaction_read_only: readOnlyMode }] };
        }
        return { rows: [{ ok: 1 }] };
      },
      release: () => {
        released = true;
      },
    };
    require.cache[databasePath] = {
      id: databasePath,
      filename: databasePath,
      loaded: true,
      exports: { connect: async () => client },
    };
    delete require.cache[helperPath];
    const { withReadOnlyTransaction } = require('../utils/readOnlyTransaction');

    const result = await withReadOnlyTransaction(({ query }) => query('SELECT 1'));
    assert.deepStrictEqual(result.rows, [{ ok: 1 }]);
    assert.deepStrictEqual(statements, [
      'BEGIN READ ONLY',
      'SHOW transaction_read_only',
      'SELECT 1',
      'ROLLBACK',
    ]);
    assert.strictEqual(released, true);

    statements.length = 0;
    released = false;
    readOnlyMode = 'off';
    await assert.rejects(
      withReadOnlyTransaction(() => Promise.resolve()),
      (error) => error.code === 'READ_ONLY_NOT_ENFORCED',
    );
    assert.deepStrictEqual(statements, [
      'BEGIN READ ONLY',
      'SHOW transaction_read_only',
      'ROLLBACK',
    ]);
    assert.strictEqual(released, true);
  });

  console.log(`\n═══ Results: ${passed} PASSED, ${failed} FAILED ═══\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  console.error('FATAL:', error.message);
  process.exit(1);
});
