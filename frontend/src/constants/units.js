// Unit-of-measure constants — mirror dari backend/utils/uom.js
// Convention: base_unit = canonical (pcs/btl/etc), pack_unit = bundled (karton/dus/etc)

export const BASE_UNITS = [
  { value: 'pcs', label: 'Pcs (Pieces)' },
  { value: 'btl', label: 'Btl (Botol)' },
  { value: 'sachet', label: 'Sachet' },
  { value: 'tube', label: 'Tube' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'kapsul', label: 'Kapsul' },
  { value: 'strip', label: 'Strip' },
  { value: 'ampul', label: 'Ampul' },
  { value: 'vial', label: 'Vial' },
  { value: 'kaplet', label: 'Kaplet' },
  { value: 'pcs', label: 'Pcs (default)' },
];

export const PACK_UNITS = [
  { value: 'karton', label: 'Karton' },
  { value: 'dus', label: 'Dus' },
  { value: 'box', label: 'Box' },
  { value: 'pak', label: 'Pak' },
  { value: 'bal', label: 'Bal' },
  { value: 'lusin', label: 'Lusin' },
  { value: 'krat', label: 'Krat' },
  { value: 'pack', label: 'Pack' },
];

// Reusable conversion utilities (mirror dari backend/utils/uom.js)
export const isPackUnit = (unit, product) => {
  if (!unit || !product?.pack_unit) return false;
  return String(unit).toLowerCase() === String(product.pack_unit).toLowerCase();
};

export const toBase = (qty, unit, product) => {
  const q = parseFloat(qty) || 0;
  if (!isPackUnit(unit, product)) return q;
  const packSize = parseInt(product.pack_size) || 1;
  return q * packSize;
};

export const fromBase = (qtyBase, unit, product) => {
  const q = parseFloat(qtyBase) || 0;
  if (!isPackUnit(unit, product)) return q;
  const packSize = parseInt(product.pack_size) || 1;
  if (packSize <= 0) return q;
  return q / packSize;
};

// Get available units for a product (untuk dropdown di form input qty)
export const getProductUnits = (product) => {
  if (!product) return [{ value: 'pcs', label: 'Pcs' }];
  const baseUnit = product.base_unit || product.unit || 'pcs';
  const units = [{ value: baseUnit, label: `${baseUnit} (eceran)` }];
  if (product.pack_unit && (parseInt(product.pack_size) || 0) > 1) {
    units.push({ value: product.pack_unit, label: `${product.pack_unit} (= ${product.pack_size} ${baseUnit})` });
  }
  return units;
};

// Format display qty + conversion preview, e.g., "20 karton (= 240 pcs)"
export const formatQtyWithConversion = (qty, unit, product) => {
  if (!product || !isPackUnit(unit, product)) return `${qty} ${unit || 'pcs'}`;
  const packSize = parseInt(product.pack_size) || 1;
  const baseUnit = product.base_unit || product.unit || 'pcs';
  return `${qty} ${unit} (= ${qty * packSize} ${baseUnit})`;
};
