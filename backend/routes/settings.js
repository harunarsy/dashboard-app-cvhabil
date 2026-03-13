const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// GET /api/settings/counters
router.get('/counters', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM document_counters ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching counters:', err);
    res.status(500).json({ error: 'Failed to fetch counters' });
  }
});

// PUT /api/settings/counters/:doc_type
router.put('/counters/:doc_type', async (req, res) => {
  const { doc_type } = req.params;
  const { last_number, is_locked } = req.body;
  
  try {
    const { rows } = await pool.query(
      'UPDATE document_counters SET last_number = $1, is_locked = $2, updated_at = CURRENT_TIMESTAMP WHERE doc_type = $3 RETURNING *',
      [last_number, is_locked, doc_type]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Counter not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating counter:', err);
    res.status(500).json({ error: 'Failed to update counter' });
  }
});

module.exports = router;
