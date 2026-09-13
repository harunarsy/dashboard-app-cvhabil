#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { _test } = require('../services/invoiceDeltaService');

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
const routes = read('routes', 'invoices.js');
const service = read('services', 'invoiceDeltaService.js');
const migration = read('migrations', 'routeSchemas.js');
const frontend = fs.readFileSync(
  path.join(__dirname, '..', '..', 'frontend', 'src', 'components', 'InvoiceList.jsx'),
  'utf8',
);

let passed = 0;
const test = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ✅ ${name}`);
};

console.log('═══ Invoice Delta Safety Contract Tests ═══\n');

test('schema stores line identity, event key, and immutable edit event snapshots', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS line_key VARCHAR\(120\)/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS invoice_line_key VARCHAR\(120\)/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS event_key VARCHAR\(160\)/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS invoice_edit_events/i);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_edit_events_idempotency/i);
  assert.match(migration, /invoice_id INTEGER NOT NULL,[\s\S]*must survive the optional permanent deletion/i);
  assert.match(migration, /20260911_021_invoice_edit_event_retention/);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS invoice_edit_events_invoice_id_fkey/i);
});

test('preview is read-only and confirm is transactional', () => {
  assert.match(routes, /BEGIN READ ONLY/);
  assert.match(routes, /await client\.query\('ROLLBACK'\)/);
  assert.match(routes, /await client\.query\('BEGIN'\)/);
  assert.match(routes, /await client\.query\('COMMIT'\)/);
  assert.match(routes, /SELECT id FROM invoices WHERE id = \$1 AND deleted_at IS NULL FOR UPDATE/);
});

test('delta confirmation locks invoice items, batches, PO rows, and HNA products', () => {
  assert.match(service, /SELECT \* FROM invoice_items WHERE invoice_id = \$1 ORDER BY id[\s\S]*FOR UPDATE/);
  assert.match(service, /SELECT \* FROM inventory_batches WHERE source_ref = \$1[\s\S]*FOR UPDATE/);
  assert.match(service, /SELECT id FROM product_master WHERE id = ANY\(\$1::int\[\]\) FOR UPDATE/);
  assert.match(routes, /SELECT id, product_id, product_name, qty, unit, received_qty[\s\S]*FOR UPDATE/);
  assert.match(routes, /received_qty_in_unit/);
});

test('preview token snapshot binds mutable header, PO, and product/UOM state', () => {
  assert.match(service, /snapshotTimestamp\(invoice\.updated_at\)/);
  assert.match(service, /purchase_order_items: purchaseOrderItems\.map/);
  assert.match(service, /state\.snapshot\.product_master =/);
  assert.match(service, /pack_size: product\.pack_size/);
});

test('lifecycle operations serialize on the invoice and owned batches', () => {
  assert.match(routes, /SELECT \* FROM invoices WHERE id = \$1 AND deleted_at IS NULL FOR UPDATE/);
  assert.match(routes, /SELECT \* FROM invoices WHERE id = \$1 AND deleted_at IS NOT NULL FOR UPDATE/);
  assert.match(routes, /SELECT \* FROM invoices WHERE id = \$1 FOR UPDATE/);
  assert.match(routes, /const lockInvoiceBatches = async/);
  assert.match(routes, /await lockInvoiceBatches\(client, req\.params\.id\)/);
});

test('lifecycle PO reversal uses exact-row allocator, not a broad product update', () => {
  assert.match(routes, /const applyPurchaseOrderProductDelta = async/);
  assert.match(routes, /const qtyByProduct = new Map\(\);[\s\S]*qtyByProduct\.set\([\s\S]*\);[\s\S]*await applyPurchaseOrderProductDelta\(client, purchaseOrderId, productId, -qty\)/);
  assert.match(routes, /await applyPurchaseOrderProductDelta\(client, purchaseOrderId, productId, -qty\)/);
  assert.match(routes, /await applyPurchaseOrderProductDelta\(client, purchaseOrderId, productId, qty\)/);
  assert.doesNotMatch(
    routes,
    /UPDATE purchase_order_items SET received_qty = received_qty [+-] \$1\s+WHERE po_id = \$2 AND product_id = \$3/i,
  );
});

test('delta service never deletes historical inventory mutations', () => {
  assert.doesNotMatch(service, /DELETE\s+FROM\s+inventory_mutations/i);
  assert.doesNotMatch(service, /UPDATE\s+sales_items/i);
  assert.match(service, /INSERT INTO inventory_mutations/);
  assert.match(service, /reference_type, reference_id/);
  assert.doesNotMatch(routes, /DELETE FROM inventory_mutations[\s\S]*reference_type IN \('faktur'/i);
});

test('legacy item rewrite also persists a stable line key', () => {
  assert.match(routes, /item\.line_key = normalizeLineKey\(item\.line_key\)[\s\S]*generatedLineKey\(id, `update-\$\{invoice_number\}`/);
  assert.match(routes, /pack_size_at_invoice, tax_type, line_key\)/);
});

test('partial historical PO posting is blocked before delta write', () => {
  assert.match(service, /PARTIAL_STOCK_RECONCILIATION_REQUIRED/);
  assert.match(routes, /error\?\.code === 'PARTIAL_STOCK_RECONCILIATION_REQUIRED'/);
});

test('legacy posted invoice item edit is forced through the delta contract', () => {
  assert.match(routes, /items !== undefined && hasStockMutations && req\.body\?\.stock_edit_mode !== 'delta'/);
  assert.match(routes, /code: 'DELTA_MODE_REQUIRED'/);
  assert.match(routes, /SELECT \* FROM invoices WHERE id = \$1 FOR UPDATE/);
});

test('legacy posted invoice resolves its stock mutation without a runtime reference error', () => {
  const mapping = _test.resolveLegacyLineMapping({
    invoice: { invoice_number: 'INV-LEGACY-001' },
    items: [{
      id: 17,
      line_key: null,
      product_id: 10,
      product_name: 'Varian A',
      batch_number: 'BATCH-001',
      expired_date: '2027-01-01',
    }],
    mutations: [{
      id: 71,
      reference_type: 'faktur',
      type: 'in',
      product_id: 10,
      batch_id: 101,
      invoice_line_key: null,
    }],
    batches: new Map([[
      101,
      {
        id: 101,
        batch_no: 'BATCH-001',
        expired_date: '2027-01-01',
      },
    ]]),
  });

  assert.strictEqual(mapping.hasPostedStock, true);
  assert.deepStrictEqual(mapping.ambiguities, []);
  assert.deepStrictEqual(mapping.mappingUpdates, [
    { mutation_id: 71, line_key: 'legacy-line-17' },
  ]);
});

test('delta confirmation consumes mapping updates from the canonical nested plan', () => {
  assert.match(service, /for \(const mapping of plan\.mapping\.mappingUpdates\)/);
  assert.doesNotMatch(service, /plan\.mappingUpdates/);
});

test('delta commit normalizes optional DATE fields and fails closed on missing write targets', () => {
  assert.match(service, /optionalDbDate\(raw\.expired_date/);
  assert.match(service, /const dueDate = optionalDbDate/);
  assert.match(service, /const paymentDate = optionalDbDate/);
  assert.match(service, /STALE_INVOICE_ITEM/);
  assert.match(service, /STALE_INVOICE_MAPPING/);
  assert.match(routes, /UPDATE purchase_orders[\s\S]*RETURNING id[\s\S]*updated\.rows\.length !== 1/);
});

test('permanent delete preserves ledger history and appends a final reversal', () => {
  assert.match(routes, /const inMutations = await loadInvoiceOwnedNetByBatch\(client, req\.params\.id\)/);
  assert.match(routes, /Reversal permanent delete faktur/);
  assert.match(routes, /UPDATE inventory_batches SET is_active = FALSE WHERE source_ref = \$1/);
  assert.doesNotMatch(routes, /DELETE FROM inventory_mutations/i);
});

test('item id cannot silently point at another stable line key', () => {
  assert.match(service, /LINE_ID_KEY_MISMATCH/);
  assert.match(routes, /error\?\.code === 'LINE_ID_KEY_MISMATCH'/);
});

test('frontend enforces preview then explicit confirmation', () => {
  assert.match(frontend, /invoicesAPI\.previewUpdate\(targetId, deltaPayload\)/);
  assert.match(frontend, /preview_token: deltaReview\.previewToken/);
  assert.match(frontend, /confirm_stock_delta: true/);
  assert.match(frontend, /Konfirmasi & simpan delta/);
});

console.log(`\n═══ Results: ${passed} PASSED ═══\n`);
