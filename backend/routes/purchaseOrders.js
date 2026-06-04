const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');
const uom = require('../utils/uom');

// ─── Auto-create tables ─────────────────────────────────────────────────────
const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id SERIAL PRIMARY KEY,
      po_number VARCHAR(50) UNIQUE NOT NULL,
      distributor_name VARCHAR(255) NOT NULL,
      distributor_address TEXT,
      pic_name VARCHAR(150),
      order_date DATE DEFAULT CURRENT_DATE,
      expected_date DATE,
      status VARCHAR(20) DEFAULT 'draft',
      notes TEXT,
      total DECIMAL(15,2) DEFAULT 0,
      is_deleted BOOLEAN DEFAULT FALSE,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS pic_name VARCHAR(150);
    ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS stock_received BOOLEAN DEFAULT FALSE;
    
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id SERIAL PRIMARY KEY,
      po_id INT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      product_name VARCHAR(255) NOT NULL,
      product_id INTEGER,
      qty INT NOT NULL DEFAULT 1,
      unit VARCHAR(30) DEFAULT 'pcs',
      unit_price DECIMAL(15,2) DEFAULT 0,
      subtotal DECIMAL(15,2) DEFAULT 0,
      received_qty INT DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_po_deleted ON purchase_orders(is_deleted);
    CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
  `);
  // Replace column-level UNIQUE with partial index (allows reuse of soft-deleted numbers)
  await pool.query(`ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_po_number_key`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_po_number_active
      ON purchase_orders(po_number) WHERE is_deleted = FALSE
  `);
  // v1.6.0 multi-unit packaging: snapshot qty di pack unit + pack_size saat PO + partial receive in pack
  await pool.query(`
    ALTER TABLE purchase_order_items
      ADD COLUMN IF NOT EXISTS product_id INTEGER,
      ADD COLUMN IF NOT EXISTS qty_in_unit DECIMAL(15,4),
      ADD COLUMN IF NOT EXISTS pack_size_at_po INT,
      ADD COLUMN IF NOT EXISTS received_qty_in_unit DECIMAL(15,4)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_purchase_order_items_product_id
      ON purchase_order_items(product_id)
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
      UPDATE purchase_order_items poi
      SET product_id = up.product_id
      FROM unique_products up
      WHERE poi.product_id IS NULL
        AND LOWER(TRIM(poi.product_name)) = up.normalized_name
    `);
  }
};
if (process.env.NODE_ENV !== 'test') ensureSchema().catch(e => console.error('purchase_orders ensureSchema:', e));

// ─── Helper: generate PO number ─────────────────────────────────────────────
const generatePONumber = async (client) => {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const currentYymm = `${yy}${mm}`;
  const monthPrefix = `HSB-SP-${currentYymm}`;

  // Sync counter ke MAX SP bulan ini SAJA (pakai REPLACE prefix, bukan REGEXP global)
  await client.query(
    `UPDATE document_counters
     SET last_number = COALESCE((
       SELECT MAX(CAST(NULLIF(REPLACE(po_number, $1, ''), '') AS INTEGER))
       FROM purchase_orders
       WHERE is_deleted = FALSE AND po_number LIKE $2
     ), 0)
     WHERE doc_type = 'SP'`,
    [monthPrefix, `${monthPrefix}%`]
  );

  const { rows: [counter] } = await client.query(
    `SELECT last_number, last_yymm FROM document_counters WHERE doc_type = 'SP'`
  );
  if (!counter) {
    await client.query(
      `INSERT INTO document_counters (doc_type, prefix, last_number, last_yymm, is_active)
       VALUES ('SP', 'HSB-SP-', 1, $1, TRUE)
       ON CONFLICT (doc_type) DO UPDATE SET last_number = 1, last_yymm = EXCLUDED.last_yymm`,
      [currentYymm]
    );
    return `${monthPrefix}001`;
  }

  let nextNumber;
  if (counter.last_yymm && counter.last_yymm !== currentYymm) {
    // Bulan baru → reset ke 1
    nextNumber = 1;
    await client.query(
      `UPDATE document_counters SET last_number = $1, last_yymm = $2 WHERE doc_type = 'SP'`,
      [nextNumber, currentYymm]
    );
  } else {
    // Bulan sama (atau last_yymm NULL row legacy) → increment + set last_yymm
    const { rows: [updated] } = await client.query(
      `UPDATE document_counters SET last_number = last_number + 1, last_yymm = $1
       WHERE doc_type = 'SP' RETURNING last_number`,
      [currentYymm]
    );
    nextNumber = updated.last_number;
  }
  return `${monthPrefix}${String(nextNumber).padStart(3, '0')}`;
};

const toNumber = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeProductName = (name = '') => String(name || '').trim().toLowerCase();

const resolveProductByIdOrName = async (client, { product_id, product_name }) => {
  const numericProductId = Number.parseInt(product_id, 10);
  if (Number.isFinite(numericProductId) && numericProductId > 0) {
    const { rows: [product] } = await client.query(
      `SELECT id, name, unit, base_unit, pack_unit, pack_size, hna, is_active
       FROM product_master
       WHERE id = $1 AND is_active = TRUE
       LIMIT 1`,
      [numericProductId]
    );
    if (product) {
      return { product, source: 'id' };
    }
  }

  const normalizedName = normalizeProductName(product_name);
  if (!normalizedName) return { product: null, source: null, ambiguous: false };

  const { rows } = await client.query(
    `SELECT id, name, unit, base_unit, pack_unit, pack_size, hna, is_active
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

const prorateSourceQty = (sourceQty, fullBaseQty, stockedBaseQty) => {
  const source = toNumber(sourceQty) || toNumber(fullBaseQty);
  const full = toNumber(fullBaseQty);
  const stocked = toNumber(stockedBaseQty);
  if (!full || stocked >= full) return source;
  return Number(((source * stocked) / full).toFixed(4));
};

// ══════════════════════════════════════════════════════════════════════════════
// CRUD
// ══════════════════════════════════════════════════════════════════════════════

// GET all POs
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT po.*, 
        json_agg(json_build_object(
          'id', pi.id, 'product_name', pi.product_name, 'product_id', pi.product_id, 'qty', pi.qty,
          'unit', pi.unit, 'unit_price', pi.unit_price, 'subtotal', pi.subtotal,
          'received_qty', pi.received_qty
        )) FILTER (WHERE pi.id IS NOT NULL) AS items
      FROM purchase_orders po
      LEFT JOIN purchase_order_items pi ON pi.po_id = po.id
      WHERE po.is_deleted = FALSE
      GROUP BY po.id
      ORDER BY po.created_at DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET single PO
router.get('/:id', auth, async (req, res) => {
  try {
    const { rows: [po] } = await pool.query('SELECT * FROM purchase_orders WHERE id = $1 AND is_deleted = FALSE', [req.params.id]);
    if (!po) return res.status(404).json({ error: 'SP not found' });
    const { rows: items } = await pool.query('SELECT * FROM purchase_order_items WHERE po_id = $1 ORDER BY id', [req.params.id]);
    // Attach received_batches per item from inventory_batches
    const { rows: batches } = await pool.query(
      `SELECT b.id, b.product_id, b.batch_no, b.expired_date, b.qty_current, b.source_qty_value, b.source_qty_unit, b.hna, b.is_active,
              COALESCE(SUM(m.qty), 0) AS received_qty_base
       FROM inventory_batches b
       LEFT JOIN inventory_mutations m ON m.batch_id = b.id AND m.reference_type = 'purchase' AND m.reference_id = $2 AND m.type = 'in'
       WHERE b.source_type = 'purchase' AND b.source_ref = $1
         AND COALESCE(b.is_active, TRUE) = TRUE
       GROUP BY b.id`,
      [`PO-${req.params.id}`, req.params.id]
    );
    const batchesByProductId = {};
    batches.forEach(b => {
      if (!batchesByProductId[b.product_id]) batchesByProductId[b.product_id] = [];
      batchesByProductId[b.product_id].push({
        id: b.id,
        batch_no: b.batch_no,
        expired_date: b.expired_date,
        qty_current: b.qty_current,
        source_qty_value: b.source_qty_value,
        source_qty_unit: b.source_qty_unit,
        hna: b.hna,
        is_active: b.is_active,
        received_qty_base: b.received_qty_base,
      });
    });
    items.forEach(item => {
      item.received_batches = (item.product_id && batchesByProductId[item.product_id]) || [];
    });
    res.json({ ...po, items });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CREATE PO (Surat Pesanan)
router.post('/', auth, async (req, res) => {
  const { distributor_name, distributor_address, order_date, expected_date, notes, items, po_number: manualPoNumber } = req.body;
  if (!distributor_name?.trim()) return res.status(400).json({ error: 'Nama distributor wajib' });
  if (!items?.length) return res.status(400).json({ error: 'Min 1 item' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const poNumber = manualPoNumber ? manualPoNumber : await generatePONumber(client);
    
    if (manualPoNumber) {
      const match = manualPoNumber.match(/\d+$/);
      if (match) {
        const manualInt = parseInt(match[0], 10);
        await client.query(
          "UPDATE document_counters SET last_number = $1 WHERE doc_type = 'SP' AND last_number < $1",
          [manualInt]
        );
      }
    }

    const total = items.reduce((s, i) => s + (i.qty || 0) * (i.unit_price || 0), 0);

    const { rows: [po] } = await client.query(
      `INSERT INTO purchase_orders (po_number, distributor_name, distributor_address, pic_name, order_date, expected_date, notes, total, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9) RETURNING *`,
      [poNumber, distributor_name.trim(), distributor_address || '', req.body.pic_name || null, order_date || new Date(), expected_date || null, notes || '', total, req.user?.id || null]
    );

    for (const item of items) {
      const { product } = await resolveProductByIdOrName(client, item);
      const qtyInUnit = parseFloat(item.qty) || 1;
      const qtyBase = product ? uom.toBase(qtyInUnit, item.unit, product) : qtyInUnit;
      const packSize = product?.pack_size || 1;
      const sub = qtyInUnit * (item.unit_price || 0);
      await client.query(
        `INSERT INTO purchase_order_items (po_id, product_name, product_id, qty, unit, unit_price, subtotal, qty_in_unit, pack_size_at_po)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [po.id, item.product_name, product?.id || null, qtyBase, item.unit || 'pcs', item.unit_price || 0, sub, qtyInUnit, packSize]
      );
    }
    await client.query('COMMIT');
    res.status(201).json(po);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505' && err.constraint === 'purchase_orders_po_number_key') {
      return res.status(400).json({ error: 'Nomor SP sudah digunakan. Gunakan nomor lain.' });
    }
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// UPDATE PO
router.put('/:id', auth, async (req, res) => {
  const { distributor_name, distributor_address, order_date, expected_date, notes, status, items } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const total = items ? items.reduce((s, i) => s + (i.qty || 0) * (i.unit_price || 0), 0) : undefined;
    await client.query(
      `UPDATE purchase_orders SET distributor_name=COALESCE($1, distributor_name), distributor_address=COALESCE($2, distributor_address),
       pic_name=COALESCE($3, pic_name), order_date=COALESCE($4, order_date), expected_date=COALESCE($5, expected_date),
       notes=COALESCE($6, notes), status=COALESCE($7, status), total=COALESCE($8, total), updated_at=NOW()
       WHERE id=$9`,
      [distributor_name, distributor_address, req.body.pic_name, order_date || null, expected_date || null, notes, status, total, req.params.id]
    );
    if (items) {
      await client.query('DELETE FROM purchase_order_items WHERE po_id = $1', [req.params.id]);
      for (const item of items) {
        const { product } = await resolveProductByIdOrName(client, item);
        const qtyInUnit = parseFloat(item.qty) || 1;
        const qtyBase = product ? uom.toBase(qtyInUnit, item.unit, product) : qtyInUnit;
        const recvInUnit = parseFloat(item.received_qty_in_unit) || 0;
        const recvBase = product ? uom.toBase(recvInUnit || (item.received_qty || 0), item.unit, product) : (item.received_qty || 0);
        const packSize = product?.pack_size || 1;
        const sub = qtyInUnit * (item.unit_price || 0);
        await client.query(
          `INSERT INTO purchase_order_items (po_id, product_name, product_id, qty, unit, unit_price, subtotal, received_qty, qty_in_unit, pack_size_at_po, received_qty_in_unit)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [req.params.id, item.product_name, product?.id || null, qtyBase, item.unit || 'pcs', item.unit_price || 0, sub, recvBase, qtyInUnit, packSize, recvInUnit]
        );
      }
    }
    await client.query('COMMIT');
    const { rows: [updated] } = await pool.query('SELECT * FROM purchase_orders WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// DELETE (soft)
router.delete('/:id', auth, async (req, res) => {
  try {
    const { rowCount } = await pool.query('UPDATE purchase_orders SET is_deleted = TRUE WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'SP deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// RECEIVE (SP → Faktur: auto-update inventory)
// ══════════════════════════════════════════════════════════════════════════════

router.post('/:id/receive', auth, async (req, res) => {
  const { items } = req.body; // [{ po_item_id, received_qty, batch_no, expired_date }]
  if (!items?.length) return res.status(400).json({ error: 'No items to receive' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const item of items) {
      // v1.6.0: receive qty bisa dikirim di unit asal PO (e.g., 5 karton) atau base unit (60 pcs)
      // Frontend convention: kirim received_qty_in_unit (di unit PO) + received_qty (di base unit) untuk clarity
      // Backward compat: kalau cuma `received_qty` dikirim (assumed base unit by old frontend)
      const recvInUnit = parseFloat(item.received_qty_in_unit) || 0;

      // Get PO item (incl unit + pack_size_at_po snapshot) + product (for fallback conversion)
      const { rows: [current] } = await client.query(
        'SELECT product_name, product_id, qty, received_qty, unit, pack_size_at_po FROM purchase_order_items WHERE id = $1 FOR UPDATE',
        [item.po_item_id]
      );
      if (!current) continue;
      const resolved = await resolveProductByIdOrName(client, current);
      let product = resolved.product;
      // Jaring pengaman: produk belum terdaftar (SP lama / produk dinonaktifkan) → daftarkan dulu supaya stok tidak hilang diam-diam
      if (!product && !resolved.ambiguous) {
        const { rows: [created] } = await client.query(
          `INSERT INTO product_master (name, unit, base_unit, hna) VALUES ($1,$2,$2,0)
           RETURNING id, hna, base_unit, pack_unit, pack_size`,
          [current.product_name, current.unit || 'pcs']
        );
        product = created;
      }
      if (!product) {
        console.warn(`[PO ${req.params.id}] Produk "${current.product_name}" tidak bisa dipetakan ke product_master${resolved.ambiguous ? ' (nama duplikat)' : ''} — item dilewati agar stok tidak salah`);
        continue;
      }

      // Determine recv qty di BASE unit
      let recvBase;
      if (item.received_qty_in_unit !== undefined && item.received_qty_in_unit !== null && product) {
        recvBase = uom.toBase(recvInUnit, current.unit || product.base_unit, product);
      } else {
        recvBase = parseInt(item.received_qty) || 0;
      }
      if (recvBase <= 0) continue;

      const room = Math.max(0, toNumber(current.qty) - toNumber(current.received_qty));
      const stockInBase = Math.min(recvBase, room);
      const sourceQtyValue = prorateSourceQty(recvInUnit || recvBase, recvBase, stockInBase);
      if (stockInBase <= 0) continue;

      // Update PO item received_qty (base) + received_qty_in_unit (pack unit running total)
      await client.query(
        `UPDATE purchase_order_items
         SET received_qty = received_qty + $1,
             received_qty_in_unit = COALESCE(received_qty_in_unit, 0) + $2
         WHERE id = $3`,
        [stockInBase, sourceQtyValue, item.po_item_id]
      );

      if (product) {
        const packSize = product.pack_size || current.pack_size_at_po || 1;
        const displayUnit = current.unit || product.base_unit || 'pcs';
        // Auto stock-in to inventory (qty_current di base unit + source snapshot)
        const { rows: [batch] } = await client.query(
          `INSERT INTO inventory_batches (product_id, batch_no, expired_date, qty_current, hna, source_type, source_ref, source_qty_value, source_qty_unit, source_pack_size)
           VALUES ($1,$2,$3,$4,$5,'purchase',$6,$7,$8,$9) RETURNING *`,
          [product.id, item.batch_no || null, item.expired_date || null, stockInBase, product.hna || 0, `PO-${req.params.id}`,
           sourceQtyValue, displayUnit, packSize]
        );
        await client.query(
          `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, reference_id, notes, created_by, qty_unit, qty_in_unit)
           VALUES ($1,$2,'in',$3,'purchase',$4,$5,$6,$7,$8)`,
          [product.id, batch.id, stockInBase, parseInt(req.params.id),
           `Terima dari SP #${req.params.id}${displayUnit !== product.base_unit ? ` (${sourceQtyValue} ${displayUnit})` : ''}`,
           req.user?.id || null, displayUnit, sourceQtyValue]
        );
      }
    }

    // Update PO status
    const { rows: poItems } = await client.query('SELECT qty, received_qty FROM purchase_order_items WHERE po_id = $1', [req.params.id]);
    const allReceived = poItems.every(i => i.received_qty >= i.qty);
    const anyReceived = poItems.some(i => i.received_qty > 0);
    const newStatus = allReceived ? 'received' : (anyReceived ? 'partial' : 'sent');
    await client.query(
      `UPDATE purchase_orders SET status = $1,
         stock_received = $3,
         updated_at = NOW() WHERE id = $2`,
      [newStatus, req.params.id, newStatus === 'received']
    );

    await client.query('COMMIT');
    res.json({ message: 'Barang diterima', status: newStatus });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

module.exports = router;
