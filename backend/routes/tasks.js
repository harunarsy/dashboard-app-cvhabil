const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// GET all tasks
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tasks WHERE is_deleted = false ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new task
router.post('/', async (req, res) => {
  const { title, description, status, priority, due_date, pic } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO tasks (title, description, status, priority, due_date, pic) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [title, description, status || 'todo', priority || 'medium', due_date, pic]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update task (status, priority, etc)
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description, status, priority, due_date, pic } = req.body;
  try {
    const result = await pool.query(
      'UPDATE tasks SET title = $1, description = $2, status = $3, priority = $4, due_date = $5, pic = $6 WHERE id = $7 RETURNING *',
      [title, description, status, priority, due_date, pic, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET task history
router.get('/:id/history', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM task_history WHERE task_id = $1 ORDER BY changed_at DESC',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// PATCH soft-delete task (is_deleted = true)
router.patch('/:id/soft-delete', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'UPDATE tasks SET is_deleted = TRUE WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.json({ success: true, task: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE task (hard delete - fallback)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('UPDATE tasks SET is_deleted = TRUE WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
