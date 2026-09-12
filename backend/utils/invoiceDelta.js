const crypto = require('crypto');

const PRICE_TOLERANCE = 0.005;
const QTY_TOLERANCE = 0.0001;

const toNumber = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundQty = (value) => Number(toNumber(value).toFixed(4));

const normalizeText = (value) => String(value ?? '').trim();
const normalizeDate = (value) => (value ? String(value).slice(0, 10) : '');
const normalizeProductId = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const normalizeLineKey = (value) => {
  const key = normalizeText(value);
  return key || null;
};

const legacyLineKey = (invoiceItemId) => `legacy-line-${invoiceItemId}`;

const generatedLineKey = (invoiceId, requestKey, index) => {
  const source = `${invoiceId}:${requestKey || 'request'}:${index}`;
  const digest = crypto.createHash('sha256').update(source).digest('hex').slice(0, 24);
  return `invoice-line-${digest}`;
};

const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const hashJson = (value) => crypto.createHash('sha256').update(stableStringify(value)).digest('hex');

const sameNumber = (left, right, tolerance = QTY_TOLERANCE) =>
  Math.abs(toNumber(left) - toNumber(right)) <= tolerance;

const addBucketDelta = (buckets, key, bucket, delta) => {
  const numericDelta = roundQty(delta);
  if (!numericDelta) return;
  const existing = buckets.get(key);
  if (existing) {
    existing.delta = roundQty(existing.delta + numericDelta);
    if (bucket.line_key) existing.line_keys.add(bucket.line_key);
    existing.contributions.push({
      line_key: bucket.line_key || null,
      delta: numericDelta,
    });
    if (!existing.product_id && bucket.product_id) existing.product_id = bucket.product_id;
    if (!existing.batch_id && bucket.batch_id) existing.batch_id = bucket.batch_id;
    if (!existing.batch_number && bucket.batch_number) existing.batch_number = bucket.batch_number;
    if (!existing.expired_date && bucket.expired_date) existing.expired_date = bucket.expired_date;
    if (!existing.unit && bucket.unit) existing.unit = bucket.unit;
    return;
  }
  buckets.set(key, {
    key,
    delta: numericDelta,
    product_id: normalizeProductId(bucket.product_id),
    product_name: normalizeText(bucket.product_name),
    batch_id: bucket.batch_id || null,
    batch_number: normalizeText(bucket.batch_number),
    expired_date: normalizeDate(bucket.expired_date),
    unit: normalizeText(bucket.unit) || 'pcs',
    hna_base: toNumber(bucket.hna_base),
    line_keys: new Set(bucket.line_key ? [bucket.line_key] : []),
    contributions: bucket.line_key
      ? [{ line_key: bucket.line_key, delta: numericDelta }]
      : [],
    kind: bucket.kind || (bucket.batch_id ? 'existing' : 'destination'),
  });
};

const assertUniqueLineKeys = (items, label) => {
  const seen = new Set();
  for (const item of items) {
    const key = normalizeLineKey(item.line_key);
    if (!key) {
      throw Object.assign(new Error(`${label} memiliki baris tanpa line_key`), {
        code: 'INVALID_LINE_KEY',
      });
    }
    if (seen.has(key)) {
      throw Object.assign(new Error(`${label} memiliki line_key duplikat: ${key}`), {
        code: 'DUPLICATE_LINE_KEY',
      });
    }
    seen.add(key);
  }
};

/**
 * Build a stock-owned delta without touching the database.
 *
 * currentLines/nextLines use base-unit quantities. stockByLine contains the
 * net quantity owned by the invoice ledger, not the current physical balance.
 * This distinction is what keeps an old +10 mutation immutable while posting
 * only the new +/- delta.
 */
const buildInvoiceDelta = ({
  currentLines = [],
  nextLines = [],
  stockByLine = new Map(),
  batchEditMode = 'metadata',
}) => {
  if (!['metadata', 'move'].includes(batchEditMode)) {
    throw Object.assign(new Error('batch_edit_mode harus metadata atau move'), {
      code: 'INVALID_BATCH_EDIT_MODE',
    });
  }

  assertUniqueLineKeys(currentLines, 'Item lama');
  assertUniqueLineKeys(nextLines, 'Item baru');

  const currentByKey = new Map(currentLines.map((line) => [normalizeLineKey(line.line_key), line]));
  const nextByKey = new Map(nextLines.map((line) => [normalizeLineKey(line.line_key), line]));
  const buckets = new Map();
  const lineChanges = [];
  const productDeltas = new Map();
  const targetHnaByProduct = new Map();
  const targetHnaByLine = new Map();
  const hnaConflicts = [];
  const metadataChanges = [];

  const addProductDelta = (productId, delta) => {
    const id = normalizeProductId(productId);
    if (!id || !delta) return;
    productDeltas.set(id, roundQty((productDeltas.get(id) || 0) + delta));
  };

  const addTargetHna = (productId, hna, lineKey) => {
    const id = normalizeProductId(productId);
    const value = toNumber(hna);
    if (!id || value <= 0) return;
    const previous = targetHnaByProduct.get(id);
    if (previous && !sameNumber(previous.value, value, PRICE_TOLERANCE)) {
      hnaConflicts.push({
        product_id: id,
        line_keys: [previous.line_key, lineKey],
        values: [previous.value, value],
      });
      return;
    }
    if (!previous) targetHnaByProduct.set(id, { value, line_key: lineKey });
    targetHnaByLine.set(lineKey, {
      product_id: id,
      hna_base: value,
      line_key: lineKey,
    });
  };

  const shouldTrackHna = (current, next) => {
    if (!current) return true;
    if (normalizeProductId(current.product_id) !== normalizeProductId(next.product_id)) return true;
    // The service hydrates hna_base from the stored invoice/batch state. Pure
    // callers may omit it; in that case keep the historical behaviour and
    // treat the next value as an explicit HNA target.
    if (current.hna_base === undefined || current.hna_base === null) return true;
    return !sameNumber(current.hna_base, next.hna_base, PRICE_TOLERANCE);
  };

  const addExisting = (line, stock, delta) => {
    if (!delta) return;
    if (!stock?.batch_id) {
      throw new Error(`Mapping batch untuk line_key ${line.line_key} tidak ditemukan`);
    }
    addBucketDelta(
      buckets,
      `batch:${stock.batch_id}`,
      {
        ...line,
        ...stock,
        batch_id: stock.batch_id,
        kind: 'existing',
      },
      delta,
    );
    addProductDelta(stock.product_id || line.product_id, delta);
  };

  const addDestination = (line, delta) => {
    if (!delta) return;
    const productId = normalizeProductId(line.product_id);
    if (!productId) throw new Error(`Produk untuk line_key ${line.line_key} belum ter-resolve`);
    addBucketDelta(
      buckets,
      `line:${line.line_key}`,
      { ...line, product_id: productId, kind: 'destination' },
      delta,
    );
    addProductDelta(productId, delta);
  };

  for (const current of currentLines) {
    const key = normalizeLineKey(current.line_key);
    const next = nextByKey.get(key);
    const stockValue = stockByLine.get(key);
    const stockEntries = Array.isArray(stockValue)
      ? stockValue
        : stockValue
          ? [stockValue]
          : [];
    const activeStockEntries = stockEntries.filter(
      (entry) => Math.abs(toNumber(entry.qty)) > QTY_TOLERANCE,
    );
    const oldQty = roundQty(activeStockEntries.reduce((sum, entry) => sum + toNumber(entry.qty), 0));

    if (!next) {
      for (const stock of activeStockEntries) {
        if (stock.qty) addExisting(current, stock, -toNumber(stock.qty));
      }
      lineChanges.push({
        line_key: key,
        status: 'removed',
        product_id_before: normalizeProductId(current.product_id),
        product_id_after: null,
        product_name_before: normalizeText(current.product_name),
        product_name_after: null,
        old_qty_base: oldQty,
        new_qty_base: 0,
        delta_base: roundQty(-oldQty),
        batch_id_before: activeStockEntries.map((stock) => stock.batch_id).filter(Boolean),
        batch_id_after: null,
        batch_number_before: stockEntries[0]?.batch_number || normalizeText(current.batch_number),
        batch_number_after: null,
      });
      continue;
    }

    const newQty = roundQty(next.quantity_base);
    const sameProduct = normalizeProductId(current.product_id) === normalizeProductId(next.product_id);
    const batchIdentityChanged = normalizeText(current.batch_number) !== normalizeText(next.batch_number)
      || normalizeDate(current.expired_date) !== normalizeDate(next.expired_date);
    const quantityChanged = !sameNumber(oldQty, newQty);
    if (
      sameProduct
      && batchEditMode === 'metadata'
      && activeStockEntries.length > 1
      && (batchIdentityChanged || quantityChanged)
    ) {
      throw Object.assign(new Error(
        `Line ${key} memiliki kepemilikan stok di beberapa batch. Pilih mode Pindah Batch atau lakukan rekonsiliasi manual sebelum mengubah qty/Batch/ED.`,
      ), {
        code: 'INVOICE_BATCH_MAPPING_AMBIGUOUS',
      });
    }
    if (
      sameProduct
      && batchEditMode === 'move'
      && activeStockEntries.length > 1
      && quantityChanged
      && !batchIdentityChanged
    ) {
      throw Object.assign(new Error(
        `Line ${key} memiliki kepemilikan stok di beberapa batch. Untuk mengubah qty, pilih satu batch tujuan atau lakukan rekonsiliasi manual.`,
      ), {
        code: 'INVOICE_BATCH_MAPPING_AMBIGUOUS',
      });
    }
    const canKeepOwnership = sameProduct && !batchIdentityChanged && !quantityChanged;
    const canPatchMetadata = sameProduct
      && batchEditMode === 'metadata'
      && activeStockEntries.length === 1
      && activeStockEntries[0].batch_id;
    const canPatchExisting = sameProduct
      && activeStockEntries.length === 1
      && !batchIdentityChanged
      && activeStockEntries[0].batch_id;
    if (canKeepOwnership) {
      // A no-op must not relocate a line that happens to be owned by more than
      // one batch. Ownership is preserved until the operator explicitly moves
      // it to a different batch.
    } else if (canPatchMetadata || canPatchExisting) {
      const stock = activeStockEntries[0];
      addExisting(current, stock, roundQty(newQty - oldQty));
      if (
        normalizeText(current.batch_number) !== normalizeText(next.batch_number) ||
        normalizeDate(current.expired_date) !== normalizeDate(next.expired_date)
      ) {
        metadataChanges.push({
          line_key: key,
          batch_id: stock.batch_id,
          before_batch_number: normalizeText(current.batch_number),
          after_batch_number: normalizeText(next.batch_number),
          before_expired_date: normalizeDate(current.expired_date),
          after_expired_date: normalizeDate(next.expired_date),
        });
      }
    } else {
      for (const stock of activeStockEntries) {
        if (stock.qty) addExisting(current, stock, -toNumber(stock.qty));
      }
      // An existing line without an owned stock ledger is not permission to
      // post stock during an edit. New lines are handled below; a legacy or
      // unposted invoice must be reconciled/posted through its own workflow.
      if (newQty && activeStockEntries.length > 0) addDestination(next, newQty);
    }

    if (shouldTrackHna(current, next)) {
      addTargetHna(next.product_id, next.hna_base, key);
    }
    const status = !oldQty && newQty
      ? 'added'
      : oldQty && !newQty
        ? 'removed'
            : !sameProduct
              ? 'replaced'
              : canPatchMetadata && metadataChanges.some((change) => change.line_key === key)
                ? 'metadata_changed'
                : batchIdentityChanged && batchEditMode === 'move'
                  ? 'batch_moved'
                : quantityChanged
              ? 'adjusted'
              : 'unchanged';
    lineChanges.push({
      line_key: key,
      status,
      product_id_before: normalizeProductId(current.product_id),
      product_id_after: normalizeProductId(next.product_id),
      product_name_before: normalizeText(current.product_name),
      product_name_after: normalizeText(next.product_name),
      old_qty_base: oldQty,
      new_qty_base: newQty,
      delta_base: roundQty(newQty - oldQty),
      batch_id_before: activeStockEntries.map((stock) => stock.batch_id).filter(Boolean),
      batch_id_after: canPatchMetadata || canPatchExisting ? activeStockEntries[0].batch_id || null : null,
      batch_number_before: activeStockEntries[0]?.batch_number || normalizeText(current.batch_number),
      batch_number_after: normalizeText(next.batch_number),
    });
  }

  for (const next of nextLines) {
    const key = normalizeLineKey(next.line_key);
    if (currentByKey.has(key)) continue;
    const newQty = roundQty(next.quantity_base);
    if (newQty) addDestination(next, newQty);
    addTargetHna(next.product_id, next.hna_base, key);
    lineChanges.push({
      line_key: key,
      status: 'added',
      product_id_before: null,
      product_id_after: normalizeProductId(next.product_id),
      product_name_before: null,
      product_name_after: normalizeText(next.product_name),
      old_qty_base: 0,
      new_qty_base: newQty,
      delta_base: newQty,
      batch_id_before: null,
      batch_id_after: null,
      batch_number_before: null,
      batch_number_after: normalizeText(next.batch_number),
    });
  }

  const batchDeltas = [...buckets.values()]
    .filter((bucket) => bucket.delta)
    .map((bucket) => ({
      ...bucket,
      line_keys: [...bucket.line_keys],
      contributions: bucket.contributions.filter((contribution) => contribution.delta),
    }));

  return {
    batch_edit_mode: batchEditMode,
    changed: batchDeltas.length > 0 || metadataChanges.length > 0 || hnaConflicts.length > 0,
    batch_deltas: batchDeltas,
    line_changes: lineChanges,
    product_deltas: [...productDeltas.entries()].map(([product_id, delta]) => ({ product_id, delta })),
    metadata_changes: metadataChanges,
    target_hna: [...targetHnaByLine.values()],
    hna_conflicts: hnaConflicts,
  };
};

module.exports = {
  PRICE_TOLERANCE,
  QTY_TOLERANCE,
  generatedLineKey,
  hashJson,
  legacyLineKey,
  normalizeDate,
  normalizeLineKey,
  normalizeProductId,
  normalizeText,
  roundQty,
  sameNumber,
  stableStringify,
  toNumber,
  buildInvoiceDelta,
};
