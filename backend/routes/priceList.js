const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');
const { recommendPrice, DEFAULT_FEE_PROFILES } = require('../utils/pricingEngine');

// ─── Daftar Harga (v1.24.0) ─────────────────────────────────────────────────
// Harga jual yang di-set manual per produk, terpisah dari sell_price master:
// tiap perubahan = baris baru dengan effective_date → riwayat harga tersimpan,
// printout bisa bilang "Berlaku per <tanggal>". HPP referensi diambil dari
// batch pembelian TERBARU (bukan FEFO) — tujuan halaman ini menentukan harga
// jual berdasarkan harga beli terkini.
const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS price_list_entries (
      id SERIAL PRIMARY KEY,
      product_id INT NOT NULL REFERENCES product_master(id) ON DELETE CASCADE,
      price DECIMAL(15,2) NOT NULL,
      effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_price_list_product
      ON price_list_entries(product_id, effective_date DESC, id DESC)
  `);
  // Fee marketplace bisa berubah sewaktu-waktu → disimpan di DB, editable dari dashboard.
  // source: official (rate resmi) | historical_order (dari transaksi nyata) | manual_override.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketplace_fee_profiles (
      id SERIAL PRIMARY KEY,
      platform TEXT NOT NULL,
      category_key TEXT NOT NULL DEFAULT 'default',
      label TEXT,
      admin_rate NUMERIC(7,5) DEFAULT 0,
      service_rate NUMERIC(7,5) DEFAULT 0,
      fixed_order_fee NUMERIC(12,2) DEFAULT 0,
      safe_effective_fee_rate NUMERIC(7,5) DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'official',
      active BOOLEAN DEFAULT TRUE,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(platform, category_key)
    )
  `);
  // Seed default — DO NOTHING supaya edit admin tidak ketimpa saat cold start berikutnya.
  for (const p of DEFAULT_FEE_PROFILES) {
    await pool.query(
      `INSERT INTO marketplace_fee_profiles
         (platform, category_key, label, admin_rate, service_rate, fixed_order_fee, safe_effective_fee_rate, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (platform, category_key) DO NOTHING`,
      [p.platform, p.category_key, p.label, p.admin_rate, p.service_rate, p.fixed_order_fee, p.safe_effective_fee_rate, p.source]
    );
  }
};
if (process.env.NODE_ENV !== 'test') ensureSchema().catch(e => console.error('priceList ensureSchema:', e));

// GET / — semua produk aktif + HPP batch terbaru + harga list saat ini + harga sebelumnya.
// Satu pass window function (bukan 3 LATERAL per produk) — temuan audit perf.
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      WITH last_batch AS (
        SELECT DISTINCT ON (product_id) product_id, hna, tax_type, created_at
        FROM inventory_batches
        WHERE COALESCE(is_active, TRUE) = TRUE
        ORDER BY product_id, created_at DESC NULLS LAST, id DESC
      ),
      ranked_entries AS (
        SELECT product_id, price, effective_date,
               ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY effective_date DESC, id DESC) AS rn
        FROM price_list_entries
      )
      SELECT p.id, p.code, p.name, p.category, p.base_unit, p.pack_unit, p.pack_size,
             p.sell_price, p.sell_price_pack, p.hna AS master_hna,
             lb.hna AS last_hna, lb.tax_type AS last_tax_type, lb.created_at AS last_purchase_at,
             cur.price AS list_price, cur.effective_date,
             prev.price AS prev_price, prev.effective_date AS prev_effective_date
      FROM product_master p
      LEFT JOIN last_batch lb ON lb.product_id = p.id
      LEFT JOIN ranked_entries cur ON cur.product_id = p.id AND cur.rn = 1
      LEFT JOIN ranked_entries prev ON prev.product_id = p.id AND prev.rn = 2
      WHERE p.is_active = TRUE
      ORDER BY p.category ASC NULLS LAST, p.name ASC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Fee profiles marketplace (editable dari dashboard) ────────────────────
router.get('/fee-profiles', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM marketplace_fee_profiles WHERE active = TRUE
       ORDER BY platform, category_key`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/fee-profiles/:id', auth, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID tidak valid' });
    const b = req.body || {};
    const rate = (v) => {
      if (v === undefined || v === null || v === '') return null;
      const n = Number.parseFloat(v);
      if (!Number.isFinite(n) || n < 0 || n >= 1) throw new Error('Rate harus 0–0.99 (desimal, contoh 6.75% = 0.0675)');
      return n;
    };
    const fixed = (v) => {
      if (v === undefined || v === null || v === '') return null;
      const n = Number.parseFloat(v);
      if (!Number.isFinite(n) || n < 0) throw new Error('Fee tetap tidak boleh minus');
      return n;
    };
    const source = ['official', 'historical_order', 'manual_override'].includes(b.source)
      ? b.source : 'manual_override';
    const { rows: [row] } = await pool.query(
      `UPDATE marketplace_fee_profiles SET
         admin_rate = COALESCE($1, admin_rate),
         service_rate = COALESCE($2, service_rate),
         fixed_order_fee = COALESCE($3, fixed_order_fee),
         safe_effective_fee_rate = COALESCE($4, safe_effective_fee_rate),
         source = $5,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 RETURNING *`,
      [rate(b.admin_rate), rate(b.service_rate), fixed(b.fixed_order_fee),
       rate(b.safe_effective_fee_rate), source, id]
    );
    if (!row) return res.status(404).json({ error: 'Profil fee tidak ditemukan' });
    res.json(row);
  } catch (err) {
    const code = /Rate harus|tidak boleh minus/.test(err.message) ? 400 : 500;
    res.status(code).json({ error: err.message });
  }
});

// POST /recommend — pricing engine: saran harga per marketplace.
// Body: hpp_per_unit, qty_bundle, packing_fee, platform, category_key, target_profit_mode,
//       custom_target_profit, seller_discount_rate, affiliate_rate, campaign_rate,
//       fee_mode ('effective'|'official'), fixed_order_fee/variable_fee_rate (override opsional).
router.post('/recommend', auth, async (req, res) => {
  try {
    const { rows: profiles } = await pool.query(
      'SELECT * FROM marketplace_fee_profiles WHERE active = TRUE'
    );
    const result = recommendPrice({
      ...req.body,
      fee_profiles: profiles.map((p) => ({
        ...p,
        admin_rate: parseFloat(p.admin_rate),
        service_rate: parseFloat(p.service_rate),
        fixed_order_fee: parseFloat(p.fixed_order_fee),
        safe_effective_fee_rate: parseFloat(p.safe_effective_fee_rate),
      })),
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /:productId/history — riwayat perubahan harga (terbaru dulu)
router.get('/:productId/history', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, price, effective_date, created_at FROM price_list_entries
       WHERE product_id = $1 ORDER BY effective_date DESC, id DESC LIMIT 50`,
      [req.params.productId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /:productId — set harga baru (insert entry; riwayat tidak ditimpa)
router.put('/:productId', auth, async (req, res) => {
  try {
    const productId = Number.parseInt(req.params.productId, 10);
    if (!Number.isFinite(productId)) return res.status(400).json({ error: 'Produk tidak valid' });
    const price = Number.parseFloat(req.body?.price);
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: 'Harga harus angka dan tidak boleh minus' });
    }
    const effectiveDate = req.body?.effective_date || new Date().toISOString().slice(0, 10);

    const { rows: [product] } = await pool.query(
      'SELECT id FROM product_master WHERE id = $1 AND is_active = TRUE', [productId]
    );
    if (!product) return res.status(404).json({ error: 'Produk tidak ditemukan' });

    const { rows: [current] } = await pool.query(
      `SELECT price, effective_date FROM price_list_entries
       WHERE product_id = $1 ORDER BY effective_date DESC, id DESC LIMIT 1`,
      [productId]
    );
    // Idempotent: harga & tanggal sama persis dengan entry terakhir → tidak nambah baris
    if (current && Number.parseFloat(current.price) === price
        && String(current.effective_date).slice(0, 10) === String(effectiveDate).slice(0, 10)) {
      return res.json({ unchanged: true, price, effective_date: effectiveDate });
    }

    const { rows: [entry] } = await pool.query(
      `INSERT INTO price_list_entries (product_id, price, effective_date, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id, price, effective_date`,
      [productId, price, effectiveDate, req.user?.id || null]
    );
    res.status(201).json(entry);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
