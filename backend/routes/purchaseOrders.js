const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

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
    
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id SERIAL PRIMARY KEY,
      po_id INT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      product_name VARCHAR(255) NOT NULL,
      qty INT NOT NULL DEFAULT 1,
      unit VARCHAR(30) DEFAULT 'pcs',
      unit_price DECIMAL(15,2) DEFAULT 0,
      subtotal DECIMAL(15,2) DEFAULT 0,
      received_qty INT DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_po_deleted ON purchase_orders(is_deleted);
    CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
  `);
};
ensureSchema().catch(e => console.error('purchase_orders ensureSchema:', e));

// ─── Helper: generate PO number (SP2603xxxx) ────────────────────────────────
const generatePONumber = async (client) => {
  const { rows } = await client.query(
    "UPDATE document_counters SET last_number = last_number + 1 WHERE doc_type = 'SP' RETURNING prefix, last_number"
  );
  if (!rows.length) {
    const now = new Date();
    const prefix = `SP${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
    return `${prefix}0001`;
  }
  return `${rows[0].prefix}${rows[0].last_number.toString().padStart(4, '0')}`;
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
          'id', pi.id, 'product_name', pi.product_name, 'qty', pi.qty,
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
    const { rows: [po] } = await pool.query('SELECT * FROM purchase_orders WHERE id = $1', [req.params.id]);
    if (!po) return res.status(404).json({ error: 'SP not found' });
    const { rows: items } = await pool.query('SELECT * FROM purchase_order_items WHERE po_id = $1 ORDER BY id', [req.params.id]);
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
    const total = items.reduce((s, i) => s + (i.qty || 0) * (i.unit_price || 0), 0);

    const { rows: [po] } = await client.query(
      `INSERT INTO purchase_orders (po_number, distributor_name, distributor_address, pic_name, order_date, expected_date, notes, total, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9) RETURNING *`,
      [poNumber, distributor_name.trim(), distributor_address || '', req.body.pic_name || null, order_date || new Date(), expected_date || null, notes || '', total, req.user?.id || null]
    );

    for (const item of items) {
      const sub = (item.qty || 0) * (item.unit_price || 0);
      await client.query(
        `INSERT INTO purchase_order_items (po_id, product_name, qty, unit, unit_price, subtotal) VALUES ($1,$2,$3,$4,$5,$6)`,
        [po.id, item.product_name, item.qty || 1, item.unit || 'pcs', item.unit_price || 0, sub]
      );
    }
    await client.query('COMMIT');
    res.status(201).json(po);
  } catch (err) {
    await client.query('ROLLBACK');
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
      [distributor_name, distributor_address, req.body.pic_name, order_date, expected_date, notes, status, total, req.params.id]
    );
    if (items) {
      await client.query('DELETE FROM purchase_order_items WHERE po_id = $1', [req.params.id]);
      for (const item of items) {
        const sub = (item.qty || 0) * (item.unit_price || 0);
        await client.query(
          `INSERT INTO purchase_order_items (po_id, product_name, qty, unit, unit_price, subtotal, received_qty) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [req.params.id, item.product_name, item.qty || 1, item.unit || 'pcs', item.unit_price || 0, sub, item.received_qty || 0]
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
      const recvQty = parseInt(item.received_qty) || 0;
      if (recvQty <= 0) continue;

      // Update PO item received_qty
      await client.query('UPDATE purchase_order_items SET received_qty = received_qty + $1 WHERE id = $2', [recvQty, item.po_item_id]);

      // Get the product name from PO item
      const { rows: [poItem] } = await client.query('SELECT product_name FROM purchase_order_items WHERE id = $1', [item.po_item_id]);
      if (!poItem) continue;

      // Find matching product in product_master
      const { rows: [product] } = await client.query(
        'SELECT id FROM product_master WHERE name = $1 AND is_active = TRUE', [poItem.product_name]
      );

      if (product) {
        // Auto stock-in to inventory
        const { rows: [batch] } = await client.query(
          `INSERT INTO inventory_batches (product_id, batch_no, expired_date, qty_current, source_type, source_ref)
           VALUES ($1,$2,$3,$4,'purchase',$5) RETURNING *`,
          [product.id, item.batch_no || null, item.expired_date || null, recvQty, `PO-${req.params.id}`]
        );
        // Record mutation
        await client.query(
          `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, reference_id, notes, created_by)
           VALUES ($1,$2,'in',$3,'purchase',$4,$5,$6)`,
          [product.id, batch.id, recvQty, parseInt(req.params.id), `Terima dari SP #${req.params.id}`, req.user?.id || null]
        );
      }
    }

    // Update PO status
    const { rows: poItems } = await client.query('SELECT qty, received_qty FROM purchase_order_items WHERE po_id = $1', [req.params.id]);
    const allReceived = poItems.every(i => i.received_qty >= i.qty);
    const anyReceived = poItems.some(i => i.received_qty > 0);
    const newStatus = allReceived ? 'received' : (anyReceived ? 'partial' : 'sent');
    await client.query('UPDATE purchase_orders SET status = $1, updated_at = NOW() WHERE id = $2', [newStatus, req.params.id]);

    await client.query('COMMIT');
    res.json({ message: 'Barang diterima', status: newStatus });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

module.exports = router;
