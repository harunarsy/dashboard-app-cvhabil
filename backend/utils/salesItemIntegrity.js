'use strict';

/**
 * Aturan penyimpanan sales_items (lihat routes/sales.js POST):
 *   qty         = jumlah satuan jual yang diketik user (karton/pcs/box)
 *   qty_in_unit = alias qty (kolom historis, dipakai semua query uang)
 *   unit_price  = harga per satuan jual
 *   subtotal    = qty x unit_price
 *   qty base    = qty x pack_size (pcs), dihitung backend lewat uom.toBase
 *
 * Semua query uang (gp, margin, omzet) memakai COALESCE(qty_in_unit, qty),
 * jadi dua kolom itu WAJIB sama. Qty base TIDAK boleh dipakai untuk uang.
 */

const MONEY_TOLERANCE = 1;
const QTY_TOLERANCE = 0.0001;

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
};

const itemLabel = (item = {}) => String(item.product_name || '').trim() || '(tanpa nama)';

/**
 * Validasi qty/harga/subtotal SATU item nota.
 * Mengembalikan pesan error (string) atau null kalau lolos.
 */
const validateSaleItemQuantities = (item = {}) => {
  const label = itemLabel(item);
  const qty = toNumber(item.qty);
  const price = toNumber(item.unit_price ?? 0);

  if (qty === null || qty <= 0) {
    return `Qty produk "${label}" harus angka lebih dari 0`;
  }
  if (price === null || price < 0) {
    return `Harga produk "${label}" tidak valid (tidak boleh minus)`;
  }

  const subtotal = toNumber(item.subtotal);
  if (subtotal !== null && Math.abs(qty * price - subtotal) > MONEY_TOLERANCE) {
    return `Subtotal produk "${label}" tidak cocok: ${qty} x ${price} = ${(qty * price).toFixed(2)}, bukan ${subtotal}. `
      + 'Periksa qty, satuan, dan harga (karton vs pcs) sebelum menyimpan.';
  }

  const qtyInUnit = toNumber(item.qty_in_unit);
  if (qtyInUnit !== null && Math.abs(qtyInUnit - qty) > QTY_TOLERANCE) {
    return `Qty produk "${label}" tidak konsisten (qty ${qty} vs qty_in_unit ${qtyInUnit}). `
      + 'Kirim qty dalam satuan jual saja; qty base dihitung sistem.';
  }

  return null;
};

/**
 * Validasi relasi qty base terhadap pack (dipakai setelah produk di-resolve).
 * Hanya berlaku untuk satuan jual non-base (karton/box/dus).
 */
const validateSaleItemPack = ({ productName, qtyBase, qtySell, packSize, unit, baseUnit }) => {
  const sellUnit = String(unit || baseUnit || 'pcs').trim().toLowerCase();
  const base = String(baseUnit || 'pcs').trim().toLowerCase();
  const pack = toNumber(packSize) || 1;
  if (sellUnit === base || pack <= 1) return null;
  const qty = toNumber(qtySell);
  const baseQty = toNumber(qtyBase);
  if (qty === null || baseQty === null) return null;
  if (Math.abs(baseQty - qty * pack) > 0.01) {
    return `Konversi satuan produk "${itemLabel({ product_name: productName })}" tidak konsisten `
      + `(${qty} ${sellUnit} x ${pack} = ${(qty * pack).toFixed(2)} ${base}, bukan ${baseQty}).`;
  }
  return null;
};

module.exports = {
  MONEY_TOLERANCE,
  QTY_TOLERANCE,
  toNumber,
  validateSaleItemQuantities,
  validateSaleItemPack,
};
