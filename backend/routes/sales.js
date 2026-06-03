const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');
const tax = require('../utils/tax');
const uom = require('../utils/uom');

// ─── Auto-create tables ─────────────────────────────────────────────────────
const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_orders (
      id SERIAL PRIMARY KEY,
      order_number VARCHAR(50) UNIQUE NOT NULL,
      customer_id INT,
      customer_name VARCHAR(150) NOT NULL,
      customer_address TEXT,
      sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
      total DECIMAL(15,2) DEFAULT 0,
      payment_method VARCHAR(20) DEFAULT 'Tunai',
      payment_details TEXT,
      status VARCHAR(20) DEFAULT 'draft',
      pdf_status VARCHAR(20) DEFAULT 'belum_dicetak',
      notes TEXT,
      is_deleted BOOLEAN DEFAULT FALSE,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sales_items (
      id SERIAL PRIMARY KEY,
      sales_order_id INT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
      product_name VARCHAR(255) NOT NULL,
      qty INT NOT NULL DEFAULT 1,
      unit VARCHAR(30) DEFAULT 'pcs',
      unit_price DECIMAL(15,2) NOT NULL DEFAULT 0,
      subtotal DECIMAL(15,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_sales_orders_date ON sales_orders(sale_date DESC);
    CREATE INDEX IF NOT EXISTS idx_sales_orders_customer ON sales_orders(customer_name);
    CREATE INDEX IF NOT EXISTS idx_sales_items_order ON sales_items(sales_order_id);
  `);
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(30)`);
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS channel VARCHAR(10) DEFAULT 'offline'`);
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS due_date DATE`);
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS payment_terms INTEGER`);
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS gross_profit DECIMAL(15,2) DEFAULT 0`);
    await pool.query(`ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS unit_hpp DECIMAL(15,2) DEFAULT 0`);
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'unpaid'`);
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP`);
    // v1.6.0 multi-unit packaging: snapshot qty di unit input + pack_size saat sale
    await pool.query(`ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS qty_in_unit DECIMAL(15,4)`);
    await pool.query(`ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS pack_size_at_sale INT`);
    // v1.7.0: batch_no + ED snapshot per item (untuk display di PDF Nota — Image #17 feedback)
    await pool.query(`ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS batch_no_snapshot VARCHAR(100)`);
    await pool.query(`ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS expired_date_snapshot DATE`);
    // v1.8.1: counter YYMM dynamic — track bulan terakhir generate untuk auto-reset tiap bulan baru
    await pool.query(`ALTER TABLE document_counters ADD COLUMN IF NOT EXISTS last_yymm VARCHAR(4)`);
    // v1.8.3 hotfix: soft-deleted nota TETAP nge-block unique constraint → nomor gak bisa re-use.
    // Drop full UNIQUE, replace dengan partial UNIQUE INDEX (hanya enforce kalau is_deleted=FALSE).
    try {
      await pool.query(`ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS sales_orders_order_number_key`);
    } catch (e) { /* sudah didrop, abaikan */ }
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS sales_orders_order_number_active_idx
                      ON sales_orders(order_number) WHERE is_deleted = FALSE`);
};
ensureSchema().catch(e => console.error('sales ensureSchema:', e));

const generateOrderNumber = async (client) => {
  // v1.8.1: format HSB-NOTA-{YYMM}{NNN} dengan reset per bulan + sync to MAX per current month.
  // Kalau bulan berubah dari last_yymm → reset last_number=0 + update last_yymm.
  // Kalau nota terakhir bulan ini dihapus → MAX bergeser turun → re-use nomor (mirror v1.7.1 behavior).
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const currentYymm = `${yy}${mm}`;
  const monthPrefix = `HSB-NOTA-${currentYymm}`;

  // Sync counter ke MAX active nota YYMM bulan ini (NNN segment after monthPrefix)
  // v1.8.3 fix: SUBSTRING(... FROM $param) treat param as REGEX (matches literal digits → MAX salah).
  // Pakai REPLACE prefix yang safe + parameterized.
  await client.query(
    `UPDATE document_counters
     SET last_number = COALESCE((
       SELECT MAX(CAST(REPLACE(order_number, $1, '') AS INTEGER))
       FROM sales_orders
       WHERE is_deleted = FALSE AND order_number LIKE $2
     ), 0)
     WHERE doc_type = 'NOTA'`,
    [monthPrefix, `${monthPrefix}%`]
  );

  // Cek apakah bulan berubah → reset counter
  const { rows: [counter] } = await client.query(
    `SELECT last_number, last_yymm FROM document_counters WHERE doc_type = 'NOTA'`
  );
  if (!counter) {
    // Fallback kalau counter missing
    await client.query(
      `INSERT INTO document_counters (doc_type, prefix, last_number, last_yymm, is_active)
       VALUES ('NOTA', 'HSB-NOTA-', 1, $1, TRUE)
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
      `UPDATE document_counters SET last_number = $1, last_yymm = $2 WHERE doc_type = 'NOTA'`,
      [nextNumber, currentYymm]
    );
  } else {
    // Bulan sama (atau last_yymm NULL untuk row legacy) → increment + ensure last_yymm set
    const { rows: [updated] } = await client.query(
      `UPDATE document_counters SET last_number = last_number + 1, last_yymm = $1
       WHERE doc_type = 'NOTA' RETURNING last_number`,
      [currentYymm]
    );
    nextNumber = updated.last_number;
  }

  const padded = String(nextNumber).padStart(3, '0');
  return `${monthPrefix}${padded}`;
};

// GET all (excluding soft-deleted)
router.get('/', auth, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
    const { rows } = await pool.query(
      `SELECT s.*, COALESCE(s.customer_phone, MAX(c.phone)) AS customer_phone,
        COALESCE(json_agg(i ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
       FROM sales_orders s
       LEFT JOIN customers c ON s.customer_id = c.id
       LEFT JOIN sales_items i ON i.sales_order_id = s.id
       WHERE s.is_deleted = FALSE
       GROUP BY s.id
       ORDER BY s.sale_date DESC, s.id DESC
       LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single
router.get('/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, COALESCE(s.customer_phone, MAX(c.phone)) AS customer_phone,
        COALESCE(json_agg(i ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
       FROM sales_orders s
       LEFT JOIN customers c ON s.customer_id = c.id
       LEFT JOIN sales_items i ON i.sales_order_id = s.id
       WHERE s.id = $1
       GROUP BY s.id`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Nota not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create
router.post('/', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { customer_id, customer_name, customer_address, customer_phone, sale_date, notes, items, payment_method, payment_details, order_number: manualOrderNumber, channel: rawChannel, due_date, payment_terms } = req.body;
    const channel = ['offline', 'online'].includes(rawChannel) ? rawChannel : 'offline';
    if (!customer_name?.trim()) return res.status(400).json({ error: 'Nama customer wajib diisi' });
    if (!items?.length) return res.status(400).json({ error: 'Minimal 1 produk diperlukan' });

    const orderNumber = manualOrderNumber ? manualOrderNumber : await generateOrderNumber(client);
    
    if (manualOrderNumber) {
      const match = manualOrderNumber.match(/\d+$/);
      if (match) {
        const manualInt = parseInt(match[0], 10);
        await client.query(
          "UPDATE document_counters SET last_number = $1 WHERE doc_type = 'NOTA' AND last_number < $1",
          [manualInt]
        );
      }
    }

    let total = 0;
    let gross_profit = 0;
    items.forEach(it => { 
      total += (it.qty || 1) * (it.unit_price || 0);
      // v1.11.12: unit_hpp = HNA exc PPN (SSOT). Margin real = vs HPP inc PPN.
      gross_profit += (it.qty || 1) * ((it.unit_price || 0) - (it.unit_hpp || 0) * (1 + tax.PPN_RATE));
    });

    const { rows } = await client.query(
      `INSERT INTO sales_orders (order_number, customer_id, customer_name, customer_address, customer_phone, sale_date, total, gross_profit, notes, payment_method, payment_details, created_by, channel, due_date, payment_terms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [orderNumber, customer_id || null, customer_name.trim(), customer_address || '', customer_phone || '', sale_date || new Date(), total, gross_profit, notes || '', payment_method || 'Tunai', payment_details || '', req.user?.id || null, channel, due_date || null, payment_terms || null]
    );
    const order = rows[0];

    // v1.6.0 multi-unit + v1.7.0 batch snapshot: resolve product (pack info) + peek first FEFO batch per item
    const productMap = new Map();
    for (const it of items) {
      if (productMap.has(it.product_name)) continue;
      const { rows: [p] } = await client.query(
        'SELECT id, name, base_unit, pack_unit, pack_size FROM product_master WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND is_active = TRUE LIMIT 1',
        [it.product_name]
      );
      if (!p) continue;
      // v1.7.0: peek first FEFO batch (for batch_no + ED snapshot di sales_items → tampil di PDF Nota)
      const { rows: [firstBatch] } = await client.query(
        `SELECT batch_no, expired_date FROM inventory_batches
         WHERE product_id = $1 AND qty_current > 0 AND COALESCE(is_active, TRUE) = TRUE
         AND (expired_date IS NULL OR expired_date >= CURRENT_DATE)
         ORDER BY expired_date ASC NULLS LAST LIMIT 1`,
        [p.id]
      );
      productMap.set(it.product_name, { ...p, firstBatch });
    }

    for (const it of items) {
      const product = productMap.get(it.product_name);
      const qtyInUnit = parseFloat(it.qty) || 1;
      const qtyBase = product ? uom.toBase(qtyInUnit, it.unit, product) : qtyInUnit;
      const packSize = product?.pack_size || 1;
      const subtotal = qtyInUnit * (it.unit_price || 0);
      const fb = product?.firstBatch;
      await client.query(
        `INSERT INTO sales_items (sales_order_id, product_name, qty, unit, unit_price, unit_hpp, subtotal, qty_in_unit, pack_size_at_sale, batch_no_snapshot, expired_date_snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [order.id, it.product_name, qtyBase, it.unit || 'pcs', it.unit_price || 0, it.unit_hpp || 0, subtotal, qtyInUnit, packSize,
         fb?.batch_no || null, fb?.expired_date || null]
      );
    }

    // ─── Auto Stock-Out (FEFO): Nota Penjualan → Inventory ──────────────
    for (const it of items) {
      const product = productMap.get(it.product_name);
      const qtyInUnit = parseFloat(it.qty) || 0;
      const qtyBase = product ? uom.toBase(qtyInUnit, it.unit, product) : qtyInUnit;
      if (product && qtyBase > 0) {
        const { rows: batches } = await client.query(
          `SELECT * FROM inventory_batches
           WHERE product_id = $1 AND qty_current > 0
           AND COALESCE(is_active, TRUE) = TRUE
           AND (expired_date IS NULL OR expired_date >= CURRENT_DATE)
           ORDER BY expired_date ASC NULLS LAST
           FOR UPDATE`,
          [product.id]
        );
        let remaining = qtyBase;
        const displayUnit = it.unit || product.base_unit || 'pcs';
        for (const batch of batches) {
          if (remaining <= 0) break;
          const deduct = Math.min(batch.qty_current, remaining);
          await client.query('UPDATE inventory_batches SET qty_current = qty_current - $1 WHERE id = $2', [deduct, batch.id]);
          await client.query(
            `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, reference_id, notes, qty_unit, qty_in_unit)
             VALUES ($1, $2, 'out', $3, 'nota', $4, $5, $6, $7)`,
            [product.id, batch.id, deduct, order.id,
             `Stok keluar FEFO dari nota ${orderNumber}${displayUnit !== product.base_unit ? ` (${qtyInUnit} ${displayUnit})` : ''}`,
             displayUnit, qtyInUnit]
          );
          remaining -= deduct;
        }
        if (remaining > 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Stok ${product.name} tidak mencukupi (kurang: ${remaining} ${product.base_unit || 'pcs'})` });
        }
      }
    }

    await client.query('COMMIT');

    // Return the full order with items
    const result = await pool.query(
      `SELECT s.*, COALESCE(s.customer_phone, MAX(c.phone)) AS customer_phone,
        COALESCE(json_agg(i ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
       FROM sales_orders s LEFT JOIN customers c ON s.customer_id = c.id
       LEFT JOIN sales_items i ON i.sales_order_id = s.id
       WHERE s.id = $1 GROUP BY s.id`, [order.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[sales] rollback failed:', rollbackErr);
    }
    if (err.code === '23505' && (err.constraint === 'sales_orders_order_number_key' || err.message.includes('order_number'))) {
      return res.status(400).json({ error: 'Nomor Nota sudah digunakan. Gunakan nomor lain.' });
    }
    return res.status(500).json({ error: err.message });
  } finally {
    try {
      client.release();
    } catch (releaseErr) {
      console.error('[sales] client release failed:', releaseErr);
    }
  }
});

// PUT update
router.put('/:id', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { customer_id, customer_name, customer_address, customer_phone, sale_date, notes, items, status, payment_method, payment_details, channel: rawChannel, due_date, payment_terms } = req.body;
    const channel = ['offline', 'online'].includes(rawChannel) ? rawChannel : 'offline';
    if (!customer_name?.trim()) return res.status(400).json({ error: 'Nama customer wajib diisi' });
    if (!items?.length) return res.status(400).json({ error: 'Minimal 1 produk diperlukan' });

    let total = 0;
    let gross_profit = 0;
    items.forEach(it => {
      total += (it.qty || 1) * (it.unit_price || 0);
      // v1.11.12: unit_hpp = HNA exc PPN (SSOT). Margin real = vs HPP inc PPN.
      gross_profit += (it.qty || 1) * ((it.unit_price || 0) - (it.unit_hpp || 0) * (1 + tax.PPN_RATE));
    });

    const { rowCount } = await client.query(
      `UPDATE sales_orders SET customer_id=$1, customer_name=$2, customer_address=$3, customer_phone=$4, sale_date=$5, total=$6, gross_profit=$7, notes=$8, status=$9, payment_method=$10, payment_details=$11, channel=$12, due_date=$13, payment_terms=$14, updated_at=NOW()
       WHERE id=$15 AND is_deleted=FALSE`,
      [customer_id || null, customer_name.trim(), customer_address || '', customer_phone || '', sale_date || new Date(), total, gross_profit, notes || '', status || 'draft', payment_method || 'Tunai', payment_details || '', channel, due_date || null, payment_terms || null, req.params.id]
    );
    if (!rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Nota not found' }); }

    // v1.8.1: STOCK SYNC — reverse-old + apply-new pattern (mirror DELETE behavior).
    // 1) Reverse semua mutations type='out' untuk nota ini → return qty ke batch.
    const { rows: outMutations } = await client.query(
      `SELECT batch_id, product_id, qty FROM inventory_mutations
       WHERE reference_type = 'nota' AND reference_id = $1 AND type = 'out' AND batch_id IS NOT NULL`,
      [req.params.id]
    );
    for (const m of outMutations) {
      await client.query(
        'UPDATE inventory_batches SET qty_current = qty_current + $1 WHERE id = $2',
        [m.qty, m.batch_id]
      );
    }
    // 2) Hapus mutations lama (out + nota-cancelled in) supaya gak duplicate audit trail
    await client.query(
      `DELETE FROM inventory_mutations WHERE reference_type IN ('nota', 'nota-cancelled') AND reference_id = $1`,
      [req.params.id]
    );

    // Replace items
    await client.query('DELETE FROM sales_items WHERE sales_order_id = $1', [req.params.id]);
    // v1.6.0 multi-unit + v1.7.0 batch snapshot: resolve product + peek first FEFO batch per item
    // v1.8.1: re-snapshot batch_no/expired_date on edit (sebelumnya PUT gak update snapshot)
    const productMap = new Map();
    for (const it of items) {
      if (productMap.has(it.product_name)) continue;
      const { rows: [p] } = await client.query(
        'SELECT id, name, base_unit, pack_unit, pack_size FROM product_master WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND is_active = TRUE LIMIT 1',
        [it.product_name]
      );
      if (!p) continue;
      const { rows: [firstBatch] } = await client.query(
        `SELECT batch_no, expired_date FROM inventory_batches
         WHERE product_id = $1 AND qty_current > 0 AND COALESCE(is_active, TRUE) = TRUE
         AND (expired_date IS NULL OR expired_date >= CURRENT_DATE)
         ORDER BY expired_date ASC NULLS LAST LIMIT 1`,
        [p.id]
      );
      productMap.set(it.product_name, { ...p, firstBatch });
    }
    for (const it of items) {
      const product = productMap.get(it.product_name);
      const qtyInUnit = parseFloat(it.qty) || 1;
      const qtyBase = product ? uom.toBase(qtyInUnit, it.unit, product) : qtyInUnit;
      const packSize = product?.pack_size || 1;
      const subtotal = qtyInUnit * (it.unit_price || 0);
      const fb = product?.firstBatch;
      await client.query(
        `INSERT INTO sales_items (sales_order_id, product_name, qty, unit, unit_price, unit_hpp, subtotal, qty_in_unit, pack_size_at_sale, batch_no_snapshot, expired_date_snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [req.params.id, it.product_name, qtyBase, it.unit || 'pcs', it.unit_price || 0, it.unit_hpp || 0, subtotal, qtyInUnit, packSize,
         fb?.batch_no || null, fb?.expired_date || null]
      );
    }

    // 3) Apply-new stock-out: FEFO deduct + INSERT mutations (mirror POST flow)
    for (const it of items) {
      const product = productMap.get(it.product_name);
      const qtyInUnit = parseFloat(it.qty) || 0;
      const qtyBase = product ? uom.toBase(qtyInUnit, it.unit, product) : qtyInUnit;
      if (product && qtyBase > 0) {
        const { rows: batches } = await client.query(
          `SELECT * FROM inventory_batches
           WHERE product_id = $1 AND qty_current > 0
           AND COALESCE(is_active, TRUE) = TRUE
           AND (expired_date IS NULL OR expired_date >= CURRENT_DATE)
           ORDER BY expired_date ASC NULLS LAST
           FOR UPDATE`,
          [product.id]
        );
        let remaining = qtyBase;
        const displayUnit = it.unit || product.base_unit || 'pcs';
        const { rows: [orderInfo] } = await client.query('SELECT order_number FROM sales_orders WHERE id = $1', [req.params.id]);
        const orderNumber = orderInfo?.order_number || `#${req.params.id}`;
        for (const batch of batches) {
          if (remaining <= 0) break;
          const deduct = Math.min(batch.qty_current, remaining);
          await client.query('UPDATE inventory_batches SET qty_current = qty_current - $1 WHERE id = $2', [deduct, batch.id]);
          await client.query(
            `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, reference_id, notes, qty_unit, qty_in_unit)
             VALUES ($1, $2, 'out', $3, 'nota', $4, $5, $6, $7)`,
            [product.id, batch.id, deduct, req.params.id,
             `Stok keluar FEFO dari nota ${orderNumber} (edit-resync)${displayUnit !== product.base_unit ? ` (${qtyInUnit} ${displayUnit})` : ''}`,
             displayUnit, qtyInUnit]
          );
          remaining -= deduct;
        }
        if (remaining > 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Stok ${product.name} tidak mencukupi (kurang: ${remaining} ${product.base_unit || 'pcs'})` });
        }
      }
    }

    await client.query('COMMIT');
    const result = await pool.query(
      `SELECT s.*, COALESCE(s.customer_phone, MAX(c.phone)) AS customer_phone,
        COALESCE(json_agg(i ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
       FROM sales_orders s LEFT JOIN customers c ON s.customer_id = c.id
       LEFT JOIN sales_items i ON i.sales_order_id = s.id
       WHERE s.id = $1 GROUP BY s.id`, [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE (soft) — v1.7.1: reverse stock (return ke batch asal) + soft-delete nota
router.delete('/:id', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Cek nota exists + active
    const { rows: [existing] } = await client.query(
      'SELECT id, order_number FROM sales_orders WHERE id = $1 AND is_deleted = FALSE', [req.params.id]
    );
    if (!existing) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Nota not found' }); }

    // Reverse stock: fetch semua mutations type='out' untuk nota ini, return qty ke batch
    const { rows: outMutations } = await client.query(
      `SELECT batch_id, product_id, qty FROM inventory_mutations
       WHERE reference_type = 'nota' AND reference_id = $1 AND type = 'out' AND batch_id IS NOT NULL`,
      [req.params.id]
    );
    for (const m of outMutations) {
      await client.query(
        'UPDATE inventory_batches SET qty_current = qty_current + $1 WHERE id = $2',
        [m.qty, m.batch_id]
      );
      await client.query(
        `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, reference_id, notes, created_by)
         VALUES ($1, $2, 'in', $3, 'nota-cancelled', $4, $5, $6)`,
        [m.product_id, m.batch_id, m.qty, req.params.id,
         `Reversal dari nota ${existing.order_number} dihapus`, req.user?.id || null]
      );
    }

    // Soft-delete nota
    await client.query(
      'UPDATE sales_orders SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1', [req.params.id]
    );
    await client.query('COMMIT');
    res.json({
      message: `Nota ${existing.order_number} dihapus + ${outMutations.length} mutasi stok dikembalikan`,
      reverted_mutations: outMutations.length,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// PATCH pdf status
router.patch('/:id/pdf-status', auth, async (req, res) => {
  const { pdf_status } = req.body;
  if (!pdf_status) return res.status(400).json({ error: 'pdf_status required' });
  try {
    const { rowCount } = await pool.query(
      'UPDATE sales_orders SET pdf_status = $1, updated_at = NOW() WHERE id = $2 AND is_deleted = FALSE',
      [pdf_status, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Nota not found' });
    res.json({ message: 'Status PDF diperbarui' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH payment status
router.patch('/:id/payment-status', auth, async (req, res) => {
  const { payment_status } = req.body;
  if (!['unpaid', 'paid'].includes(payment_status)) {
    return res.status(400).json({ error: 'payment_status must be unpaid or paid' });
  }
  try {
    let paid_at = null;
    if (payment_status === 'paid') {
      if (req.body.paid_at) {
        const d = new Date(req.body.paid_at);
        if (isNaN(d.getTime())) return res.status(400).json({ error: 'Format tanggal paid_at tidak valid' });
        paid_at = d;
      } else {
        paid_at = new Date();
      }
    }
    const { rowCount } = await pool.query(
      'UPDATE sales_orders SET payment_status = $1, paid_at = $2, updated_at = NOW() WHERE id = $3 AND is_deleted = FALSE',
      [payment_status, paid_at, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Nota not found' });
    res.json({ message: 'Status pembayaran diperbarui', payment_status, paid_at });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
