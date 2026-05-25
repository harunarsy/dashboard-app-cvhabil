// Unit-of-measure conversion utility — single source of truth
// Convention: base_unit = canonical (pcs/btl/etc), pack_unit = bundled (karton/dus/etc)
// product.pack_size = jumlah base unit per 1 pack (e.g., 12 pcs per 1 karton → pack_size=12)
// Kalau pack_unit NULL atau pack_size <= 1, treat as single-unit (no conversion)

const isPackUnit = (unit, product) => {
  if (!unit || !product?.pack_unit) return false;
  return String(unit).toLowerCase() === String(product.pack_unit).toLowerCase();
};

// Convert qty in given unit → qty di base unit (storage canonical)
const toBase = (qty, unit, product) => {
  const q = parseFloat(qty) || 0;
  if (!isPackUnit(unit, product)) return q;
  const packSize = parseInt(product.pack_size) || 1;
  return q * packSize;
};

// Convert qty di base unit → qty di given unit (untuk display)
const fromBase = (qtyBase, unit, product) => {
  const q = parseFloat(qtyBase) || 0;
  if (!isPackUnit(unit, product)) return q;
  const packSize = parseInt(product.pack_size) || 1;
  if (packSize <= 0) return q;
  return q / packSize;
};

// Resolve effective unit price PER BASE UNIT — for storage konsisten
// Kalau input price is per pack unit, divide by pack_size
const pricePerBase = (unitPrice, unit, product) => {
  const p = parseFloat(unitPrice) || 0;
  if (!isPackUnit(unit, product)) return p;
  const packSize = parseInt(product.pack_size) || 1;
  if (packSize <= 0) return p;
  return p / packSize;
};

module.exports = { isPackUnit, toBase, fromBase, pricePerBase };
