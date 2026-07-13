// Marketplace Produk — matching listing marketplace ↔ produk HABIL, rekomendasi harga per
// platform (pakai pricingEngine + marketplace_fee_profiles), dan simpan harga ke Daftar Harga.
// File template (2.7MB) DIPROSES DI BROWSER; route ini hanya menerima baris JSON kecil.
//
// Alur: frontend parse template → POST /analyze {platform, rows} → tiap baris dapat produk HABIL
// (dari marketplace_sku_map), HPP terkini (FEFO), stok, & harga rekomendasi. Baris belum kenal →
// saran fuzzy by nama; user konfirmasi → POST /sku-map (mapping permanen, dipakai lagi utk toko
// berikutnya). Harga final → POST /save-prices menulis price_list_entries per channel.

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');
const { recommendPrice } = require('../utils/pricingEngine');

const PPN_RATE = 0.11;
const FLOOR_PROFIT = 5000; // laba minimum per listing (Rp) — "floor 4-5rb per barang"

// platform kunci di sini: 'tiktok' | 'shopee'. Pemetaan ke channel HABIL & category pricing.
const PLATFORM_CHANNEL = { tiktok: 'tokopedia_tiktok', shopee: 'shopee' };
const PRICING_PLATFORM = { tiktok: 'tokopedia_tiktok', shopee: 'shopee' };
const DEFAULT_CATEGORY = { tiktok: 'default', shopee: 'health_supplement' };

const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketplace_sku_map (
      id SERIAL PRIMARY KEY,
      platform TEXT NOT NULL,
      match_key TEXT NOT NULL,
      key_type TEXT NOT NULL DEFAULT 'sku',
      product_id INT REFERENCES product_master(id) ON DELETE CASCADE,
      bundle_qty INT DEFAULT 1,
      listing_name TEXT,
      variation TEXT,
      created_by INT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (platform, match_key)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_msku_platform ON marketplace_sku_map(platform);`);
};
ensureSchema().catch((e) => console.error('marketplace ensureSchema:', e.message));

// ── helper matching ────────────────────────────────────────────────────────
const normKey = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
// Kunci baris: pakai SKU kalau ada, kalau tidak pakai nama+varian (kunci "ingatan" mapping).
const rowMatchKey = (row) => {
  if (row.sku && String(row.sku).trim()) return { key: String(row.sku).trim().toUpperCase(), type: 'sku' };
  return { key: normKey(`${row.product_name} ${row.variation || ''}`), type: 'name' };
};

// Skor kemiripan token (Jaccard) utk saran produk saat belum ada mapping.
const tokenize = (s) => new Set(normKey(s).split(' ').filter((t) => t.length >= 2));
const similarity = (a, b) => {
  const A = tokenize(a); const B = tokenize(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
};

// HPP sudah-include-PPN dari batch FEFO (nota → hna apa adanya; faktur → hna×(1+ppn)).
// Fallback tanpa batch: product_master.hna × 1.11.
const hppInclFromProduct = (p) => {
  if (p.fefo_hna !== null && p.fefo_hna !== undefined) {
    const hna = parseFloat(p.fefo_hna) || 0;
    if (p.fefo_tax === 'nota') return hna;
    return hna * (1 + (parseFloat(p.fefo_ppn) || PPN_RATE));
  }
  return (parseFloat(p.hna) || 0) * (1 + PPN_RATE);
};

// Ambil semua produk aktif + stok agregat + batch FEFO sekali jalan.
const loadProducts = async () => {
  const { rows } = await pool.query(`
    SELECT pm.id, pm.name, pm.code, pm.hna, pm.base_unit, pm.pack_size,
           COALESCE(st.stock, 0) AS stock,
           fefo.hna AS fefo_hna, fefo.tax_type AS fefo_tax, fefo.ppn_rate AS fefo_ppn
    FROM product_master pm
    LEFT JOIN (
      SELECT product_id, SUM(qty_current) AS stock
      FROM inventory_batches WHERE is_active = TRUE AND qty_current > 0
      GROUP BY product_id
    ) st ON st.product_id = pm.id
    LEFT JOIN LATERAL (
      SELECT hna, tax_type, ppn_rate FROM inventory_batches
      WHERE product_id = pm.id AND is_active = TRUE AND qty_current > 0
      ORDER BY expired_date ASC NULLS LAST, id ASC LIMIT 1
    ) fefo ON TRUE
    WHERE pm.is_active = TRUE
  `);
  return rows;
};

// Rekomendasi harga dgn floor laba: mode sehat, kalau laba < FLOOR pakai target custom = FLOOR.
const recommendWithFloor = (hppIncl, bundleQty, platform, categoryKey, feeProfiles) => {
  const base = {
    hpp_per_unit: hppIncl,
    qty_bundle: Math.max(1, bundleQty || 1),
    platform: PRICING_PLATFORM[platform] || 'shopee',
    category_key: categoryKey || DEFAULT_CATEGORY[platform] || 'default',
    fee_profiles: feeProfiles,
  };
  let rec = recommendPrice({ ...base, target_profit_mode: 'healthy' });
  if (rec.estimasi && rec.estimasi.estimasi_laba < FLOOR_PROFIT) {
    const floored = recommendPrice({ ...base, target_profit_mode: 'custom', custom_target_profit: FLOOR_PROFIT });
    if (floored.harga_rekomendasi_psikologis && floored.harga_rekomendasi_psikologis > (rec.harga_rekomendasi_psikologis || 0)) {
      rec = floored;
    }
  }
  return rec;
};

// ── POST /analyze ────────────────────────────────────────────────────────
// Body: { platform:'tiktok'|'shopee', category_key?, rows:[{excelRow, product_name, variation,
//         sku, price, stock, bundle_qty}] }
router.post('/analyze', auth, async (req, res) => {
  try {
    const platform = req.body?.platform;
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!PLATFORM_CHANNEL[platform]) return res.status(400).json({ error: 'Platform tidak dikenali (tiktok/shopee).' });

    const [{ rows: maps }, products, { rows: feeProfiles }] = await Promise.all([
      pool.query('SELECT * FROM marketplace_sku_map WHERE platform = $1', [platform]),
      loadProducts(),
      pool.query('SELECT * FROM marketplace_fee_profiles WHERE active = TRUE'),
    ]);
    const feeParsed = feeProfiles.map((p) => ({
      ...p,
      admin_rate: parseFloat(p.admin_rate),
      service_rate: parseFloat(p.service_rate),
      fixed_order_fee: parseFloat(p.fixed_order_fee),
      safe_effective_fee_rate: parseFloat(p.safe_effective_fee_rate),
    }));
    const mapByKey = new Map(maps.map((m) => [m.match_key, m]));
    const productById = new Map(products.map((p) => [p.id, p]));

    const result = rows.map((row) => {
      const { key, type } = rowMatchKey(row);
      const mapping = mapByKey.get(key) || null;
      const out = {
        excelRow: row.excelRow,
        product_name: row.product_name,
        variation: row.variation || null,
        sku: row.sku || null,
        match_key: key,
        key_type: type,
        current_price: row.price ?? null,
        current_stock: row.stock ?? null,
        bundle_qty: mapping ? (mapping.bundle_qty || 1) : (row.bundle_qty || 1),
        matched: null,
        suggestions: [],
      };

      const product = mapping ? productById.get(mapping.product_id) : null;
      if (product) {
        const hppIncl = hppInclFromProduct(product);
        const rec = recommendWithFloor(hppIncl, out.bundle_qty, platform,
          req.body?.category_key, feeParsed);
        out.matched = {
          product_id: product.id,
          name: product.name,
          code: product.code,
          hpp_incl: Math.round(hppIncl),
          hpp_bundle: Math.round(hppIncl * out.bundle_qty),
          stock_habil: parseInt(product.stock, 10) || 0,
          recommended_price: rec.harga_rekomendasi_psikologis,
          estimasi_laba: rec.estimasi ? rec.estimasi.estimasi_laba : null,
          margin_laba: rec.estimasi ? rec.estimasi.margin_laba : null,
          fee_rate: rec.total_variable_fee_rate,
          harga_bep: rec.pembulatan_psikologis ? rec.pembulatan_psikologis.bep : null,
          harga_laba_sehat: rec.pembulatan_psikologis ? rec.pembulatan_psikologis.laba_sehat : null,
          warnings: rec.warnings || [],
        };
      } else {
        // Belum ada mapping → saran produk HABIL paling mirip (top 4).
        out.suggestions = products
          .map((p) => ({ product_id: p.id, name: p.name, code: p.code, score: similarity(`${row.product_name} ${row.variation || ''}`, p.name) }))
          .filter((s) => s.score > 0.12)
          .sort((a, b) => b.score - a.score)
          .slice(0, 4)
          .map((s) => ({ product_id: s.product_id, name: s.name, code: s.code, score: +s.score.toFixed(2) }));
      }
      return out;
    });

    const matchedCount = result.filter((r) => r.matched).length;
    res.json({ platform, channel: PLATFORM_CHANNEL[platform], total: result.length, matched: matchedCount, unmatched: result.length - matchedCount, rows: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── sku-map CRUD ───────────────────────────────────────────────────────────
router.get('/sku-map', auth, async (req, res) => {
  try {
    const params = [];
    let where = '';
    if (req.query.platform) { params.push(req.query.platform); where = 'WHERE m.platform = $1'; }
    const { rows } = await pool.query(
      `SELECT m.*, pm.name AS product_name_habil, pm.code AS product_code
       FROM marketplace_sku_map m LEFT JOIN product_master pm ON pm.id = m.product_id
       ${where} ORDER BY m.updated_at DESC`, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Upsert mapping. Body: { platform, match_key, key_type, product_id, bundle_qty, listing_name, variation }
router.post('/sku-map', auth, async (req, res) => {
  try {
    const b = req.body || {};
    if (!PLATFORM_CHANNEL[b.platform] || !b.match_key || !b.product_id) {
      return res.status(400).json({ error: 'platform, match_key, dan product_id wajib.' });
    }
    const bundleQty = Math.max(1, parseInt(b.bundle_qty, 10) || 1);
    const { rows: [row] } = await pool.query(
      `INSERT INTO marketplace_sku_map (platform, match_key, key_type, product_id, bundle_qty, listing_name, variation, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (platform, match_key) DO UPDATE SET
         product_id = EXCLUDED.product_id, key_type = EXCLUDED.key_type,
         bundle_qty = EXCLUDED.bundle_qty, listing_name = EXCLUDED.listing_name,
         variation = EXCLUDED.variation, updated_at = NOW()
       RETURNING *`,
      [b.platform, String(b.match_key).toUpperCase(), b.key_type || 'sku', parseInt(b.product_id, 10),
       bundleQty, b.listing_name || null, b.variation || null, req.user?.id || null]);
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/sku-map/:id', auth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID tidak valid.' });
    const { rowCount } = await pool.query('DELETE FROM marketplace_sku_map WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Mapping tidak ditemukan.' });
    res.json({ deleted: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /save-prices — simpan harga ke Daftar Harga HABIL per channel ──────
// Body: { entries: [{ product_id, channel, price, effective_date? }] }
router.post('/save-prices', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    if (!entries.length) return res.status(400).json({ error: 'entries kosong.' });
    const today = new Date().toISOString().slice(0, 10);
    await client.query('BEGIN');
    const saved = [];
    for (const e of entries) {
      const productId = parseInt(e.product_id, 10);
      const price = Math.round(Number(e.price));
      const channel = ['shopee', 'tokopedia_tiktok', 'offline'].includes(e.channel) ? e.channel : null;
      if (!Number.isFinite(productId) || !Number.isFinite(price) || price < 0 || !channel) continue;
      const effDate = e.effective_date || today;
      // pola sama dgn priceList.js: offline → product_master.sell_price, lainnya → price_list_entries
      if (channel === 'offline') {
        await client.query('UPDATE product_master SET sell_price = $1, updated_at = NOW() WHERE id = $2 AND is_active = TRUE', [price, productId]);
      } else {
        // idempotent: sama persis dgn entry terakhir → skip
        const { rows: [cur] } = await client.query(
          `SELECT price, effective_date FROM price_list_entries WHERE product_id=$1 AND channel=$2 ORDER BY effective_date DESC, id DESC LIMIT 1`, [productId, channel]);
        if (cur && parseFloat(cur.price) === price && String(cur.effective_date).slice(0, 10) === String(effDate).slice(0, 10)) {
          saved.push({ product_id: productId, channel, price, unchanged: true });
          continue;
        }
        await client.query(
          `INSERT INTO price_list_entries (product_id, channel, price, effective_date, created_by) VALUES ($1,$2,$3,$4,$5)`,
          [productId, channel, price, effDate, req.user?.id || null]);
      }
      saved.push({ product_id: productId, channel, price });
    }
    await client.query('COMMIT');
    res.json({ saved_count: saved.length, saved });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

module.exports = router;
