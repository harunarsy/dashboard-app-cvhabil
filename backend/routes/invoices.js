const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

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
      ADD COLUMN IF NOT EXISTS draft_data JSONB
  `);
  await pool.query(`
    ALTER TABLE invoice_items
      ADD COLUMN IF NOT EXISTS expired_date DATE,
      ADD COLUMN IF NOT EXISTS hna DECIMAL(15,2),
      ADD COLUMN IF NOT EXISTS hna_times_qty DECIMAL(15,2),
      ADD COLUMN IF NOT EXISTS disc_percent DECIMAL(5,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS disc_nominal DECIMAL(15,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS hna_baru DECIMAL(15,2),
      ADD COLUMN IF NOT EXISTS hna_per_item DECIMAL(15,2)
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
  // Ensure newer columns exist in invoice_items
  await pool.query(`
    ALTER TABLE invoice_items
      ADD COLUMN IF NOT EXISTS hpp_inc_ppn DECIMAL(15,2) DEFAULT 0
  `);

  // Data Migration: Populate missing hpp_inc_ppn and hna_per_item for old records
  await pool.query(`
    UPDATE invoice_items 
    SET 
      hna_per_item = CASE WHEN quantity > 0 AND hna_baru > 0 THEN hna_baru / quantity ELSE hna_per_item END,
      hpp_inc_ppn = CASE WHEN quantity > 0 AND hna_baru > 0 THEN (hna_baru / quantity) * 1.11 ELSE hpp_inc_ppn END
    WHERE (hpp_inc_ppn = 0 OR hna_per_item = 0) AND quantity > 0 AND hna_baru > 0
  `);
};
ensureSchema().catch(console.error);

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

// GET all invoices
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.*,
        COUNT(ii.id) AS item_count,
        SUM(ii.quantity) AS total_qty,
        COALESCE(string_agg(DISTINCT ii.product_name, ', '), '') AS product_names
      FROM invoices i
      LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
      WHERE i.deleted_at IS NULL AND (i.is_draft IS NULL OR i.is_draft = FALSE)
      GROUP BY i.id
      ORDER BY i.purchase_date DESC
    `);
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
    const result = await pool.query(
      `SELECT * FROM invoices WHERE is_draft = TRUE AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1`
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
    const inv = await pool.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    if (!inv.rows.length) return res.status(404).json({ error: 'Not found' });
    const items = await pool.query('SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id', [req.params.id]);
    res.json({ invoice: inv.rows[0], items: items.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// SAVE DRAFT
router.post('/draft', auth, async (req, res) => {
  const { draft_data } = req.body;
  try {
    const existing = await pool.query(`SELECT id FROM invoices WHERE is_draft = TRUE AND deleted_at IS NULL LIMIT 1`);
    if (existing.rows.length > 0) {
      await pool.query(`UPDATE invoices SET draft_data = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(draft_data), existing.rows[0].id]);
      res.json({ id: existing.rows[0].id, saved: true });
    } else {
      const r = await pool.query(
        `INSERT INTO invoices (invoice_number, purchase_date, distributor_name, status, is_draft, draft_data)
         VALUES ('DRAFT-' || extract(epoch from now())::bigint, NOW(), 'DRAFT', 'Pending', TRUE, $1) RETURNING id`,
        [JSON.stringify(draft_data)]
      );
      res.json({ id: r.rows[0].id, saved: true });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE DRAFT
router.delete('/draft/clear', auth, async (req, res) => {
  try {
    await pool.query(`DELETE FROM invoices WHERE is_draft = TRUE`);
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

  const resolvedHnaFinal = hna_final ?? final_hna ?? null;
  const resolvedPpn = ppn_masukan ?? ppn_input ?? null;

  try {
    const existing = await pool.query(
      'SELECT id FROM invoices WHERE invoice_number = $1 AND deleted_at IS NULL AND (is_draft IS NULL OR is_draft = FALSE)',
      [invoice_number]
    );

    let invoiceId;
    if (existing.rows.length > 0) {
      invoiceId = existing.rows[0].id;
      // snapshot before update
      const snap = await pool.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
      await logAudit(invoiceId, invoice_number, 'UPDATE', snap.rows[0], null, 'Overwrite via POST');

      await pool.query(
        `UPDATE invoices SET purchase_date=$1, distributor_name=$2,
          total_hna=$3, discount_amount=$4, hna_baru=$5,
          disc_cod_ada=$6, disc_cod_amount=$7,
          hna_final=$8, ppn_input=$9, ppn_masukan=$10, ppn_pembulatan=$11,
          hna_plus_ppn=$12, harga_per_produk=$13,
          due_date=$14, payment_date=$15, status=$16, updated_at=NOW()
        WHERE id=$17`,
        [purchase_date, distributor_name,
         total_hna||null, discount_amount||null, hna_baru||null,
         disc_cod_ada||false, disc_cod_amount||null,
         resolvedHnaFinal, resolvedPpn, resolvedPpn, ppn_pembulatan||null,
         hna_plus_ppn||null, harga_per_produk||null,
         due_date||null, payment_date||null, status||'Pending', invoiceId]
      );
    } else {
      const r = await pool.query(
        `INSERT INTO invoices
          (invoice_number, purchase_date, distributor_name,
           total_hna, discount_amount, hna_baru,
           disc_cod_ada, disc_cod_amount,
           hna_final, ppn_input, ppn_masukan, ppn_pembulatan,
           hna_plus_ppn, harga_per_produk,
           due_date, payment_date, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
        [invoice_number, purchase_date, distributor_name,
         total_hna||null, discount_amount||null, hna_baru||null,
         disc_cod_ada||false, disc_cod_amount||null,
         resolvedHnaFinal, resolvedPpn, resolvedPpn, ppn_pembulatan||null,
         hna_plus_ppn||null, harga_per_produk||null,
         due_date||null, payment_date||null, status||'Pending']
      );
      invoiceId = r.rows[0].id;
      await logAudit(invoiceId, invoice_number, 'CREATE', { invoice_number, distributor_name, status, hna_final: resolvedHnaFinal, hna_plus_ppn });
    }

    await pool.query('DELETE FROM invoice_items WHERE invoice_id = $1', [invoiceId]);
    if (items && items.length > 0) {
      for (const item of items) {
        await pool.query(
          `INSERT INTO invoice_items
            (invoice_id, product_name, quantity, unit_price, total_price,
             expired_date, hna, hna_times_qty, disc_percent, disc_nominal, hna_baru, hna_per_item, margin,
             disc_cod_per_item, hna_after_cod, hpp_inc_ppn)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [invoiceId, item.product_name, item.quantity||0,
           item.unit_price||item.hna||0, item.total_price||item.hna_times_qty||0,
           item.expired_date||null, item.hna||0, item.hna_times_qty||0,
           item.disc_percent||0, item.disc_nominal||0, item.hna_baru||0,
           item.hna_per_item||0, item.margin||0,
           item.disc_cod_per_item||0, item.hna_after_cod||0, item.hpp_inc_ppn||0]
        );
      }
    }

    await pool.query(`DELETE FROM invoices WHERE is_draft = TRUE`);

    // ─── Auto Stock-In: Faktur → Inventory ──────────────────────────────
    // Each invoice item gets added to inventory_batches + inventory_mutations
    if (items && items.length > 0) {
      for (const item of items) {
        // Find product in product_master by name
        const { rows: [product] } = await pool.query(
          'SELECT id FROM product_master WHERE LOWER(name) = LOWER($1) AND is_active = TRUE LIMIT 1',
          [item.product_name]
        );
        if (product && (item.quantity || 0) > 0) {
          // Create inventory batch
          const { rows: [batch] } = await pool.query(
            `INSERT INTO inventory_batches (product_id, batch_no, expired_date, qty_current, source_type, source_ref)
             VALUES ($1, $2, $3, $4, 'faktur', $5) RETURNING id`,
            [product.id, invoice_number, item.expired_date || null, item.quantity, `invoice-${invoiceId}`]
          );
          // Record mutation
          await pool.query(
            `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, reference_id, notes)
             VALUES ($1, $2, 'in', $3, 'faktur', $4, $5)`,
            [product.id, batch.id, item.quantity, invoiceId, `Stok masuk dari faktur ${invoice_number}`]
          );
        }
      }
    }

    const final = await pool.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
    if (global.io) global.io.emit('invoiceCreated', final.rows[0]);
    res.status(201).json({ invoice: final.rows[0], items: items||[] });
  } catch (err) {
    console.error('Create invoice error:', err);
    res.status(500).json({ error: err.message });
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

  const resolvedHnaFinal = hna_final ?? final_hna ?? null;
  const resolvedPpn = ppn_masukan ?? ppn_input ?? null;

  try {
    // snapshot before
    const snap = await pool.query('SELECT * FROM invoices WHERE id = $1', [id]);
    const beforeSnap = snap.rows[0] || null;

    const result = await pool.query(
      `UPDATE invoices SET
        invoice_number=$1, purchase_date=$2, distributor_name=$3,
        total_hna=$4, discount_amount=$5, hna_baru=$6,
        disc_cod_ada=$7, disc_cod_amount=$8,
        hna_final=$9, ppn_input=$10, ppn_masukan=$11, ppn_pembulatan=$12,
        hna_plus_ppn=$13, harga_per_produk=$14,
        due_date=$15, payment_date=$16, status=$17,
        updated_at=NOW()
       WHERE id=$18 RETURNING *`,
      [invoice_number, purchase_date, distributor_name,
       total_hna||null, discount_amount||null, hna_baru||null,
       disc_cod_ada||false, disc_cod_amount||null,
       resolvedHnaFinal, resolvedPpn, resolvedPpn, ppn_pembulatan||null,
       hna_plus_ppn||null, harga_per_produk||null,
       due_date||null, payment_date||null, status||'Pending', id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    if (beforeSnap) {
      const afterSnap = result.rows[0];
      const TRACK = ['invoice_number','purchase_date','distributor_name','status','hna_final','hna_plus_ppn','disc_cod_amount','due_date','payment_date'];
      const before = {}; const after = {};
      TRACK.forEach(k => { if (String(beforeSnap[k]||'') !== String(afterSnap[k]||'')) { before[k] = beforeSnap[k]; after[k] = afterSnap[k]; } });
      if (Object.keys(before).length > 0) await logAudit(id, afterSnap.invoice_number, 'UPDATE', { before, after }, 'Field(s) changed: ' + Object.keys(before).join(', '));
    }

    if (items !== undefined) {
      await pool.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);
      for (const item of (items || [])) {
        await pool.query(
          `INSERT INTO invoice_items
            (invoice_id, product_name, quantity, unit_price, total_price,
             expired_date, hna, hna_times_qty, disc_percent, disc_nominal, hna_baru, hna_per_item, margin,
             disc_cod_per_item, hna_after_cod, hpp_inc_ppn)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [id, item.product_name, item.quantity||0,
           item.unit_price||item.hna||0, item.total_price||item.hna_times_qty||0,
           item.expired_date||null, item.hna||0, item.hna_times_qty||0,
           item.disc_percent||0, item.disc_nominal||0, item.hna_baru||0,
           item.hna_per_item||0, item.margin||0,
           item.disc_cod_per_item||0, item.hna_after_cod||0, item.hpp_inc_ppn||0]
        );
      }
    }

    if (global.io) global.io.emit('invoiceUpdated', result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// SOFT DELETE
router.delete('/:id', auth, async (req, res) => {
  try {
    const snap = await pool.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    if (snap.rows.length) await logAudit(req.params.id, snap.rows[0].invoice_number, 'DELETE', snap.rows[0]);
    const result = await pool.query(
      'UPDATE invoices SET deleted_at = NOW() WHERE id = $1 RETURNING *', [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    if (global.io) global.io.emit('invoiceDeleted', { id: req.params.id });
    res.json({ message: 'Moved to trash', invoice: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  try {
    const snap = await pool.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    if (snap.rows.length) await logAudit(req.params.id, snap.rows[0].invoice_number, 'PERMANENT_DELETE', snap.rows[0]);
    await pool.query('DELETE FROM invoice_items WHERE invoice_id = $1', [req.params.id]);
    await pool.query('DELETE FROM invoices WHERE id = $1', [req.params.id]);
    res.json({ message: 'Permanently deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;