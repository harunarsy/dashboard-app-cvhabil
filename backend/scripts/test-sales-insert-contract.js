/**
 * test-sales-insert-contract.js — Contract test statis untuk statement INSERT
 * jalur POST /api/sales (Buat Nota Baru). Tidak membutuhkan database.
 *
 * Latar (P0 27 Sep 2026): daftar kolom INSERT menempatkan `status` di posisi 26,
 * tetapi daftar VALUES menaruh literal 'final' di posisi terakhir (46) sehingga
 * PostgreSQL menugaskannya ke kolom DATE `tax_invoice_date` dan create nota
 * selalu gagal. Test ini mengunci paritas kolom↔value + posisi literal 'final'.
 *
 * Run: node scripts/test-sales-insert-contract.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const salesPath = path.join(__dirname, '..', 'routes', 'sales.js');
const source = fs.readFileSync(salesPath, 'utf8');

const match = source.match(
  /INSERT INTO sales_orders \(([\s\S]*?)\)\s*VALUES \(([\s\S]*?)\)\s*RETURNING/,
);
assert.ok(match, 'statement INSERT INTO sales_orders ... RETURNING tidak ditemukan di routes/sales.js');

const columns = match[1].split(',').map((s) => s.trim()).filter(Boolean);
const values = match[2].split(',').map((s) => s.trim()).filter(Boolean);

assert.strictEqual(
  values.length,
  columns.length,
  `jumlah value (${values.length}) != jumlah kolom (${columns.length}) — ${columns.length} kolom butuh ${columns.length} value`,
);

const literalIndexes = values.map((v, i) => (v.startsWith('$') ? -1 : i)).filter((i) => i >= 0);
assert.strictEqual(literalIndexes.length, 1, 'harus ada tepat 1 value literal (non-placeholder), ditemukan: ' + literalIndexes.length);

const literalIndex = literalIndexes[0];
assert.strictEqual(values[literalIndex], "'final'", `literal di posisi ${literalIndex + 1} harus 'final', ditemukan ${values[literalIndex]}`);

const statusIndex = columns.indexOf('status');
assert.ok(statusIndex >= 0, 'kolom status tidak ditemukan pada daftar kolom INSERT');
assert.strictEqual(
  literalIndex,
  statusIndex,
  `literal 'final' berada di posisi ${literalIndex + 1} tetapi kolom status ada di posisi ${statusIndex + 1} — value bergeser; kolom DATE di ujung (tax_invoice_date) bisa menerima 'final'`,
);

const placeholders = values.filter((_, i) => i !== literalIndex);
const expected = placeholders.map((_, i) => '$' + (i + 1));
assert.deepStrictEqual(
  placeholders,
  expected,
  `urutan placeholder tidak valid — harus $1..$${expected.length} berurutan\n  aktual   : ${placeholders.join(',')}`,
);

console.log("✅ POST /api/sales INSERT contract: kolom↔value sejajar, literal 'final' di posisi kolom status, placeholder $1..$" + expected.length + ' berurutan');
