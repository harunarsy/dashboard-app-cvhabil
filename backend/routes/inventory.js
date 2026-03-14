const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

// ─── Auto-create tables ─────────────────────────────────────────────────────
const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_master (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE,
      name VARCHAR(255) NOT NULL,
      unit VARCHAR(30) DEFAULT 'pcs',
      hna DECIMAL(15,2) DEFAULT 0,
      sell_price DECIMAL(15,2) DEFAULT 0,
      category VARCHAR(100),
      min_stock INT DEFAULT 5,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS inventory_batches (
      id SERIAL PRIMARY KEY,
      product_id INT NOT NULL REFERENCES product_master(id) ON DELETE CASCADE,
      batch_no VARCHAR(100),
      expired_date DATE,
      qty_current INT DEFAULT 0,
      hna DECIMAL(15,2) DEFAULT 0,
      source_type VARCHAR(30),
      source_ref VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS inventory_mutations (
      id SERIAL PRIMARY KEY,
      product_id INT NOT NULL REFERENCES product_master(id) ON DELETE CASCADE,
      batch_id INT REFERENCES inventory_batches(id),
      type VARCHAR(10) NOT NULL,
      qty INT NOT NULL,
      reference_type VARCHAR(30),
      reference_id INT,
      notes TEXT,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS stock_opname (
      id SERIAL PRIMARY KEY,
      product_id INT NOT NULL REFERENCES product_master(id) ON DELETE CASCADE,
      system_qty INT NOT NULL DEFAULT 0,
      physical_qty INT NOT NULL DEFAULT 0,
      difference INT NOT NULL DEFAULT 0,
      notes TEXT,
      opname_date DATE NOT NULL DEFAULT CURRENT_DATE,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_batches_product ON inventory_batches(product_id);
    CREATE INDEX IF NOT EXISTS idx_batches_expired ON inventory_batches(expired_date);
    CREATE INDEX IF NOT EXISTS idx_mutations_product ON inventory_mutations(product_id);
    CREATE INDEX IF NOT EXISTS idx_mutations_created ON inventory_mutations(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_opname_date ON stock_opname(opname_date DESC);
  `);
  // Add hna column to inventory_batches if not exists
  await pool.query(`
    ALTER TABLE inventory_batches
      ADD COLUMN IF NOT EXISTS hna DECIMAL(15,2) DEFAULT 0;
  `);
};
ensureSchema().catch(e => console.error('inventory ensureSchema:', e));

// ══════════════════════════════════════════════════════════════════════════════
// PRODUCT MASTER
// ══════════════════════════════════════════════════════════════════════════════

// GET all products with stock summary
router.get('/products', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*,
        COALESCE(SUM(b.qty_current), 0) AS total_stock,
        MIN(b.expired_date) FILTER (WHERE b.qty_current > 0 AND b.expired_date IS NOT NULL) AS nearest_expiry,
        COUNT(b.id) FILTER (WHERE b.qty_current > 0 AND b.expired_date IS NOT NULL AND b.expired_date < CURRENT_DATE + INTERVAL '90 days') AS expiring_batches
      FROM product_master p
      LEFT JOIN inventory_batches b ON b.product_id = p.id
      WHERE p.is_active = TRUE
      GROUP BY p.id
      ORDER BY p.name ASC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET single product with batches and mutations
router.get('/products/:id', auth, async (req, res) => {
  try {
    const { rows: [product] } = await pool.query('SELECT * FROM product_master WHERE id = $1', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const { rows: batches } = await pool.query(
      'SELECT * FROM inventory_batches WHERE product_id = $1 ORDER BY expired_date ASC NULLS LAST', [req.params.id]
    );
    const { rows: mutations } = await pool.query(
      'SELECT * FROM inventory_mutations WHERE product_id = $1 ORDER BY created_at DESC LIMIT 50', [req.params.id]
    );
    res.json({ ...product, batches, mutations });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CREATE product
router.post('/products', auth, async (req, res) => {
  const { code, name, unit, hna, sell_price, category, min_stock } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nama produk wajib diisi' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO product_master (code, name, unit, hna, sell_price, category, min_stock)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [code || null, name.trim(), unit || 'pcs', hna || 0, sell_price || 0, category || '', min_stock || 5]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// UPDATE product
router.put('/products/:id', auth, async (req, res) => {
  const { code, name, unit, hna, sell_price, category, min_stock } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nama produk wajib diisi' });
  try {
    const { rows } = await pool.query(
      `UPDATE product_master SET code=$1, name=$2, unit=$3, hna=$4, sell_price=$5, category=$6, min_stock=$7, updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [code || null, name.trim(), unit || 'pcs', hna || 0, sell_price || 0, category || '', min_stock || 5, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE product (soft)
router.delete('/products/:id', auth, async (req, res) => {
  try {
    const { rowCount } = await pool.query('UPDATE product_master SET is_active = FALSE WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product deactivated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// STOCK IN / OUT
// ══════════════════════════════════════════════════════════════════════════════

// POST stock in (stok masuk)
router.post('/stock-in', auth, async (req, res) => {
  const { product_id, batch_no, expired_date, qty, hna, source_type, source_ref, notes } = req.body;
  if (!product_id || !qty || qty <= 0) return res.status(400).json({ error: 'product_id and qty required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Get product to use its hna as default if not provided
    let finalHna = hna;
    if (!finalHna) {
      const { rows: [product] } = await client.query('SELECT hna FROM product_master WHERE id = $1', [product_id]);
      finalHna = product?.hna || 0;
    }
    
    // Create or update batch
    const { rows: [batch] } = await client.query(
      `INSERT INTO inventory_batches (product_id, batch_no, expired_date, qty_current, hna, source_type, source_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [product_id, batch_no || null, expired_date || null, qty, finalHna, source_type || 'manual', source_ref || null]
    );
    // Record mutation
    await client.query(
      `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, reference_id, notes, created_by)
       VALUES ($1,$2,'in',$3,$4,$5,$6,$7)`,
      [product_id, batch.id, qty, source_type || 'manual', null, notes || '', req.user?.id || null]
    );
    await client.query('COMMIT');
    res.status(201).json(batch);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// POST stock out (stok keluar) — uses FEFO (First Expired, First Out)
router.post('/stock-out', auth, async (req, res) => {
  const { product_id, qty, reference_type, reference_id, notes } = req.body;
  if (!product_id || !qty || qty <= 0) return res.status(400).json({ error: 'product_id and qty required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Get batches sorted by expiry (FEFO)
    const { rows: batches } = await client.query(
      `SELECT * FROM inventory_batches WHERE product_id = $1 AND qty_current > 0
       ORDER BY expired_date ASC NULLS LAST`, [product_id]
    );
    let remaining = qty;
    const totalAvailable = batches.reduce((s, b) => s + b.qty_current, 0);
    if (totalAvailable < qty) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Stok tidak cukup. Tersedia: ${totalAvailable}, Diminta: ${qty}` });
    }
    for (const batch of batches) {
      if (remaining <= 0) break;
      const deduct = Math.min(batch.qty_current, remaining);
      await client.query('UPDATE inventory_batches SET qty_current = qty_current - $1 WHERE id = $2', [deduct, batch.id]);
      await client.query(
        `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, reference_id, notes, created_by)
         VALUES ($1,$2,'out',$3,$4,$5,$6,$7)`,
        [product_id, batch.id, deduct, reference_type || 'manual', reference_id || null, notes || '', req.user?.id || null]
      );
      remaining -= deduct;
    }
    await client.query('COMMIT');
    res.json({ message: `Stok keluar ${qty} berhasil (FEFO)` });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ══════════════════════════════════════════════════════════════════════════════
// STOCK OPNAME
// ══════════════════════════════════════════════════════════════════════════════

// GET opname history
router.get('/opname', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT so.*, pm.name AS product_name, pm.unit
      FROM stock_opname so
      JOIN product_master pm ON pm.id = so.product_id
      ORDER BY so.opname_date DESC, so.created_at DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST opname (record stock check)
router.post('/opname', auth, async (req, res) => {
  const { items } = req.body; // [{ product_id, physical_qty, notes }]
  if (!items?.length) return res.status(400).json({ error: 'items required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const results = [];
    for (const item of items) {
      // Get system qty
      const { rows: [stock] } = await client.query(
        'SELECT COALESCE(SUM(qty_current), 0) AS system_qty FROM inventory_batches WHERE product_id = $1',
        [item.product_id]
      );
      const systemQty = parseInt(stock.system_qty);
      const physicalQty = parseInt(item.physical_qty) || 0;
      const diff = physicalQty - systemQty;

      const { rows: [record] } = await client.query(
        `INSERT INTO stock_opname (product_id, system_qty, physical_qty, difference, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [item.product_id, systemQty, physicalQty, diff, item.notes || '', req.user?.id || null]
      );
      results.push(record);

      // Adjust stock if different (create adjustment mutation)
      if (diff !== 0) {
        const type = diff > 0 ? 'in' : 'out';
        await client.query(
          `INSERT INTO inventory_mutations (product_id, type, qty, reference_type, notes, created_by)
           VALUES ($1,$2,$3,'opname',$4,$5)`,
          [item.product_id, type, Math.abs(diff), `Stok opname adjustment: ${diff > 0 ? '+' : ''}${diff}`, req.user?.id || null]
        );
        // Adjust batch quantities proportionally
        if (diff > 0) {
          // Add to existing batch or create adjustment batch
          await client.query(
            `INSERT INTO inventory_batches (product_id, batch_no, qty_current, source_type, source_ref)
             VALUES ($1, 'OPNAME-ADJ', $2, 'opname', $3)`,
            [item.product_id, diff, `opname-${record.id}`]
          );
        } else {
          // Deduct from oldest batches
          let toDeduct = Math.abs(diff);
          const { rows: batches } = await client.query(
            'SELECT * FROM inventory_batches WHERE product_id = $1 AND qty_current > 0 ORDER BY expired_date ASC NULLS LAST',
            [item.product_id]
          );
          for (const b of batches) {
            if (toDeduct <= 0) break;
            const d = Math.min(b.qty_current, toDeduct);
            await client.query('UPDATE inventory_batches SET qty_current = qty_current - $1 WHERE id = $2', [d, b.id]);
            toDeduct -= d;
          }
        }
      }
    }
    await client.query('COMMIT');
    res.status(201).json(results);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ALERTS
// ══════════════════════════════════════════════════════════════════════════════

router.get('/alerts', auth, async (req, res) => {
  try {
    // Near-expiry batches (within 90 days)
    const { rows: expiring } = await pool.query(`
      SELECT b.*, pm.name AS product_name, pm.unit
      FROM inventory_batches b
      JOIN product_master pm ON pm.id = b.product_id
      WHERE b.qty_current > 0 AND b.expired_date IS NOT NULL
        AND b.expired_date < CURRENT_DATE + INTERVAL '90 days'
      ORDER BY b.expired_date ASC
    `);
    // Low stock products
    const { rows: lowStock } = await pool.query(`
      SELECT pm.*, COALESCE(SUM(b.qty_current), 0) AS total_stock
      FROM product_master pm
      LEFT JOIN inventory_batches b ON b.product_id = pm.id
      WHERE pm.is_active = TRUE
      GROUP BY pm.id
      HAVING COALESCE(SUM(b.qty_current), 0) < pm.min_stock
      ORDER BY pm.name
    `);
    res.json({ expiring, lowStock });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET mutations history
router.get('/mutations', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT m.*, pm.name AS product_name, pm.unit
      FROM inventory_mutations m
      JOIN product_master pm ON pm.id = m.product_id
      ORDER BY m.created_at DESC
      LIMIT 100
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET FEFO batch HNA for a product (for auto-fill in sales order)
router.get('/fefo-hna/:productId', auth, async (req, res) => {
  try {
    const { rows: [batch] } = await pool.query(`
      SELECT hna
      FROM inventory_batches
      WHERE product_id = $1 AND qty_current > 0
      ORDER BY expired_date ASC NULLS LAST
      LIMIT 1
    `, [req.params.productId]);
    
    if (batch) {
      res.json({ hna: batch.hna || 0 });
    } else {
      // No active batch, return product master HNA
      const { rows: [product] } = await pool.query('SELECT hna FROM product_master WHERE id = $1', [req.params.productId]);
      res.json({ hna: product?.hna || 0 });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
