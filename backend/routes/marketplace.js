// Marketplace Produk — matching listing marketplace ↔ produk HABIL, rekomendasi harga per
// platform (pricingEngine + marketplace_fee_profiles), simpan harga ke Daftar Harga.
// File template (2.7MB) DIPROSES DI BROWSER; route ini hanya menerima baris JSON kecil.
//
// Konsep:
//  - TOKO (marketplace_stores): identitas toko (Semesta-Shopee dll) supaya katalog "lengket" —
//    dibuka lagi tanpa upload ulang.
//  - KATALOG (marketplace_listings): snapshot produk per toko (nama, harga, stok, hasil match,
//    rekomendasi, harga final) — disimpan tiap analyze.
//  - KAMUS (marketplace_sku_map): pemetaan permanen SKU/nama → produk HABIL, GLOBAL per platform,
//    dipakai ulang lintas toko. Auto-match yg belum dikonfirmasi TIDAK masuk kamus (tentatif).

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');
const { recommendPrice } = require('../utils/pricingEngine');

const PPN_RATE = 0.11;
const FLOOR_PROFIT = 5000; // laba minimum per listing (Rp)
const AUTO_STRONG = 0.6;   // skor kemiripan cukup tinggi → auto-match walau tak ada pesaing dekat
const AUTO_MIN = 0.4;      // skor minimum utk auto-match kalau unggul jelas dari kandidat ke-2
const AUTO_MARGIN = 0.15;  // selisih skor top vs ke-2 supaya tak ambigu

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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketplace_stores (
      id SERIAL PRIMARY KEY,
      platform TEXT NOT NULL,
      name TEXT NOT NULL,
      name_key TEXT NOT NULL,
      external_shop_id TEXT,
      last_filename TEXT,
      created_by INT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (platform, name_key)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketplace_listings (
      id SERIAL PRIMARY KEY,
      store_id INT REFERENCES marketplace_stores(id) ON DELETE CASCADE,
      match_key TEXT NOT NULL,
      key_type TEXT,
      product_name TEXT,
      variation TEXT,
      sku TEXT,
      current_price NUMERIC(14,2),
      current_stock INT,
      bundle_qty INT DEFAULT 1,
      matched_product_id INT REFERENCES product_master(id) ON DELETE SET NULL,
      matched_auto BOOLEAN DEFAULT FALSE,
      hpp_incl NUMERIC(14,2),
      recommended_price NUMERIC(14,2),
      final_price NUMERIC(14,2),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (store_id, match_key)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_mlisting_store ON marketplace_listings(store_id);`);
};
ensureSchema().catch((e) => console.error('marketplace ensureSchema:', e.message));

// ── helper matching ────────────────────────────────────────────────────────
const normKey = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const rowMatchKey = (row) => {
  if (row.sku && String(row.sku).trim()) return { key: String(row.sku).trim().toUpperCase(), type: 'sku' };
  return { key: normKey(`${row.product_name} ${row.variation || ''}`), type: 'name' };
};

const tokenize = (s) => new Set(normKey(s).split(' ').filter((t) => t.length >= 2));
const similarity = (a, b) => {
  const A = tokenize(a); const B = tokenize(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
};

// Skor kandidat produk utk sebuah listing; sertakan varian agar varian rasa terbedakan.
const scoreProducts = (row, products) => {
  const text = `${row.product_name} ${row.variation || ''}`;
  return products
    .map((p) => ({ product_id: p.id, name: p.name, code: p.code, score: similarity(text, p.name) }))
    .filter((s) => s.score > 0.12)
    .sort((a, b) => b.score - a.score);
};

// Auto-match: ambil kandidat teratas kalau cukup yakin & tak ambigu. Return {product_id} | null.
const pickAuto = (scored) => {
  if (!scored.length) return null;
  const top = scored[0];
  const second = scored[1];
  if (top.score >= AUTO_STRONG) return top;
  if (top.score >= AUTO_MIN && (!second || top.score - second.score >= AUTO_MARGIN)) return top;
  return null;
};

const hppInclFromProduct = (p) => {
  if (p.fefo_hna !== null && p.fefo_hna !== undefined) {
    const hna = parseFloat(p.fefo_hna) || 0;
    if (p.fefo_tax === 'nota') return hna;
    return hna * (1 + (parseFloat(p.fefo_ppn) || PPN_RATE));
  }
  return (parseFloat(p.hna) || 0) * (1 + PPN_RATE);
};

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
    if (floored.harga_rekomendasi_psikologis && floored.harga_rekomendasi_psikologis > (rec.harga_rekomendasi_psikologis || 0)) rec = floored;
  }
  return rec;
};

// Bentuk objek "matched" utk sebuah produk + rekomendasi.
const buildMatched = (product, bundleQty, platform, categoryKey, feeParsed, auto) => {
  const hppIncl = hppInclFromProduct(product);
  // HPP nol (produk tanpa batch/HNA) → rekomendasi tak bisa dipercaya (menghasilkan harga sampah
  // spt Rp6.900). Jangan kasih angka rekomendasi; suruh lengkapi HPP dulu.
  const noHpp = !(hppIncl > 0);
  const rec = recommendWithFloor(hppIncl, bundleQty, platform, categoryKey, feeParsed);
  return {
    product_id: product.id,
    name: product.name,
    code: product.code,
    auto: !!auto,
    no_hpp: noHpp,
    hpp_incl: Math.round(hppIncl),
    hpp_bundle: Math.round(hppIncl * bundleQty),
    stock_habil: parseInt(product.stock, 10) || 0,
    recommended_price: noHpp ? null : rec.harga_rekomendasi_psikologis,
    estimasi_laba: noHpp ? null : (rec.estimasi ? rec.estimasi.estimasi_laba : null),
    margin_laba: noHpp ? null : (rec.estimasi ? rec.estimasi.margin_laba : null),
    fee_rate: rec.total_variable_fee_rate,
    harga_bep: noHpp ? null : (rec.pembulatan_psikologis ? rec.pembulatan_psikologis.bep : null),
    harga_laba_sehat: noHpp ? null : (rec.pembulatan_psikologis ? rec.pembulatan_psikologis.laba_sehat : null),
    warnings: noHpp ? ['HPP produk ini kosong di HABIL — lengkapi HNA/faktur dulu sebelum pakai harga rekomendasi.'] : (rec.warnings || []),
  };
};

// Upsert toko by (platform, name_key). Return row.
const upsertStore = async (platform, name, externalShopId, filename, userId) => {
  const nameKey = normKey(name).toLowerCase();
  const { rows: [row] } = await pool.query(
    `INSERT INTO marketplace_stores (platform, name, name_key, external_shop_id, last_filename, created_by)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (platform, name_key) DO UPDATE SET
       external_shop_id = COALESCE(EXCLUDED.external_shop_id, marketplace_stores.external_shop_id),
       last_filename = EXCLUDED.last_filename, updated_at = NOW()
     RETURNING *`,
    [platform, String(name).trim(), nameKey, externalShopId || null, filename || null, userId || null]);
  return row;
};

// ── POST /analyze ────────────────────────────────────────────────────────
// Body: { platform, store_name, external_shop_id?, filename?, category_key?, rows:[...] }
router.post('/analyze', auth, async (req, res) => {
  try {
    const platform = req.body?.platform;
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const storeName = (req.body?.store_name || '').trim();
    if (!PLATFORM_CHANNEL[platform]) return res.status(400).json({ error: 'Platform tidak dikenali (tiktok/shopee).' });
    if (!storeName) return res.status(400).json({ error: 'Nama toko wajib diisi.' });

    const [{ rows: maps }, products, { rows: feeProfiles }] = await Promise.all([
      pool.query('SELECT * FROM marketplace_sku_map WHERE platform = $1', [platform]),
      loadProducts(),
      pool.query('SELECT * FROM marketplace_fee_profiles WHERE active = TRUE'),
    ]);
    const feeParsed = feeProfiles.map((p) => ({
      ...p,
      admin_rate: parseFloat(p.admin_rate), service_rate: parseFloat(p.service_rate),
      fixed_order_fee: parseFloat(p.fixed_order_fee), safe_effective_fee_rate: parseFloat(p.safe_effective_fee_rate),
    }));
    const mapByKey = new Map(maps.map((m) => [m.match_key, m]));
    const productById = new Map(products.map((p) => [p.id, p]));

    const store = await upsertStore(platform, storeName, req.body?.external_shop_id, req.body?.filename, req.user?.id);

    let auto = 0; let confirmed = 0;
    const result = rows.map((row) => {
      const { key, type } = rowMatchKey(row);
      const mapping = mapByKey.get(key) || null;
      const bundleQty = mapping ? (mapping.bundle_qty || 1) : (row.bundle_qty || 1);
      const out = {
        excelRow: row.excelRow, product_name: row.product_name, variation: row.variation || null,
        sku: row.sku || null, match_key: key, key_type: type,
        current_price: row.price ?? null, current_stock: row.stock ?? null,
        bundle_qty: bundleQty, matched: null, suggestions: [],
      };

      if (mapping && productById.get(mapping.product_id)) {
        out.matched = buildMatched(productById.get(mapping.product_id), bundleQty, platform, req.body?.category_key, feeParsed, false);
        confirmed += 1;
      } else {
        const scored = scoreProducts(row, products);
        const auto1 = pickAuto(scored);
        if (auto1 && productById.get(auto1.product_id)) {
          out.matched = buildMatched(productById.get(auto1.product_id), bundleQty, platform, req.body?.category_key, feeParsed, true);
          auto += 1;
        } else {
          out.suggestions = scored.slice(0, 5).map((s) => ({ product_id: s.product_id, name: s.name, code: s.code, score: +s.score.toFixed(2) }));
        }
      }
      return out;
    });

    // Simpan katalog (upsert per match_key). final_price dipertahankan kalau sudah ada.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of result) {
        await client.query(
          `INSERT INTO marketplace_listings
             (store_id, match_key, key_type, product_name, variation, sku, current_price, current_stock,
              bundle_qty, matched_product_id, matched_auto, hpp_incl, recommended_price, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
           ON CONFLICT (store_id, match_key) DO UPDATE SET
             product_name=EXCLUDED.product_name, variation=EXCLUDED.variation, sku=EXCLUDED.sku,
             current_price=EXCLUDED.current_price, current_stock=EXCLUDED.current_stock,
             bundle_qty=EXCLUDED.bundle_qty, matched_product_id=EXCLUDED.matched_product_id,
             matched_auto=EXCLUDED.matched_auto, hpp_incl=EXCLUDED.hpp_incl,
             recommended_price=EXCLUDED.recommended_price, updated_at=NOW()`,
          [store.id, r.match_key, r.key_type, r.product_name, r.variation, r.sku,
           r.current_price, r.current_stock, r.bundle_qty,
           r.matched ? r.matched.product_id : null, r.matched ? r.matched.auto : false,
           r.matched ? r.matched.hpp_incl : null, r.matched ? r.matched.recommended_price : null]);
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
    finally { client.release(); }

    res.json({
      platform, channel: PLATFORM_CHANNEL[platform], store: { id: store.id, name: store.name },
      total: result.length, matched: confirmed + auto, matched_confirmed: confirmed, matched_auto: auto,
      unmatched: result.length - confirmed - auto, rows: result,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Toko ────────────────────────────────────────────────────────────────
router.get('/stores', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.*, COUNT(l.id) AS listing_count,
             COUNT(l.id) FILTER (WHERE l.matched_product_id IS NOT NULL) AS matched_count
      FROM marketplace_stores s LEFT JOIN marketplace_listings l ON l.store_id = s.id
      GROUP BY s.id ORDER BY s.updated_at DESC`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Katalog toko tersimpan (buka lagi tanpa upload). Rekomendasi dihitung ulang fresh dari HPP terkini.
router.get('/stores/:id/listings', auth, async (req, res) => {
  try {
    const storeId = parseInt(req.params.id, 10);
    if (!Number.isFinite(storeId)) return res.status(400).json({ error: 'ID toko tidak valid.' });
    const { rows: [store] } = await pool.query('SELECT * FROM marketplace_stores WHERE id = $1', [storeId]);
    if (!store) return res.status(404).json({ error: 'Toko tidak ditemukan.' });

    const [{ rows: listings }, products, { rows: feeProfiles }] = await Promise.all([
      pool.query('SELECT * FROM marketplace_listings WHERE store_id = $1 ORDER BY id', [storeId]),
      loadProducts(),
      pool.query('SELECT * FROM marketplace_fee_profiles WHERE active = TRUE'),
    ]);
    const feeParsed = feeProfiles.map((p) => ({
      ...p, admin_rate: parseFloat(p.admin_rate), service_rate: parseFloat(p.service_rate),
      fixed_order_fee: parseFloat(p.fixed_order_fee), safe_effective_fee_rate: parseFloat(p.safe_effective_fee_rate),
    }));
    const productById = new Map(products.map((p) => [p.id, p]));

    const rows = listings.map((l) => {
      const out = {
        product_name: l.product_name, variation: l.variation, sku: l.sku, match_key: l.match_key,
        key_type: l.key_type, current_price: l.current_price != null ? Math.round(l.current_price) : null,
        current_stock: l.current_stock, bundle_qty: l.bundle_qty || 1,
        final_price: l.final_price != null ? Math.round(l.final_price) : null,
        matched: null, suggestions: [],
      };
      if (l.matched_product_id && productById.get(l.matched_product_id)) {
        out.matched = buildMatched(productById.get(l.matched_product_id), out.bundle_qty, store.platform, null, feeParsed, l.matched_auto);
      } else {
        out.suggestions = scoreProducts(l, products).slice(0, 5).map((s) => ({ product_id: s.product_id, name: s.name, code: s.code, score: +s.score.toFixed(2) }));
      }
      return out;
    });
    const matched = rows.filter((r) => r.matched).length;
    res.json({ store: { id: store.id, name: store.name, platform: store.platform, last_filename: store.last_filename },
      channel: PLATFORM_CHANNEL[store.platform], total: rows.length, matched, unmatched: rows.length - matched, rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/stores/:id', auth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID tidak valid.' });
    const { rowCount } = await pool.query('DELETE FROM marketplace_stores WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Toko tidak ditemukan.' });
    res.json({ deleted: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── sku-map (kamus permanen) ─────────────────────────────────────────────
router.get('/sku-map', auth, async (req, res) => {
  try {
    const params = []; let where = '';
    if (req.query.platform) { params.push(req.query.platform); where = 'WHERE m.platform = $1'; }
    const { rows } = await pool.query(
      `SELECT m.*, pm.name AS product_name_habil, pm.code AS product_code
       FROM marketplace_sku_map m LEFT JOIN product_master pm ON pm.id = m.product_id
       ${where} ORDER BY m.updated_at DESC`, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Konfirmasi mapping (permanen). Body: { platform, match_key, key_type, product_id, bundle_qty, listing_name, variation, store_id? }
router.post('/sku-map', auth, async (req, res) => {
  try {
    const b = req.body || {};
    if (!PLATFORM_CHANNEL[b.platform] || !b.match_key || !b.product_id) {
      return res.status(400).json({ error: 'platform, match_key, dan product_id wajib.' });
    }
    const bundleQty = Math.max(1, parseInt(b.bundle_qty, 10) || 1);
    const matchKey = String(b.match_key).toUpperCase();
    const { rows: [row] } = await pool.query(
      `INSERT INTO marketplace_sku_map (platform, match_key, key_type, product_id, bundle_qty, listing_name, variation, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (platform, match_key) DO UPDATE SET
         product_id=EXCLUDED.product_id, key_type=EXCLUDED.key_type, bundle_qty=EXCLUDED.bundle_qty,
         listing_name=EXCLUDED.listing_name, variation=EXCLUDED.variation, updated_at=NOW()
       RETURNING *`,
      [b.platform, matchKey, b.key_type || 'sku', parseInt(b.product_id, 10), bundleQty, b.listing_name || null, b.variation || null, req.user?.id || null]);
    // Update katalog toko terkait (kalau ada) agar langsung sinkron & "lengket".
    if (b.store_id) {
      await pool.query(
        `UPDATE marketplace_listings SET matched_product_id=$1, matched_auto=FALSE, bundle_qty=$2, updated_at=NOW()
         WHERE store_id=$3 AND match_key=$4`,
        [parseInt(b.product_id, 10), bundleQty, parseInt(b.store_id, 10), matchKey]);
    }
    // Hitung objek matched utk baris ini → frontend patch 1 baris tanpa reload (no "mecah fokus").
    let matched = null;
    try {
      const [products, { rows: feeProfiles }] = await Promise.all([
        loadProducts(), pool.query('SELECT * FROM marketplace_fee_profiles WHERE active = TRUE'),
      ]);
      const product = products.find((p) => p.id === parseInt(b.product_id, 10));
      if (product) {
        const feeParsed = feeProfiles.map((p) => ({ ...p, admin_rate: parseFloat(p.admin_rate), service_rate: parseFloat(p.service_rate), fixed_order_fee: parseFloat(p.fixed_order_fee), safe_effective_fee_rate: parseFloat(p.safe_effective_fee_rate) }));
        matched = buildMatched(product, bundleQty, b.platform, null, feeParsed, false);
      }
    } catch (_) { /* patch opsional; abaikan kalau gagal */ }
    res.status(201).json({ ...row, matched, bundle_qty: bundleQty });
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

// ── POST /save-prices — simpan harga ke Daftar Harga HABIL + katalog toko ──
// Body: { store_id?, entries:[{ product_id, channel, price, match_key? }] }
router.post('/save-prices', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    const storeId = req.body?.store_id ? parseInt(req.body.store_id, 10) : null;
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
      if (channel === 'offline') {
        await client.query('UPDATE product_master SET sell_price = $1, updated_at = NOW() WHERE id = $2 AND is_active = TRUE', [price, productId]);
      } else {
        const { rows: [cur] } = await client.query(
          `SELECT price, effective_date FROM price_list_entries WHERE product_id=$1 AND channel=$2 ORDER BY effective_date DESC, id DESC LIMIT 1`, [productId, channel]);
        if (!(cur && parseFloat(cur.price) === price && String(cur.effective_date).slice(0, 10) === String(effDate).slice(0, 10))) {
          await client.query(`INSERT INTO price_list_entries (product_id, channel, price, effective_date, created_by) VALUES ($1,$2,$3,$4,$5)`,
            [productId, channel, price, effDate, req.user?.id || null]);
        }
      }
      // simpan final_price ke katalog toko biar lengket
      if (storeId && e.match_key) {
        await client.query('UPDATE marketplace_listings SET final_price=$1, updated_at=NOW() WHERE store_id=$2 AND match_key=$3',
          [price, storeId, String(e.match_key).toUpperCase()]);
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
