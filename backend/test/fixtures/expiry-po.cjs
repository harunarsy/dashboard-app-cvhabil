const assert = require('node:assert/strict');

const poHeader = {
  id: 321, po_number: 'HSB-SP-2609001', distributor_name: 'Distributor ED',
  order_date: '2026-09-29', status: 'received', stock_received: true,
};
const poItem = {
  id: 17, po_id: 321, product_id: 10, product_name: 'Produk ED',
  qty: 2, received_qty: 2, unit: 'pcs', unit_price: 1000,
};
const receivedBatch = {
  id: 101, product_id: 10, batch_no: 'PO-MONTH', expired_date: '2028-02-29',
  expired_date_precision: 'month', qty_current: 2, source_qty_value: 2,
  source_qty_unit: 'pcs', hna: 1000, is_active: true, received_qty_base: 2,
};

// Emulate the SELECT boundary: an omitted column must not appear in the response.
const projectBatchRow = (sql, row) => {
  const projection = sql.match(/\bSELECT\s+([\s\S]+?)\s+FROM\s+inventory_batches\b/i)?.[1];
  assert.ok(projection, `Unexpected batch SELECT: ${sql}`);
  if (/^(?:b\.)?\*\s*$/.test(projection.trim())) return { ...row };
  return Object.fromEntries(Object.entries(row).filter(([column]) =>
    new RegExp(`\\b${column}\\b`, 'i').test(projection)));
};

const createPoFixtureQuery = (batch = receivedBatch) => async (sql, params = []) => {
  assert.match(sql.trim(), /^SELECT\b/i);
  if (/FROM purchase_orders\b/i.test(sql)) {
    assert.deepEqual(params, [321]);
    return { rows: [{ ...poHeader }] };
  }
  if (/FROM purchase_order_items\b/i.test(sql)) {
    assert.deepEqual(params, [321]);
    return { rows: [{ ...poItem }] };
  }
  if (/FROM inventory_batches\b/i.test(sql)) {
    assert.deepEqual(params, ['PO-321', 321]);
    return { rows: [projectBatchRow(sql, batch)] };
  }
  throw new Error(`Unexpected PO fixture query: ${sql}`);
};

const readReceivedPo = async () => {
  const databasePath = require.resolve('../../config/database');
  const routerPath = require.resolve('../../routes/purchaseOrders');
  const previousDatabase = require.cache[databasePath];
  const previousRouter = require.cache[routerPath];
  try {
    require.cache[databasePath] = {
      id: databasePath, filename: databasePath, loaded: true,
      exports: { query: createPoFixtureQuery() },
    };
    delete require.cache[routerPath];
    const router = require(routerPath);
    const layer = router.stack.find((entry) => entry.route?.path === '/:id' && entry.route.methods.get);
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(data) { this.data = data; return this; },
    };
    await layer.route.stack.at(-1).handle({ params: { id: 321 } }, response);
    assert.equal(response.statusCode, 200, JSON.stringify(response.data));
    return response.data;
  } finally {
    if (previousDatabase) require.cache[databasePath] = previousDatabase;
    else delete require.cache[databasePath];
    if (previousRouter) require.cache[routerPath] = previousRouter;
    else delete require.cache[routerPath];
  }
};

module.exports = { poHeader, poItem, receivedBatch, projectBatchRow, createPoFixtureQuery, readReceivedPo };
