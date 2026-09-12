const assert = require('assert');
const { buildInvoiceDelta } = require('../utils/invoiceDelta');

const currentLine = (overrides = {}) => ({
  id: 1,
  line_key: 'line-a',
  product_id: 10,
  product_name: 'Varian A',
  quantity_base: 10,
  unit: 'pcs',
  batch_number: 'BATCH-001',
  expired_date: '2027-01-01',
  ...overrides,
});

const nextLine = (overrides = {}) => ({
  line_key: 'line-a',
  product_id: 10,
  product_name: 'Varian A',
  quantity_base: 10,
  unit: 'pcs',
  batch_number: 'BATCH-001',
  expired_date: '2027-01-01',
  hna_base: 100,
  ...overrides,
});

const owned = (overrides = {}) => [{
  qty: 10,
  batch_id: 101,
  product_id: 10,
  batch_number: 'BATCH-001',
  expired_date: '2027-01-01',
  ...overrides,
}];

const deltaFor = (next, stock = owned(), extra = {}) => buildInvoiceDelta({
  currentLines: [currentLine()],
  nextLines: Array.isArray(next) ? next : [next],
  stockByLine: new Map([['line-a', stock]]),
  ...extra,
});

const onlyBatch = (result, batchId) => result.batch_deltas.find((entry) => entry.batch_id === batchId);

let passed = 0;
const test = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ✅ ${name}`);
};

console.log('═══ Invoice Delta Unit Tests ═══\n');

test('qty 10 → 11 hanya menghasilkan +1', () => {
  const result = deltaFor(nextLine({ quantity_base: 11 }));
  assert.strictEqual(onlyBatch(result, 101).delta, 1);
  assert.strictEqual(result.batch_deltas.length, 1);
});

test('qty 10 → 9 menghasilkan -1 tanpa menghapus mutasi awal', () => {
  const result = deltaFor(nextLine({ quantity_base: 9 }));
  assert.strictEqual(onlyBatch(result, 101).delta, -1);
});

test('saldo owner dapat dihitung dari lebih dari satu batch', () => {
  const result = deltaFor(
    nextLine({ quantity_base: 15 }),
    owned({ qty: 4, batch_id: 101 }),
  );
  assert.strictEqual(result.batch_deltas.find((entry) => entry.batch_id === 101).delta, 11);
});

test('tambah produk baru menghasilkan batch destination +qty', () => {
  const result = deltaFor([
    nextLine({ quantity_base: 10 }),
    nextLine({ line_key: 'line-b', product_id: 11, product_name: 'Varian B', quantity_base: 5, batch_number: 'B-002' }),
  ]);
  const added = result.batch_deltas.find((entry) => entry.kind === 'destination');
  assert.strictEqual(added.delta, 5);
  assert.strictEqual(added.product_id, 11);
});

test('hapus produk lama menghasilkan delta negatif seluruh qty owner', () => {
  const result = deltaFor([]);
  assert.strictEqual(onlyBatch(result, 101).delta, -10);
  assert.strictEqual(result.line_changes[0].status, 'removed');
});

test('ganti varian atomik: A -10 dan B +5', () => {
  const result = deltaFor(nextLine({ product_id: 11, product_name: 'Varian B', quantity_base: 5, batch_number: 'B-002' }));
  assert.strictEqual(onlyBatch(result, 101).delta, -10);
  const destination = result.batch_deltas.find((entry) => entry.kind === 'destination');
  assert.strictEqual(destination.product_id, 11);
  assert.strictEqual(destination.delta, 5);
  assert.strictEqual(result.line_changes[0].status, 'replaced');
});

test('simpan tanpa perubahan tidak membuat batch delta', () => {
  const result = deltaFor(nextLine());
  assert.strictEqual(result.changed, false);
  assert.strictEqual(result.batch_deltas.length, 0);
});

test('simpan tanpa perubahan pada ownership multi-batch tidak memindahkan stok', () => {
  const result = deltaFor(
    nextLine(),
    [
      owned({ batch_id: 101, qty: 4 })[0],
      owned({ batch_id: 102, qty: 6, batch_number: 'BATCH-002' })[0],
    ],
  );
  assert.strictEqual(result.changed, false);
  assert.strictEqual(result.batch_deltas.length, 0);
  assert.strictEqual(result.line_changes[0].status, 'unchanged');
});

test('mode pindah batch tanpa perubahan batch tetap memakai delta pada batch yang sama', () => {
  const result = deltaFor(
    nextLine({ quantity_base: 11 }),
    owned(),
    { batchEditMode: 'move' },
  );
  assert.strictEqual(onlyBatch(result, 101).delta, 1);
  assert.strictEqual(result.batch_deltas.filter((entry) => entry.kind === 'destination').length, 0);
});

test('mode pindah batch memblokir perubahan qty multi-batch tanpa tujuan batch baru', () => {
  assert.throws(
    () => deltaFor(
      nextLine({ quantity_base: 11 }),
      [
        owned({ batch_id: 101, qty: 4 })[0],
        owned({ batch_id: 102, qty: 6, batch_number: 'BATCH-002' })[0],
      ],
      { batchEditMode: 'move' },
    ),
    (error) => error.code === 'INVOICE_BATCH_MAPPING_AMBIGUOUS',
  );
});

test('baris lama tanpa ownership ledger tidak otomatis menambah stok saat diedit', () => {
  const result = buildInvoiceDelta({
    currentLines: [currentLine({ hna_base: 100 })],
    nextLines: [nextLine({ quantity_base: 11 })],
    stockByLine: new Map(),
  });
  assert.strictEqual(result.batch_deltas.length, 0);
  assert.strictEqual(result.product_deltas.length, 0);
});

test('simpan tanpa perubahan tidak memicu target revaluasi HNA', () => {
  const result = buildInvoiceDelta({
    currentLines: [currentLine({ hna_base: 100 })],
    nextLines: [nextLine({ hna_base: 100 })],
    stockByLine: new Map([['line-a', owned()]]),
  });
  assert.strictEqual(result.target_hna.length, 0);
});

test('koreksi batch/ED metadata tidak mengubah qty', () => {
  const result = deltaFor(nextLine({ batch_number: 'BATCH-TYPO-FIX', expired_date: '2028-02-02' }));
  assert.strictEqual(result.batch_deltas.length, 0);
  assert.strictEqual(result.metadata_changes.length, 1);
});

test('koreksi metadata pada ownership multi-batch diblokir agar tidak menjadi pindah diam-diam', () => {
  assert.throws(
    () => deltaFor(
      nextLine({ batch_number: 'BATCH-TYPO-FIX' }),
      [
        owned({ batch_id: 101, qty: 4 })[0],
        owned({ batch_id: 102, qty: 6, batch_number: 'BATCH-002' })[0],
      ],
    ),
    (error) => error.code === 'INVOICE_BATCH_MAPPING_AMBIGUOUS',
  );
});

test('pindah batch membuat batch lama negatif dan destination positif', () => {
  const result = deltaFor(
    nextLine({ batch_number: 'BATCH-NEW', expired_date: '2028-02-02' }),
    owned(),
    { batchEditMode: 'move' },
  );
  assert.strictEqual(onlyBatch(result, 101).delta, -10);
  const destination = result.batch_deltas.find((entry) => entry.kind === 'destination');
  assert.strictEqual(destination.delta, 10);
});

test('mutasi historis yang netral tidak membuat delta palsu pada edit berikutnya', () => {
  const result = deltaFor(
    nextLine(),
    [
      owned({ qty: 0, batch_id: 101, batch_number: 'BATCH-OLD', expired_date: '2027-01-01' })[0],
      owned({ qty: 10, batch_id: 102, batch_number: 'BATCH-001', expired_date: '2027-01-01' })[0],
    ],
  );
  assert.strictEqual(result.changed, false);
  assert.strictEqual(result.batch_deltas.length, 0);
});

test('mode batch yang tidak dikenal ditolak sebagai input invalid', () => {
  assert.throws(
    () => deltaFor(nextLine(), owned(), { batchEditMode: 'guess' }),
    (error) => error.code === 'INVALID_BATCH_EDIT_MODE',
  );
});

test('duplicate line_key diblokir', () => {
  assert.throws(() => deltaFor([
    nextLine(),
    nextLine({ product_id: 11, line_key: 'line-a' }),
  ]), /line_key duplikat/);
});

test('HNA berbeda pada produk yang sama diblokir', () => {
  const result = deltaFor([
    nextLine({ hna_base: 100 }),
    nextLine({ line_key: 'line-b', product_id: 10, hna_base: 101 }),
  ]);
  assert.strictEqual(result.hna_conflicts.length, 1);
});

test('HNA sama pada dua baris produk tetap menargetkan kedua line untuk revaluasi', () => {
  const result = deltaFor([
    nextLine({ hna_base: 100 }),
    nextLine({ line_key: 'line-b', product_id: 10, product_name: 'Varian A', quantity_base: 5, batch_number: 'BATCH-002', hna_base: 100 }),
  ]);
  assert.strictEqual(result.hna_conflicts.length, 0);
  assert.deepStrictEqual(result.target_hna.map((entry) => entry.line_key), ['line-a', 'line-b']);
});

test('replacement tetap membawa kontribusi per line key', () => {
  const result = deltaFor(nextLine({ product_id: 11, product_name: 'Varian B', quantity_base: 5 }));
  const oldContribution = onlyBatch(result, 101).contributions[0];
  assert.strictEqual(oldContribution.line_key, 'line-a');
  assert.strictEqual(oldContribution.delta, -10);
});

console.log(`\n═══ Results: ${passed} PASSED ═══\n`);
