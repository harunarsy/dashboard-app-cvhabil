const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

// GET all distributors
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT DISTINCT distributor_name FROM invoices WHERE distributor_name IS NOT NULL ORDER BY distributor_name'
    );
    const distributors = result.rows.map(row => ({ name: row.distributor_name }));
    res.json(distributors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADD new distributor (optional - just returns the name)
router.post('/', auth, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  res.json({ name, message: 'Distributor can be used' });
});

module.exports = router;