const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

const DEFAULT_PROFIT_THRESHOLDS = {
  high: 20,
  normal: 5,
  thin: 0
};

const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id SERIAL PRIMARY KEY,
      setting_key VARCHAR(50) UNIQUE NOT NULL,
      setting_value JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value)
     VALUES ('profit_thresholds', $1::jsonb)
     ON CONFLICT (setting_key) DO NOTHING`,
    [JSON.stringify(DEFAULT_PROFIT_THRESHOLDS)]
  );
};
ensureSchema().catch(console.error);

router.use(auth);

const parseThresholds = (value = {}) => {
  const raw = value && typeof value === 'object' ? value : {};
  const toNumber = (input, fallback) => {
    const parsed = Number.parseFloat(input);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  return {
    high: toNumber(raw.high, DEFAULT_PROFIT_THRESHOLDS.high),
    normal: toNumber(raw.normal, DEFAULT_PROFIT_THRESHOLDS.normal),
    thin: toNumber(raw.thin, DEFAULT_PROFIT_THRESHOLDS.thin),
  };
};

const readProfitThresholds = async () => {
  const { rows } = await pool.query(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'profit_thresholds' LIMIT 1`
  );
  const value = rows[0]?.setting_value || DEFAULT_PROFIT_THRESHOLDS;
  return parseThresholds(value);
};

const ALLOWED_COUNTER_DOC_TYPES = new Set(['NOTA', 'SP']);
const parseBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  }
  return Boolean(value);
};

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

// GET /api/settings/profit-thresholds
router.get('/profit-thresholds', async (req, res) => {
  try {
    const profit_thresholds = await readProfitThresholds();
    res.json({ profit_thresholds });
  } catch (err) {
    console.error('Error fetching profit thresholds:', err);
    res.status(500).json({ error: 'Failed to fetch profit thresholds' });
  }
});

// PUT /api/settings/profit-thresholds
router.put('/profit-thresholds', async (req, res) => {
  const payload = req.body?.profit_thresholds || req.body || {};
  const profit_thresholds = parseThresholds(payload);

  try {
    await pool.query(
      `INSERT INTO app_settings (setting_key, setting_value, updated_at)
       VALUES ('profit_thresholds', $1::jsonb, NOW())
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
      [JSON.stringify(profit_thresholds)]
    );
    res.json({ profit_thresholds });
  } catch (err) {
    console.error('Error updating profit thresholds:', err);
    res.status(500).json({ error: 'Failed to update profit thresholds' });
  }
});

// PUT /api/settings/counters/:doc_type
router.put('/counters/:doc_type', async (req, res) => {
  const { doc_type } = req.params;
  const parsedLastNumber = Number.parseInt(req.body?.last_number, 10);
  const is_locked = parseBoolean(req.body?.is_locked);

  if (!ALLOWED_COUNTER_DOC_TYPES.has(doc_type)) {
    return res.status(400).json({ error: 'Unsupported counter type' });
  }
  if (!Number.isInteger(parsedLastNumber) || parsedLastNumber < 0) {
    return res.status(400).json({ error: 'last_number must be a non-negative integer' });
  }
  
  try {
    const { rows } = await pool.query(
      'UPDATE document_counters SET last_number = $1, is_locked = $2, updated_at = CURRENT_TIMESTAMP WHERE doc_type = $3 RETURNING *',
      [parsedLastNumber, is_locked, doc_type]
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
