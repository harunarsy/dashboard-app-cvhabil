const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
require('dotenv').config();

const poolConfig = process.env.DATABASE_URL 
  ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
  : {
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME ?? process.env.DB_DATABASE,
      ssl: false
    };

const pool = new Pool(poolConfig);

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
  const { title, description, status, priority, due_date } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO tasks (title, description, status, priority, due_date) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [title, description, status || 'todo', priority || 'medium', due_date]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update task (status, priority, etc)
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description, status, priority, due_date } = req.body;
  try {
    const result = await pool.query(
      'UPDATE tasks SET title = $1, description = $2, status = $3, priority = $4, due_date = $5 WHERE id = $6 RETURNING *',
      [title, description, status, priority, due_date, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Soft DELETE task (move to trash)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('UPDATE tasks SET is_deleted = true WHERE id = $1', [id]);
    res.status(204).send();
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

module.exports = router;
