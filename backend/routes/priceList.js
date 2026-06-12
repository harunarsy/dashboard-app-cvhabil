const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

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
};
if (process.env.NODE_ENV !== 'test') ensureSchema().catch(e => console.error('priceList ensureSchema:', e));

// GET / — semua produk aktif + HPP batch terbaru + harga list saat ini + harga sebelumnya
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.id, p.code, p.name, p.category, p.base_unit, p.pack_unit, p.pack_size,
             p.sell_price, p.sell_price_pack, p.hna AS master_hna,
             lb.hna AS last_hna, lb.tax_type AS last_tax_type, lb.created_at AS last_purchase_at,
             cur.price AS list_price, cur.effective_date,
             prev.price AS prev_price, prev.effective_date AS prev_effective_date
      FROM product_master p
      LEFT JOIN LATERAL (
        SELECT hna, tax_type, created_at FROM inventory_batches b
        WHERE b.product_id = p.id AND COALESCE(b.is_active, TRUE) = TRUE
        ORDER BY b.created_at DESC NULLS LAST, b.id DESC
        LIMIT 1
      ) lb ON TRUE
      LEFT JOIN LATERAL (
        SELECT price, effective_date FROM price_list_entries e
        WHERE e.product_id = p.id
        ORDER BY e.effective_date DESC, e.id DESC
        LIMIT 1
      ) cur ON TRUE
      LEFT JOIN LATERAL (
        SELECT price, effective_date FROM price_list_entries e
        WHERE e.product_id = p.id
        ORDER BY e.effective_date DESC, e.id DESC
        OFFSET 1 LIMIT 1
      ) prev ON TRUE
      WHERE p.is_active = TRUE
      ORDER BY p.name ASC
    `);
    res.json(rows);
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
