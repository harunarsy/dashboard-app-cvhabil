const crypto = require('crypto');
const uom = require('./uom');

/**
 * Computes deterministic SHA-256 hash of canonical adjustment payload.
 * Used for strict idempotency replay validation (same key + same payload -> replay; same key + different payload -> 409).
 */
function computeAdjustmentPayloadHash({ orderId, type, reason = null, notes = null, paymentMethod = null, adjustmentDate = null, differenceAmount, items = [] }) {
  const normalizedItems = (items || []).map((it) => ({
    direction: it.direction ? String(it.direction).trim().toLowerCase() : null,
    original_sales_item_id: it.original_sales_item_id ? Number(it.original_sales_item_id) : null,
    replacement_batch_id: it.replacement_batch_id ? Number(it.replacement_batch_id) : null,
    qty_in_unit: it.qty_in_unit !== undefined && it.qty_in_unit !== null && it.qty_in_unit !== ''
      ? Number(it.qty_in_unit)
      : (it.qty !== undefined && it.qty !== null && it.qty !== ''
        ? Number(it.qty)
        : (it.qty_base !== undefined && it.qty_base !== null && it.qty_base !== '' ? Number(it.qty_base) : null)),
    unit: it.unit ? String(it.unit).trim().toLowerCase() : null,
    unit_price: it.unit_price !== undefined && it.unit_price !== null && it.unit_price !== '' ? Number(it.unit_price) : null,
    condition: it.condition ? String(it.condition).trim().toLowerCase() : null,
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

  const normText = (v) => (v === undefined || v === null ? null : String(v).trim() || null);
  const canonical = {
    orderId: Number(orderId),
    type: String(type || '').trim().toLowerCase(),
    reason: normText(reason)?.toLowerCase() ?? null,
    notes: normText(notes),
    paymentMethod: normText(paymentMethod)?.toLowerCase() ?? null,
    adjustmentDate: normText(adjustmentDate),
    differenceAmount: differenceAmount !== undefined && differenceAmount !== null && differenceAmount !== ''
      ? Number(differenceAmount)
      : null,
    items: normalizedItems,
  };

  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/**
 * Validates unit price for replacement item.
 * Must be a finite number >= 0. Price 0 is allowed (e.g. warranty exchange).
 */
function validateReplacementPrice(rawPrice) {
  const price = Number(rawPrice);
  if (!Number.isFinite(price) || price < 0) {
    throw Object.assign(
      new Error('USER: Harga produk pengganti harus berupa angka valid dan tidak boleh negatif'),
      { statusCode: 400 },
    );
  }
  return price;
}

/**
 * Validates display quantity (qty_in_unit).
 * Must be a finite number > 0.
 */
function validateQuantityInUnit(rawQty, label = 'Qty') {
  const qty = Number(rawQty);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw Object.assign(
      new Error(`USER: ${label} harus berupa angka lebih dari 0`),
      { statusCode: 400 },
    );
  }
  return qty;
}

/**
 * Resolves base quantity for returned item based strictly on original sales snapshot.
 * Never trusts client's qty_base.
 *
 * @param {Object} originalSnapshot - row from sales_items (qty, qty_in_unit, pack_size_at_sale, unit)
 * @param {Object} rawPayloadItem - raw item payload from client
 * @returns {{ qtyBase: number, qtyInUnit: number }}
 */
function resolveReturnedQuantities(originalSnapshot, rawPayloadItem = {}) {
  const hasQtyInUnit = rawPayloadItem.qty_in_unit !== undefined && rawPayloadItem.qty_in_unit !== null && rawPayloadItem.qty_in_unit !== '';
  const hasQty = rawPayloadItem.qty !== undefined && rawPayloadItem.qty !== null && rawPayloadItem.qty !== '';
  const hasQtyBase = rawPayloadItem.qty_base !== undefined && rawPayloadItem.qty_base !== null && rawPayloadItem.qty_base !== '';

  const packSizeAtSale = Number(originalSnapshot?.pack_size_at_sale) || 1;
  const originalQty = Number(originalSnapshot?.qty) || 0;
  const originalQtyInUnit = Number(originalSnapshot?.qty_in_unit) || 0;

  let packMultiplier = 1;
  if (packSizeAtSale > 1) {
    if (originalQtyInUnit > 0 && originalQty > 0) {
      packMultiplier = originalQty / originalQtyInUnit;
    } else {
      packMultiplier = packSizeAtSale;
    }
  }

  let qtyInUnit;
  if (hasQtyInUnit) {
    qtyInUnit = validateQuantityInUnit(rawPayloadItem.qty_in_unit, 'Qty retur (qty_in_unit)');
  } else if (hasQty) {
    qtyInUnit = validateQuantityInUnit(rawPayloadItem.qty, 'Qty retur (qty)');
  } else if (hasQtyBase) {
    // Legacy payload with ONLY qty_base
    // If pack multiplier > 1, treating raw qty_base as qty_in_unit would multiply stock erroneously (e.g. 12 karton * 12 = 144)
    // To preserve inventory integrity, reject legacy qty_base on pack items
    if (packMultiplier > 1) {
      throw Object.assign(
        new Error('USER: Payload retur lama tidak aman untuk produk bertingkat (pack). Kirimkan qty_in_unit secara eksplisit.'),
        { statusCode: 400 },
      );
    }
    qtyInUnit = validateQuantityInUnit(rawPayloadItem.qty_base, 'Qty retur (qty_base)');
  } else {
    throw Object.assign(new Error('USER: Qty retur wajib diisi'), { statusCode: 400 });
  }

  // If item was sold as a pack (multiplier > 1), fractional pack returns are rejected
  if (packMultiplier > 1 && !Number.isInteger(qtyInUnit)) {
    throw Object.assign(
      new Error('USER: Retur produk dalam satuan pack harus berupa bilangan bulat (tidak boleh pecahan)'),
      { statusCode: 400 },
    );
  }

  const qtyBase = qtyInUnit * packMultiplier;
  return { qtyBase, qtyInUnit };
}

/**
 * Validates and resolves unit and base quantity for replacement item based on replacement product master / UOM.
 * Rejects any unit that is not an allowed UOM of the replacement product.
 *
 * @param {Object} replacementProduct - row from product_master (base_unit, pack_unit, pack_size)
 * @param {Object} rawPayloadItem - raw item payload from client
 * @returns {{ qtyBase: number, qtyInUnit: number, unit: string }}
 */
function resolveReplacementQuantities(replacementProduct, rawPayloadItem = {}) {
  const allowedUnits = [];
  const baseUnit = String(replacementProduct?.base_unit || 'pcs').trim().toLowerCase();
  allowedUnits.push(baseUnit);

  const packUnit = replacementProduct?.pack_unit ? String(replacementProduct.pack_unit).trim().toLowerCase() : null;
  if (packUnit && !allowedUnits.includes(packUnit)) {
    allowedUnits.push(packUnit);
  }

  const requestedUnitRaw = rawPayloadItem.unit ? String(rawPayloadItem.unit).trim() : '';
  let targetUnit;

  if (!requestedUnitRaw) {
    targetUnit = replacementProduct?.base_unit || 'pcs';
  } else {
    const requestedNormalized = requestedUnitRaw.toLowerCase();
    if (!allowedUnits.includes(requestedNormalized)) {
      throw Object.assign(
        new Error(`USER: Satuan pengganti "${requestedUnitRaw}" tidak valid untuk produk "${replacementProduct?.product_name || replacementProduct?.name || 'terpilih'}". Satuan yang diizinkan: ${allowedUnits.join(', ')}`),
        { statusCode: 400 },
      );
    }
    // Match canonical casing
    if (packUnit && requestedNormalized === packUnit) {
      targetUnit = replacementProduct.pack_unit;
    } else {
      targetUnit = replacementProduct.base_unit || 'pcs';
    }
  }

  const isPack = uom.isPackUnit(targetUnit, replacementProduct);

  const hasQtyInUnit = rawPayloadItem.qty_in_unit !== undefined && rawPayloadItem.qty_in_unit !== null && rawPayloadItem.qty_in_unit !== '';
  const hasQty = rawPayloadItem.qty !== undefined && rawPayloadItem.qty !== null && rawPayloadItem.qty !== '';
  const hasQtyBase = rawPayloadItem.qty_base !== undefined && rawPayloadItem.qty_base !== null && rawPayloadItem.qty_base !== '';

  let qtyInUnit;
  if (hasQtyInUnit) {
    qtyInUnit = validateQuantityInUnit(rawPayloadItem.qty_in_unit, 'Qty replacement (qty_in_unit)');
  } else if (hasQty) {
    qtyInUnit = validateQuantityInUnit(rawPayloadItem.qty, 'Qty replacement (qty)');
  } else if (hasQtyBase) {
    if (isPack) {
      throw Object.assign(
        new Error('USER: Payload pengganti lama tidak aman untuk satuan pack. Kirimkan qty_in_unit secara eksplisit.'),
        { statusCode: 400 },
      );
    }
    qtyInUnit = validateQuantityInUnit(rawPayloadItem.qty_base, 'Qty replacement (qty_base)');
  } else {
    throw Object.assign(new Error('USER: Qty replacement wajib diisi'), { statusCode: 400 });
  }

  if (isPack && !Number.isInteger(qtyInUnit)) {
    throw Object.assign(
      new Error('USER: Penggantian produk dalam satuan pack harus berupa bilangan bulat (tidak boleh pecahan)'),
      { statusCode: 400 },
    );
  }

  const qtyBase = replacementProduct
    ? uom.toBase(qtyInUnit, targetUnit, replacementProduct)
    : qtyInUnit;

  return { qtyBase, qtyInUnit, unit: targetUnit };
}

/**
 * Enforces mathematical and business nominal invariants on adjustments.
 * Separated by adjustment type:
 * - For 'price_difference':
 *     refundAmount <= originalTotal (can never refund more than original sale total)
 *     additionalCharge >= 0, refundAmount >= 0
 * - For 'return' and 'exchange':
 *     returnedValue >= 0, replacementValue >= 0
 *     refundAmount >= 0, additionalCharge >= 0
 *     refundAmount <= returnedValue (refund can never exceed value of goods returned)
 */
function assertNominalInvariants({ type = 'exchange', returnedValue = 0, replacementValue = 0, refundAmount = 0, additionalCharge = 0, originalTotal = 0 }) {
  if (!Number.isFinite(refundAmount) || refundAmount < 0) {
    throw Object.assign(new Error('USER: Invariant gagal: Nilai refund tidak boleh negatif'), { statusCode: 400 });
  }
  if (!Number.isFinite(additionalCharge) || additionalCharge < 0) {
    throw Object.assign(new Error('USER: Invariant gagal: Tambahan bayar tidak boleh negatif'), { statusCode: 400 });
  }

  if (type === 'price_difference') {
    const maxRefund = Number(originalTotal) || 0;
    if (refundAmount > maxRefund + 0.001) {
      throw Object.assign(
        new Error(`USER: Invariant gagal: Nilai refund (${refundAmount}) tidak boleh melebihi total nota (${maxRefund})`),
        { statusCode: 400 },
      );
    }
    return;
  }

  if (!Number.isFinite(returnedValue) || returnedValue < 0) {
    throw Object.assign(new Error('USER: Invariant gagal: Nilai barang retur tidak boleh negatif'), { statusCode: 400 });
  }
  if (!Number.isFinite(replacementValue) || replacementValue < 0) {
    throw Object.assign(new Error('USER: Invariant gagal: Nilai barang pengganti tidak boleh negatif'), { statusCode: 400 });
  }

  // Precision tolerance of 0.001
  if (refundAmount > returnedValue + 0.001) {
    throw Object.assign(
      new Error(`USER: Invariant gagal: Nilai refund (${refundAmount}) tidak boleh melebihi nilai barang retur (${returnedValue})`),
      { statusCode: 400 },
    );
  }
}

/**
 * Validates void reason.
 * Must be a non-empty trimmed string.
 */
function validateVoidReason(rawReason) {
  const reason = String(rawReason || '').trim();
  if (!reason) {
    throw Object.assign(
      new Error('USER: Alasan pembatalan (void_reason) wajib diisi'),
      { statusCode: 400 },
    );
  }
  return reason;
}

/**
 * Parses and validates positive integer ID from request params.
 */
function parsePositiveIntId(rawId, label = 'ID') {
  const id = Number.parseInt(rawId, 10);
  if (!Number.isFinite(id) || id <= 0 || String(id) !== String(rawId).trim()) {
    throw Object.assign(
      new Error(`${label} harus berupa bilangan bulat positif`),
      { statusCode: 400 },
    );
  }
  return id;
}

module.exports = {
  computeAdjustmentPayloadHash,
  validateReplacementPrice,
  validateQuantityInUnit,
  resolveReturnedQuantities,
  resolveReplacementQuantities,
  assertNominalInvariants,
  validateVoidReason,
  parsePositiveIntId,
};
