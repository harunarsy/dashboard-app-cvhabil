const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');
const uom = require('../utils/uom');
const tax = require('../utils/tax');
const { seedProductAlias } = require('../utils/productAliases');
const { runOnce } = require('../utils/migrationOnce');
const formDrafts = require('../utils/formDrafts');

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
      ADD COLUMN IF NOT EXISTS tax_type VARCHAR(20) DEFAULT 'faktur',
      ADD COLUMN IF NOT EXISTS ppn_rate DECIMAL(5,4) DEFAULT 0.11
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
  // inventory_batches.tax_type dimiliki inventory.js ensureSchema (single owner,
  // hindari dua ALTER tabel sama berebut lock saat cold start paralel).
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_invoice_items_product_id
      ON invoice_items(product_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id
      ON invoice_items(invoice_id)
  `);

  // Draft form WIP pindah ke tabel form_drafts (single owner tabel: invoices.js;
  // sales.js memakai tabel yang sama tanpa CREATE supaya tidak berebut lock).
  await formDrafts.ensureTable(pool);
  await runOnce(pool, 'form_drafts_migrate_v1', async () => {
    // Pindahkan draft faktur lama (baris palsu is_draft=TRUE) ke form_drafts,
    // ambil yang terbaru per owner, lalu bersihkan baris palsunya.
    await pool.query(`
      INSERT INTO form_drafts (doc_type, owner_id, draft_data, updated_at)
      SELECT 'faktur', COALESCE(latest.draft_data->'__meta'->>'owner_id', ''),
             latest.draft_data, COALESCE(latest.updated_at, NOW())
      FROM (
        SELECT DISTINCT ON (COALESCE(draft_data->'__meta'->>'owner_id', ''))
          draft_data, updated_at
        FROM invoices
        WHERE is_draft = TRUE AND deleted_at IS NULL AND draft_data IS NOT NULL
        ORDER BY COALESCE(draft_data->'__meta'->>'owner_id', ''), updated_at DESC NULLS LAST
      ) latest
      ON CONFLICT (doc_type, owner_id) DO NOTHING
    `);
    // Draft palsu tidak pernah punya items/stok — aman dihapus permanen.
    await pool.query(`DELETE FROM invoices WHERE is_draft = TRUE`);
  });

  // Data Migration one-time (AUDIT-CA-03): dulunya full-scan UPDATE tiap cold start.
  await runOnce(pool, 'invoice_items_backfill_v1', async () => {
    // Populate missing hpp_inc_ppn and hna_per_item for old records
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
  });
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

const getDraftOwnerId = (req) => String(req.user?.id || '');

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

  // v1.22.2: fallback alias — nama distributor lama tetap ketemu produk yang benar
  const { rows: aliasRows } = await client.query(
    `SELECT pm.id, pm.name, pm.hna, pm.base_unit, pm.pack_unit, pm.pack_size, pm.is_active
     FROM product_aliases pa
     JOIN product_master pm ON pm.id = pa.product_id AND pm.is_active = TRUE
     WHERE LOWER(TRIM(pa.alias_name)) = $1
     LIMIT 1`,
    [normalizedName]
  );
  if (aliasRows.length === 1) {
    return { product: aliasRows[0], source: 'alias' };
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

    // v1.22.2: nama yang belum ketemu di master dicoba via alias (nama distributor lama).
    // Unique index normalized menjamin 1 alias → tepat 1 produk.
    const unresolvedNames = normalizedNames.filter(
      (n) => !lookup.byName.has(n) && !lookup.ambiguousNames.has(n)
    );
    if (unresolvedNames.length > 0) {
      const { rows: aliasRows } = await client.query(
        `SELECT pm.*, LOWER(TRIM(pa.alias_name)) AS normalized_name
         FROM product_aliases pa
         JOIN product_master pm ON pm.id = pa.product_id AND pm.is_active = TRUE
         WHERE LOWER(TRIM(pa.alias_name)) = ANY($1::text[])`,
        [unresolvedNames]
      );
      aliasRows.forEach((row) => lookup.byName.set(row.normalized_name, row));
    }
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

// AUDIT-LS-04: pembelian NOTA via SP — batch purchase (dibuat saat Terima Barang,
// hna bisa 0/stale) tetap WAJIB di-backfill harga beli riil + tax_type 'nota'.
// product_master.hna TIDAK disentuh (semantik master = HNA exc PPN, nota tidak punya).
const syncPurchaseBatchForNota = async (client, productId, hargaBeli, purchaseOrderId, batchNo = null) => {
  const nextHna = toNumber(hargaBeli);
  if (!productId || !purchaseOrderId || nextHna <= 0) return;
  const params = [nextHna, `PO-${purchaseOrderId}`, productId];
  let sql = `UPDATE inventory_batches SET hna = $1, tax_type = 'nota'
             WHERE source_type = 'purchase' AND source_ref = $2 AND product_id = $3`;
  if (batchNo) {
    sql += ' AND batch_no = $4';
    params.push(batchNo);
  }
  await client.query(sql, params);
};

// AUDIT-LS-09: item faktur — qty wajib angka > 0, hna wajib angka >= 0 (baris kosong dilewati).
const validateInvoiceItems = (items = []) => {
  for (const item of items) {
    const label = String(item.product_name || '').trim();
    if (!label) continue;
    const qty = parseFloat(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return `Qty produk "${label}" harus angka lebih dari 0`;
    const hna = parseFloat(item.hna ?? 0);
    if (!Number.isFinite(hna) || hna < 0) return `Harga produk "${label}" tidak boleh minus`;
  }
  return null;
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
    const draft = await formDrafts.getDraft(pool, 'faktur', getDraftOwnerId(req));
    res.json(draft);
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

// SAVE DRAFT — single upsert, tanpa transaksi/FOR UPDATE seperti pola lama
router.post('/draft', auth, async (req, res) => {
  try {
    await formDrafts.saveDraft(pool, 'faktur', getDraftOwnerId(req), req.body?.draft_data);
    res.json({ saved: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE DRAFT
router.delete('/draft/clear', auth, async (req, res) => {
  try {
    await formDrafts.clearDraft(pool, 'faktur', getDraftOwnerId(req));
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
  // v1.43.0: rate PPN per-faktur (default 0.11 historis bila tak dikirim; form baru kirim 0.12).
  const resolvedPpnRate = taxType === tax.TAX_TYPE_NOTA
    ? 0
    : (parseFloat(req.body.ppn_rate) || tax.PPN_RATE);
  const purchase_order_id = req.body.purchase_order_id ?? null;
  const invoiceItems = items || [];
  const itemError = validateInvoiceItems(invoiceItems);
  if (itemError) return res.status(400).json({ error: itemError });

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
          tax_type=$18, ppn_rate=$19, updated_at=NOW()
        WHERE id=$20`,
        [purchase_date, distributor_name,
         total_hna||null, discount_amount||null, hna_baru||null,
         disc_cod_ada||false, disc_cod_amount||null,
         resolvedHnaFinal, resolvedPpn, resolvedPpn, ppn_pembulatan||null,
         hna_plus_ppn||null, harga_per_produk||null,
         due_date||null, payment_date||null, status||'Pending', purchase_order_id, taxType, resolvedPpnRate, invoiceId]
      );
    } else {
      const r = await client.query(
        `INSERT INTO invoices
          (invoice_number, purchase_date, distributor_name,
           total_hna, discount_amount, hna_baru,
           disc_cod_ada, disc_cod_amount,
           hna_final, ppn_input, ppn_masukan, ppn_pembulatan,
           hna_plus_ppn, harga_per_produk,
	           due_date, payment_date, status, purchase_order_id, tax_type, ppn_rate)
	         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,
        [invoice_number, purchase_date, distributor_name,
         total_hna||null, discount_amount||null, hna_baru||null,
         disc_cod_ada||false, disc_cod_amount||null,
         resolvedHnaFinal, resolvedPpn, resolvedPpn, ppn_pembulatan||null,
	         hna_plus_ppn||null, harga_per_produk||null,
	         due_date||null, payment_date||null, status||'Pending', purchase_order_id, taxType, resolvedPpnRate]
      );
      invoiceId = r.rows[0].id;
      await logAudit(invoiceId, invoice_number, 'CREATE', { invoice_number, distributor_name, status, hna_final: resolvedHnaFinal, hna_plus_ppn });
    }

    // AUDIT-LS-01: faktur yang SUDAH posting stok tidak boleh stock-in lagi via
    // overwrite-POST (double-click / retry / re-save = stok & room SP DOBEL).
    // Mirror guard hasStockMutations di PUT: item berubah → tolak; sama → skip stock-in.
    let alreadyPosted = false;
    if (existing.rows.length > 0) {
      const { rows: postedRows } = await client.query(
        `SELECT 1 FROM inventory_mutations WHERE reference_type = 'faktur' AND reference_id = $1 LIMIT 1`,
        [invoiceId]
      );
      alreadyPosted = postedRows.length > 0;
      if (alreadyPosted && await invoiceItemsChanged(client, invoiceId, invoiceItems)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Faktur ini sudah memposting stok. Ubah item lewat menu Edit Faktur, bukan simpan ulang dari form baru.',
        });
      }
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
    // AUDIT-LS-01: alreadyPosted → seluruh blok stock-in & HNA sync di-skip.
    const poItemsByName = !alreadyPosted && purchase_order_id
      ? await loadPurchaseOrderItemsForUpdate(client, purchase_order_id)
      : null;
    if (!alreadyPosted && invoiceItems.length > 0) {
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
        } else if (product && taxType === tax.TAX_TYPE_NOTA && purchase_order_id) {
          // AUDIT-LS-04: nota + SP — backfill batch purchase dgn harga beli riil.
          // Mirror guard cabang faktur: tanpa batch_number & batch PO > 1 → jangan
          // blanket-update (harga satu baris bisa menimpa batch lain).
          let batchNo = item.batch_number || null;
          if (!batchNo) {
            const { rows: hnaBatchRows } = await client.query(
              `SELECT id FROM inventory_batches WHERE source_type = 'purchase' AND source_ref = $1 AND product_id = $2`,
              [`PO-${purchase_order_id}`, product.id]
            );
            if (hnaBatchRows.length > 1) {
              console.warn(`[Invoice ${invoice_number}] Multiple PO batches for product #${product.id} without batch_number — nota batch HNA not blanket-updated`);
            } else {
              await syncPurchaseBatchForNota(client, product.id, effectiveHna(item, qtyBase), purchase_order_id, null);
            }
          } else {
            await syncPurchaseBatchForNota(client, product.id, effectiveHna(item, qtyBase), purchase_order_id, batchNo);
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
          // Satu jalur untuk PO-linked maupun beli langsung — qty yang masuk sudah
          // dibatasi room SP di atas (stockQtyBase); isi batch & mutasi identik.
          // AUDIT-LS-02: pembagi WAJIB qty penuh baris faktur. effectiveHna membagi
          // nominal TOTAL baris; kalau dibagi stockQtyBase hasil clamp room SP,
          // HNA per pcs menggelembung (1jt/40 = 25rb padahal benar 1jt/100 = 10rb).
          const batchHna = effectiveHna(item, qtyBase);
          const { rows: [batch] } = await client.query(
            `INSERT INTO inventory_batches (product_id, batch_no, expired_date, qty_current, hna, source_type, source_ref, source_qty_value, source_qty_unit, source_pack_size, tax_type, ppn_rate)
             VALUES ($1, $2, $3, $4, $5, 'faktur', $6, $7, $8, $9, $10, $11) RETURNING id`,
            [product.id, item.batch_number || invoice_number, item.expired_date || null, stockQtyBase, batchHna, `invoice-${invoiceId}`, sourceQtyValue, displayUnit, packSize, taxType, resolvedPpnRate]
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

    if (purchase_order_id) await syncPurchaseOrderStatus(client, purchase_order_id);

    await client.query('COMMIT');

    // v1.22.2: nama item ≠ nama master tapi tetap match (by-id/alias) → simpan jadi alias.
    // Di luar transaksi: gagal seed tidak boleh menggagalkan faktur.
    for (const item of invoiceItems) {
      const matched = getProductFromLookup(productLookup, item);
      if (matched && normalizeProductName(item.product_name) !== normalizeProductName(matched.name)) {
        await seedProductAlias(pool, matched.id, item.product_name);
      }
    }

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
  // v1.43.0: rate PPN per-faktur — saat edit, kalau tak dikirim pertahankan default historis.
  const resolvedPpnRate = taxType === tax.TAX_TYPE_NOTA
    ? 0
    : (parseFloat(req.body.ppn_rate) || tax.PPN_RATE);
  const invoiceItems = items || [];
  const itemError = items !== undefined ? validateInvoiceItems(invoiceItems) : null;
  if (itemError) return res.status(400).json({ error: itemError });

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
	        tax_type=$18, ppn_rate=$19,
	        updated_at=NOW()
	       WHERE id=$20 RETURNING *`,
      [invoice_number, purchase_date, distributor_name,
       total_hna||null, discount_amount||null, hna_baru||null,
       disc_cod_ada||false, disc_cod_amount||null,
       resolvedHnaFinal, resolvedPpn, resolvedPpn, ppn_pembulatan||null,
	       hna_plus_ppn||null, harga_per_produk||null,
	       due_date||null, payment_date||null, status||'Pending', taxType, resolvedPpnRate, id]
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

    // AUDIT-LS-03: ganti tax_type wajib MENJALAR ke items & batch faktur ini.
    // Kalau cuma header yang berubah, HPP batch tetap kebaca ×1,11 (atau sebaliknya)
    // dan snapshot unit_hpp_tax_type nota berikutnya ikut salah ~11%.
    if (tax.normalizeTaxType(beforeSnap?.tax_type) !== taxType) {
      await client.query('UPDATE invoice_items SET tax_type = $1 WHERE invoice_id = $2', [taxType, id]);
      await client.query(
        `UPDATE inventory_batches SET tax_type = $1 WHERE source_type = 'faktur' AND source_ref = $2`,
        [taxType, `invoice-${id}`]
      );
    }
    // v1.43.0: ganti rate PPN faktur (mis. 11%→12%) juga MENJALAR ke batch faktur ini,
    // supaya HPP inventory & nota berikutnya ikut rate baru (bukan rate lama batch).
    if (taxType === tax.TAX_TYPE_FAKTUR &&
        parseFloat(beforeSnap?.ppn_rate ?? tax.PPN_RATE) !== resolvedPpnRate) {
      await client.query(
        `UPDATE inventory_batches SET ppn_rate = $1 WHERE source_type = 'faktur' AND source_ref = $2`,
        [resolvedPpnRate, `invoice-${id}`]
      );
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

    // v1.22.2: auto-seed alias dari item yang match by-id/alias dgn nama berbeda
    if (shouldRewriteItems) {
      for (const item of invoiceItems) {
        const matched = getProductFromLookup(productLookup, item);
        if (matched && normalizeProductName(item.product_name) !== normalizeProductName(matched.name)) {
          await seedProductAlias(pool, matched.id, item.product_name);
        }
      }
    }

    if (global.io) global.io.emit('invoiceUpdated', result.rows[0]);
    res.json({ ...result.rows[0], unmatchedProducts: [] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PATCH payment status — set Paid + payment_date (atau balik ke Pending) tanpa
// menyentuh item/stok. Untuk klik cepat status "BELUM BAYAR" di daftar faktur.
router.patch('/:id/payment-status', auth, async (req, res) => {
  try {
    const { status, payment_date } = req.body;
    if (!['Paid', 'Pending'].includes(status)) {
      return res.status(400).json({ error: 'status harus Paid atau Pending' });
    }
    let payDate = null;
    if (status === 'Paid') {
      payDate = payment_date || new Date().toISOString().split('T')[0];
      const d = new Date(payDate);
      if (isNaN(d.getTime())) return res.status(400).json({ error: 'Tanggal bayar tidak valid' });
    }
    const result = await pool.query(
      `UPDATE invoices SET status = $1, payment_date = $2 WHERE id = $3 AND deleted_at IS NULL RETURNING *`,
      [status, payDate, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Faktur tidak ditemukan' });
    await logAudit(req.params.id, result.rows[0].invoice_number, 'PAYMENT_STATUS', { status, payment_date: payDate });
    if (global.io) global.io.emit('invoiceUpdated', result.rows[0]);
    res.json({ ...result.rows[0], unmatchedProducts: [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
    // AUDIT-LS-05a: tolak kalau batch faktur ini sudah dipakai keluar stok oleh nota —
    // menghapusnya bikin reversal edit/hapus nota jadi no-op senyap (stok hilang tanpa jejak).
    const { rows: usedByNota } = await client.query(
      `SELECT 1 FROM inventory_mutations m
       JOIN inventory_batches b ON b.id = m.batch_id
       WHERE b.source_ref = $1 AND m.type = 'out'
       LIMIT 1`,
      [`invoice-${req.params.id}`]
    );
    if (usedByNota.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Faktur tidak bisa dihapus permanen: stok dari faktur ini sudah terpakai di nota penjualan. Koreksi lewat Stok Opname.',
      });
    }

    // AUDIT-LS-05b: kembalikan room SP — stok yang dihapus harus bisa diterima ulang.
    const purchaseOrderId = snap.rows[0]?.purchase_order_id || null;
    if (purchaseOrderId) {
      const { rows: inMutations } = await client.query(
        `SELECT product_id, COALESCE(SUM(qty), 0) AS qty_in
         FROM inventory_mutations
         WHERE reference_type = 'faktur' AND reference_id = $1 AND type = 'in'
         GROUP BY product_id`,
        [req.params.id]
      );
      for (const m of inMutations) {
        await client.query(
          `UPDATE purchase_order_items
           SET received_qty = GREATEST(0, received_qty - $1)
           WHERE po_id = $2 AND product_id = $3`,
          [m.qty_in, purchaseOrderId, m.product_id]
        );
      }
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
    if (purchaseOrderId) await syncPurchaseOrderStatus(client, purchaseOrderId);
    await client.query('COMMIT');
    res.json({ message: 'Permanently deleted' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

module.exports = router;
