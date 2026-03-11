const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');

// ─── Auto-create tables ─────────────────────────────────────────────────────
const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ledger_entries (
      id SERIAL PRIMARY KEY,
      entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
      account_name VARCHAR(255) NOT NULL,
      description TEXT,
      debit DECIMAL(15,2) DEFAULT 0,
      credit DECIMAL(15,2) DEFAULT 0,
      category VARCHAR(50),
      reference_type VARCHAR(30),
      reference_id INT,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_ledger_date ON ledger_entries(entry_date DESC);
    CREATE INDEX IF NOT EXISTS idx_ledger_category ON ledger_entries(category);
    CREATE INDEX IF NOT EXISTS idx_ledger_account ON ledger_entries(account_name);
  `);
};
ensureSchema().catch(e => console.error('ledger ensureSchema:', e));

// All ledger routes are Direktur-only
router.use(auth, roleGuard('direktur'));

// GET all entries with optional filters
router.get('/', async (req, res) => {
  const { month, category, account } = req.query;
  try {
    let query = 'SELECT * FROM ledger_entries WHERE 1=1';
    const params = [];
    if (month) { params.push(month); query += ` AND DATE_TRUNC('month', entry_date) = $${params.length}::date`; }
    if (category) { params.push(category); query += ` AND category = $${params.length}`; }
    if (account) { params.push(`%${account}%`); query += ` AND account_name ILIKE $${params.length}`; }
    query += ' ORDER BY entry_date DESC, id DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET summary (balance sheet overview)
router.get('/summary', async (req, res) => {
  try {
    const { rows: byCategory } = await pool.query(`
      SELECT category,
        SUM(debit) AS total_debit, SUM(credit) AS total_credit,
        SUM(debit) - SUM(credit) AS balance
      FROM ledger_entries
      GROUP BY category
      ORDER BY category
    `);
    const { rows: monthly } = await pool.query(`
      SELECT DATE_TRUNC('month', entry_date) AS month,
        SUM(debit) AS total_debit, SUM(credit) AS total_credit,
        SUM(debit) - SUM(credit) AS net
      FROM ledger_entries
      GROUP BY DATE_TRUNC('month', entry_date)
      ORDER BY month DESC LIMIT 12
    `);
    const { rows: [totals] } = await pool.query(`
      SELECT SUM(debit) AS total_debit, SUM(credit) AS total_credit,
        SUM(debit) - SUM(credit) AS net_balance
      FROM ledger_entries
    `);
    res.json({ byCategory, monthly, totals: totals || { total_debit: 0, total_credit: 0, net_balance: 0 } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CREATE entry
router.post('/', async (req, res) => {
  const { entry_date, account_name, description, debit, credit, category, reference_type, reference_id } = req.body;
  if (!account_name?.trim()) return res.status(400).json({ error: 'Account name required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO ledger_entries (entry_date, account_name, description, debit, credit, category, reference_type, reference_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [entry_date || new Date(), account_name.trim(), description || '', debit || 0, credit || 0, category || 'general', reference_type || null, reference_id || null, req.user?.id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// UPDATE entry
router.put('/:id', async (req, res) => {
  const { entry_date, account_name, description, debit, credit, category } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE ledger_entries SET entry_date=COALESCE($1,entry_date), account_name=COALESCE($2,account_name),
       description=COALESCE($3,description), debit=COALESCE($4,debit), credit=COALESCE($5,credit),
       category=COALESCE($6,category) WHERE id=$7 RETURNING *`,
      [entry_date, account_name, description, debit, credit, category, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Entry not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE entry
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM ledger_entries WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Entry deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
