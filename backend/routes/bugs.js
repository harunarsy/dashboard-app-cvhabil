const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

// POST — submit bug report (no auth required, user bisa submit)
router.post('/', async (req, res) => {
  const { title, description, steps, contact, reported_at, user_agent, type } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
  try {
    const r = await pool.query(
      `INSERT INTO bug_reports (title, description, steps, contact, user_agent, reported_at, type)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [title, description||'', steps||'', contact||'', user_agent||'', reported_at||new Date(), type||'bug']
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all bugs — admin only (with limit)
router.get('/', auth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    const r = await pool.query('SELECT * FROM bug_reports ORDER BY reported_at DESC LIMIT $1', [limit]);
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH — update bug status (open/in_progress/resolved)
router.patch('/:id', auth, async (req, res) => {
  const { status } = req.body;
  try {
    const r = await pool.query(
      `UPDATE bug_reports SET status=$1 WHERE id=$2 RETURNING *`,
      [status, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
