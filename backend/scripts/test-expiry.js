#!/usr/bin/env node

const assert = require('assert');
const { receivedBatch, projectBatchRow, createPoFixtureQuery } = require('../test/fixtures/expiry-po.cjs');
const { normalizeExpiry, normalizeExpiryEdit } = require('../utils/expiry');
const { buildInvoiceDelta } = require('../utils/invoiceDelta');
const {
  buildInvoiceDeltaPlan,
  applyInvoiceDeltaPlan,
  requestHashForBody,
  _test: { optionalDbDate },
} = require('../services/invoiceDeltaService');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('helper month/day/null dengan kalender Gregorian ketat', () => {
  for (const [value, precision, expected] of [
    ['2028-02', undefined, { date: '2028-02-29', precision: 'month' }],
    ['2027-02', 'month', { date: '2027-02-28', precision: 'month' }],
    ['2027-05-12', undefined, { date: '2027-05-12', precision: 'day' }],
    ['2027-05-31', 'month', { date: '2027-05-31', precision: 'month' }],
    ['2027-05-31', 'day', { date: '2027-05-31', precision: 'day' }],
    ['2000-02', undefined, { date: '2000-02-29', precision: 'month' }],
    ['2100-02', undefined, { date: '2100-02-28', precision: 'month' }],
    ['  ', 'month', { date: null, precision: null }],
    [null, null, { date: null, precision: null }],
    ['2027-05-12T23:30:00-07:00', undefined, { date: '2027-05-12', precision: 'day' }],
  ]) assert.deepStrictEqual(normalizeExpiry(value, precision), expected);
});

test('helper invalid precision/kalender/pasangan month ditolak 400', () => {
  for (const [value, precision] of [
    ['2027-13', undefined], ['2027-00', undefined], ['2027-02-29', undefined],
    ['2027-05-12', 'month'], ['2027-05', 'day'], ['2027-05-31', 'year'],
    [null, 'year'], ['2027-05-00', undefined], ['2027-05-31garbage', undefined],
    ['2027-05-31Tgarbage', undefined], ['2027-05-31T99:99:99Z', undefined], [new Date('invalid'), undefined],
  ]) assert.throws(() => normalizeExpiry(value, precision),
    (error) => error.code === 'INVALID_DATE' && error.statusCode === 400);
});

test('edit canonical month tanpa precision menjaga mode, switch eksplisit dihormati', () => {
  assert.deepStrictEqual(normalizeExpiryEdit('2027-05-31', undefined, '2027-05-31', 'month'),
    { date: '2027-05-31', precision: 'month' });
  assert.deepStrictEqual(normalizeExpiryEdit(undefined, undefined, '2027-05-31', 'month'),
    { date: '2027-05-31', precision: 'month' });
  assert.deepStrictEqual(normalizeExpiryEdit('2027-05-31', 'day', '2027-05-31', 'month'),
    { date: '2027-05-31', precision: 'day' });
});

test('expired_date bulan Februari kabisat menjadi hari terakhir 2028-02-29', () => {
  assert.strictEqual(optionalDbDate('2028-02', 'expired_date'), '2028-02-29');
});

test('expired_date bulan Februari biasa menjadi hari terakhir 2027-02-28', () => {
  assert.strictEqual(optionalDbDate('2027-02', 'expired_date'), '2027-02-28');
});

test('expired_date tanggal lengkap legacy tetap 2027-05-12', () => {
  assert.strictEqual(optionalDbDate('2027-05-12', 'expired_date'), '2027-05-12');
});

test('expired_date timestamp legacy mempertahankan tanggal sumber tanpa geser zona waktu', () => {
  assert.strictEqual(optionalDbDate('2027-05-12T23:30:00-07:00', 'expired_date'), '2027-05-12');
});

test('expired_date bulan 13 ditolak sebagai INVALID_DATE', () => {
  assert.throws(
    () => optionalDbDate('2027-13', 'expired_date'),
    (error) => error.code === 'INVALID_DATE',
  );
});

test('expired_date tanggal kalender mustahil ditolak sebagai INVALID_DATE', () => {
  assert.throws(
    () => optionalDbDate('2027-02-29', 'expired_date'),
    (error) => error.code === 'INVALID_DATE',
  );
});

test('invoice_date non-ED tetap menolak input bulan', () => {
  assert.throws(
    () => optionalDbDate('2028-02', 'invoice_date'),
    (error) => error.code === 'INVALID_DATE',
  );
});

test('invoice_date non-ED tanggal lengkap tetap exact', () => {
  assert.strictEqual(optionalDbDate('2027-05-12', 'invoice_date'), '2027-05-12');
});

test('expired_date kosong tetap NULL', () => {
  for (const value of [undefined, null, '', '   ']) {
    assert.strictEqual(optionalDbDate(value, 'expired_date'), null);
  }
});

const computePlan = async ({
  date = '2027-05-12',
  precision = null,
  next = {},
  omitStoredPrecision = false,
  postedStock = true,
  additionalItems = [],
} = {}) => {
  const invoice = {
    id: 321,
    invoice_number: 'INV-EXPIRY-001',
    purchase_date: '2026-09-29',
    distributor_name: 'Distributor ED',
    due_date: null,
    payment_date: null,
    tax_type: 'faktur',
    ppn_rate: 0.11,
    purchase_order_id: null,
  };
  const item = {
    id: 17,
    line_key: 'line-expiry',
    product_id: 10,
    product_name: 'Produk ED',
    quantity: 10,
    unit: 'pcs',
    batch_number: 'BATCH-ED',
    expired_date: date,
    expired_date_precision: precision,
    hna: 100,
  };
  const batch = {
    id: 101,
    product_id: 10,
    batch_no: 'BATCH-ED',
    expired_date: date,
    expired_date_precision: precision,
    qty_current: 10,
    hna: 100,
    source_ref: 'invoice-321',
  };
  const mutation = {
    id: 71,
    product_id: 10,
    batch_id: 101,
    type: 'in',
    qty: 10,
    reference_type: 'faktur',
    reference_id: 321,
    invoice_line_key: 'line-expiry',
  };
  const product = {
    id: 10,
    name: 'Produk ED',
    hna: 100,
    base_unit: 'pcs',
    pack_size: 1,
    is_active: true,
  };
  if (omitStoredPrecision) {
    delete item.expired_date_precision;
    delete batch.expired_date_precision;
  }

  // Only the external SELECT boundary is replaced; normalization, UOM,
  // ownership, delta, preview and snapshot hashing run through the real planner.
  const client = {
    async query(sql) {
      if (!/^\s*SELECT\b/i.test(sql) || /\bFOR UPDATE\b/i.test(sql)) {
        throw new Error(`Compute-only fixture received a write or lock: ${sql}`);
      }
      const fixtures = {
        invoices: [invoice],
        invoice_items: [item],
        inventory_batches: [batch],
        inventory_mutations: postedStock ? [mutation] : [],
        product_master: [product],
      };
      const table = sql.match(/\bFROM\s+(\w+)\b/i)?.[1];
      if (!Object.prototype.hasOwnProperty.call(fixtures, table)) {
        throw new Error(`Compute-only fixture received an unexpected SELECT: ${sql}`);
      }
      return { rows: fixtures[table].map((row) => ({ ...row })) };
    },
  };
  const helpers = {
    async loadProductLookupForItems() { return new Map([[10, product]]); },
    collectUnmatchedProducts(lookup, items) {
      return items.filter((entry) => !lookup.has(entry.product_id));
    },
    getProductFromLookup(lookup, entry) { return lookup.get(entry.product_id); },
    effectiveHna(entry) { return Number(entry.hna); },
  };
  const legacyPayload = { ...item };
  delete legacyPayload.expired_date_precision;
  const requestItems = [{ ...legacyPayload, ...next }, ...additionalItems];

  return buildInvoiceDeltaPlan({
    client,
    invoiceId: invoice.id,
    items: requestItems,
    requestKey: 'expiry-tests',
    requestHash: requestHashForBody({ items: requestItems }),
    batchEditMode: 'metadata',
    helpers,
    forUpdate: false,
  });
};

const assertNoStockOrPriceDelta = (plan) => {
  assert.deepStrictEqual(plan.delta.batch_deltas, []);
  assert.deepStrictEqual(plan.delta.product_deltas, []);
  assert.deepStrictEqual(plan.delta.target_hna, []);
  assert.deepStrictEqual(plan.preview.stock_deltas, []);
  assert.deepStrictEqual(plan.hnaRevaluations, []);
  assert.deepStrictEqual(plan.poEffects, []);
};

const assertNoOp = (plan) => {
  assert.strictEqual(plan.delta.changed, false);
  assert.strictEqual(plan.preview.no_op, true);
  assert.strictEqual(plan.delta.line_changes[0].status, 'unchanged');
  assert.deepStrictEqual(plan.delta.metadata_changes, []);
  assertNoStockOrPriceDelta(plan);
};

test('planner edit legacy tanpa precision tetap no-op dan tidak membulatkan tanggal', async () => {
  const plan = await computePlan();
  assertNoOp(plan);
  assert.strictEqual(plan.currentLines[0].expired_date, '2027-05-12');
  assert.strictEqual(plan.nextLines[0].expired_date, '2027-05-12');
  assert.strictEqual(plan.state.items[0].expired_date, '2027-05-12');
  assert.strictEqual(plan.state.batches.get(101).expired_date, '2027-05-12');
  assert.strictEqual(plan.state.items[0].expired_date_precision, null);
  assert.strictEqual(plan.state.batches.get(101).expired_date_precision, null);
});

test('planner precision day eksplisit pada DATE legacy bukan perubahan metadata', async () => {
  const plan = await computePlan({ next: { expired_date_precision: 'day' } });
  assertNoOp(plan);
  assert.strictEqual(plan.currentLines[0].expired_date_precision, 'day');
  assert.strictEqual(plan.nextLines[0].expired_date_precision, 'day');
});

test('planner tanggal legacy akhir bulan tetap day ketika precision tidak dikirim', async () => {
  const plan = await computePlan({ date: '2027-05-31' });
  assertNoOp(plan);
  assert.strictEqual(plan.currentLines[0].expired_date_precision, 'day');
  assert.strictEqual(plan.nextLines[0].expired_date_precision, 'day');
});

test('planner timestamp legacy dan DATE yang sama tetap no-op', async () => {
  const plan = await computePlan({
    date: '2027-05-12T00:00:00.000Z',
    next: { expired_date: '2027-05-12' },
  });
  assertNoOp(plan);
  assert.strictEqual(plan.currentLines[0].expired_date, '2027-05-12');
  assert.strictEqual(plan.nextLines[0].expired_date, '2027-05-12');
});

for (const [before, after] of [['day', 'month'], ['month', 'day']]) {
  test(`planner precision-only ${before} ke ${after} adalah metadata pada batch existing`, async () => {
    const plan = await computePlan({
      date: '2027-05-31',
      precision: before,
      next: { expired_date_precision: after },
    });
    assert.strictEqual(plan.delta.changed, true);
    assert.strictEqual(plan.preview.no_op, false);
    assert.strictEqual(plan.delta.line_changes[0].status, 'metadata_changed');
    assertNoStockOrPriceDelta(plan);
    assert.strictEqual(plan.delta.metadata_changes.length, 1);
    const change = plan.delta.metadata_changes[0];
    assert.strictEqual(change.line_key, 'line-expiry');
    assert.strictEqual(change.batch_id, 101);
    assert.strictEqual(change.before_expired_date, '2027-05-31');
    assert.strictEqual(change.after_expired_date, '2027-05-31');
    assert.strictEqual(change.before_expired_date_precision, before);
    assert.strictEqual(change.after_expired_date_precision, after);
    assert.deepStrictEqual(plan.preview.metadata_changes, plan.delta.metadata_changes);
  });
}

test('planner month tersimpan dan precision sama tetap no-op', async () => {
  const plan = await computePlan({
    date: '2027-05-31',
    precision: 'month',
    next: { expired_date_precision: 'month' },
  });
  assertNoOp(plan);
  assert.strictEqual(plan.currentLines[0].expired_date_precision, 'month');
  assert.strictEqual(plan.nextLines[0].expired_date_precision, 'month');
});

test('planner edit month canonical tanpa precision tetap month dan no-op', async () => {
  const plan = await computePlan({ date: '2027-05-31', precision: 'month' });
  assertNoOp(plan);
  assert.strictEqual(plan.nextLines[0].expired_date_precision, 'month');
});

test('planner snapshot legacy NULL dan metadata belum ada menghasilkan hash sama', async () => {
  const withNull = await computePlan();
  const withoutColumn = await computePlan({ omitStoredPrecision: true });
  assert.strictEqual(withNull.snapshotHash, withoutColumn.snapshotHash);
});

test('planner mengosongkan ED month menghapus DATE dan precision tanpa delta stok', async () => {
  const plan = await computePlan({
    date: '2027-05-31',
    precision: 'month',
    next: { expired_date: '', expired_date_precision: null },
  });
  assert.strictEqual(plan.delta.changed, true);
  assert.strictEqual(plan.preview.no_op, false);
  assertNoStockOrPriceDelta(plan);
  assert.ok(plan.nextLines[0].expired_date === '' || plan.nextLines[0].expired_date === null);
  assert.strictEqual(plan.nextLines[0].expired_date_precision, null);
  assert.strictEqual(plan.delta.metadata_changes.length, 1);
  const change = plan.delta.metadata_changes[0];
  assert.strictEqual(change.batch_id, 101);
  assert.strictEqual(change.before_expired_date, '2027-05-31');
  assert.strictEqual(change.before_expired_date_precision, 'month');
  assert.ok(change.after_expired_date === '' || change.after_expired_date === null);
  assert.strictEqual(change.after_expired_date_precision, null);
});

test('preview batch tujuan baru tidak mengambil ED metadata item unposted lain', async () => {
  const plan = await computePlan({
    date: '2027-05-31',
    precision: 'day',
    postedStock: false,
    next: { expired_date_precision: 'month' },
    additionalItems: [{ line_key: 'line-new', product_id: 10, product_name: 'Produk ED',
      quantity: 2, unit: 'pcs', hna: 100, batch_number: 'NEW', expired_date: '2028-02' }],
  });
  assert.strictEqual(plan.delta.metadata_changes[0].batch_id, null);
  const destination = plan.preview.stock_deltas.find((entry) => entry.line_keys.includes('line-new'));
  assert.strictEqual(destination.batch_id, null);
  assert.strictEqual(destination.batch_after, 'NEW');
  assert.strictEqual(destination.expired_after, '2028-02-29');
  assert.strictEqual(destination.expired_after_precision, 'month');
});

test('preview qty+metadata pada batch existing membawa Batch/ED/precision tujuan', async () => {
  const plan = await computePlan({ next: { quantity: 12, batch_number: 'NEW', expired_date: '2028-02' } });
  const change = plan.preview.stock_deltas[0];
  assert.strictEqual(change.batch_id, 101);
  assert.strictEqual(change.batch_before, 'BATCH-ED');
  assert.strictEqual(change.batch_after, 'NEW');
  assert.strictEqual(change.expired_before, '2027-05-12');
  assert.strictEqual(change.expired_before_precision, 'day');
  assert.strictEqual(change.expired_after, '2028-02-29');
  assert.strictEqual(change.expired_after_precision, 'month');
  assert.strictEqual(change.delta_base, 2);
});

for (const [before, after] of [['day', 'month'], ['month', 'day']]) {
  test(`apply precision-only ${before} ke ${after} menulis item/batch/audit tanpa mutasi qty`, async () => {
    const plan = await computePlan({ date: '2027-05-31', precision: before,
      next: { expired_date_precision: after } });
    let itemWrite = false;
    let batchWrite = false;
    let auditWrite = false;
    let eventWrite = false;
    const updatedItem = { ...plan.state.items[0], expired_date_precision: after };
    await applyInvoiceDeltaPlan({ plan, body: {}, idempotencyKey: 'precision-only', userId: 1,
      client: { async query(sql, params) {
        const binds = [...sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
        assert.strictEqual(params.length, Math.max(...binds));
        assert.ok(params.every((param) => param !== undefined));
        if (/UPDATE invoice_items SET/.test(sql)) {
          assert.strictEqual(params[5], '2027-05-31');
          assert.strictEqual(params[22], after);
          assert.strictEqual(params[23], 17);
          itemWrite = true;
          return { rows: [{ id: 17 }] };
        }
        if (/UPDATE inventory_batches/.test(sql)) {
          assert.ok(!/qty_current|hna\s*=/.test(sql));
          assert.deepStrictEqual(params, ['BATCH-ED', '2027-05-31', 101, after]);
          batchWrite = true;
          return { rows: [{ id: 101 }] };
        }
        if (/UPDATE invoices SET/.test(sql)) return { rows: [plan.state.invoice] };
        if (/SELECT \* FROM invoice_items/.test(sql)) return { rows: [updatedItem] };
        if (/INSERT INTO invoice_audit_log/.test(sql)) {
          const snapshot = JSON.parse(params[2]);
          assert.strictEqual(snapshot.before.items[0].expired_date_precision, before);
          assert.strictEqual(snapshot.after.items[0].expired_date_precision, after);
          assert.strictEqual(snapshot.after.metadata_changes[0].after_expired_date_precision, after);
          auditWrite = true;
          return { rows: [] };
        }
        if (/INSERT INTO invoice_edit_events/.test(sql)) {
          const snapshot = JSON.parse(params[4]);
          assert.strictEqual(snapshot.line_changes[0].expired_date_precision_before, before);
          assert.strictEqual(snapshot.line_changes[0].expired_date_precision_after, after);
          assert.deepStrictEqual(JSON.parse(params[5]), []);
          eventWrite = true;
          return { rows: [] };
        }
      if (/^\s*(SET LOCAL|SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT)/i.test(String(sql).trim())) return { rows: [] };
        throw new Error(`Unexpected precision-only write: ${sql}`);
      } },
    });
    assert.ok(itemWrite && batchWrite && auditWrite && eventWrite);
  });
}

test('planner snapshot hash berubah jika hanya precision state berubah', async () => {
  const day = await computePlan({
    date: '2027-05-31', precision: 'day', next: { expired_date_precision: 'day' },
  });
  const month = await computePlan({
    date: '2027-05-31', precision: 'month', next: { expired_date_precision: 'month' },
  });
  assert.notStrictEqual(day.snapshotHash, month.snapshotHash);
});

test('request hash mengikat precision walaupun DATE tidak berubah', () => {
  const item = { expired_date: '2027-05-31', expired_date_precision: 'day' };
  assert.notStrictEqual(requestHashForBody({ items: [item] }),
    requestHashForBody({ items: [{ ...item, expired_date_precision: 'month' }] }));
});

test('request hash precision legacy omitted/undefined/null konsisten', () => {
  const item = { expired_date: '2027-05-12' };
  assert.strictEqual(requestHashForBody({ items: [item] }),
    requestHashForBody({ items: [{ ...item, expired_date_precision: null }] }));
  assert.strictEqual(requestHashForBody({ items: [item] }),
    requestHashForBody({ items: [{ ...item, expired_date_precision: undefined }] }));
});

test('precision-only mode move tidak membuat stok pindah batch', () => {
  const current = { line_key: 'ed', product_id: 10, product_name: 'Produk ED', quantity_base: 2,
    batch_number: 'B', expired_date: '2027-05-31', expired_date_precision: 'day', hna_base: 100 };
  const result = buildInvoiceDelta({
    currentLines: [current], nextLines: [{ ...current, expired_date_precision: 'month' }],
    stockByLine: new Map([['ed', [{ batch_id: 101, product_id: 10, qty: 2, batch_number: 'B', expired_date: '2027-05-31' }]]]),
    batchEditMode: 'move',
  });
  assert.strictEqual(result.changed, true);
  assert.deepStrictEqual(result.batch_deltas, []);
  assert.strictEqual(result.metadata_changes[0].batch_id, 101);
});

test('precision-only item unposted terdeteksi tanpa mengarang stok', () => {
  const current = { line_key: 'ed', product_id: 10, quantity_base: 2, hna_base: 100,
    expired_date: '2027-05-31', expired_date_precision: 'day' };
  const result = buildInvoiceDelta({ currentLines: [current],
    nextLines: [{ ...current, expired_date_precision: 'month' }], stockByLine: new Map() });
  assert.strictEqual(result.changed, true);
  assert.deepStrictEqual(result.batch_deltas, []);
  assert.strictEqual(result.metadata_changes[0].batch_id, null);
});

test('migration 023 hanya menambah enam precision nullable tanpa UPDATE historis', async () => {
  const { migrations } = require('../migrations/routeSchemas');
  const migration = migrations.find(({ id }) => id === '20260929_023_expiry_precision');
  assert.ok(migration);
  const statements = [];
  await migration.up({ async query(sql) { statements.push(sql); return { rows: [] }; } });
  const columns = statements.filter((sql) => /^ALTER TABLE/.test(sql));
  assert.strictEqual(columns.length, 6);
  assert.ok(!statements.some((sql) => /\bUPDATE\b|\bNOT NULL\b|\bDEFAULT\b/i.test(sql)));
  for (const column of columns) assert.match(column, /ADD COLUMN IF NOT EXISTS \w+ TEXT$/);
  assert.strictEqual(statements.filter((sql) => /IN \('day', 'month'\)/.test(sql)).length, 6);
});

// Route imports receive only an in-memory DB boundary. No config/database module runs.
const databasePath = require.resolve('../config/database');
let routeClient;
require.cache[databasePath] = {
  id: databasePath, filename: databasePath, loaded: true,
  exports: {
    query: (...args) => routeClient.query(...args),
    connect: async () => routeClient,
  },
};
const routes = {
  inventory: require('../routes/inventory'),
  purchaseOrders: require('../routes/purchaseOrders'),
  loans: require('../routes/loans'),
  sales: require('../routes/sales'),
  invoices: require('../routes/invoices'),
};
const invokeRoute = async (route, method, path, body, query, request = {}) => {
  const calls = [];
  routeClient = {
    release() {},
    async query(sql, params = []) {
      calls.push({ sql, params });
      const indexes = [...sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
      assert.strictEqual(params.length, indexes.length ? Math.max(...indexes) : 0);
      assert.ok(params.every((param) => param !== undefined), `Undefined bind: ${sql}`);
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [], rowCount: 0 };
      return query(sql, params);
    },
  };
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; },
    json(data) { this.data = data; return this; } };
  const layer = routes[route].stack.find((entry) => entry.route?.path === path && entry.route.methods[method]);
  assert.ok(layer, `Missing route ${route} ${method} ${path}`);
  await layer.route.stack[layer.route.stack.length - 1].handle(
    { body, params: { id: 321 }, user: { id: 1 }, ...request }, response,
  );
  return { response, calls };
};

test('inventory edit HNA saja menjaga canonical month dan tidak menyinkron snapshot nota', async () => {
  const { response, calls } = await invokeRoute('inventory', 'put', '/batches/:id',
    { batch_no: 'B-ED', hna: 110, notes: 'Koreksi harga', expired_date: '2027-05-31' },
    async (sql, params) => {
      if (/^SELECT batch_no/.test(sql)) return { rows: [{ batch_no: 'B-ED', expired_date: '2027-05-31', expired_date_precision: 'month', hna: 100 }] };
      if (/UPDATE inventory_batches/.test(sql)) {
        assert.strictEqual(params[1], '2027-05-31');
        assert.strictEqual(params[5], 'month');
        return { rows: [{ id: 321, product_id: 10, batch_no: 'B-ED', expired_date: params[1], expired_date_precision: params[5], hna: 110 }] };
      }
      if (/INSERT INTO batch_audit_log/.test(sql)) return { rows: [] };
      if (/^\s*(SET LOCAL|SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT)/i.test(String(sql).trim())) return { rows: [] };
      throw new Error(`Unexpected inventory edit query: ${sql}`);
    });
  assert.strictEqual(response.statusCode, 200);
  assert.ok(!calls.some(({ sql }) => /UPDATE sales_items/.test(sql)));
});

test('stock-in month menulis DATE+precision dengan bind sejajar', async () => {
  const { response } = await invokeRoute('inventory', 'post', '/stock-in',
    { product_id: 10, qty: 2, hna: 100, expired_date: '2028-02' }, async (sql, params) => {
      if (/INSERT INTO inventory_batches/.test(sql)) {
        assert.strictEqual(params[2], '2028-02-29');
        assert.strictEqual(params[7], 'month');
        return { rows: [{ id: 101, expired_date: params[2], expired_date_precision: params[7] }] };
      }
      if (/INSERT INTO inventory_mutations/.test(sql)) return { rows: [] };
      if (/^\s*(SET LOCAL|SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT)/i.test(String(sql).trim())) return { rows: [] };
      throw new Error(`Unexpected stock-in query: ${sql}`);
    });
  assert.strictEqual(response.statusCode, 201);
  assert.strictEqual(response.data.expired_date_precision, 'month');
});

test('PO menerima invalid ED dengan 400 sebelum ada write', async () => {
  const { response, calls } = await invokeRoute('purchaseOrders', 'post', '/:id/receive',
    { items: [{ po_item_id: 1, received_qty: 1, expired_date: '2027-13' }] },
    async (sql) => { throw new Error(`Unexpected PO query: ${sql}`); });
  assert.strictEqual(response.statusCode, 400);
  assert.ok(!calls.some(({ sql }) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql)));
});

test('fix-wave PO detail mempertahankan precision month dari SELECT sampai received_batches', async () => {
  const { response } = await invokeRoute('purchaseOrders', 'get', '/:id', {}, createPoFixtureQuery());
  assert.strictEqual(response.statusCode, 200, JSON.stringify(response.data));
  assert.deepStrictEqual(response.data.items[0].received_batches[0], {
    id: 101, batch_no: 'PO-MONTH', expired_date: '2028-02-29', expired_date_precision: 'month',
    qty_current: 2, source_qty_value: 2, source_qty_unit: 'pcs', hna: 1000,
    is_active: true, received_qty_base: 2,
  });
});

test('fix-wave inventory available batches mengembalikan DATE dan precision month', async () => {
  const { response } = await invokeRoute('inventory', 'get', '/batches-by-product/:productId', {},
    async (sql, params) => {
      assert.deepStrictEqual(params, ['10']);
      return { rows: [projectBatchRow(sql, receivedBatch)] };
    }, { params: { productId: '10' }, query: {} });
  assert.strictEqual(response.statusCode, 200, JSON.stringify(response.data));
  assert.strictEqual(response.data[0].expired_date, '2028-02-29');
  assert.strictEqual(response.data[0].expired_date_precision, 'month');
});

test('invoice create invalid ED mengembalikan 400 sebelum menulis header/item/batch', async () => {
  const { response, calls } = await invokeRoute('invoices', 'post', '/', {
    invoice_number: 'INV-ED', purchase_date: '2026-09-29', distributor_name: 'Distributor',
    items: [{ product_id: 10, product_name: 'Produk ED', quantity: 1, unit: 'pcs', hna: 100, expired_date: '2027-13' }],
  }, async (sql) => {
    if (/FROM product_master/.test(sql)) return { rows: [{ id: 10, name: 'Produk ED', base_unit: 'pcs', pack_size: 1 }] };
    if (/FROM product_aliases|FROM invoices/.test(sql)) return { rows: [] };
      if (/^\s*(SET LOCAL|SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT)/i.test(String(sql).trim())) return { rows: [] };
    throw new Error(`Unexpected invoice query: ${sql}`);
  });
  assert.strictEqual(response.statusCode, 400, JSON.stringify(response.data));
  assert.ok(!calls.some(({ sql }) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql)));
});

for (const [identity, expectedDate, expectedPrecision] of [
  [{ line_key: 'legacy-line-17' }, '2027-05-31', 'month'],
  [{}, '2027-05-31', 'month'],
  [{ line_key: 'new-line' }, null, null],
]) {
  test(`invoice rewrite ${identity.line_key || 'legacy posisi'} memakai identitas sebelum fallback posisi`, async () => {
    const header = { id: 321, invoice_number: 'INV-ED', purchase_date: '2026-09-29',
      distributor_name: 'Distributor', tax_type: 'faktur', ppn_rate: 0.11 };
    let written = false;
    const { response } = await invokeRoute('invoices', 'put', '/:id', {
      ...header, items: [{ ...identity, product_id: 10, product_name: 'Produk ED',
        quantity: 1, unit: 'pcs', hna: 100 }],
    }, async (sql, params) => {
      if (/SELECT \* FROM invoices/.test(sql)) return { rows: [header] };
      if (/SELECT \* FROM invoice_items/.test(sql)) return { rows: [{ id: 17, line_key: null,
        product_name: 'Produk ED', expired_date: '2027-05-31', expired_date_precision: 'month' }] };
      if (/SELECT 1 FROM inventory_mutations/.test(sql)) return { rows: [] };
      if (/HAVING COUNT\(\*\) > 1/.test(sql)) return { rows: [] };
      if (/FROM product_master/.test(sql)) return { rows: [{ id: 10, name: 'Produk ED', base_unit: 'pcs', pack_size: 1 }] };
      if (/FROM product_aliases/.test(sql)) return { rows: [] };
      if (/UPDATE invoices SET/.test(sql)) return { rows: [header] };
      if (/INSERT INTO invoice_items/.test(sql)) {
        assert.strictEqual(params[6], expectedDate);
        assert.strictEqual(params[23], expectedPrecision);
        written = true;
        return { rows: [] };
      }
      if (/DELETE FROM invoice_items|UPDATE product_master/.test(sql)) return { rows: [] };
      if (/^\s*(SET LOCAL|SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT)/i.test(String(sql).trim())) return { rows: [] };
      throw new Error(`Unexpected invoice rewrite query: ${sql}`);
    });
    assert.strictEqual(response.statusCode, 200, JSON.stringify(response.data));
    assert.ok(written);
  });
}

test('retur pinjaman batch baru month menulis DATE+precision', async () => {
  const { response } = await invokeRoute('loans', 'post', '/:id/return',
    { items: [{ loan_item_id: 17, qty: 2, mode: 'new', batch_no: 'RET', expired_date: '2028-02' }] },
    async (sql, params) => {
      if (/SELECT \* FROM loans/.test(sql)) return { rows: [{ id: 321, loan_number: 'PJM', customer_name: 'Pelanggan' }] };
      if (/SELECT \* FROM loan_items/.test(sql)) return { rows: [{ id: 17, product_id: 10, product_name: 'Produk ED', qty: 10, qty_returned: 0, qty_purchased: 0, unit_hpp: 100, unit_hpp_tax_type: 'faktur', unit_hpp_ppn_rate: 0.11 }] };
      if (/INSERT INTO inventory_batches/.test(sql)) {
        assert.strictEqual(params[2], '2028-02-29');
        assert.strictEqual(params[8], 'month');
        return { rows: [{ id: 101 }] };
      }
      if (/INSERT INTO inventory_mutations|UPDATE loan_items|UPDATE loans/.test(sql)) return { rows: [] };
      if (/SELECT l\.\*/.test(sql)) return { rows: [{ id: 321 }] };
      if (/^\s*(SET LOCAL|SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT)/i.test(String(sql).trim())) return { rows: [] };
      throw new Error(`Unexpected loan return query: ${sql}`);
    });
  assert.strictEqual(response.statusCode, 200);
});

for (const [storedDate, storedPrecision, missingNullable] of [
  ['2027-05-31', 'month', false], ['2027-05-12', null, true],
]) {
test(`loan conversion menyalin ED snapshot ${storedDate}/${storedPrecision} ke nota tanpa inventory write`, async () => {
  const snapshot = { id: 17, product_id: 10, product_name: 'Produk ED', qty: 10, qty_returned: 0,
    qty_purchased: 0, unit: 'pcs', unit_price: 200, unit_hpp: 100, unit_hpp_tax_type: 'faktur',
    unit_hpp_ppn_rate: 0.11, batch_id_snapshot: 101, batch_no_snapshot: 'B-ED',
    expired_date_snapshot: storedDate, expired_date_snapshot_precision: storedPrecision };
  if (missingNullable) {
    delete snapshot.unit_hpp_tax_type;
    delete snapshot.unit_hpp_ppn_rate;
    delete snapshot.batch_no_snapshot;
  }
  const { response, calls } = await invokeRoute('loans', 'post', '/:id/convert',
    { items: [{ loan_item_id: 17, qty: 2 }] }, async (sql, params) => {
      if (/SELECT \* FROM loans/.test(sql)) return { rows: [{ id: 321, loan_number: 'PJM', customer_id: 1, customer_name: 'Pelanggan' }] };
      if (/SELECT \* FROM loan_items/.test(sql)) return { rows: [snapshot] };
      if (/SELECT last_number/.test(sql)) return { rows: [] };
      if (/SELECT COALESCE\(MAX\(CAST\(SUBSTRING\(order_number/.test(sql)) return { rows: [{ max_number: 0 }] };
      if (/document_counters/.test(sql)) return { rows: [] };
      if (/SELECT weight_gram/.test(sql)) return { rows: [{ weight_gram: 0 }] };
      if (/SELECT pack_size/.test(sql)) return { rows: [{ pack_size: 1 }] };
      if (/INSERT INTO sales_orders/.test(sql)) return { rows: [{ id: 501 }] };
      if (/INSERT INTO sales_items/.test(sql)) {
        assert.strictEqual(params[0], 501);
        assert.strictEqual(params[1], 'Produk ED');
        assert.strictEqual(params[11], 101);
        if (missingNullable) {
          assert.strictEqual(params[6], null);
          assert.strictEqual(params[7], null);
          assert.strictEqual(params[12], null);
        }
        assert.strictEqual(params[13], storedDate);
        assert.strictEqual(params[14], storedPrecision || 'day');
        return { rows: [] };
      }
      if (/INSERT INTO loan_conversions|UPDATE loan_items|UPDATE loans/.test(sql)) return { rows: [] };
      if (/SELECT l\.\*/.test(sql)) return { rows: [{ id: 321 }] };
      // v1.67.24: generator nomor dokumen mengunci counter per docType dulu.
      if (/pg_advisory_xact_lock/.test(sql)) return { rows: [] };
      if (/^\s*(SET LOCAL|SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT)/i.test(String(sql).trim())) return { rows: [] };
      throw new Error(`Unexpected loan conversion query: ${sql}`);
    });
  assert.strictEqual(response.statusCode, 201);
  assert.ok(!calls.some(({ sql }) => /\b(INSERT INTO|UPDATE) inventory_/.test(sql)));
});
}

for (const [selectedId, storedPrecision, storedDate, addSameBatchItem = false] of [
  [101, 'month', '2027-05-31'], [102, 'month', '2027-05-31'], [101, null, '2027-05-12'],
  [102, 'month', '2027-05-31', true],
]) {
  test(`sales edit batch ${selectedId} precision ${storedPrecision} ${addSameBatchItem ? 'tidak memakai ulang snapshot item berganti batch' : selectedId === 101 ? 'menjaga snapshot historis' : 'mengambil ED dari batch terpilih'}`, async () => {
    const old = { id: 17, product_name: 'Produk ED', qty: 2, unit: 'pcs', unit_price: 200,
      unit_hpp: 100, batch_id_snapshot: 101, batch_no_snapshot: 'B-ED',
      expired_date_snapshot: storedDate, expired_date_snapshot_precision: storedPrecision };
    const batch = { id: selectedId, product_id: 10, batch_no: 'ACTUAL', qty_current: 10,
      expired_date: '2028-02-29', expired_date_precision: 'day', tax_type: 'faktur', ppn_rate: 0.11 };
    let inserted = 0;
    const { response } = await invokeRoute('sales', 'put', '/:id', {
      customer_id: 1, customer_name: 'Pelanggan',
      items: [{ ...old, selected_batch_id: selectedId },
        ...(addSameBatchItem ? [{ ...old, id: undefined, selected_batch_id: 101 }] : [])],
    }, async (sql, params) => {
      if (/SELECT source_loan_id/.test(sql)) return { rows: [{ source_loan_id: null }] };
      if (/SELECT ppn_excluded/.test(sql)) return { rows: [{ payment_status: 'unpaid', ppn_excluded: false }] };
      if (/SELECT \* FROM sales_items/.test(sql)) return { rows: [old] };
      if (/SELECT batch_id, product_id, qty/.test(sql)) return { rows: [] };
      if (/SELECT id, name, base_unit/.test(sql)) return { rows: [{ id: 10, name: 'Produk ED', base_unit: 'pcs', pack_size: 1, weight_gram: 0 }] };
      if (/SELECT order_number/.test(sql)) return { rows: [{ order_number: 'HSB-NOTA-TEST' }] };
      if (/SELECT \* FROM inventory_batches/.test(sql)) return { rows: [{ ...batch, id: params[0] }] };
      if (/INSERT INTO sales_items/.test(sql)) {
        const preserve = inserted === 0 && selectedId === 101;
        assert.strictEqual(params[10], inserted === 0 ? selectedId : 101);
        assert.strictEqual(params[11], preserve ? 'B-ED' : 'ACTUAL');
        assert.strictEqual(params[12], preserve ? storedDate : '2028-02-29');
        assert.strictEqual(params[14], preserve ? storedPrecision : 'day');
        inserted += 1;
        return { rows: [] };
      }
      if (/AS g\s+FROM sales_items/.test(sql)) return { rows: [{ g: 178 }] };
      if (/SELECT s\.\*/.test(sql)) return { rows: [{ id: 321 }] };
      if (/^\s*(UPDATE|DELETE|INSERT)\b/.test(sql)) return { rows: [], rowCount: 1 };
      if (/^\s*(SET LOCAL|SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT)/i.test(String(sql).trim())) return { rows: [] };
      throw new Error(`Unexpected sales edit query: ${sql}`);
    });
    assert.strictEqual(response.statusCode, 200, JSON.stringify(response.data));
    assert.strictEqual(inserted, addSameBatchItem ? 2 : 1);
  });
}

const originalSaleLine = (overrides = {}) => ({
  id: 17, sales_order_id: 321, product_name: 'Produk ED', qty: 2, qty_in_unit: 2,
  unit: 'pcs', unit_price: 200, unit_hpp: 100, unit_hpp_tax_type: 'nota',
  batch_id_snapshot: 101, batch_no_snapshot: 'B-101',
  expired_date_snapshot: '2027-05-12', expired_date_snapshot_precision: null,
  ...overrides,
});
const withoutSaleItemId = ({ id, ...item }) => item;
const currentSaleBatches = [
  { id: 101, product_id: 10, batch_no: 'B-101', expired_date: '2028-01-31', expired_date_precision: 'month', qty_current: 20, tax_type: 'nota', ppn_rate: 0 },
  { id: 102, product_id: 10, batch_no: 'B-102', expired_date: '2028-02-29', expired_date_precision: 'month', qty_current: 20, tax_type: 'nota', ppn_rate: 0 },
];
const editSaleFixture = async (oldItems, items, batches = currentSaleBatches) => {
  const written = [];
  const result = await invokeRoute('sales', 'put', '/:id', {
    customer_id: 1, customer_name: 'Pelanggan', items,
  }, async (sql, params) => {
    if (/SELECT source_loan_id/.test(sql)) return { rows: [{ source_loan_id: null }] };
    if (/SELECT ppn_excluded/.test(sql)) return { rows: [{ payment_status: 'unpaid', ppn_excluded: false }] };
    if (/SELECT \* FROM sales_items/.test(sql)) return { rows: oldItems.map((item) => ({ ...item })) };
    if (/SELECT batch_id, product_id, qty/.test(sql)) return { rows: [] };
    if (/SELECT id, name, base_unit/.test(sql)) return { rows: [{ id: 10, name: 'Produk ED', base_unit: 'pcs', pack_size: 1, weight_gram: 0 }] };
    if (/SELECT order_number/.test(sql)) return { rows: [{ order_number: 'HSB-NOTA-TEST' }] };
    if (/FROM inventory_batches/.test(sql)) {
      if (/WHERE id = \$1 AND product_id = \$2/.test(sql)) {
        return { rows: batches.filter((b) => String(b.id) === String(params[0]) && b.product_id === params[1]) };
      }
      if (/batch_no = \$2/.test(sql)) {
        return { rows: batches.filter((b) => b.product_id === params[0] && b.batch_no === params[1]
          && (params.length < 3 || b.expired_date === params[2])
          && (params.length < 4 || (b.expired_date_precision || 'day') === params[3])) };
      }
      if (/WHERE product_id = \$1/.test(sql)) return { rows: batches.filter((b) => b.product_id === params[0]) };
    }
    if (/INSERT INTO sales_items/.test(sql)) {
      written.push({
        product_name: params[1], batch_id_snapshot: params[10], batch_no_snapshot: params[11],
        expired_date_snapshot: params[12], expired_date_snapshot_precision: params[14],
      });
      return { rows: [] };
    }
    if (/AS g\s+FROM sales_items/.test(sql)) return { rows: [{ g: 200 }] };
    if (/SELECT s\.\*/.test(sql)) return { rows: [{ id: 321 }] };
    if (/^\s*(UPDATE|DELETE|INSERT)\b/.test(sql)) return { rows: [], rowCount: 1 };
      if (/^\s*(SET LOCAL|SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT)/i.test(String(sql).trim())) return { rows: [] };
    throw new Error(`Unexpected fix-wave sale query: ${sql}`);
  });
  return { ...result, written };
};

for (const [date, precision, inferredId] of [
  ['2027-05-12', null, 101],
  ['2027-06-30', 'month', 101],
  ['2027-05-12', null, null],
]) {
  test(`fix-wave legacy no-id no-op menjaga ED ${date}/${precision} walau picker menginfer ID ${inferredId}`, async () => {
    const old = originalSaleLine({ batch_id_snapshot: null, expired_date_snapshot: date, expired_date_snapshot_precision: precision });
    const item = withoutSaleItemId(old);
    if (inferredId) Object.assign(item, { selected_batch_id: inferredId, batch_id_snapshot: inferredId, selected_batch_changed: false });
    const { response, written } = await editSaleFixture([old], [item]);
    assert.strictEqual(response.statusCode, 200, JSON.stringify(response.data));
    assert.strictEqual(written.length, 1);
    assert.strictEqual(written[0].batch_no_snapshot, 'B-101');
    assert.strictEqual(written[0].expired_date_snapshot, date);
    assert.strictEqual(written[0].expired_date_snapshot_precision, precision);
  });
}

for (const withIds of [true, false]) {
  test(`fix-wave dua baris produk sama ${withIds ? 'dengan ID' : 'legacy posisi tanpa ID'}: batch tujuan line1 tidak mencuri histori line2`, async () => {
    const first = originalSaleLine();
    const second = originalSaleLine({ id: 18, batch_id_snapshot: 102, batch_no_snapshot: 'B-102', expired_date_snapshot: '2027-06-30', expired_date_snapshot_precision: 'month' });
    const changed = { ...first, selected_batch_id: 102, batch_id_snapshot: 102, batch_no_snapshot: 'B-102', expired_date_snapshot: '2028-02-29', expired_date_snapshot_precision: 'month', selected_batch_changed: true };
    const unchanged = { ...second, selected_batch_id: 102, selected_batch_changed: false };
    const { response, written } = await editSaleFixture([first, second],
      withIds ? [changed, unchanged] : [withoutSaleItemId(changed), withoutSaleItemId(unchanged)]);
    assert.strictEqual(response.statusCode, 200, JSON.stringify(response.data));
    assert.deepStrictEqual(written, [
      { product_name: 'Produk ED', batch_id_snapshot: 102, batch_no_snapshot: 'B-102', expired_date_snapshot: '2028-02-29', expired_date_snapshot_precision: 'month' },
      { product_name: 'Produk ED', batch_id_snapshot: 102, batch_no_snapshot: 'B-102', expired_date_snapshot: '2027-06-30', expired_date_snapshot_precision: 'month' },
    ]);
  });
}

test('fix-wave explicit item ID lebih diutamakan dari posisi ketika urutan dibalik', async () => {
  const first = originalSaleLine();
  const second = originalSaleLine({ id: 18, batch_id_snapshot: 102, batch_no_snapshot: 'B-102', expired_date_snapshot: '2027-06-30', expired_date_snapshot_precision: 'month' });
  const { response, written } = await editSaleFixture([first, second], [
    { ...second, id: '18', selected_batch_id: 102, selected_batch_changed: false },
    { ...first, id: '17', selected_batch_id: 102, batch_id_snapshot: 102, selected_batch_changed: true },
  ]);
  assert.strictEqual(response.statusCode, 200, JSON.stringify(response.data));
  assert.deepStrictEqual(written.map((item) => [item.expired_date_snapshot, item.expired_date_snapshot_precision]),
    [['2027-06-30', 'month'], ['2028-02-29', 'month']]);
});

test('fix-wave actual explicit batch change legacy tanpa item ID memakai ED+precision DB, bukan snapshot payload', async () => {
  const old = originalSaleLine({ batch_id_snapshot: null });
  const { response, written } = await editSaleFixture([old], [{
    ...withoutSaleItemId(old), selected_batch_id: 102, selected_batch_changed: true,
  }]);
  assert.strictEqual(response.statusCode, 200, JSON.stringify(response.data));
  assert.strictEqual(written[0].batch_id_snapshot, 102);
  assert.strictEqual(written[0].expired_date_snapshot, '2028-02-29');
  assert.strictEqual(written[0].expired_date_snapshot_precision, 'month');
});

test('fix-wave client lama tanpa item ID/intent tetap bisa memilih batch baru', async () => {
  const old = originalSaleLine();
  const { response, written } = await editSaleFixture([old], [{
    ...withoutSaleItemId(old), selected_batch_id: 102,
  }]);
  assert.strictEqual(response.statusCode, 200, JSON.stringify(response.data));
  assert.strictEqual(written[0].batch_id_snapshot, 102);
  assert.strictEqual(written[0].expired_date_snapshot, '2028-02-29');
  assert.strictEqual(written[0].expired_date_snapshot_precision, 'month');
});

test('fix-wave legacy tanpa ID/intent: dua baris berposisi stabil tidak dicocokkan berdasarkan batch tujuan', async () => {
  const first = originalSaleLine();
  const second = originalSaleLine({ id: 18, batch_id_snapshot: 102, batch_no_snapshot: 'B-102', expired_date_snapshot: '2027-06-30', expired_date_snapshot_precision: 'month' });
  const { response, written } = await editSaleFixture([first, second], [
    { ...withoutSaleItemId(first), selected_batch_id: 102, batch_id_snapshot: 102, batch_no_snapshot: 'B-102', expired_date_snapshot: '2028-02-29', expired_date_snapshot_precision: 'month' },
    { ...withoutSaleItemId(second), selected_batch_id: 102 },
  ]);
  assert.strictEqual(response.statusCode, 200, JSON.stringify(response.data));
  assert.deepStrictEqual(written.map((item) => [item.expired_date_snapshot, item.expired_date_snapshot_precision]),
    [['2028-02-29', 'month'], ['2027-06-30', 'month']]);
});

test('fix-wave mixed payload: fallback tanpa ID tidak mengonsumsi baris ber-ID eksplisit berikutnya', async () => {
  const first = originalSaleLine();
  const second = originalSaleLine({ id: 18, batch_id_snapshot: 102, batch_no_snapshot: 'B-102', expired_date_snapshot: '2027-06-30', expired_date_snapshot_precision: 'month' });
  const { response, written } = await editSaleFixture([first, second], [
    { ...withoutSaleItemId(first), selected_batch_id: 102, batch_id_snapshot: 102, selected_batch_changed: true },
    { ...second, selected_batch_id: 102, selected_batch_changed: false },
  ]);
  assert.strictEqual(response.statusCode, 200, JSON.stringify(response.data));
  assert.deepStrictEqual(written.map((item) => [item.expired_date_snapshot, item.expired_date_snapshot_precision]),
    [['2028-02-29', 'month'], ['2027-06-30', 'month']]);
});

test('fix-wave legacy no-ID dengan count berubah dan asal ambigu ditolak, tidak mengambil histori batch tujuan', async () => {
  const first = originalSaleLine();
  const second = originalSaleLine({ id: 18, batch_id_snapshot: 102, batch_no_snapshot: 'B-102', expired_date_snapshot: '2027-06-30', expired_date_snapshot_precision: 'month' });
  const { response, calls } = await editSaleFixture([first, second], [{
    ...withoutSaleItemId(first), selected_batch_id: 102, batch_id_snapshot: 102,
    batch_no_snapshot: 'B-102', expired_date_snapshot: '2028-02-29',
    expired_date_snapshot_precision: 'month', selected_batch_changed: true,
  }]);
  assert.strictEqual(response.statusCode, 400, JSON.stringify(response.data));
  assert.ok(!calls.some(({ sql }) => sql === 'COMMIT'));
});

test('fix-wave legacy tanpa ID: penghapusan baris tetap aman jika snapshot asal unik', async () => {
  const first = originalSaleLine();
  const second = originalSaleLine({ id: 18, batch_id_snapshot: 102, batch_no_snapshot: 'B-102', expired_date_snapshot: '2027-06-30', expired_date_snapshot_precision: 'month' });
  const { response, written } = await editSaleFixture([first, second], [{ ...withoutSaleItemId(second), selected_batch_id: 102 }]);
  assert.strictEqual(response.statusCode, 200, JSON.stringify(response.data));
  assert.strictEqual(written[0].expired_date_snapshot, '2027-06-30');
  assert.strictEqual(written[0].expired_date_snapshot_precision, 'month');
});

for (const id of [999, '17junk', 0]) {
  test(`fix-wave explicit invalid/unowned sales item ID ${id} ditolak tanpa fallback histori`, async () => {
    const old = originalSaleLine();
    const { response, calls } = await editSaleFixture([old], [{ ...old, id, selected_batch_id: 101 }]);
    assert.strictEqual(response.statusCode, 400, JSON.stringify(response.data));
    assert.ok(!calls.some(({ sql }) => sql === 'COMMIT'));
  });
}

test('fix-wave explicit item ID produk lain ditolak meskipun ada fallback produk yang cocok', async () => {
  const old = originalSaleLine();
  const other = originalSaleLine({ id: 18, product_name: 'Produk Lain' });
  const { response, calls } = await editSaleFixture([old, other], [{ ...old, id: 18, selected_batch_id: 101 }]);
  assert.strictEqual(response.statusCode, 400, JSON.stringify(response.data));
  assert.ok(!calls.some(({ sql }) => sql === 'COMMIT'));
});

test('fix-wave duplicate explicit item ID tidak boleh mengonsumsi histori baris kedua', async () => {
  const old = originalSaleLine();
  const second = originalSaleLine({ id: 18 });
  const { response, calls } = await editSaleFixture([old, second], [
    { ...old, selected_batch_id: 101 }, { ...second, id: 17, selected_batch_id: 101 },
  ]);
  assert.strictEqual(response.statusCode, 400, JSON.stringify(response.data));
  assert.ok(!calls.some(({ sql }) => sql === 'COMMIT'));
});

for (const [returnedDate, returnedPrecision] of [['2027-05-31', 'month'], ['2027-05-12', null]]) {
test(`adjustment menyimpan ED historis retur ${returnedDate}/${returnedPrecision}, ED batch replacement, dan precision karantina`, async () => {
  const { response } = await invokeRoute('sales', 'post', '/:id/adjustments', {
    type: 'exchange', reason: 'Rusak', idempotency_key: 'expiry-adjustment',
    items: [
      { direction: 'returned', original_sales_item_id: 17, qty_in_unit: 1, condition: 'quarantine', condition_reason: 'Rusak' },
      { direction: 'replacement', replacement_batch_id: 102, qty_in_unit: 1, unit: 'pcs', unit_price: 200 },
    ],
  }, async (sql, params) => {
    if (/SELECT \* FROM sales_adjustments/.test(sql)) return { rows: [] };
    if (/FROM sales_orders WHERE id/.test(sql)) return { rows: [{ id: 321, order_number: 'NOTA', customer_name: 'Pelanggan', sale_date: '2026-09-29', total: 200, payment_status: 'paid', paid_at: '2026-09-29', is_deleted: false }] };
    if (/SELECT \* FROM sales_items/.test(sql)) return { rows: [{ id: 17, product_name: 'Produk ED', qty: 2, qty_in_unit: 2, unit: 'pcs', pack_size_at_sale: 1, unit_price: 200, batch_id_snapshot: 101, batch_no_snapshot: 'OLD', expired_date_snapshot: returnedDate, expired_date_snapshot_precision: returnedPrecision }] };
    if (/AS returned_qty/.test(sql)) return { rows: [{ returned_qty: 0 }] };
    if (/SELECT id, product_id, batch_no/.test(sql)) return { rows: [{ id: 101, product_id: 10, batch_no: 'CHANGED', expired_date: '2028-02-29', expired_date_precision: 'day' }] };
    if (/SELECT b\.id, b\.product_id/.test(sql)) return { rows: [{ id: 102, product_id: 10, product_name: 'Produk ED', base_unit: 'pcs', pack_size: 1, qty_current: 10, batch_no: 'NEW', expired_date: '2028-02-29', expired_date_precision: 'month' }] };
    if (/INSERT INTO sales_adjustments/.test(sql)) return { rows: [{ id: 501, adjustment_number: 'ADJ' }] };
    if (/INSERT INTO sales_adjustment_items/.test(sql)) {
      assert.strictEqual(params[0], 501);
      assert.strictEqual(params[2], 10);
      assert.strictEqual(params[3], 'Produk ED');
      if (params[11] === 'returned') {
        assert.strictEqual(params[1], 17);
        assert.strictEqual(params[4], 101);
        assert.strictEqual(params[5], null);
        assert.strictEqual(params[13], 'Rusak');
        assert.strictEqual(params[17], returnedDate);
        assert.strictEqual(params[18], null);
        assert.strictEqual(params[19], null);
        assert.strictEqual(params[20], returnedPrecision || 'day');
        assert.strictEqual(params[21], null);
      } else {
        assert.strictEqual(params[11], 'replacement');
        assert.strictEqual(params[1], null);
        assert.strictEqual(params[4], null);
        assert.strictEqual(params[5], 102);
        assert.strictEqual(params[12], null);
        assert.strictEqual(params[13], null);
        assert.strictEqual(params[14], null);
        assert.strictEqual(params[15], null);
        assert.strictEqual(params[16], null);
        assert.strictEqual(params[17], null);
        assert.strictEqual(params[19], '2028-02-29');
        assert.strictEqual(params[20], null);
        assert.strictEqual(params[21], 'month');
      }
      return { rows: [] };
    }
    if (/INSERT INTO inventory_batches/.test(sql)) {
      assert.match(sql, /notes, expired_date_precision\)/);
      assert.match(sql, /FALSE, \$3, expired_date_precision/);
      return { rows: [{ id: 103 }] };
    }
    if (/UPDATE inventory_batches|INSERT INTO inventory_mutations/.test(sql)) return { rows: [] };
      if (/^\s*(SET LOCAL|SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT)/i.test(String(sql).trim())) return { rows: [] };
    throw new Error(`Unexpected adjustment query: ${sql}`);
  });
  assert.strictEqual(response.statusCode, 201, JSON.stringify(response.data));
});
}

(async () => {
  let passed = 0;
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed += 1;
    } catch (error) {
      console.error(`✗ ${name}`);
      console.error(error);
      failed += 1;
    }
  }
  console.log(`\nExpiry contract: ${passed} PASSED, ${failed} FAILED\n`);
  if (failed) process.exitCode = 1;
})();
