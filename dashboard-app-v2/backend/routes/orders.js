const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

// Get all orders
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM orders ORDER BY created_at DESC LIMIT 100'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get orders error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create new order
router.post('/', auth, async (req, res) => {
  const { order_number, customer_name, customer_email, total_amount } = req.body;
  
  if (!order_number || !customer_name || !total_amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  try {
    const result = await pool.query(
      `INSERT INTO orders (order_number, customer_name, customer_email, total_amount, status) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [order_number, customer_name, customer_email, total_amount, 'pending']
    );
    
    // Emit real-time update to all connected clients
    if (global.io) {
      global.io.emit('orderCreated', result.rows[0]);
    }
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update order status
router.put('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  if (!status) {
    return res.status(400).json({ error: 'Status required' });
  }
  
  try {
    const result = await pool.query(
      `UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [status, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    if (global.io) {
      global.io.emit('orderUpdated', result.rows[0]);
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update order error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;