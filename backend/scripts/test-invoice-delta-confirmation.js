const assert = require('assert');
const {
  applyInvoiceDeltaPlan,
  _test,
} = require('../services/invoiceDeltaService');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const assertQueryParameters = (sql, params) => {
  const indexes = [...sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
  const expected = indexes.length ? Math.max(...indexes) : 0;
  assert.strictEqual(params.length, expected, `Jumlah parameter SQL tidak cocok: ${sql}`);
  for (const value of params) {
    assert.notStrictEqual(value, undefined, `Parameter undefined: ${sql}`);
    if (typeof value === 'number') assert.ok(Number.isFinite(value), `Parameter numerik invalid: ${sql}`);
  }
};

const createClient = () => {
  const calls = [];
  let nextBatchId = 501;
  const client = {
    calls,
    async query(sql, params = []) {
      assertQueryParameters(sql, params);
      calls.push({ sql, params });

      if (/UPDATE inventory_mutations SET invoice_line_key/.test(sql)) return { rows: [{ id: params[1] }] };
      if (/UPDATE invoice_items SET/.test(sql)) {
        assert.strictEqual(params[5], null, 'Expired Date kosong wajib menjadi NULL saat update item');
        return { rows: [{ id: params[22] }] };
      }
      if (/INSERT INTO invoice_items/.test(sql)) {
        assert.strictEqual(params[5], null, 'Expired Date kosong wajib menjadi NULL saat insert item');
        return { rows: [] };
      }
      if (/INSERT INTO inventory_batches/.test(sql)) {
        assert.ok(params[2] === null || /^\d{4}-\d{2}-\d{2}$/.test(params[2]));
        return { rows: [{ id: nextBatchId++ }] };
      }
      if (/UPDATE inventory_batches\s+SET batch_no/.test(sql)) {
        assert.ok(params[1] === null || /^\d{4}-\d{2}-\d{2}$/.test(params[1]));
        return { rows: [{ id: params[2] }] };
      }
      if (/UPDATE inventory_batches SET hna/.test(sql)) return { rows: [{ id: params[1] }] };
      if (/UPDATE product_master SET hna/.test(sql)) return { rows: [{ id: params[1] }] };
      if (/UPDATE inventory_batches\s+SET qty_current/.test(sql)) {
        return { rows: [{ id: params[1], qty_current: params[2] + params[0] }] };
      }
      if (/INSERT INTO inventory_mutations/.test(sql)) return { rows: [] };
      if (/UPDATE purchase_order_items/.test(sql)) {
        return {
          rows: [{
            id: params[2],
            received_qty: params[3] + params[0],
            received_qty_in_unit: params[4] == null ? null : params[4] + params[1],
          }],
        };
      }
      if (/UPDATE invoices SET/.test(sql)) {
        assert.match(params[1], /^\d{4}-\d{2}-\d{2}$/);
        assert.strictEqual(params[14], null, 'due_date kosong wajib menjadi NULL');
        assert.strictEqual(params[15], null, 'payment_date kosong wajib menjadi NULL');
        return { rows: [{ id: params[19], invoice_number: params[0], purchase_date: params[1] }] };
      }
      if (/SELECT \* FROM invoice_items/.test(sql)) return { rows: [{ id: 10 }, { id: 11 }, { id: 12 }] };
      if (/INSERT INTO invoice_audit_log/.test(sql)) return { rows: [] };
      if (/INSERT INTO invoice_edit_events/.test(sql)) return { rows: [] };
      throw new Error(`Query tidak ditangani contract test: ${sql}`);
    },
  };
  return client;
};

const line = ({ id = null, key, productId, name, qty, batch, expired = '', hna }) => ({
  id,
  line_key: key,
  product_id: productId,
  product_name: name,
  quantity_base: qty,
  quantity_input: qty,
  unit: 'pcs',
  batch_number: batch,
  expired_date: expired,
  hna_base: hna,
  product: { id: productId, base_unit: 'pcs', pack_size: 1 },
  raw: {
    id,
    line_key: key,
    product_id: productId,
    product_name: name,
    quantity: qty,
    unit: 'pcs',
    batch_number: batch,
    expired_date: expired,
    hna,
    hna_times_qty: hna * qty,
    hna_baru: hna * qty,
    hna_per_item: hna,
    hpp_inc_ppn: hna * 1.11,
  },
});

test('DATE boundary menerima kosong sebagai NULL dan menolak tanggal mustahil', () => {
  assert.strictEqual(_test.optionalDbDate(''), null);
  assert.strictEqual(_test.optionalDbDate(null), null);
  assert.strictEqual(_test.optionalDbDate('2026-09-13T10:00:00.000Z'), '2026-09-13');
  assert.strictEqual(_test.requiredDbDate('2026-09-13', 'Tanggal faktur'), '2026-09-13');
  assert.throws(() => _test.optionalDbDate('2026-02-30'), (error) => error.code === 'INVALID_DATE');
  assert.throws(() => _test.requiredDbDate('', 'Tanggal faktur'), (error) => error.code === 'INVALID_DATE');
});

test('tanggal opsional yang dikosongkan benar-benar dihapus, bukan memakai nilai lama', () => {
  const values = _test.itemDbValues(line({
    key: 'date-clear', productId: 1, name: 'Produk', qty: 1,
    batch: 'BATCH', expired: '', hna: 1000,
  }), 'faktur');
  assert.strictEqual(values[5], null);
});

test('jalur confirm lengkap menyimpan item, delta batch, mutasi, HNA, PO, header, dan audit tanpa DATE kosong', async () => {
  const client = createClient();
  const existing = line({ id: 10, key: 'legacy-line-10', productId: 2, name: 'Kecap', qty: 6, batch: 'ANQG29VD', hna: 27500 });
  const nfdm = line({ key: 'new-nfdm', productId: 4, name: 'NFDM', qty: 1, batch: 'ENQF30MI', hna: 161500 });
  const diabtx = line({ key: 'new-diabtx', productId: 3, name: 'Diabtx', qty: 160, batch: 'ANQF10DC', hna: 74800 });
  const plan = {
    state: {
      invoice: {
        id: 321,
        invoice_number: 'INVSB1260902363',
        purchase_date: '2026-09-10',
        due_date: '2026-10-10',
        payment_date: '2026-09-12',
        distributor_name: 'PT ANTAR MITRA SEMBADA',
        tax_type: 'faktur',
        ppn_rate: 0.11,
        status: 'Pending',
        purchase_order_id: 77,
      },
      batches: new Map(),
      snapshot: { invoice: { id: 321 } },
    },
    mapping: { mappingUpdates: [{ mutation_id: 91, line_key: 'legacy-line-10' }] },
    currentLines: [existing],
    nextLines: [existing, nfdm, diabtx],
    delta: {
      metadata_changes: [],
      batch_deltas: [
        {
          key: 'line:new-nfdm', product_id: 4, delta: 1, line_keys: ['new-nfdm'],
          contributions: [{ line_key: 'new-nfdm', delta: 1 }], unit: 'pcs',
        },
        {
          key: 'line:new-diabtx', product_id: 3, delta: 160, line_keys: ['new-diabtx'],
          contributions: [{ line_key: 'new-diabtx', delta: 160 }], unit: 'pcs',
        },
      ],
    },
    hnaRevaluations: [
      { target_key: 'line:new-nfdm', line_key: 'new-nfdm', product_id: 4, after_hna: 161500, product_master_sync: true, product_master_changed: true },
      { target_key: 'line:new-diabtx', line_key: 'new-diabtx', product_id: 3, after_hna: 74800, product_master_sync: true, product_master_changed: true },
    ],
    poEffects: [{
      po_item_id: 701,
      delta_base: 1,
      delta_in_unit: 1,
      before_received_qty: 0,
      before_received_qty_in_unit: null,
    }],
    preview: {
      stock_deltas: [{ product_id: 4, delta_base: 1 }, { product_id: 3, delta_base: 160 }],
      hna_revaluations: [{ product_id: 4 }, { product_id: 3 }],
      po_effects: [{ po_item_id: 701, delta_base: 1 }],
      negative_warnings: [],
    },
    requestHash: 'a'.repeat(64),
    helpers: {
      async syncPurchaseOrderStatus(syncClient, poId) {
        assert.strictEqual(syncClient, client);
        assert.strictEqual(poId, 77);
      },
    },
  };

  const response = await applyInvoiceDeltaPlan({
    client,
    plan,
    body: {
      invoice_number: 'INVSB1260902363',
      purchase_date: '2026-09-10',
      due_date: null,
      payment_date: null,
      distributor_name: 'PT ANTAR MITRA SEMBADA',
      status: 'Pending',
      tax_type: 'faktur',
      ppn_rate: 0.11,
    },
    idempotencyKey: 'invoice-edit-contract-001',
    userId: 1,
  });

  assert.strictEqual(response.invoice.id, 321);
  assert.strictEqual(client.calls.filter(({ sql }) => /INSERT INTO inventory_batches/.test(sql)).length, 2);
  assert.strictEqual(client.calls.filter(({ sql }) => /INSERT INTO inventory_mutations/.test(sql)).length, 2);
  assert.strictEqual(client.calls.filter(({ sql }) => /INSERT INTO invoice_edit_events/.test(sql)).length, 1);
});

test('jalur confirm koreksi batch, qty turun, dan HNA batch tetap atomik serta memakai NULL untuk ED kosong', async () => {
  const client = createClient();
  const current = line({ id: 20, key: 'legacy-line-20', productId: 8, name: 'Produk Lama', qty: 10, batch: 'TYPO', expired: '2028-01-01', hna: 10000 });
  const next = line({ id: 20, key: 'legacy-line-20', productId: 8, name: 'Produk Lama', qty: 9, batch: 'BATCH-BENAR', expired: '', hna: 11000 });
  const plan = {
    state: {
      invoice: {
        id: 322,
        invoice_number: 'INV-METADATA-001',
        purchase_date: '2026-09-11',
        due_date: null,
        payment_date: null,
        distributor_name: 'Distributor',
        tax_type: 'faktur',
        ppn_rate: 0.11,
        status: 'Pending',
        purchase_order_id: null,
      },
      batches: new Map([[40, { id: 40, qty_current: 10 }]]),
      snapshot: { invoice: { id: 322 } },
    },
    mapping: { mappingUpdates: [] },
    currentLines: [current],
    nextLines: [next],
    delta: {
      metadata_changes: [{
        batch_id: 40,
        after_batch_number: 'BATCH-BENAR',
        after_expired_date: '',
      }],
      batch_deltas: [{
        key: 'batch:40', batch_id: 40, product_id: 8, delta: -1,
        line_keys: ['legacy-line-20'],
        contributions: [{ line_key: 'legacy-line-20', delta: -1 }],
        unit: 'pcs',
      }],
    },
    hnaRevaluations: [{
      target_key: 'batch:40', line_key: 'legacy-line-20', batch_id: 40,
      product_id: 8, after_hna: 11000, batch_changed: true,
      product_master_sync: true, product_master_changed: true,
    }],
    poEffects: [],
    preview: {
      stock_deltas: [{ batch_id: 40, delta_base: -1 }],
      hna_revaluations: [{ batch_id: 40 }],
      po_effects: [],
      negative_warnings: [],
    },
    requestHash: 'b'.repeat(64),
    helpers: { async syncPurchaseOrderStatus() { throw new Error('Tidak boleh dipanggil tanpa SP'); } },
  };

  await applyInvoiceDeltaPlan({
    client,
    plan,
    body: {
      purchase_date: '2026-09-11',
      due_date: null,
      payment_date: null,
      tax_type: 'faktur',
    },
    idempotencyKey: 'invoice-edit-contract-002',
    userId: 1,
  });

  const metadataCall = client.calls.find(({ sql }) => /UPDATE inventory_batches\s+SET batch_no/.test(sql));
  assert.strictEqual(metadataCall.params[1], null);
  const mutationCall = client.calls.find(({ sql }) => /INSERT INTO inventory_mutations/.test(sql));
  assert.strictEqual(mutationCall.params[2], 'out');
  assert.strictEqual(mutationCall.params[3], 1);
});

(async () => {
  let passed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed += 1;
    } catch (error) {
      console.error(`✗ ${name}`);
      console.error(error);
      process.exitCode = 1;
    }
  }
  if (process.exitCode) process.exit(process.exitCode);
  console.log(`\n═══ Results: ${passed} PASSED ═══\n`);
})();
