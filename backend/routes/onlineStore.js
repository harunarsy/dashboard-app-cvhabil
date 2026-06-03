const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

// ─── Auto-create tables ─────────────────────────────────────────────────────
const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS online_store_sales (
      id SERIAL PRIMARY KEY,
      platform VARCHAR(30) NOT NULL,
      order_id VARCHAR(100),
      order_date DATE,
      product_name VARCHAR(255),
      qty INT DEFAULT 1,
      sell_price DECIMAL(15,2) DEFAULT 0,
      shipping_fee DECIMAL(15,2) DEFAULT 0,
      platform_fee DECIMAL(15,2) DEFAULT 0,
      net_amount DECIMAL(15,2) DEFAULT 0,
      buyer_name VARCHAR(255),
      status VARCHAR(30) DEFAULT 'completed',
      batch_import_id VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS online_store_withdrawals (
      id SERIAL PRIMARY KEY,
      platform VARCHAR(30) NOT NULL,
      amount DECIMAL(15,2) NOT NULL,
      withdrawal_date DATE DEFAULT CURRENT_DATE,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_oss_platform ON online_store_sales(platform);
    CREATE INDEX IF NOT EXISTS idx_oss_date ON online_store_sales(order_date DESC);
    CREATE INDEX IF NOT EXISTS idx_oss_batch ON online_store_sales(batch_import_id);
  `);
};
ensureSchema().catch(e => console.error('online_store ensureSchema:', e));

// ══════════════════════════════════════════════════════════════════════════════
// CSV IMPORT
// ══════════════════════════════════════════════════════════════════════════════

// Parse CSV text into rows (handles quoted fields)
function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = [];
    let current = '', inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { values.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    values.push(current.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
}

// Map Shopee CSV columns to our schema
function mapShopee(row) {
  return {
    platform: 'shopee',
    order_id: row['No. Pesanan'] || row['Order ID'] || '',
    order_date: row['Waktu Pesanan Dibuat'] || row['Order Creation Date'] || null,
    product_name: row['Nama Produk'] || row['Product Name'] || '',
    qty: parseInt(row['Jumlah'] || row['Quantity'] || 1),
    sell_price: parseFloat(row['Harga Awal'] || row['Original Price'] || 0),
    shipping_fee: parseFloat(row['Ongkos Kirim'] || row['Shipping Fee'] || 0),
    platform_fee: parseFloat(row['Biaya Layanan'] || row['Service Fee'] || 0),
    buyer_name: row['Username (Pembeli)'] || row['Buyer Username'] || '',
    status: row['Status Pesanan'] || row['Order Status'] || 'completed',
  };
}

// Map TikTok CSV columns to our schema
function mapTikTok(row) {
  return {
    platform: 'tiktok',
    order_id: row['Order ID'] || row['No. Pesanan'] || '',
    order_date: row['Created Time'] || row['Waktu Dibuat'] || null,
    product_name: row['Product Name'] || row['Nama Produk'] || '',
    qty: parseInt(row['Quantity'] || row['Jumlah'] || 1),
    sell_price: parseFloat(row['SKU Unit Original Price'] || row['Harga'] || 0),
    shipping_fee: parseFloat(row['Shipping Fee Paid by Buyer'] || row['Ongkir'] || 0),
    platform_fee: parseFloat(row['Platform Fee'] || row['Biaya Platform'] || 0),
    buyer_name: row['Buyer'] || row['Pembeli'] || '',
    status: row['Order Status'] || 'completed',
  };
}

// POST import CSV
router.post('/import', auth, async (req, res) => {
  const { platform, csv_text } = req.body;
  if (!csv_text?.trim()) return res.status(400).json({ error: 'CSV data required' });

  const mapper = platform === 'tiktok' ? mapTikTok : mapShopee;
  const rows = parseCSV(csv_text);
  if (!rows.length) return res.status(400).json({ error: 'No data rows found in CSV' });

  const batchId = `${platform}-${Date.now()}`;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let imported = 0;
    for (const row of rows) {
      const mapped = mapper(row);
      if (!mapped.product_name && !mapped.order_id) continue;
      const net = (mapped.sell_price * mapped.qty) - mapped.platform_fee;
      await client.query(
        `INSERT INTO online_store_sales (platform, order_id, order_date, product_name, qty, sell_price, shipping_fee, platform_fee, net_amount, buyer_name, status, batch_import_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [mapped.platform, mapped.order_id, mapped.order_date || null, mapped.product_name, mapped.qty, mapped.sell_price, mapped.shipping_fee, mapped.platform_fee, net, mapped.buyer_name, mapped.status, batchId]
      );
      imported++;
    }
    await client.query('COMMIT');
    res.json({ message: `Berhasil import ${imported} transaksi dari ${platform}`, batchId, count: imported });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// GET all online sales (with pagination)
router.get('/sales', auth, async (req, res) => {
  const { platform, limit = 100, offset = 0 } = req.query;
  try {
    let query = 'SELECT * FROM online_store_sales';
    const params = [];
    if (platform) { query += ' WHERE platform = $1'; params.push(platform); }
    query += ` ORDER BY order_date DESC NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));
    const { rows } = await pool.query(query, params);
    const { rows: [count] } = await pool.query('SELECT COUNT(*) FROM online_store_sales' + (platform ? ' WHERE platform = $1' : ''), platform ? [platform] : []);
    res.json({ data: rows, total: parseInt(count.count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET summary / profit dashboard
router.get('/summary', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT platform,
        COUNT(*) AS total_orders,
        SUM(qty) AS total_items,
        SUM(sell_price * qty) AS gross_revenue,
        SUM(platform_fee) AS total_fees,
        SUM(net_amount) AS net_revenue
      FROM online_store_sales
      GROUP BY platform
    `);
    const { rows: monthly } = await pool.query(`
      SELECT DATE_TRUNC('month', order_date) AS month, platform,
        SUM(net_amount) AS revenue, COUNT(*) AS orders
      FROM online_store_sales
      WHERE order_date IS NOT NULL
      GROUP BY DATE_TRUNC('month', order_date), platform
      ORDER BY month DESC LIMIT 12
    `);
    res.json({ platforms: rows, monthly });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// WITHDRAWALS
// ══════════════════════════════════════════════════════════════════════════════

router.get('/withdrawals', auth, async (req, res) => {
  try { const { rows } = await pool.query('SELECT * FROM online_store_withdrawals ORDER BY withdrawal_date DESC'); res.json(rows); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/withdrawals', auth, async (req, res) => {
  const { platform, amount, withdrawal_date, notes } = req.body;
  if (!platform || !amount) return res.status(400).json({ error: 'Platform and amount required' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO online_store_withdrawals (platform, amount, withdrawal_date, notes) VALUES ($1,$2,$3,$4) RETURNING *',
      [platform, amount, withdrawal_date || new Date(), notes || '']
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
