const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

// Ensure updated invoices table schema
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
      ADD COLUMN IF NOT EXISTS harga_per_produk DECIMAL(15,2)
  `);
  await pool.query(`
    ALTER TABLE invoice_items
      ADD COLUMN IF NOT EXISTS expired_date DATE,
      ADD COLUMN IF NOT EXISTS hna DECIMAL(15,2),
      ADD COLUMN IF NOT EXISTS hna_times_qty DECIMAL(15,2),
      ADD COLUMN IF NOT EXISTS disc_percent DECIMAL(5,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS disc_nominal DECIMAL(15,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS hna_baru DECIMAL(15,2)
  `);
};
ensureSchema().catch(console.error);

// GET all invoices with item count
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.*,
        COUNT(ii.id) AS item_count,
        SUM(ii.quantity) AS total_qty
      FROM invoices i
      LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
      GROUP BY i.id
      ORDER BY i.purchase_date DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single invoice with items
router.get('/:id', auth, async (req, res) => {
  try {
    const invoiceResult = await pool.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    if (invoiceResult.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    const itemsResult = await pool.query('SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id', [req.params.id]);
    res.json({ invoice: invoiceResult.rows[0], items: itemsResult.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE new invoice
router.post('/', auth, async (req, res) => {
  const {
    invoice_number, purchase_date, distributor_name,
    total_hna, discount_amount, hna_baru,
    disc_cod_ada, disc_cod_amount, hna_final, final_hna,
    ppn_masukan, ppn_input, ppn_pembulatan,
    hna_plus_ppn, harga_per_produk,
    payment_date, status, items
  } = req.body;

  const resolvedHnaFinal = hna_final ?? final_hna ?? null;
  const resolvedPpn = ppn_masukan ?? ppn_input ?? null;

  try {
    const invoiceResult = await pool.query(
      `INSERT INTO invoices 
        (invoice_number, purchase_date, distributor_name,
         total_hna, discount_amount, hna_baru,
         disc_cod_ada, disc_cod_amount,
         hna_final, ppn_input, ppn_masukan, ppn_pembulatan,
         hna_plus_ppn, harga_per_produk,
         payment_date, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        invoice_number, purchase_date, distributor_name,
        total_hna||null, discount_amount||null, hna_baru||null,
        disc_cod_ada||false, disc_cod_amount||null,
        resolvedHnaFinal, resolvedPpn, resolvedPpn, ppn_pembulatan||null,
        hna_plus_ppn||null, harga_per_produk||null,
        payment_date||null, status||'Pending'
      ]
    );

    const invoiceId = invoiceResult.rows[0].id;

    if (items && items.length > 0) {
      for (const item of items) {
        await pool.query(
          `INSERT INTO invoice_items 
            (invoice_id, product_name, quantity, unit_price, total_price,
             expired_date, hna, hna_times_qty, disc_percent, disc_nominal, hna_baru, margin)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [invoiceId, item.product_name, item.quantity||0,
           item.unit_price||item.hna||0, item.total_price||item.hna_times_qty||0,
           item.expired_date||null, item.hna||0, item.hna_times_qty||0,
           item.disc_percent||0, item.disc_nominal||0, item.hna_baru||0, item.margin||0]
        );
      }
    }

    if (global.io) global.io.emit('invoiceCreated', invoiceResult.rows[0]);
    res.status(201).json({ invoice: invoiceResult.rows[0], items: items||[] });
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
    payment_date, status, items
  } = req.body;

  const resolvedHnaFinal = hna_final ?? final_hna ?? null;
  const resolvedPpn = ppn_masukan ?? ppn_input ?? null;

  try {
    const result = await pool.query(
      `UPDATE invoices SET
        invoice_number=$1, purchase_date=$2, distributor_name=$3,
        total_hna=$4, discount_amount=$5, hna_baru=$6,
        disc_cod_ada=$7, disc_cod_amount=$8,
        hna_final=$9, ppn_input=$10, ppn_masukan=$11, ppn_pembulatan=$12,
        hna_plus_ppn=$13, harga_per_produk=$14,
        payment_date=$15, status=$16
       WHERE id=$17 RETURNING *`,
      [
        invoice_number, purchase_date, distributor_name,
        total_hna||null, discount_amount||null, hna_baru||null,
        disc_cod_ada||false, disc_cod_amount||null,
        resolvedHnaFinal, resolvedPpn, resolvedPpn, ppn_pembulatan||null,
        hna_plus_ppn||null, harga_per_produk||null,
        payment_date||null, status||'Pending', id
      ]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });

    if (items !== undefined) {
      await pool.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);
      if (items && items.length > 0) {
        for (const item of items) {
          await pool.query(
            `INSERT INTO invoice_items 
              (invoice_id, product_name, quantity, unit_price, total_price,
               expired_date, hna, hna_times_qty, disc_percent, disc_nominal, hna_baru, margin)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [id, item.product_name, item.quantity||0,
             item.unit_price||item.hna||0, item.total_price||item.hna_times_qty||0,
             item.expired_date||null, item.hna||0, item.hna_times_qty||0,
             item.disc_percent||0, item.disc_nominal||0, item.hna_baru||0, item.margin||0]
          );
        }
      }
    }

    if (global.io) global.io.emit('invoiceUpdated', result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update invoice error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE invoice
router.delete('/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM invoice_items WHERE invoice_id = $1', [req.params.id]);
    const result = await pool.query('DELETE FROM invoices WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    if (global.io) global.io.emit('invoiceDeleted', { id: req.params.id });
    res.json({ message: 'Invoice deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
