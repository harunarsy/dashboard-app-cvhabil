'use strict';

/**
 * v1.68.0 — kontrak validasi item nota (bug "qty pcs x harga karton").
 * Usage: node scripts/test-sales-item-integrity.js
 */

const assert = require('assert');
const {
  validateSaleItemQuantities,
  validateSaleItemPack,
} = require('../utils/salesItemIntegrity');

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    console.error(`  ❌ ${name}\n     ${err.message}`);
    process.exitCode = 1;
  }
};

console.log('── VALIDASI ITEM NOTA (v1.68.0) ──');

test('qty x harga = subtotal lolos', () => {
  assert.strictEqual(
    validateSaleItemQuantities({ product_name: 'AQUA', qty: 5, unit_price: 47900, subtotal: 239500 }),
    null,
  );
});

test('qty pcs dengan harga karton ditolak', () => {
  const err = validateSaleItemQuantities({ product_name: 'AQUA', qty: 120, unit_price: 47900, subtotal: 239500 });
  assert.ok(err && /Subtotal produk "AQUA" tidak cocok/.test(err));
});

test('qty_in_unit beda dengan qty ditolak', () => {
  const err = validateSaleItemQuantities({ product_name: 'Omela', qty: 1, qty_in_unit: 12, unit_price: 212000 });
  assert.ok(err && /qty_in_unit/.test(err));
});

test('tanpa subtotal/qty_in_unit (payload form normal) lolos', () => {
  assert.strictEqual(
    validateSaleItemQuantities({ product_name: 'Omela', qty: 2, unit_price: 212000 }),
    null,
  );
});

test('toleransi pembulatan Rp1 tetap lolos', () => {
  assert.strictEqual(
    validateSaleItemQuantities({ product_name: 'Bulat', qty: 3, unit_price: 33333.335, subtotal: 100000 }),
    null,
  );
});

test('qty nol/negatif ditolak', () => {
  assert.ok(validateSaleItemQuantities({ product_name: 'X', qty: 0, unit_price: 1000 }));
  assert.ok(validateSaleItemQuantities({ product_name: 'X', qty: -2, unit_price: 1000 }));
});

test('qty base harus qty x pack untuk satuan karton', () => {
  assert.strictEqual(
    validateSaleItemPack({
      productName: 'Omela', qtySell: 2, qtyBase: 24, packSize: 12, unit: 'karton', baseUnit: 'pcs',
    }),
    null,
  );
  const err = validateSaleItemPack({
    productName: 'Omela', qtySell: 2, qtyBase: 2, packSize: 12, unit: 'karton', baseUnit: 'pcs',
  });
  assert.ok(err && /Konversi satuan/.test(err));
});

test('satuan pcs tidak dipaksa dikali pack', () => {
  assert.strictEqual(
    validateSaleItemPack({
      productName: 'Nephrisol', qtySell: 3, qtyBase: 3, packSize: 12, unit: 'pcs', baseUnit: 'pcs',
    }),
    null,
  );
});

console.log(`\n═══ ${passed} tes lolos ═══`);
