const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// GET /api/settings/counters
// v1.8.2: untuk doc_type NOTA, compute next_preview dengan YYMM dynamic per current month.
// Sync last_number ke MAX active nota bulan ini supaya preview accurate dgn historical state.
router.get('/counters', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM document_counters ORDER BY id ASC');
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const currentYymm = `${yy}${mm}`;

    const enriched = await Promise.all(rows.map(async (counter) => {
      if (counter.doc_type !== 'NOTA') {
        return { ...counter, next_preview: null };
      }
      const monthPrefix = `HSB-NOTA-${currentYymm}`;
      // v1.8.3 fix: SUBSTRING(... FROM $param) treats param as REGEX pattern, bukan position
      // (matches literal digits di string → MAX salah). Pakai REPLACE prefix → cast INT.
      const { rows: [maxRow] } = await pool.query(
        `SELECT COALESCE(MAX(CAST(REPLACE(order_number, $1, '') AS INTEGER)), 0) AS max_num
         FROM sales_orders WHERE is_deleted = FALSE AND order_number LIKE $2`,
        [monthPrefix, `${monthPrefix}%`]
      );
      const nextNum = (parseInt(maxRow.max_num) || 0) + 1;
      const nextPreview = `${monthPrefix}${String(nextNum).padStart(3, '0')}`;
      return { ...counter, next_preview: nextPreview, current_yymm: currentYymm, month_max: maxRow.max_num };
    }));
    res.json(enriched);
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
