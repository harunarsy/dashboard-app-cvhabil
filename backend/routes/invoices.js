const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');
const uom = require('../utils/uom');
const tax = require('../utils/tax');

// Auto-migrate schema
const ensureSchema = async () => {
  await pool.query(`
    ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS hna_baru DECIMAL(15,2),
      ADD COLUMN IF NOT EXISTS disc_cod_ada BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS disc_cod_amount DECIMAL(15,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS hna_final DECIMAL(15,2),
      ADD COLUMN IF NOT EXISTS ppn_masukan DECIMAL(15,2),
      ADD COLUMN IF NOT EXISTS ppn_pembulatan INTEGER,
      ADD COLUMN IF NOT EXISTS hna_plus_ppn DECIMAL(15,2),
      ADD COLUMN IF NOT EXISTS harga_per_produk DECIMAL(15,2),
      ADD COLUMN IF NOT EXISTS due_date DATE,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS draft_data JSONB,
      ADD COLUMN IF NOT EXISTS purchase_order_id INTEGER,
      ADD COLUMN IF NOT EXISTS tax_type VARCHAR(20) DEFAULT 'faktur'
  `);
  await pool.query(`
    ALTER TABLE invoice_items
      ADD COLUMN IF NOT EXISTS expired_date DATE,
      ADD COLUMN IF NOT EXISTS hna DECIMAL(15,2),
      ADD COLUMN IF NOT EXISTS hna_times_qty DECIMAL(15,2),
      ADD COLUMN IF NOT EXISTS disc_percent DECIMAL(5,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS disc_nominal DECIMAL(15,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS hna_baru DECIMAL(15,2),
      ADD COLUMN IF NOT EXISTS hna_per_item DECIMAL(15,2),
      ADD COLUMN IF NOT EXISTS product_id INTEGER,
      ADD COLUMN IF NOT EXISTS tax_type VARCHAR(20) DEFAULT 'faktur'
  `);
  // Audit log table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_audit_log (
      id SERIAL PRIMARY KEY,
      invoice_id INTEGER NOT NULL,
      invoice_number VARCHAR(100),
      action VARCHAR(50) NOT NULL,
      changed_by VARCHAR(100) DEFAULT 'admin',
      changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      snapshot JSONB,
      note TEXT
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_invoice_id ON invoice_audit_log(invoice_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_invoices_purchase_date ON invoices(purchase_date DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_invoices_purchase_date_id ON invoices(purchase_date DESC, id DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_inventory_mutations_ref ON inventory_mutations(reference_type, reference_id)`);
  // Ensure newer columns exist in invoice_items
  await pool.query(`
    ALTER TABLE invoice_items
      ADD COLUMN IF NOT EXISTS hpp_inc_ppn DECIMAL(15,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100)
  `);
  // v1.6.0 multi-unit packaging: unit column (kritis — sebelumnya MISSING) + snapshot qty di unit input + pack_size saat invoice
  await pool.query(`
    ALTER TABLE invoice_items
      ADD COLUMN IF NOT EXISTS unit VARCHAR(30) DEFAULT 'pcs',
      ADD COLUMN IF NOT EXISTS qty_in_unit DECIMAL(15,4),
      ADD COLUMN IF NOT EXISTS pack_size_at_invoice INT
  `);
  await pool.query(`
    ALTER TABLE inventory_batches
      ADD COLUMN IF NOT EXISTS tax_type VARCHAR(20) DEFAULT 'faktur'
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_invoice_items_product_id
      ON invoice_items(product_id)
  `);

  // Data Migration: Populate missing hpp_inc_ppn and hna_per_item for old records
  // PPN_RATE constant via tax.js (sengaja inline literal di SQL karena query-side)
  await pool.query(`
    UPDATE invoice_items
    SET
      hna_per_item = CASE WHEN quantity > 0 AND hna_baru > 0 THEN hna_baru / quantity ELSE hna_per_item END,
      hpp_inc_ppn = CASE WHEN quantity > 0 AND hna_baru > 0 THEN (hna_baru / quantity) * ${1 + tax.PPN_RATE} ELSE hpp_inc_ppn END
    WHERE (hpp_inc_ppn = 0 OR hna_per_item = 0) AND quantity > 0 AND hna_baru > 0
  `);

  const { rows: [productMasterExists] } = await pool.query(`
    SELECT to_regclass('public.product_master') AS exists
  `);
  if (productMasterExists?.exists) {
    await pool.query(`
      WITH unique_products AS (
        SELECT LOWER(TRIM(name)) AS normalized_name, MIN(id) AS product_id
        FROM product_master
        WHERE is_active = TRUE
        GROUP BY 1
        HAVING COUNT(*) = 1
      )
      UPDATE invoice_items ii
      SET product_id = up.product_id
      FROM unique_products up
      WHERE ii.product_id IS NULL
        AND LOWER(TRIM(ii.product_name)) = up.normalized_name
    `);
  }
};
if (process.env.NODE_ENV !== 'test') ensureSchema().catch(console.error);

// Helper: log audit
const logAudit = async (invoiceId, invoiceNumber, action, snapshot, note = '') => {
  try {
    await pool.query(
      `INSERT INTO invoice_audit_log (invoice_id, invoice_number, action, snapshot, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [invoiceId, invoiceNumber, action, JSON.stringify(snapshot), note]
    );
  } catch (e) { console.error('Audit log error:', e.message); }
};

const DRAFT_OWNER_META_KEY = '__meta';
const getDraftOwnerId = (req) => String(req.user?.id || '');
const buildOwnedDraftData = (draftData, ownerId) => {
  const payload = draftData && typeof draftData === 'object' && !Array.isArray(draftData)
    ? { ...draftData }
    : {};
  const existingMeta = payload[DRAFT_OWNER_META_KEY];
  payload[DRAFT_OWNER_META_KEY] = {
    ...(existingMeta && typeof existingMeta === 'object' ? existingMeta : {}),
    owner_id: ownerId,
    saved_at: new Date().toISOString(),
  };
  return payload;
};

const normalizeProductName = (name = '') => String(name).trim().toLowerCase();
const toNumber = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const toDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // pg parses DATE columns as Date at LOCAL midnight; use local parts so the
    // YYYY-MM-DD matches the string sent from the client regardless of server TZ.
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
};
const prorateSourceQty = (sourceQty, fullBaseQty, stockedBaseQty) => {
  const source = toNumber(sourceQty) || toNumber(fullBaseQty);
  const full = toNumber(fullBaseQty);
  const stocked = toNumber(stockedBaseQty);
  if (!full || stocked >= full) return source;
  return Number(((source * stocked) / full).toFixed(4));
};

const effectiveHna = (item, qtyBase) => {
  const qty = toNumber(qtyBase) || toNumber(item.quantity) || 1;
  if (toNumber(item.hna_after_cod) > 0) return toNumber(item.hna_after_cod) / qty;
  if (toNumber(item.hna_per_item) > 0) return toNumber(item.hna_per_item);
  if (toNumber(item.hna_baru) > 0) return toNumber(item.hna_baru) / qty;
  return toNumber(item.hna) || 0;
};

const resolveProductByIdOrName = async (client, item = {}) => {
  const numericProductId = Number.parseInt(item.product_id, 10);
  if (Number.isFinite(numericProductId) && numericProductId > 0) {
    const { rows: [product] } = await client.query(
      `SELECT id, name, hna, base_unit, pack_unit, pack_size, is_active
       FROM product_master
       WHERE id = $1 AND is_active = TRUE
       LIMIT 1`,
      [numericProductId]
    );
    if (product) return { product, source: 'id' };
  }

  const normalizedName = normalizeProductName(item.product_name);
  if (!normalizedName) return { product: null, source: null, ambiguous: false };

  const { rows } = await client.query(
    `SELECT id, name, hna, base_unit, pack_unit, pack_size, is_active
     FROM product_master
     WHERE LOWER(TRIM(name)) = $1 AND is_active = TRUE
     ORDER BY id ASC`,
    [normalizedName]
  );

  if (rows.length === 1) {
    return { product: rows[0], source: 'name' };
  }
  if (rows.length > 1) {
    return { product: null, source: 'name', ambiguous: true };
  }
  return { product: null, source: null, ambiguous: false };
};

const loadProductLookupForItems = async (client, items = []) => {
  const lookup = {
    byId: new Map(),
    byName: new Map(),
    ambiguousNames: new Set(),
  };
  const productIds = [
    ...new Set(
      items
        .map((item) => Number.parseInt(item.product_id, 10))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ];
  const normalizedNames = [
    ...new Set(
      items
        .map((item) => normalizeProductName(item.product_name))
        .filter(Boolean),
    ),
  ];

  if (productIds.length > 0) {
    const { rows } = await client.query(
      `SELECT id, name, hna, base_unit, pack_unit, pack_size, is_active
       FROM product_master
       WHERE id = ANY($1::int[]) AND is_active = TRUE`,
      [productIds]
    );
    rows.forEach((row) => lookup.byId.set(String(row.id), row));
  }

  if (normalizedNames.length > 0) {
    const { rows: ambiguousRows } = await client.query(
      `SELECT LOWER(TRIM(name)) AS normalized_name
       FROM product_master
       WHERE LOWER(TRIM(name)) = ANY($1::text[])
         AND is_active = TRUE
       GROUP BY 1
       HAVING COUNT(*) > 1`,
      [normalizedNames]
    );
    ambiguousRows.forEach((row) => lookup.ambiguousNames.add(row.normalized_name));

    const { rows: uniqueRows } = await client.query(
      `WITH unique_products AS (
         SELECT LOWER(TRIM(name)) AS normalized_name, MIN(id) AS product_id
         FROM product_master
         WHERE LOWER(TRIM(name)) = ANY($1::text[])
           AND is_active = TRUE
         GROUP BY 1
         HAVING COUNT(*) = 1
       )
       SELECT pm.*, up.normalized_name
       FROM unique_products up
       JOIN product_master pm ON pm.id = up.product_id`,
      [normalizedNames]
    );
    uniqueRows.forEach((row) => lookup.byName.set(row.normalized_name, row));
  }

  return lookup;
};

const emptyProductLookup = () => ({
  byId: new Map(),
  byName: new Map(),
  ambiguousNames: new Set(),
});

const getProductFromLookup = (productLookup, item = {}) => {
  if (!item) return null;
  return (item.product_id && productLookup.byId.get(String(item.product_id)))
    || productLookup.byName.get(normalizeProductName(item.product_name))
    || null;
};

const collectUnmatchedProducts = (productLookup, items = []) => {
  const seen = new Set();
  const unmatchedProducts = [];

  for (const item of items || []) {
    const name = String(item.product_name || '').trim();
    if (!name || getProductFromLookup(productLookup, item)) continue;

    const normalizedName = normalizeProductName(name);
    const key = `${normalizedName}:${item.product_id || ''}`;
    if (seen.has(key)) continue;

    seen.add(key);
    unmatchedProducts.push({
      name,
      product_id: item.product_id || null,
      duplicate: productLookup.ambiguousNames.has(normalizedName),
    });
  }

  return unmatchedProducts;
};

const buildUnmatchedProductError = (unmatchedProducts) => ({
  error: 'Ada produk faktur yang belum dikenali master Inventory. Pilih produk dari master atau buat produk baru di Inventory dulu.',
  unmatchedProducts,
});

const loadPurchaseOrderItemsForUpdate = async (client, purchaseOrderId) => {
  if (!purchaseOrderId) return null;
  const { rows } = await client.query(
    `SELECT id, product_id, product_name, qty, received_qty
     FROM purchase_order_items
     WHERE po_id = $1
     ORDER BY id
     FOR UPDATE`,
    [purchaseOrderId]
  );
  const index = {
    byId: new Map(),
    byName: new Map(),
  };
  rows.forEach((row) => {
    const normalizedName = normalizeProductName(row.product_name);
    const item = {
      ...row,
      qty: toNumber(row.qty),
      received_qty: toNumber(row.received_qty),
    };
    if (item.product_id) {
      const idKey = String(item.product_id);
      const list = index.byId.get(idKey) || [];
      list.push(item);
      index.byId.set(idKey, list);
    }
    if (normalizedName) {
      const list = index.byName.get(normalizedName) || [];
      list.push(item);
      index.byName.set(normalizedName, list);
    }
  });
  return index;
};

const pickPurchaseOrderItem = (poItemsIndex, item) => {
  if (!poItemsIndex) return null;
  const itemProductId = item?.product_id ? String(item.product_id) : null;
  let rows = itemProductId ? poItemsIndex.byId.get(itemProductId) || [] : [];
  if (rows.length === 0) {
    const byNameRows = poItemsIndex.byName.get(normalizeProductName(item?.product_name)) || [];
    // v1.22.1: fallback nama hanya untuk PO item legacy tanpa product_id (atau id sama) —
    // cegah room produk lain yang kebetulan senama ikut terpotong.
    rows = byNameRows.filter(
      (row) => !row.product_id || !itemProductId || String(row.product_id) === itemProductId
    );
  }
  return rows.find((row) => row.qty - row.received_qty > 0) || rows[0] || null;
};

const syncPurchaseOrderStatus = async (client, purchaseOrderId) => {
  if (!purchaseOrderId) return null;
  const { rows } = await client.query(
    'SELECT qty, received_qty FROM purchase_order_items WHERE po_id = $1',
    [purchaseOrderId]
  );
  const allReceived = rows.length > 0 && rows.every((i) => toNumber(i.received_qty) >= toNumber(i.qty));
  const anyReceived = rows.some((i) => toNumber(i.received_qty) > 0);
  const newStatus = allReceived ? 'received' : (anyReceived ? 'partial' : 'sent');
  await client.query(
    `UPDATE purchase_orders
     SET status = $1, stock_received = $2, updated_at = NOW()
     WHERE id = $3`,
    [newStatus, allReceived, purchaseOrderId]
  );
  return newStatus;
};

const syncProductHna = async (client, productId, hna, purchaseOrderId = null, batchNo = null) => {
  const nextHna = toNumber(hna);
  if (!productId || nextHna <= 0) return;
  await client.query(
    `UPDATE product_master SET hna = $1, updated_at = NOW() WHERE id = $2`,
    [nextHna, productId]
  );
  if (purchaseOrderId) {
    if (batchNo) {
      await client.query(
        `UPDATE inventory_batches
         SET hna = $1
         WHERE source_type = 'purchase' AND source_ref = $2 AND product_id = $3 AND batch_no = $4`,
        [nextHna, `PO-${purchaseOrderId}`, productId, batchNo]
      );
    } else {
      await client.query(
        `UPDATE inventory_batches
         SET hna = $1
         WHERE source_type = 'purchase' AND source_ref = $2 AND product_id = $3`,
        [nextHna, `PO-${purchaseOrderId}`, productId]
      );
    }
  }
};

const roundQty = (value) => Number(toNumber(value).toFixed(4));
// Money columns are DECIMAL(15,2) — compare at 2 decimals so a recomputed value
// like 314176.875 doesn't false-positive against the stored 314176.88.
const round2 = (value) => Number(toNumber(value).toFixed(2));
const canonicalInvoiceItem = async (client, item) => {
  const { product } = await resolveProductByIdOrName(client, item);
  const qtyInUnit = toNumber(item.quantity);
  const unit = item.unit || product?.base_unit || 'pcs';
  const qtyBase = product ? uom.toBase(qtyInUnit, unit, product) : qtyInUnit;
  return {
    product_id: item.product_id ? Number.parseInt(item.product_id, 10) || null : null,
    product_name: normalizeProductName(item.product_name),
    quantity: roundQty(qtyBase),
    unit,
    unit_price: round2(item.unit_price || item.hna || 0),
    expired_date: toDateOnly(item.expired_date),
    hna: round2(item.hna),
    hna_baru: round2(item.hna_baru),
    batch_number: item.batch_number || '',
  };
};

const canonicalStoredInvoiceItem = (item) => ({
  product_id: item.product_id ? Number.parseInt(item.product_id, 10) || null : null,
  product_name: normalizeProductName(item.product_name),
  quantity: roundQty(item.quantity),
  unit: item.unit || 'pcs',
  unit_price: round2(item.unit_price || item.hna || 0),
  expired_date: toDateOnly(item.expired_date),
  hna: round2(item.hna),
  hna_baru: round2(item.hna_baru),
  batch_number: item.batch_number || '',
});

const invoiceItemsChanged = async (client, invoiceId, nextItems = []) => {
  const { rows: currentItems } = await client.query(
    `SELECT product_id, product_name, quantity, unit, unit_price, expired_date, hna, hna_baru, batch_number
     FROM invoice_items
     WHERE invoice_id = $1
     ORDER BY id`,
    [invoiceId]
  );
  if (currentItems.length !== nextItems.length) return true;
  const current = currentItems.map(canonicalStoredInvoiceItem);
  const next = [];
  for (const item of nextItems) {
    next.push(await canonicalInvoiceItem(client, item));
  }
  return JSON.stringify(current) !== JSON.stringify(next);
};

// GET all invoices
router.get('/', auth, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
    const result = await pool.query(`
      SELECT i.*,
        COUNT(ii.id) AS item_count,
        SUM(ii.quantity) AS total_qty,
        COALESCE(string_agg(DISTINCT ii.product_name, ', '), '') AS product_names
      FROM invoices i
      LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
      WHERE i.deleted_at IS NULL AND (i.is_draft IS NULL OR i.is_draft = FALSE)
      GROUP BY i.id
      ORDER BY i.purchase_date DESC, i.id DESC
      LIMIT $1
    `, [limit]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET trash
router.get('/trash', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.*, COUNT(ii.id) AS item_count
      FROM invoices i
      LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
      WHERE i.deleted_at IS NOT NULL
      GROUP BY i.id
      ORDER BY i.deleted_at DESC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET draft
router.get('/draft', auth, async (req, res) => {
  try {
    const ownerId = getDraftOwnerId(req);
    const { rows: ownedRows } = await pool.query(
      `SELECT * FROM invoices
       WHERE is_draft = TRUE
         AND deleted_at IS NULL
         AND COALESCE(draft_data->'__meta'->>'owner_id', '') = $1
       ORDER BY updated_at DESC
       LIMIT 1`,
      [ownerId]
    );
    if (ownedRows[0]) {
      return res.json(ownedRows[0]);
    }

    const result = await pool.query(
      `SELECT * FROM invoices
       WHERE is_draft = TRUE
         AND deleted_at IS NULL
         AND COALESCE(draft_data->'__meta'->>'owner_id', '') = ''
       ORDER BY updated_at DESC
       LIMIT 1`
    );
    res.json(result.rows[0] || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET audit log for invoice
router.get('/:id/audit', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM invoice_audit_log WHERE invoice_id = $1 ORDER BY changed_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET single invoice with items
router.get('/:id', auth, async (req, res) => {
  try {
    const inv = await pool.query('SELECT * FROM invoices WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (!inv.rows.length) return res.status(404).json({ error: 'Not found' });
    const items = await pool.query('SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id', [req.params.id]);
    res.json({ invoice: inv.rows[0], items: items.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// SAVE DRAFT
router.post('/draft', auth, async (req, res) => {
  const { draft_data } = req.body;
  const ownerId = getDraftOwnerId(req);
  const ownedDraftData = buildOwnedDraftData(draft_data, ownerId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT id FROM invoices
       WHERE is_draft = TRUE
         AND deleted_at IS NULL
         AND COALESCE(draft_data->'__meta'->>'owner_id', '') = $1
       ORDER BY updated_at DESC
       LIMIT 1
       FOR UPDATE`,
      [ownerId]
    );
    if (existing.rows.length > 0) {
      await client.query(
        `UPDATE invoices SET draft_data = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(ownedDraftData), existing.rows[0].id]
      );
      await client.query('COMMIT');
      return res.json({ id: existing.rows[0].id, saved: true });
    }

    const legacyDraft = await client.query(
      `SELECT id FROM invoices
       WHERE is_draft = TRUE
         AND deleted_at IS NULL
         AND COALESCE(draft_data->'__meta'->>'owner_id', '') = ''
       ORDER BY updated_at DESC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`
    );
    if (legacyDraft.rows.length > 0) {
      await client.query(
        `UPDATE invoices SET draft_data = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(ownedDraftData), legacyDraft.rows[0].id]
      );
      await client.query('COMMIT');
      return res.json({ id: legacyDraft.rows[0].id, saved: true });
    }

    const r = await client.query(
      `INSERT INTO invoices (invoice_number, purchase_date, distributor_name, status, is_draft, draft_data)
       VALUES ('DRAFT-' || extract(epoch from now())::bigint, NOW(), 'DRAFT', 'Pending', TRUE, $1) RETURNING id`,
      [JSON.stringify(ownedDraftData)]
    );
    await client.query('COMMIT');
    res.json({ id: r.rows[0].id, saved: true });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[invoices] draft save rollback failed:', rollbackErr);
    }
    res.status(500).json({ error: err.message });
  }
  finally { client.release(); }
});

// DELETE DRAFT
router.delete('/draft/clear', auth, async (req, res) => {
  try {
    const ownerId = getDraftOwnerId(req);
    await pool.query(
      `DELETE FROM invoices
       WHERE is_draft = TRUE
         AND deleted_at IS NULL
         AND (
           COALESCE(draft_data->'__meta'->>'owner_id', '') = $1
           OR COALESCE(draft_data->'__meta'->>'owner_id', '') = ''
         )`,
      [ownerId]
    );
    res.json({ cleared: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CREATE invoice
router.post('/', auth, async (req, res) => {
  const {
    invoice_number, purchase_date, distributor_name,
    total_hna, discount_amount, hna_baru,
    disc_cod_ada, disc_cod_amount, hna_final, final_hna,
    ppn_masukan, ppn_input, ppn_pembulatan,
    hna_plus_ppn, harga_per_produk,
    due_date, payment_date, status, items
  } = req.body;

  const taxType = tax.normalizeTaxType(req.body.tax_type);
  const resolvedHnaFinal = hna_final ?? final_hna ?? null;
  const resolvedPpn = taxType === tax.TAX_TYPE_NOTA ? 0 : (ppn_masukan ?? ppn_input ?? null);
  const purchase_order_id = req.body.purchase_order_id ?? null;
  const invoiceItems = items || [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const productLookup = invoiceItems.length > 0
      ? await loadProductLookupForItems(client, invoiceItems)
      : emptyProductLookup();
    const unmatchedProducts = collectUnmatchedProducts(productLookup, invoiceItems);
    if (unmatchedProducts.length > 0) {
      await client.query('ROLLBACK');
      return res.status(422).json(buildUnmatchedProductError(unmatchedProducts));
    }

    const existing = await client.query(
      'SELECT id FROM invoices WHERE invoice_number = $1 AND deleted_at IS NULL AND (is_draft IS NULL OR is_draft = FALSE)',
      [invoice_number]
    );

    let invoiceId;
    if (existing.rows.length > 0) {
      invoiceId = existing.rows[0].id;
      // snapshot before update
      const snap = await client.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
      await logAudit(invoiceId, invoice_number, 'UPDATE', snap.rows[0], 'Overwrite via POST');

      await client.query(
        `UPDATE invoices SET purchase_date=$1, distributor_name=$2,
          total_hna=$3, discount_amount=$4, hna_baru=$5,
          disc_cod_ada=$6, disc_cod_amount=$7,
          hna_final=$8, ppn_input=$9, ppn_masukan=$10, ppn_pembulatan=$11,
          hna_plus_ppn=$12, harga_per_produk=$13,
          due_date=$14, payment_date=$15, status=$16,
          purchase_order_id=COALESCE($17, purchase_order_id),
          tax_type=$18, updated_at=NOW()
        WHERE id=$19`,
        [purchase_date, distributor_name,
         total_hna||null, discount_amount||null, hna_baru||null,
         disc_cod_ada||false, disc_cod_amount||null,
         resolvedHnaFinal, resolvedPpn, resolvedPpn, ppn_pembulatan||null,
         hna_plus_ppn||null, harga_per_produk||null,
         due_date||null, payment_date||null, status||'Pending', purchase_order_id, taxType, invoiceId]
      );
    } else {
      const r = await client.query(
        `INSERT INTO invoices
          (invoice_number, purchase_date, distributor_name,
           total_hna, discount_amount, hna_baru,
           disc_cod_ada, disc_cod_amount,
           hna_final, ppn_input, ppn_masukan, ppn_pembulatan,
           hna_plus_ppn, harga_per_produk,
	           due_date, payment_date, status, purchase_order_id, tax_type)
	         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
        [invoice_number, purchase_date, distributor_name,
         total_hna||null, discount_amount||null, hna_baru||null,
         disc_cod_ada||false, disc_cod_amount||null,
         resolvedHnaFinal, resolvedPpn, resolvedPpn, ppn_pembulatan||null,
	         hna_plus_ppn||null, harga_per_produk||null,
	         due_date||null, payment_date||null, status||'Pending', purchase_order_id, taxType]
      );
      invoiceId = r.rows[0].id;
      await logAudit(invoiceId, invoice_number, 'CREATE', { invoice_number, distributor_name, status, hna_final: resolvedHnaFinal, hna_plus_ppn });
    }

    await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [invoiceId]);
    if (invoiceItems.length > 0) {
      for (const item of invoiceItems) {
        const product = getProductFromLookup(productLookup, item);
        const qtyInUnit = parseFloat(item.quantity) || 0;
        const qtyBase = product ? uom.toBase(qtyInUnit, item.unit, product) : qtyInUnit;
        const packSize = product?.pack_size || 1;
        const storedProductId = product ? product.id : null;
        await client.query(
          `INSERT INTO invoice_items
	            (invoice_id, product_name, product_id, quantity, unit_price, total_price,
	             expired_date, hna, hna_times_qty, disc_percent, disc_nominal, hna_baru, hna_per_item, margin,
	             disc_cod_per_item, hna_after_cod, hpp_inc_ppn, batch_number, unit, qty_in_unit, pack_size_at_invoice, tax_type)
	           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
          [invoiceId, item.product_name, storedProductId, qtyBase,
           item.unit_price||item.hna||0, item.total_price||item.hna_times_qty||0,
           item.expired_date||null, item.hna||0, item.hna_times_qty||0,
           item.disc_percent||0, item.disc_nominal||0, item.hna_baru||0,
           item.hna_per_item||0, item.margin||0,
           item.disc_cod_per_item||0, item.hna_after_cod||0, item.hpp_inc_ppn||0,
	           item.batch_number||null, item.unit || product?.base_unit || 'pcs', qtyInUnit, packSize, taxType]
	        );
      }
    }

    await client.query('DELETE FROM invoices WHERE id = $1 AND is_draft = TRUE', [invoiceId]);

    // ─── Auto Stock-In: Faktur → Inventory ──────────────────────────────
    // Faktur linked SP memakai purchase_order_items.received_qty sebagai SSOT:
    // tiap pintu hanya menambah sisa room, bukan boolean stock_received.
    const poItemsByName = purchase_order_id
      ? await loadPurchaseOrderItemsForUpdate(client, purchase_order_id)
      : null;
    if (invoiceItems.length > 0) {
      for (const item of invoiceItems) {
        const product = getProductFromLookup(productLookup, item);
        const qtyInUnit = parseFloat(item.quantity) || 0;
        const qtyBase = product ? uom.toBase(qtyInUnit, item.unit, product) : qtyInUnit;
        const packSize = product?.pack_size || 1;
        const displayUnit = item.unit || product?.base_unit || 'pcs';

	        if (product && taxType === tax.TAX_TYPE_FAKTUR) {
          if (purchase_order_id) {
            let batchNo = item.batch_number || null;
            if (!batchNo) {
              const { rows: hnaBatchRows } = await client.query(
                `SELECT id FROM inventory_batches WHERE source_type = 'purchase' AND source_ref = $1 AND product_id = $2`,
                [`PO-${purchase_order_id}`, product.id]
              );
              if (hnaBatchRows.length > 1) {
                console.warn(`[Invoice ${invoice_number}] Multiple PO batches for product #${product.id} without batch_number — batch HNA not blanket-updated`);
                await syncProductHna(client, product.id, effectiveHna(item, qtyBase), null);
              } else {
                await syncProductHna(client, product.id, effectiveHna(item, qtyBase), purchase_order_id, null);
              }
            } else {
              await syncProductHna(client, product.id, effectiveHna(item, qtyBase), purchase_order_id, batchNo);
            }
          } else {
            await syncProductHna(client, product.id, effectiveHna(item, qtyBase));
          }
        }

        let stockQtyBase = qtyBase;
        let sourceQtyValue = qtyInUnit || qtyBase;
        const poItem = purchase_order_id
          ? pickPurchaseOrderItem(poItemsByName, item)
          : null;
        if (poItem) {
          const room = Math.max(0, poItem.qty - poItem.received_qty);
          stockQtyBase = Math.min(qtyBase, room);
          sourceQtyValue = prorateSourceQty(qtyInUnit || qtyBase, qtyBase, stockQtyBase);
          if (stockQtyBase > 0) {
            await client.query(
              `UPDATE purchase_order_items
               SET received_qty = received_qty + $1,
                   received_qty_in_unit = COALESCE(received_qty_in_unit, 0) + $2
               WHERE id = $3`,
              [stockQtyBase, sourceQtyValue, poItem.id]
            );
            poItem.received_qty += stockQtyBase;
          }
        }

        if (product && stockQtyBase > 0) {
          // ─── PO-linked: create ONE faktur batch for remaining room ──
          if (purchase_order_id && poItem) {
            const batchHna = effectiveHna(item, stockQtyBase || qtyBase);
            const { rows: [batch] } = await client.query(
	              `INSERT INTO inventory_batches (product_id, batch_no, expired_date, qty_current, hna, source_type, source_ref, source_qty_value, source_qty_unit, source_pack_size, tax_type)
	               VALUES ($1, $2, $3, $4, $5, 'faktur', $6, $7, $8, $9, $10) RETURNING id`,
	              [product.id, item.batch_number || invoice_number, item.expired_date || null, stockQtyBase, batchHna, `invoice-${invoiceId}`, sourceQtyValue, displayUnit, packSize, taxType]
            );
            await client.query(
              `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, reference_id, notes, qty_unit, qty_in_unit)
               VALUES ($1, $2, 'in', $3, 'faktur', $4, $5, $6, $7)`,
              [product.id, batch.id, stockQtyBase, invoiceId,
               `Stok masuk dari faktur ${invoice_number}${displayUnit !== product.base_unit ? ` (${sourceQtyValue} ${displayUnit})` : ''}`,
               displayUnit, sourceQtyValue]
            );
          } else {
            // No PO linked: create new batch
            const batchHna = effectiveHna(item, stockQtyBase || qtyBase);
            const { rows: [batch] } = await client.query(
	              `INSERT INTO inventory_batches (product_id, batch_no, expired_date, qty_current, hna, source_type, source_ref, source_qty_value, source_qty_unit, source_pack_size, tax_type)
	               VALUES ($1, $2, $3, $4, $5, 'faktur', $6, $7, $8, $9, $10) RETURNING id`,
	              [product.id, item.batch_number || invoice_number, item.expired_date || null, stockQtyBase, batchHna, `invoice-${invoiceId}`, sourceQtyValue, displayUnit, packSize, taxType]
            );
            await client.query(
              `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, reference_id, notes, qty_unit, qty_in_unit)
               VALUES ($1, $2, 'in', $3, 'faktur', $4, $5, $6, $7)`,
              [product.id, batch.id, stockQtyBase, invoiceId,
               `Stok masuk dari faktur ${invoice_number}${displayUnit !== product.base_unit ? ` (${sourceQtyValue} ${displayUnit})` : ''}`,
               displayUnit, sourceQtyValue]
            );
          }
        }
      }
    }

    if (purchase_order_id) await syncPurchaseOrderStatus(client, purchase_order_id);

    await client.query('COMMIT');

    const final = await pool.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
    if (global.io) global.io.emit('invoiceCreated', final.rows[0]);
    res.status(201).json({ invoice: final.rows[0], items: invoiceItems, unmatchedProducts: [] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create invoice error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// UPDATE invoice
router.put('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const {
    invoice_number, purchase_date, distributor_name,
    total_hna, discount_amount, hna_baru,
    disc_cod_ada, disc_cod_amount, hna_final, final_hna,
    ppn_masukan, ppn_input, ppn_pembulatan,
    hna_plus_ppn, harga_per_produk,
    due_date, payment_date, status, items
  } = req.body;

  const taxType = tax.normalizeTaxType(req.body.tax_type);
  const resolvedHnaFinal = hna_final ?? final_hna ?? null;
  const resolvedPpn = taxType === tax.TAX_TYPE_NOTA ? 0 : (ppn_masukan ?? ppn_input ?? null);
  const invoiceItems = items || [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // snapshot before
    const snap = await client.query('SELECT * FROM invoices WHERE id = $1', [id]);
    const beforeSnap = snap.rows[0] || null;

    const { rows: mutationRows } = await client.query(
      `SELECT 1 FROM inventory_mutations
       WHERE reference_type = 'faktur' AND reference_id = $1
       LIMIT 1`,
      [id]
    );
    const hasStockMutations = mutationRows.length > 0;
    const allowItemRewrite = items !== undefined
      ? !(hasStockMutations && await invoiceItemsChanged(client, id, items || []))
      : false;
    if (items !== undefined && hasStockMutations && !allowItemRewrite) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Qty faktur posted tidak bisa diedit — koreksi lewat Stok Opname',
      });
    }

    const shouldRewriteItems = items !== undefined && !hasStockMutations;
    const productLookup = shouldRewriteItems && invoiceItems.length > 0
      ? await loadProductLookupForItems(client, invoiceItems)
      : emptyProductLookup();
    if (shouldRewriteItems) {
      const unmatchedProducts = collectUnmatchedProducts(productLookup, invoiceItems);
      if (unmatchedProducts.length > 0) {
        await client.query('ROLLBACK');
        return res.status(422).json(buildUnmatchedProductError(unmatchedProducts));
      }
    }

    const result = await client.query(
      `UPDATE invoices SET
        invoice_number=$1, purchase_date=$2, distributor_name=$3,
        total_hna=$4, discount_amount=$5, hna_baru=$6,
        disc_cod_ada=$7, disc_cod_amount=$8,
        hna_final=$9, ppn_input=$10, ppn_masukan=$11, ppn_pembulatan=$12,
	        hna_plus_ppn=$13, harga_per_produk=$14,
	        due_date=$15, payment_date=$16, status=$17,
	        tax_type=$18,
	        updated_at=NOW()
	       WHERE id=$19 RETURNING *`,
      [invoice_number, purchase_date, distributor_name,
       total_hna||null, discount_amount||null, hna_baru||null,
       disc_cod_ada||false, disc_cod_amount||null,
       resolvedHnaFinal, resolvedPpn, resolvedPpn, ppn_pembulatan||null,
	       hna_plus_ppn||null, harga_per_produk||null,
	       due_date||null, payment_date||null, status||'Pending', taxType, id]
    );
    if (!result.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Not found' });
    }
    if (beforeSnap) {
	      const afterSnap = result.rows[0];
	      const TRACK = ['invoice_number','purchase_date','distributor_name','status','hna_final','hna_plus_ppn','disc_cod_amount','due_date','payment_date','tax_type'];
      const before = {}; const after = {};
      TRACK.forEach(k => { if (String(beforeSnap[k]||'') !== String(afterSnap[k]||'')) { before[k] = beforeSnap[k]; after[k] = afterSnap[k]; } });
      if (Object.keys(before).length > 0) await logAudit(id, afterSnap.invoice_number, 'UPDATE', { before, after }, 'Field(s) changed: ' + Object.keys(before).join(', '));
    }

    if (shouldRewriteItems) {
      await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);
      for (const item of invoiceItems) {
        const product = getProductFromLookup(productLookup, item);
        const qtyInUnit = parseFloat(item.quantity) || 0;
        const qtyBase = product ? uom.toBase(qtyInUnit, item.unit, product) : qtyInUnit;
        const packSize = product?.pack_size || 1;
        const storedProductId = product ? product.id : null;
        await client.query(
          `INSERT INTO invoice_items
	            (invoice_id, product_name, product_id, quantity, unit_price, total_price,
	             expired_date, hna, hna_times_qty, disc_percent, disc_nominal, hna_baru, hna_per_item, margin,
	             disc_cod_per_item, hna_after_cod, hpp_inc_ppn, batch_number, unit, qty_in_unit, pack_size_at_invoice, tax_type)
	           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
          [id, item.product_name, storedProductId, qtyBase,
           item.unit_price||item.hna||0, item.total_price||item.hna_times_qty||0,
           item.expired_date||null, item.hna||0, item.hna_times_qty||0,
           item.disc_percent||0, item.disc_nominal||0, item.hna_baru||0,
           item.hna_per_item||0, item.margin||0,
           item.disc_cod_per_item||0, item.hna_after_cod||0, item.hpp_inc_ppn||0,
	           item.batch_number||null, item.unit || product?.base_unit || 'pcs', qtyInUnit, packSize, taxType]
	        );
	        // v1.8.2: sync product_master.hna ke RAW HNA per pcs dari faktur edit (mirror POST behavior)
	        if (taxType === tax.TAX_TYPE_FAKTUR && product && parseFloat(item.hna) > 0) {
          await client.query(
            `UPDATE product_master SET hna = $1, updated_at = NOW()
             WHERE id = $2`,
            [parseFloat(item.hna), product.id]
          );
        }
      }
    }

    await client.query('COMMIT');
    if (global.io) global.io.emit('invoiceUpdated', result.rows[0]);
    res.json({ ...result.rows[0], unmatchedProducts: [] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// SOFT DELETE
router.delete('/:id', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const snap = await client.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    if (snap.rows.length) {
      await client.query(
        `INSERT INTO invoice_audit_log (invoice_id, invoice_number, action, snapshot, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.params.id, snap.rows[0].invoice_number, 'DELETE', JSON.stringify(snap.rows[0]), '']
      );
    }
    const result = await client.query(
      'UPDATE invoices SET deleted_at = NOW() WHERE id = $1 RETURNING *', [req.params.id]
    );
    if (!result.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Not found' });
    }
    await client.query('COMMIT');
    if (global.io) global.io.emit('invoiceDeleted', { id: req.params.id });
    res.json({ message: 'Moved to trash', invoice: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// RESTORE
router.put('/:id/restore', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE invoices SET deleted_at = NULL WHERE id = $1 RETURNING *', [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    await logAudit(req.params.id, result.rows[0].invoice_number, 'RESTORE', result.rows[0]);
    res.json({ message: 'Restored', invoice: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PERMANENT DELETE
router.delete('/:id/permanent', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const snap = await client.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    if (snap.rows.length) {
      await client.query(
        `INSERT INTO invoice_audit_log (invoice_id, invoice_number, action, snapshot, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.params.id, snap.rows[0].invoice_number, 'PERMANENT_DELETE', JSON.stringify(snap.rows[0]), '']
      );
    }
    // Clean up inventory_batches and mutations created from this invoice
    await client.query(
      `DELETE FROM inventory_mutations WHERE reference_type = 'faktur' AND reference_id = $1`,
      [req.params.id]
    );
    await client.query(
      `DELETE FROM inventory_batches WHERE source_ref = $1`,
      [`invoice-${req.params.id}`]
    );
    await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [req.params.id]);
    await client.query('DELETE FROM invoices WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ message: 'Permanently deleted' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

module.exports = router;
