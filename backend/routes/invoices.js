const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

// ==================== INVOICES ENDPOINTS ====================

// GET all invoices
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM invoices ORDER BY purchase_date DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get invoices error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET single invoice with items
router.get('/:id', auth, async (req, res) => {
  try {
    const invoiceResult = await pool.query(
      'SELECT * FROM invoices WHERE id = $1',
      [req.params.id]
    );

    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const itemsResult = await pool.query(
      'SELECT * FROM invoice_items WHERE invoice_id = $1',
      [req.params.id]
    );

    res.json({
      invoice: invoiceResult.rows[0],
      items: itemsResult.rows
    });
  } catch (err) {
    console.error('Get invoice error:', err);
    res.status(500).json({ error: err.message });
  }
});

// CREATE new invoice
router.post('/', auth, async (req, res) => {
  const {
    invoice_number,
    purchase_date,
    distributor_name,
    total_hna,
    discount_amount,
    ppn_input,
    final_hna,
    payment_date,
    status,
    items
  } = req.body;

  try {
    // Insert invoice
    const invoiceResult = await pool.query(
      `INSERT INTO invoices 
        (invoice_number, purchase_date, distributor_name, total_hna, 
         discount_amount, ppn_input, final_hna, payment_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [invoice_number, purchase_date, distributor_name, total_hna,
       discount_amount, ppn_input, final_hna, payment_date, status]
    );

    const invoiceId = invoiceResult.rows[0].id;

    // Insert items if provided
    if (items && items.length > 0) {
      for (const item of items) {
        await pool.query(
          `INSERT INTO invoice_items 
            (invoice_id, product_name, quantity, unit_price, total_price, margin)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [invoiceId, item.product_name, item.quantity, item.unit_price,
           item.total_price, item.margin]
        );
      }
    }

    // Emit real-time update
    if (global.io) {
      global.io.emit('invoiceCreated', invoiceResult.rows[0]);
    }

    res.status(201).json({
      invoice: invoiceResult.rows[0],
      items: items || []
    });
  } catch (err) {
    console.error('Create invoice error:', err);
    res.status(500).json({ error: err.message });
  }
});

// UPDATE invoice
router.put('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const {
    invoice_number,
    purchase_date,
    distributor_name,
    total_hna,
    discount_amount,
    ppn_input,
    final_hna,
    payment_date,
    status
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE invoices 
       SET invoice_number=$1, purchase_date=$2, distributor_name=$3, 
           total_hna=$4, discount_amount=$5, ppn_input=$6, 
           final_hna=$7, payment_date=$8, status=$9
       WHERE id=$10
       RETURNING *`,
      [invoice_number, purchase_date, distributor_name, total_hna,
       discount_amount, ppn_input, final_hna, payment_date, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (global.io) {
      global.io.emit('invoiceUpdated', result.rows[0]);
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update invoice error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE invoice
router.delete('/:id', auth, async (req, res) => {
  try {
    // Delete items first
    await pool.query(
      'DELETE FROM invoice_items WHERE invoice_id = $1',
      [req.params.id]
    );

    // Delete invoice
    const result = await pool.query(
      'DELETE FROM invoices WHERE id = $1 RETURNING *',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (global.io) {
      global.io.emit('invoiceDeleted', { id: req.params.id });
    }

    res.json({ message: 'Invoice deleted successfully' });
  } catch (err) {
    console.error('Delete invoice error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;