const crypto = require('crypto');
const uom = require('../utils/uom');
const tax = require('../utils/tax');
const {
  buildInvoiceDelta,
  generatedLineKey,
  hashJson,
  legacyLineKey,
  normalizeDate,
  normalizeLineKey,
  normalizeProductId,
  normalizeText,
  QTY_TOLERANCE,
  roundQty,
  sameNumber,
  toNumber,
} = require('../utils/invoiceDelta');

const EDIT_REFERENCE_TYPE = 'faktur-edit';
const EDITABLE_REFERENCE_TYPES = ['faktur', EDIT_REFERENCE_TYPE, 'faktur-cancelled', 'faktur-restored'];
const PREVIEW_TTL_MS = 10 * 60 * 1000;

const mutationSign = (mutation) => {
  if (mutation.reference_type === 'faktur' && mutation.type === 'in') return 1;
  if (mutation.reference_type === EDIT_REFERENCE_TYPE && mutation.type === 'in') return 1;
  if (mutation.reference_type === EDIT_REFERENCE_TYPE && mutation.type === 'out') return -1;
  if (mutation.reference_type === 'faktur-cancelled' && mutation.type === 'in') return 1;
  if (mutation.reference_type === 'faktur-cancelled' && mutation.type === 'out') return -1;
  if (mutation.reference_type === 'faktur-restored' && mutation.type === 'in') return 1;
  if (mutation.reference_type === 'faktur-restored' && mutation.type === 'out') return -1;
  return 0;
};

const previewSecret = () => process.env.JWT_SECRET || 'habil-invoice-delta-preview-secret';

const signPreviewPayload = (encoded) => crypto
  .createHmac('sha256', previewSecret())
  .update(encoded)
  .digest('base64url');

const createPreviewToken = ({ invoiceId, snapshotHash, requestHash }) => {
  const payload = {
    invoice_id: String(invoiceId),
    snapshot_hash: snapshotHash,
    request_hash: requestHash,
    expires_at: Date.now() + PREVIEW_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${signPreviewPayload(encoded)}`;
};

const verifyPreviewToken = (token, { invoiceId, snapshotHash, requestHash }) => {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'preview_token wajib diisi' };
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return { ok: false, reason: 'preview_token tidak valid' };
  const expected = signPreviewPayload(encoded);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return { ok: false, reason: 'preview_token tidak valid' };
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'preview_token tidak valid' };
  }
  if (String(payload.invoice_id) !== String(invoiceId)) return { ok: false, reason: 'preview_token bukan untuk faktur ini' };
  if (Number(payload.expires_at) < Date.now()) return { ok: false, reason: 'preview_token sudah kedaluwarsa, buat preview baru' };
  if (payload.snapshot_hash !== snapshotHash) return { ok: false, reason: 'Data faktur berubah setelah preview, buat preview baru' };
  if (payload.request_hash !== requestHash) return { ok: false, reason: 'Payload berbeda dari preview, buat preview baru' };
  return { ok: true, payload };
};

const requestHashForBody = (body = {}) => {
  const {
    preview_token: _previewToken,
    confirm_stock_delta: _confirmStockDelta,
    idempotency_key: _idempotencyKey,
    ...payload
  } = body;
  return hashJson(payload);
};

const appendForUpdate = (sql, forUpdate) => (forUpdate ? `${sql} FOR UPDATE` : sql);

const loadDeltaState = async (client, invoiceId, { forUpdate = false } = {}) => {
  const invoiceSql = appendForUpdate(
    'SELECT * FROM invoices WHERE id = $1 AND deleted_at IS NULL',
    forUpdate,
  );
  const itemSql = appendForUpdate(
    'SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id',
    forUpdate,
  );
  const mutationSql = appendForUpdate(
    `SELECT id, product_id, batch_id, type, qty, reference_type, reference_id,
            notes, created_by, created_at, qty_unit, qty_in_unit,
            invoice_line_key, event_key
     FROM inventory_mutations
     WHERE reference_id = $1 AND reference_type = ANY($2::text[])
     ORDER BY id`,
    forUpdate,
  );

  const [{ rows: invoiceRows }, { rows: items }, { rows: mutations }] = await Promise.all([
    client.query(invoiceSql, [invoiceId]),
    client.query(itemSql, [invoiceId]),
    client.query(mutationSql, [invoiceId, EDITABLE_REFERENCE_TYPES]),
  ]);
  const invoice = invoiceRows[0] || null;
  if (!invoice) return { invoice: null, items: [], mutations: [], batches: new Map(), snapshot: null };

  const batchIds = [...new Set(mutations.map((mutation) => Number.parseInt(mutation.batch_id, 10)).filter((id) => Number.isFinite(id)))];
  const batchParams = [`invoice-${invoiceId}`];
  let batchSql = `SELECT * FROM inventory_batches WHERE source_ref = $1`;
  if (batchIds.length > 0) {
    batchSql += ' OR id = ANY($2::int[])';
    batchParams.push(batchIds);
  }
  batchSql += ' ORDER BY id';
  batchSql = appendForUpdate(batchSql, forUpdate);
  const { rows: batchRows } = await client.query(batchSql, batchParams);
  const batches = new Map(batchRows.map((batch) => [Number(batch.id), batch]));

  let purchaseOrderItems = [];
  if (invoice.purchase_order_id) {
    const purchaseOrderSql = appendForUpdate(
      `SELECT id, product_id, product_name, qty, unit, received_qty, received_qty_in_unit
         FROM purchase_order_items
        WHERE po_id = $1
        ORDER BY id`,
      forUpdate,
    );
    const result = await client.query(purchaseOrderSql, [invoice.purchase_order_id]);
    purchaseOrderItems = result.rows;
  }

  const snapshotTimestamp = (value) => {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    return String(value);
  };
  const snapshotDate = (value) => {
    if (!value) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
  };
  const snapshot = {
    invoice: {
      id: invoice.id,
      updated_at: snapshotTimestamp(invoice.updated_at),
      invoice_number: invoice.invoice_number || null,
      purchase_order_id: invoice.purchase_order_id || null,
      tax_type: invoice.tax_type || null,
      ppn_rate: invoice.ppn_rate || null,
      purchase_date: snapshotDate(invoice.purchase_date),
      distributor_name: invoice.distributor_name || '',
      total_hna: invoice.total_hna,
      discount_amount: invoice.discount_amount,
      hna_baru: invoice.hna_baru,
      disc_cod_ada: invoice.disc_cod_ada ?? false,
      disc_cod_amount: invoice.disc_cod_amount,
      hna_final: invoice.hna_final,
      ppn_input: invoice.ppn_input,
      ppn_masukan: invoice.ppn_masukan,
      ppn_pembulatan: invoice.ppn_pembulatan,
      hna_plus_ppn: invoice.hna_plus_ppn,
      harga_per_produk: invoice.harga_per_produk,
      due_date: snapshotDate(invoice.due_date),
      payment_date: snapshotDate(invoice.payment_date),
      status: invoice.status || null,
    },
    items: items.map((item) => ({
      id: item.id,
      line_key: item.line_key || null,
      product_id: item.product_id || null,
      product_name: item.product_name || '',
      quantity: item.quantity,
      unit: item.unit || 'pcs',
      batch_number: item.batch_number || '',
      expired_date: normalizeDate(item.expired_date),
      hna: item.hna,
      disc_percent: item.disc_percent,
      disc_nominal: item.disc_nominal,
    })),
    mutations: mutations.map((mutation) => ({
      id: mutation.id,
      product_id: mutation.product_id,
      batch_id: mutation.batch_id,
      type: mutation.type,
      qty: mutation.qty,
      reference_type: mutation.reference_type,
      invoice_line_key: mutation.invoice_line_key || null,
      event_key: mutation.event_key || null,
    })),
    batches: batchRows.map((batch) => ({
      id: batch.id,
      product_id: batch.product_id,
      batch_no: batch.batch_no || '',
      expired_date: normalizeDate(batch.expired_date),
      qty_current: batch.qty_current,
      hna: batch.hna,
    })),
    purchase_order_items: purchaseOrderItems.map((item) => ({
      id: item.id,
      product_id: item.product_id || null,
      product_name: item.product_name || '',
      qty: item.qty,
      unit: item.unit || null,
      received_qty: item.received_qty,
      received_qty_in_unit: item.received_qty_in_unit,
    })),
  };

  return { invoice, items, mutations, batches, purchaseOrderItems, snapshot };
};

const batchMatchesItem = (invoice, item, batch) => {
  if (!batch) return false;
  const expectedBatch = normalizeText(item.batch_number) || normalizeText(invoice.invoice_number);
  const actualBatch = normalizeText(batch.batch_no) || normalizeText(invoice.invoice_number);
  const expectedDate = normalizeDate(item.expired_date);
  const actualDate = normalizeDate(batch.expired_date);
  return expectedBatch === actualBatch && expectedDate === actualDate;
};

const resolveLegacyLineMapping = (state) => {
  const { invoice, items, mutations, batches } = state;
  const hasPostedStock = mutations.some(
    (mutation) => mutation.reference_type === 'faktur' && mutation.type === 'in',
  );
  const currentLines = items.map((item) => ({
    ...item,
    line_key: normalizeLineKey(item.line_key) || legacyLineKey(item.id),
    stored_line_key: normalizeLineKey(item.line_key),
  }));
  const initialMutations = mutations.filter(
    (mutation) => mutation.reference_type === 'faktur' && mutation.type === 'in',
  );
  const usedMutationIds = new Set(
    initialMutations.filter((mutation) => mutation.invoice_line_key).map((mutation) => mutation.id),
  );
  const ambiguities = [];
  const currentLineKeys = new Set(currentLines.map((line) => line.line_key));

  // A persisted key must point to a current invoice item. Otherwise the
  // mutation would remain attached to an invisible line and could be omitted
  // from a later removal/replacement delta.
  for (const mutation of initialMutations) {
    if (mutation.invoice_line_key && !currentLineKeys.has(mutation.invoice_line_key)) {
      ambiguities.push({
        mutation_id: mutation.id,
        product_id: mutation.product_id,
        batch_id: mutation.batch_id,
        line_key: mutation.invoice_line_key,
        reason: 'invoice_line_key mutasi tidak memiliki pasangan pada invoice_items',
      });
    }
  }

  const compatible = (line, mutation) => {
    const batch = batches.get(Number(mutation.batch_id));
    const productMatches = !line.product_id || Number(line.product_id) === Number(mutation.product_id);
    return productMatches && batchMatchesItem(invoice, line, batch);
  };

  const candidateByLine = new Map();
  const linesByCandidateMutation = new Map();
  for (const line of currentLines) {
    const mapped = initialMutations.filter(
      (mutation) => mutation.invoice_line_key === line.line_key,
    );
    if (mapped.length > 0) {
      mapped.forEach((mutation) => usedMutationIds.add(mutation.id));
      continue;
    }

    const candidates = initialMutations.filter(
      (mutation) => !usedMutationIds.has(mutation.id) && compatible(line, mutation),
    );
    candidateByLine.set(line.line_key, candidates);
    for (const candidate of candidates) {
      const lines = linesByCandidateMutation.get(candidate.id) || [];
      lines.push(line);
      linesByCandidateMutation.set(candidate.id, lines);
    }
    if (candidates.length > 1) {
      ambiguities.push({
        item_id: line.id,
        line_key: line.line_key,
        product_id: line.product_id || null,
        product_name: line.product_name || '',
        candidate_batch_ids: candidates.map((mutation) => mutation.batch_id),
      });
    }
  }

  // A unique candidate is safe only when no other line can claim the same
  // mutation. This is the ambiguity case for legacy rows that share product,
  // batch, and expiry metadata.
  for (const [lineKey, candidates] of candidateByLine) {
    if (candidates.length !== 1) continue;
    const candidate = candidates[0];
    const competingLines = linesByCandidateMutation.get(candidate.id) || [];
    if (competingLines.length !== 1) {
      ambiguities.push({
        item_id: currentLines.find((line) => line.line_key === lineKey)?.id,
        line_key: lineKey,
        product_id: currentLines.find((line) => line.line_key === lineKey)?.product_id || null,
        product_name: currentLines.find((line) => line.line_key === lineKey)?.product_name || '',
        candidate_batch_ids: candidates.map((mutation) => mutation.batch_id),
        reason: 'Satu mutasi stok cocok dengan beberapa baris faktur',
      });
      continue;
    }
    candidate.resolved_line_key = lineKey;
    usedMutationIds.add(candidate.id);
  }

  // A cancellation/restore row from an older invoice may not have line_key.
  // If its batch belongs to exactly one resolved line, attach it in memory.
  const lineKeysByBatch = new Map();
  for (const mutation of mutations) {
    const key = mutation.invoice_line_key || mutation.resolved_line_key;
    if (!key || !mutation.batch_id) continue;
    const batchKey = String(mutation.batch_id);
    const keys = lineKeysByBatch.get(batchKey) || new Set();
    keys.add(key);
    lineKeysByBatch.set(batchKey, keys);
  }
  for (const mutation of mutations) {
    if (mutation.invoice_line_key || mutation.resolved_line_key || !mutation.batch_id) continue;
    const keys = lineKeysByBatch.get(String(mutation.batch_id));
    if (keys?.size === 1) mutation.resolved_line_key = [...keys][0];
  }

  const orphanInitial = initialMutations.filter(
    (mutation) => !mutation.invoice_line_key && !mutation.resolved_line_key,
  );
  if (hasPosted && orphanInitial.length > 0) {
    orphanInitial.forEach((mutation) => {
      ambiguities.push({
        mutation_id: mutation.id,
        product_id: mutation.product_id,
        batch_id: mutation.batch_id,
        reason: 'Mutasi awal faktur belum dapat dipetakan ke satu baris item',
      });
    });
  }

  return {
    currentLines,
    hasPostedStock,
    ambiguities,
    mappingUpdates: mutations
      .filter((mutation) => !mutation.invoice_line_key && mutation.resolved_line_key)
      .map((mutation) => ({ mutation_id: mutation.id, line_key: mutation.resolved_line_key })),
  };
};

const buildStockByLine = (state, mapping) => {
  const stockByLine = new Map();
  const mappedLineByBatch = new Map();
  for (const mutation of state.mutations) {
    const key = mutation.invoice_line_key || mutation.resolved_line_key;
    if (!key || !mutation.batch_id) continue;
    const batchKey = String(mutation.batch_id);
    const keys = mappedLineByBatch.get(batchKey) || new Set();
    keys.add(key);
    mappedLineByBatch.set(batchKey, keys);
  }

  for (const mutation of state.mutations) {
    const sign = mutationSign(mutation);
    if (!sign) continue;
    const key = mutation.invoice_line_key || mutation.resolved_line_key;
    if (!key) {
      const keys = mappedLineByBatch.get(String(mutation.batch_id));
      if (keys?.size === 1) mutation.resolved_line_key = [...keys][0];
    }
    const resolvedKey = mutation.invoice_line_key || mutation.resolved_line_key;
    if (!resolvedKey || !mutation.batch_id) {
      throw Object.assign(new Error('Mapping mutasi stok faktur ambigu atau tidak lengkap'), {
        code: 'INVOICE_LINE_MAPPING_AMBIGUOUS',
      });
    }
    const batch = state.batches.get(Number(mutation.batch_id));
    if (!batch) {
      throw Object.assign(new Error(`Batch #${mutation.batch_id} untuk mutasi faktur tidak ditemukan`), {
        code: 'INVOICE_BATCH_MISSING',
      });
    }
    const entries = stockByLine.get(resolvedKey) || [];
    let entry = entries.find((candidate) => Number(candidate.batch_id) === Number(mutation.batch_id));
    if (!entry) {
      entry = {
        qty: 0,
        batch_id: Number(mutation.batch_id),
        product_id: Number(mutation.product_id),
        batch_number: batch.batch_no || '',
        expired_date: normalizeDate(batch.expired_date),
        hna_base: toNumber(batch.hna),
      };
      entries.push(entry);
    }
    entry.qty = roundQty(entry.qty + sign * toNumber(mutation.qty));
    stockByLine.set(resolvedKey, entries);
  }
  for (const [lineKey, entries] of stockByLine) {
    const activeEntries = entries.filter(
      (entry) => Math.abs(toNumber(entry.qty)) > QTY_TOLERANCE,
    );
    if (activeEntries.length > 0) stockByLine.set(lineKey, activeEntries);
    else stockByLine.delete(lineKey);
  }
  return stockByLine;
};

const normalizeNextLines = async ({ client, invoiceId, items, requestKey, helpers }) => {
  const validItems = (items || []).filter((item) => normalizeText(item.product_name));
  const productLookup = validItems.length > 0
    ? await helpers.loadProductLookupForItems(client, validItems)
    : helpers.emptyProductLookup();
  const unmatchedProducts = helpers.collectUnmatchedProducts(productLookup, validItems);
  if (unmatchedProducts.length > 0) {
    throw Object.assign(new Error(helpers.buildUnmatchedProductError(unmatchedProducts).error), {
      code: 'UNMATCHED_PRODUCTS',
      unmatchedProducts,
    });
  }

  const nextLines = validItems.map((item, index) => {
    const product = helpers.getProductFromLookup(productLookup, item);
    const productId = normalizeProductId(product?.id || item.product_id);
    const unit = normalizeText(item.unit) || product?.base_unit || product?.unit || 'pcs';
    const qtyInUnit = toNumber(item.quantity);
    const rawQtyBase = product ? uom.toBase(qtyInUnit, unit, product) : qtyInUnit;
    if (qtyInUnit < 0 || rawQtyBase < 0) {
      throw Object.assign(new Error(`Qty produk "${item.product_name}" tidak boleh negatif`), {
        code: 'INVALID_QTY',
      });
    }
    if (Math.abs(rawQtyBase - Math.round(rawQtyBase)) > 0.0001) {
      throw Object.assign(new Error(`Qty produk "${item.product_name}" menghasilkan pecahan base unit, database stok hanya menerima bilangan bulat`), {
        code: 'NON_INTEGER_BASE_QTY',
      });
    }
    const suppliedLineKey = normalizeLineKey(item.line_key);
    if (
      (item.line_key !== undefined && item.line_key !== null && !suppliedLineKey)
      || (suppliedLineKey && suppliedLineKey.length > 120)
    ) {
      throw Object.assign(new Error('line_key tidak valid'), { code: 'INVALID_LINE_KEY' });
    }
    const lineKey = suppliedLineKey
      || (item.id ? legacyLineKey(item.id) : generatedLineKey(invoiceId, requestKey, index));
    const quantityBase = Math.round(rawQtyBase);
    return {
      ...item,
      raw: item,
      line_key: lineKey,
      product_id: productId,
      product_name: normalizeText(item.product_name),
      quantity_input: qtyInUnit,
      quantity_base: quantityBase,
      unit,
      batch_number: normalizeText(item.batch_number),
      expired_date: normalizeDate(item.expired_date),
      hna_base: helpers.effectiveHna(item, quantityBase, product),
      product,
    };
  });
  return { nextLines, productLookup };
};

const queryProducts = async (client, productIds) => {
  const ids = [...new Set(productIds.map(normalizeProductId).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { rows } = await client.query(
    `SELECT id, name, hna, base_unit, pack_unit, pack_size, is_active
     FROM product_master WHERE id = ANY($1::int[])`,
    [ids],
  );
  return new Map(rows.map((row) => [Number(row.id), row]));
};

const lockProductsForUpdate = async (client, productIds) => {
  const ids = [...new Set(productIds.map(normalizeProductId).filter(Boolean))]
    .sort((left, right) => left - right);
  if (ids.length === 0) return;
  await client.query(
    'SELECT id FROM product_master WHERE id = ANY($1::int[]) FOR UPDATE',
    [ids],
  );
};

const findPoRowsForProduct = (poIndex, productId, productName) => {
  const byId = poIndex?.byId?.get(String(productId)) || [];
  if (byId.length > 0) return byId;
  return poIndex?.byName?.get(normalizeText(productName).toLowerCase()) || [];
};

const buildPurchaseOrderEffects = async ({ client, invoice, delta, nextLines, currentLines, helpers, forUpdate }) => {
  const purchaseOrderId = invoice.purchase_order_id || null;
  if (!purchaseOrderId) return { effects: [], errors: [], index: null };
  const poIndex = await helpers.loadPurchaseOrderItemsForUpdate(client, purchaseOrderId, { forUpdate });
  const productIds = delta.product_deltas.map((entry) => entry.product_id);
  const productRows = await queryProducts(client, productIds);
  const productNames = new Map();
  for (const line of [...nextLines, ...currentLines]) {
    if (line.product_id && line.product_name) productNames.set(Number(line.product_id), line.product_name);
  }
  const effects = [];
  const errors = [];

  for (const productDelta of delta.product_deltas) {
    const requested = roundQty(productDelta.delta);
    if (!requested) continue;
    const rows = findPoRowsForProduct(
      poIndex,
      productDelta.product_id,
      productNames.get(productDelta.product_id),
    );
    if (rows.length === 0) {
      errors.push({
        code: 'PO_PRODUCT_NOT_FOUND',
        product_id: productDelta.product_id,
        delta: requested,
        message: `Produk #${productDelta.product_id} tidak memiliki baris di Surat Pesanan terkait`,
      });
      continue;
    }
    let remaining = Math.abs(requested);
    const allocationRows = requested > 0
      ? rows.filter((row) => toNumber(row.qty) - toNumber(row.received_qty) > 0)
      : [...rows].sort((a, b) => toNumber(b.received_qty) - toNumber(a.received_qty));
    for (const row of allocationRows) {
      if (remaining <= 0) break;
      const before = toNumber(row.received_qty);
      const capacity = requested > 0 ? Math.max(0, toNumber(row.qty) - before) : Math.max(0, before);
      const amount = Math.min(remaining, capacity);
      if (!amount) continue;
      const signed = requested > 0 ? amount : -amount;
      const product = productRows.get(productDelta.product_id);
      const beforeReceivedQtyInUnit = row.received_qty_in_unit == null
        ? (row.qty_in_unit == null || toNumber(row.qty) === 0
          ? null
          : (toNumber(row.qty_in_unit) * before) / toNumber(row.qty))
        : toNumber(row.received_qty_in_unit);
      // Prefer the PO row's recorded base/display ratio. Product master UOM
      // may have changed after the PO was created; using today's pack_size
      // would make received_qty_in_unit drift while the base ledger is right.
      const deltaInUnit = row.qty_in_unit != null && toNumber(row.qty) !== 0
        ? (signed * toNumber(row.qty_in_unit)) / toNumber(row.qty)
        : product
          ? uom.fromBase(signed, row.unit || product.base_unit, product)
          : signed;
      effects.push({
        po_item_id: row.id,
        product_id: productDelta.product_id,
        before_received_qty: before,
        delta_base: roundQty(signed),
        after_received_qty: roundQty(before + signed),
        delta_in_unit: Number(toNumber(deltaInUnit).toFixed(4)),
        before_received_qty_in_unit: beforeReceivedQtyInUnit == null
          ? null
          : Number(beforeReceivedQtyInUnit.toFixed(4)),
        after_received_qty_in_unit: beforeReceivedQtyInUnit == null
          ? null
          : Number((beforeReceivedQtyInUnit + deltaInUnit).toFixed(4)),
        qty_limit_in_unit: row.qty_in_unit == null ? null : toNumber(row.qty_in_unit),
        qty_limit: toNumber(row.qty),
      });
      remaining = roundQty(remaining - amount);
    }
    if (remaining > 0) {
      errors.push({
        code: requested > 0 ? 'PO_ROOM_EXCEEDED' : 'PO_RECEIVED_NEGATIVE',
        product_id: productDelta.product_id,
        delta: requested,
        remaining,
        message: requested > 0
          ? `Delta stok produk #${productDelta.product_id} melebihi room Surat Pesanan`
          : `Delta stok produk #${productDelta.product_id} membuat received_qty Surat Pesanan negatif`,
      });
    }
  }
  return { effects, errors, index: poIndex };
};

const buildHnaRevaluations = async ({ client, invoice, taxType, delta, nextLines, currentLines, stockByLine, state }) => {
  const effectiveTaxType = tax.normalizeTaxType(taxType ?? invoice.tax_type);
  const productIds = delta.target_hna.map((entry) => entry.product_id);
  const products = await queryProducts(client, productIds);
  const currentByKey = new Map(currentLines.map((line) => [line.line_key, line]));
  const nextByKey = new Map(nextLines.map((line) => [line.line_key, line]));
  const revaluations = new Map();
  const targetBatchByLine = new Map();

  for (const target of delta.target_hna) {
    const next = nextByKey.get(target.line_key);
    const current = currentByKey.get(target.line_key);
    const entries = stockByLine.get(target.line_key) || [];
    const targetBatchIds = (
      current &&
      next &&
      Number(current.product_id) === Number(next.product_id) &&
      delta.batch_edit_mode === 'metadata' &&
      entries.length > 0
    )
      ? entries.map((entry) => entry.batch_id).filter(Boolean)
      : [];
    targetBatchByLine.set(
      target.line_key,
      targetBatchIds.length === 1 ? targetBatchIds[0] : targetBatchIds,
    );
    const revaluationTargets = targetBatchIds.length > 0 ? targetBatchIds : [null];
    const product = products.get(target.product_id) || next?.product;
    for (const targetBatchId of revaluationTargets) {
      const targetKey = targetBatchId ? `batch:${targetBatchId}` : `line:${target.line_key}`;
      const batch = targetBatchId ? state.batches.get(Number(targetBatchId)) : null;
      const existing = revaluations.get(targetKey);
      if (existing && !sameNumber(existing.after_hna, target.hna_base, 0.005)) {
        throw Object.assign(new Error(`HNA produk #${target.product_id} memiliki nilai tujuan berbeda pada lebih dari satu baris`), {
          code: 'HNA_CONFLICT',
        });
      }
      const batchChanged = !batch || !sameNumber(batch.hna, target.hna_base, 0.005);
      const alreadyTargetsProduct = [...revaluations.values()].some(
        (entry) => entry.product_id === target.product_id
          && sameNumber(entry.after_hna, target.hna_base, 0.005),
      );
      const productMasterChanged = !alreadyTargetsProduct
        && effectiveTaxType !== tax.TAX_TYPE_NOTA
        && (!product || !sameNumber(product.hna, target.hna_base, 0.005));
      revaluations.set(targetKey, {
        target_key: targetKey,
        line_key: target.line_key,
        batch_id: targetBatchId,
        product_id: target.product_id,
        before_hna: batch ? toNumber(batch.hna) : null,
        after_hna: toNumber(target.hna_base),
        batch_will_create: !targetBatchId,
        product_master_before: product ? toNumber(product.hna) : null,
        product_master_after: effectiveTaxType === tax.TAX_TYPE_NOTA ? null : toNumber(target.hna_base),
        product_master_sync: !alreadyTargetsProduct && effectiveTaxType !== tax.TAX_TYPE_NOTA,
        changed: batchChanged || productMasterChanged,
        batch_changed: batchChanged,
        product_master_changed: productMasterChanged,
      });
    }
  }
  return { revaluations: [...revaluations.values()], targetBatchByLine };
};

const buildPreview = ({ invoice, delta, state, currentLines, nextLines, stockByLine, hnaRevaluations, poEffects }) => {
  const currentByKey = new Map(currentLines.map((line) => [line.line_key, line]));
  const nextByKey = new Map(nextLines.map((line) => [line.line_key, line]));
  const productNameFor = (bucket) => {
    const lineKey = bucket.line_keys?.[0];
    return nextByKey.get(lineKey)?.product_name
      || currentByKey.get(lineKey)?.product_name
      || bucket.product_name
      || `Produk #${bucket.product_id}`;
  };
  const stockDeltas = delta.batch_deltas.map((bucket) => {
    const batch = bucket.batch_id ? state.batches.get(Number(bucket.batch_id)) : null;
    const before = batch ? toNumber(batch.qty_current) : 0;
    const after = roundQty(before + bucket.delta);
    return {
      key: bucket.key,
      line_keys: bucket.line_keys,
      product_id: bucket.product_id,
      product_name: productNameFor(bucket),
      batch_id: bucket.batch_id || null,
      batch_before: batch?.batch_no || '',
      batch_after: bucket.batch_number || batch?.batch_no || '',
      expired_before: normalizeDate(batch?.expired_date),
      expired_after: normalizeDate(bucket.expired_date || batch?.expired_date),
      before_qty: before,
      delta_base: roundQty(bucket.delta),
      after_qty: after,
      status: after < 0 ? 'minus' : 'ok',
      will_create_batch: !bucket.batch_id,
    };
  });
  const negativeWarnings = stockDeltas
    .filter((row) => row.after_qty < 0)
    .map((row) => ({
      product_id: row.product_id,
      product_name: row.product_name,
      batch_id: row.batch_id,
      batch: row.batch_after || row.batch_before,
      before_qty: row.before_qty,
      delta_base: row.delta_base,
      after_qty: row.after_qty,
      message: `${row.product_name} batch ${row.batch_after || row.batch_before || '-'} akan menjadi minus (${row.before_qty} ${row.delta_base >= 0 ? '+' : ''}${row.delta_base} = ${row.after_qty})`,
    }));
  const changedHna = hnaRevaluations.filter((entry) => entry.changed);
  const hasStockOrHnaChange = stockDeltas.length > 0 || changedHna.length > 0;
  return {
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    mode: 'delta',
    batch_edit_mode: delta.batch_edit_mode,
    line_changes: delta.line_changes,
    stock_deltas: stockDeltas,
    metadata_changes: delta.metadata_changes,
    hna_revaluations: changedHna,
    po_effects: poEffects,
    negative_warnings: negativeWarnings,
    requires_confirmation: hasStockOrHnaChange,
    has_stock_or_hna_change: hasStockOrHnaChange,
    no_op: !delta.changed && changedHna.length === 0 && poEffects.length === 0,
    line_mapping: currentLines.map((line) => ({
      item_id: line.id,
      line_key: line.line_key,
      source: line.stored_line_key ? 'stored' : 'legacy-preflight',
    })),
  };
};

const buildInvoiceDeltaPlan = async ({
  client,
  invoiceId,
  items,
  requestKey,
  batchEditMode,
  requestHash,
  requestedTaxType = null,
  helpers,
  forUpdate = false,
}) => {
  const state = await loadDeltaState(client, invoiceId, { forUpdate });
  if (!state.invoice) {
    throw Object.assign(new Error('Faktur tidak ditemukan'), { code: 'NOT_FOUND' });
  }
  const mapping = resolveLegacyLineMapping(state);
  if (mapping.ambiguities.length > 0) {
    throw Object.assign(new Error('Mapping item faktur lama ambigu. Rekonsiliasi manual diperlukan sebelum stok boleh diedit.'), {
      code: 'INVOICE_LINE_MAPPING_AMBIGUOUS',
      ambiguities: mapping.ambiguities,
      mapping: mapping.currentLines.map((line) => ({ item_id: line.id, line_key: line.line_key })),
    });
  }
  let currentLines = mapping.currentLines.map((item) => ({
    id: item.id,
    line_key: item.line_key,
    stored_line_key: item.stored_line_key,
    product_id: normalizeProductId(item.product_id),
    product_name: normalizeText(item.product_name),
    quantity_base: Math.round(toNumber(item.quantity)),
    quantity_input: toNumber(item.qty_in_unit ?? item.quantity),
    unit: normalizeText(item.unit) || 'pcs',
    batch_number: normalizeText(item.batch_number),
    expired_date: normalizeDate(item.expired_date),
    hna_base: 0,
    raw: item,
  }));
  const stockByLine = buildStockByLine(state, mapping);
  let { nextLines, productLookup } = await normalizeNextLines({
    client,
    invoiceId,
    items,
    requestKey,
    helpers,
  });
  const currentById = new Map(currentLines.map((line) => [String(line.id), line]));
  const alignNextLines = (lines) => lines.map((line) => {
    const current = line.raw?.id ? currentById.get(String(line.raw.id)) : null;
    if (!current) return line;
    if (line.raw.line_key && line.line_key !== current.line_key) {
      throw Object.assign(new Error(`id item #${line.raw.id} tidak cocok dengan line_key faktur`), {
        code: 'LINE_ID_KEY_MISMATCH',
      });
    }
    return line.raw.line_key ? line : { ...line, line_key: current.line_key };
  });
  nextLines = alignNextLines(nextLines);
  let snapshotProductIds = [
    ...currentLines.map((line) => line.product_id),
    ...nextLines.map((line) => line.product_id),
  ];
  // On confirmation, lock product rows before reading their HNA/UOM snapshot.
  // Otherwise a concurrent product-master update could land between the read
  // and the lock, allowing a stale preview to overwrite the newer value.
  if (forUpdate) {
    await lockProductsForUpdate(client, snapshotProductIds);
    // The first lookup only identifies rows well enough to acquire locks. Once
    // the locks are held, resolve and convert the request again so pack_size,
    // base_unit, active state, and HNA all come from the locked product rows.
    ({ nextLines, productLookup } = await normalizeNextLines({
      client,
      invoiceId,
      items,
      requestKey,
      helpers,
    }));
    nextLines = alignNextLines(nextLines);
    snapshotProductIds = [
      ...currentLines.map((line) => line.product_id),
      ...nextLines.map((line) => line.product_id),
    ];
    await lockProductsForUpdate(client, snapshotProductIds);
  }
  const snapshotProducts = await queryProducts(client, snapshotProductIds);
  state.snapshot.product_master = [...snapshotProducts.values()].map((product) => ({
    id: product.id,
    name: product.name || '',
    hna: product.hna,
    base_unit: product.base_unit || null,
    pack_unit: product.pack_unit || null,
    pack_size: product.pack_size,
    is_active: product.is_active,
  }));
  // Invoice quantity is the document quantity; stock ownership is the amount
  // actually posted to the ledger. A PO-linked invoice can historically have
  // been clamped to the remaining PO room, so never guess a correction delta
  // from those two different quantities. Block it before any write instead.
  currentLines = currentLines.map((line) => {
    const product = snapshotProducts.get(Number(line.product_id));
    const ownedEntries = stockByLine.get(line.line_key) || [];
    const storedHna = product
      ? helpers.effectiveHna(line.raw, line.quantity_base, product)
      : toNumber(line.raw?.hna);
    const batchHna = ownedEntries.length === 1 ? toNumber(ownedEntries[0].hna_base) : 0;
    return {
      ...line,
      product,
      hna_base: storedHna > 0 ? storedHna : batchHna,
    };
  });
  if (mapping.hasPostedStock) {
    const partialStockLines = currentLines
      .map((line) => {
        const ownedQty = roundQty((stockByLine.get(line.line_key) || [])
          .reduce((sum, entry) => sum + toNumber(entry.qty), 0));
        return { line, ownedQty };
      })
      .filter(({ line, ownedQty }) => !sameNumber(ownedQty, line.quantity_base, QTY_TOLERANCE));
    if (partialStockLines.length > 0) {
      throw Object.assign(new Error('Qty faktur dan qty yang tercatat di ledger stok berbeda. Rekonsiliasi penerimaan/PO secara manual sebelum edit delta.'), {
        code: 'PARTIAL_STOCK_RECONCILIATION_REQUIRED',
        validation_errors: partialStockLines.map(({ line, ownedQty }) => ({
          code: 'PARTIAL_STOCK_RECONCILIATION_REQUIRED',
          line_key: line.line_key,
          item_id: line.id,
          product_id: line.product_id,
          product_name: line.product_name,
          invoice_qty_base: line.quantity_base,
          owned_qty_base: ownedQty,
        })),
      });
    }
  }
  const delta = buildInvoiceDelta({
    currentLines,
    nextLines,
    stockByLine,
    batchEditMode,
  });
  if (delta.hna_conflicts.length > 0) {
    throw Object.assign(new Error('Satu produk memiliki beberapa HNA tujuan berbeda. Pilih satu nilai sebelum menyimpan.'), {
      code: 'HNA_CONFLICT',
      conflicts: delta.hna_conflicts,
    });
  }
  const { effects: poEffects, errors: poErrors } = await buildPurchaseOrderEffects({
    client,
    invoice: state.invoice,
    delta,
    nextLines,
    currentLines,
    helpers,
    forUpdate,
  });
  const { revaluations: hnaRevaluations, targetBatchByLine } = await buildHnaRevaluations({
    client,
    invoice: state.invoice,
    taxType: tax.normalizeTaxType(requestedTaxType ?? state.invoice.tax_type),
    delta,
    nextLines,
    currentLines,
    stockByLine,
    state,
  });
  const preview = buildPreview({
    invoice: state.invoice,
    delta,
    state,
    currentLines,
    nextLines,
    stockByLine,
    hnaRevaluations,
    poEffects,
  });
  return {
    state,
    mapping,
    currentLines,
    nextLines,
    productLookup,
    stockByLine,
    delta,
    preview,
    hnaRevaluations,
    targetBatchByLine,
    poEffects,
    poErrors,
    snapshotHash: hashJson(state.snapshot),
    requestHash,
    helpers: createHelpers(helpers),
  };
};

const calculateHeader = (invoice, nextLines, body) => {
  const taxTypeValue = body.tax_type ?? invoice.tax_type;
  const taxType = taxTypeValue === 'nota' ? tax.TAX_TYPE_NOTA : tax.TAX_TYPE_FAKTUR;
  const rate = taxType === tax.TAX_TYPE_NOTA
    ? 0
    : (Number.parseFloat(body.ppn_rate) || Number.parseFloat(invoice.ppn_rate) || tax.PPN_RATE);
  const totalHna = nextLines.reduce((sum, line) => {
    const raw = line.raw || {};
    return sum + toNumber(raw.hna_times_qty || (toNumber(raw.hna) * toNumber(raw.quantity)));
  }, 0);
  const hnaBaru = nextLines.reduce((sum, line) => {
    const raw = line.raw || {};
    const hnaTimesQty = toNumber(raw.hna_times_qty || (toNumber(raw.hna) * toNumber(raw.quantity)));
    return sum + toNumber(raw.hna_baru || (hnaTimesQty - toNumber(raw.disc_nominal)));
  }, 0);
  const discountAmount = nextLines.reduce((sum, line) => sum + toNumber(line.raw?.disc_nominal), 0);
  const discCodAda = body.disc_cod_ada ?? invoice.disc_cod_ada ?? false;
  const discCod = discCodAda
    ? toNumber(body.disc_cod_amount ?? invoice.disc_cod_amount)
    : 0;
  const hnaFinalRaw = hnaBaru - discCod;
  const ppnRaw = hnaFinalRaw * rate;
  const hnaPlusPpnRaw = hnaFinalRaw + ppnRaw;
  const totalQty = nextLines.reduce((sum, line) => sum + toNumber(line.quantity_input), 0);
  return {
    taxType,
    rate,
    total_hna: Number(totalHna.toFixed(2)),
    discount_amount: Number(discountAmount.toFixed(2)),
    hna_baru: Number(hnaBaru.toFixed(2)),
    hna_final: Number(hnaFinalRaw.toFixed(2)),
    ppn: Number(ppnRaw.toFixed(2)),
    ppn_pembulatan: Math.floor(ppnRaw),
    hna_plus_ppn: Number(hnaPlusPpnRaw.toFixed(2)),
    harga_per_produk: totalQty > 0 ? Number((hnaPlusPpnRaw / totalQty).toFixed(2)) : 0,
  };
};

const itemDbValues = (line, taxType) => {
  const raw = line.raw || line;
  const quantityInput = toNumber(raw.quantity ?? line.quantity_input);
  const hna = toNumber(raw.hna);
  const hnaTimesQty = toNumber(raw.hna_times_qty || hna * quantityInput);
  const discNominal = toNumber(raw.disc_nominal);
  const hnaBaru = toNumber(raw.hna_baru || hnaTimesQty - discNominal);
  return [
    line.product_name,
    line.product_id || null,
    line.quantity_base,
    toNumber(raw.unit_price || hna),
    toNumber(raw.total_price || hnaTimesQty),
    normalizeDate(raw.expired_date),
    hna,
    hnaTimesQty,
    toNumber(raw.disc_percent),
    discNominal,
    hnaBaru,
    toNumber(raw.hna_per_item),
    toNumber(raw.margin),
    toNumber(raw.disc_cod_per_item),
    toNumber(raw.hna_after_cod || hnaBaru),
    toNumber(raw.hpp_inc_ppn),
    normalizeText(raw.batch_number),
    line.unit || 'pcs',
    quantityInput,
    Number(line.product?.pack_size || raw.pack_size_at_invoice || 1),
    taxType,
    line.line_key,
  ];
};

const persistInvoiceItems = async (client, plan, taxType) => {
  const currentByKey = new Map(plan.currentLines.map((line) => [line.line_key, line]));
  const nextKeys = new Set(plan.nextLines.map((line) => line.line_key));
  for (const current of plan.currentLines) {
    if (!nextKeys.has(current.line_key)) {
      await client.query('DELETE FROM invoice_items WHERE id = $1', [current.id]);
    }
  }
  for (const next of plan.nextLines) {
    const current = currentByKey.get(next.line_key);
    const values = itemDbValues(next, taxType);
    if (current) {
      await client.query(
        `UPDATE invoice_items SET
           product_name=$1, product_id=$2, quantity=$3, unit_price=$4, total_price=$5,
           expired_date=$6, hna=$7, hna_times_qty=$8, disc_percent=$9, disc_nominal=$10,
           hna_baru=$11, hna_per_item=$12, margin=$13, disc_cod_per_item=$14,
           hna_after_cod=$15, hpp_inc_ppn=$16, batch_number=$17, unit=$18,
           qty_in_unit=$19, pack_size_at_invoice=$20, tax_type=$21, line_key=$22
         WHERE id=$23`,
        [...values, current.id],
      );
    } else {
      await client.query(
        `INSERT INTO invoice_items
          (product_name, product_id, quantity, unit_price, total_price,
           expired_date, hna, hna_times_qty, disc_percent, disc_nominal,
           hna_baru, hna_per_item, margin, disc_cod_per_item, hna_after_cod,
           hpp_inc_ppn, batch_number, unit, qty_in_unit, pack_size_at_invoice,
           tax_type, line_key, invoice_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
        [...values, plan.state.invoice.id],
      );
    }
  }
};

const updateInvoiceHeader = async (client, invoice, nextLines, body) => {
  if (
    body.purchase_order_id !== undefined &&
    body.purchase_order_id !== null &&
    String(body.purchase_order_id) !== String(invoice.purchase_order_id || '')
  ) {
    throw Object.assign(new Error('Pindah Surat Pesanan saat edit delta belum diizinkan. Lepas SP atau edit faktur tanpa mengganti SP.'), {
      code: 'PO_RELINK_NOT_SUPPORTED',
    });
  }
  const calculated = calculateHeader(invoice, nextLines, body);
  const invoiceNumber = body.invoice_number ?? invoice.invoice_number;
  const purchaseDate = body.purchase_date ?? invoice.purchase_date;
  const distributorName = body.distributor_name ?? invoice.distributor_name;
  const discCodAda = body.disc_cod_ada ?? invoice.disc_cod_ada ?? false;
  const discCodAmount = discCodAda ? toNumber(body.disc_cod_amount ?? invoice.disc_cod_amount) : null;
  const result = await client.query(
    `UPDATE invoices SET
       invoice_number=$1, purchase_date=$2, distributor_name=$3,
       total_hna=$4, discount_amount=$5, hna_baru=$6,
       disc_cod_ada=$7, disc_cod_amount=$8, hna_final=$9,
       ppn_input=$10, ppn_masukan=$11, ppn_pembulatan=$12,
       hna_plus_ppn=$13, harga_per_produk=$14,
       due_date=$15, payment_date=$16, status=$17,
       tax_type=$18, ppn_rate=$19, updated_at=NOW()
     WHERE id=$20 RETURNING *`,
    [
      invoiceNumber,
      purchaseDate,
      distributorName,
      calculated.total_hna,
      calculated.discount_amount,
      calculated.hna_baru,
      discCodAda,
      discCodAmount,
      calculated.hna_final,
      calculated.ppn,
      calculated.ppn,
      calculated.ppn_pembulatan,
      calculated.hna_plus_ppn,
      calculated.harga_per_produk,
      body.due_date ?? invoice.due_date ?? null,
      body.payment_date ?? invoice.payment_date ?? null,
      body.status ?? invoice.status ?? 'Pending',
      calculated.taxType,
      calculated.rate,
      invoice.id,
    ],
  );
  return { row: result.rows[0], calculated };
};

const applyInvoiceDeltaPlan = async ({ client, plan, body, idempotencyKey, userId }) => {
  const calculated = calculateHeader(plan.state.invoice, plan.nextLines, body);
  for (const mapping of plan.mappingUpdates) {
    await client.query(
      'UPDATE inventory_mutations SET invoice_line_key = $1 WHERE id = $2 AND invoice_line_key IS NULL',
      [mapping.line_key, mapping.mutation_id],
    );
  }
  await persistInvoiceItems(client, plan, calculated.taxType);

  const destinationBatchIds = new Map();
  for (const bucket of plan.delta.batch_deltas.filter((entry) => !entry.batch_id)) {
    const line = plan.nextLines.find((candidate) => bucket.line_keys.includes(candidate.line_key));
    if (!line) throw new Error(`Destination batch untuk ${bucket.key} tidak memiliki line item`);
    const hna = plan.hnaRevaluations.find((entry) => entry.target_key === `line:${line.line_key}`)?.after_hna
      || toNumber(line.hna_base);
    const { rows: [created] } = await client.query(
      `INSERT INTO inventory_batches
        (product_id, batch_no, expired_date, qty_current, hna, source_type, source_ref,
         source_qty_value, source_qty_unit, source_pack_size, tax_type, ppn_rate)
       VALUES ($1,$2,$3,0,$4,'faktur',$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        line.product_id,
        line.batch_number || plan.state.invoice.invoice_number,
        line.expired_date || null,
        hna,
        `invoice-${plan.state.invoice.id}`,
        line.quantity_input,
        line.unit,
        Number(line.product?.pack_size || 1),
        calculated.taxType,
        calculated.rate,
      ],
    );
    destinationBatchIds.set(bucket.key, Number(created.id));
  }

  for (const metadata of plan.delta.metadata_changes) {
    await client.query(
      `UPDATE inventory_batches
       SET batch_no = $1, expired_date = $2
       WHERE id = $3`,
      [metadata.after_batch_number || plan.state.invoice.invoice_number, metadata.after_expired_date || null, metadata.batch_id],
    );
  }

  for (const revaluation of plan.hnaRevaluations) {
    if (revaluation.batch_id && revaluation.batch_changed) {
      await client.query(
        'UPDATE inventory_batches SET hna = $1 WHERE id = $2',
        [revaluation.after_hna, revaluation.batch_id],
      );
    }
    if (revaluation.product_master_sync && revaluation.product_master_changed) {
      await client.query(
        'UPDATE product_master SET hna = $1, updated_at = NOW() WHERE id = $2',
        [revaluation.after_hna, revaluation.product_id],
      );
    }
  }

  for (const bucket of plan.delta.batch_deltas) {
    const batchId = bucket.batch_id || destinationBatchIds.get(bucket.key);
    if (!batchId) throw new Error(`Batch untuk delta ${bucket.key} tidak ditemukan`);
    const beforeBatch = plan.state.batches.get(Number(batchId));
    const beforeQty = beforeBatch ? toNumber(beforeBatch.qty_current) : 0;
    const { rows: updatedRows } = await client.query(
      `UPDATE inventory_batches
       SET qty_current = qty_current + $1
       WHERE id = $2 AND qty_current = $3
       RETURNING id, qty_current`,
      [bucket.delta, batchId, beforeQty],
    );
    if (updatedRows.length !== 1) {
      throw Object.assign(new Error(`Saldo batch #${batchId} berubah sebelum konfirmasi. Preview harus dibuat ulang.`), {
        code: 'STALE_BATCH_BALANCE',
      });
    }
    for (const contribution of bucket.contributions || []) {
      if (!contribution.delta) continue;
      const line = plan.nextLines.find((candidate) => candidate.line_key === contribution.line_key)
        || plan.currentLines.find((candidate) => candidate.line_key === contribution.line_key);
      const product = line?.product || plan.nextLines.find((candidate) => Number(candidate.product_id) === Number(bucket.product_id))?.product;
      const qtyInUnit = product
        ? uom.fromBase(Math.abs(contribution.delta), bucket.unit || product.base_unit, product)
        : Math.abs(contribution.delta);
      const type = contribution.delta > 0 ? 'in' : 'out';
      await client.query(
        `INSERT INTO inventory_mutations
          (product_id, batch_id, type, qty, reference_type, reference_id, notes,
           created_by, qty_unit, qty_in_unit, invoice_line_key, event_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          bucket.product_id,
          batchId,
          type,
          Math.abs(contribution.delta),
          EDIT_REFERENCE_TYPE,
          plan.state.invoice.id,
          `${type === 'in' ? 'Delta masuk' : 'Delta keluar'} edit faktur ${plan.state.invoice.invoice_number}`,
          userId || null,
          bucket.unit || product?.base_unit || 'pcs',
          Number(toNumber(qtyInUnit).toFixed(4)),
          contribution.line_key || null,
          idempotencyKey,
        ],
      );
    }
  }

  for (const effect of plan.poEffects) {
    const { rows } = await client.query(
      `UPDATE purchase_order_items
       SET received_qty = COALESCE(received_qty, 0) + $1,
           received_qty_in_unit = CASE
             WHEN qty_in_unit IS NULL AND received_qty_in_unit IS NULL THEN NULL
             ELSE COALESCE(received_qty_in_unit, $5) + $2
           END
       WHERE id = $3 AND COALESCE(received_qty, 0) = $4
         AND COALESCE(received_qty_in_unit, $5) IS NOT DISTINCT FROM $5
         AND (
           qty_in_unit IS NULL
           OR (
             COALESCE(received_qty_in_unit, $5) + $2 >= 0
             AND COALESCE(received_qty_in_unit, $5) + $2 <= qty_in_unit
           )
         )
       RETURNING id, received_qty, received_qty_in_unit`,
      [
        effect.delta_base,
        effect.delta_in_unit,
        effect.po_item_id,
        effect.before_received_qty,
        effect.before_received_qty_in_unit,
      ],
    );
    if (rows.length !== 1 || toNumber(rows[0].received_qty) < 0) {
      throw Object.assign(new Error('Saldo received_qty Surat Pesanan berubah atau menjadi negatif. Tidak ada perubahan yang disimpan.'), {
        code: 'STALE_PO_BALANCE',
      });
    }
  }
  if (plan.state.invoice.purchase_order_id) {
    await plan.helpers.syncPurchaseOrderStatus(client, plan.state.invoice.purchase_order_id);
  }

  const { row: updatedInvoice } = await updateInvoiceHeader(
    client,
    plan.state.invoice,
    plan.nextLines,
    body,
  );
  const { rows: afterItems } = await client.query(
    'SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id',
    [plan.state.invoice.id],
  );
  const afterSnapshot = {
    invoice: updatedInvoice,
    items: afterItems,
    stock_delta: plan.preview.stock_deltas,
    hna_revaluations: plan.preview.hna_revaluations,
    po_effects: plan.preview.po_effects,
  };
  const beforeSnapshot = plan.state.snapshot;
  const response = {
    ...updatedInvoice,
    invoice: updatedInvoice,
    items: afterItems,
    unmatchedProducts: [],
    delta: plan.preview,
  };
  await client.query(
    `INSERT INTO invoice_audit_log
      (invoice_id, invoice_number, action, snapshot, note)
     VALUES ($1,$2,'UPDATE',$3,$4)`,
    [
      plan.state.invoice.id,
      updatedInvoice.invoice_number,
      JSON.stringify({ before: beforeSnapshot, after: afterSnapshot }),
      `Edit faktur delta: ${plan.preview.stock_deltas.length} perubahan saldo, ${plan.preview.hna_revaluations.length} revaluasi HNA, event ${idempotencyKey}`,
    ],
  );
  await client.query(
    `INSERT INTO invoice_edit_events
      (invoice_id, idempotency_key, request_hash, before_snapshot, after_snapshot,
       stock_delta, hna_revaluations, po_effects, negative_warning, response, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      plan.state.invoice.id,
      idempotencyKey,
      plan.requestHash,
      JSON.stringify(beforeSnapshot),
      JSON.stringify(afterSnapshot),
      JSON.stringify(plan.preview.stock_deltas),
      JSON.stringify(plan.preview.hna_revaluations),
      JSON.stringify(plan.preview.po_effects),
      JSON.stringify(plan.preview.negative_warnings),
      JSON.stringify(response),
      userId || null,
    ],
  );
  return response;
};

const createHelpers = (helpers) => ({ ...helpers });

module.exports = {
  EDIT_REFERENCE_TYPE,
  EDITABLE_REFERENCE_TYPES,
  buildInvoiceDeltaPlan,
  createHelpers,
  createPreviewToken,
  requestHashForBody,
  verifyPreviewToken,
  applyInvoiceDeltaPlan,
};
