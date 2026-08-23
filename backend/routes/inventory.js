const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');
const pricing = require('../utils/pricing');
const tax = require('../utils/tax');
const { seedProductAlias } = require('../utils/productAliases');

// ══════════════════════════════════════════════════════════════════════════════
// PRODUCT MASTER
// ══════════════════════════════════════════════════════════════════════════════

// GET all products with stock summary (+ limit + q search)
router.get('/products', auth, async (req, res) => {
  try {
    // Cap 2000 menyamai request picker faktur (limit 2000) — cap lebih kecil bikin
    // produk huruf belakang hilang senyap dari dropdown begitu master > cap.
    const limit = Math.min(parseInt(req.query.limit) || 500, 2000);
    const q = req.query.q?.trim();
    let whereClause = 'WHERE p.is_active = TRUE';
    const params = [];
    let idx = 1;
    if (q) {
      whereClause += ` AND (p.name ILIKE $${idx} OR p.code ILIKE $${idx})`;
      params.push(`%${q}%`);
      idx++;
    }
    const { rows } = await pool.query(`
      SELECT p.*,
        COALESCE(stats.total_stock, 0) AS total_stock,
        stats.nearest_expiry,
        COALESCE(stats.expiring_batches, 0) AS expiring_batches,
        latest.hna AS latest_hna,
        latest.batch_no AS latest_batch_no,
        latest.expired_date AS latest_batch_expired_date,
        COALESCE(stockval.stock_value, 0) AS stock_value,
        COALESCE(stockval.stock_value_inc_ppn, 0) AS stock_value_inc_ppn,
        stockval.avg_hna AS avg_hna,
        stockval.min_hna AS min_hna,
        stockval.max_hna AS max_hna,
        COALESCE(stockval.batch_count, 0) AS batch_count,
        stockval.batch_cost_tiers AS batch_cost_tiers
      FROM product_master p
      LEFT JOIN LATERAL (
        SELECT
          -- v1.66.2: WAJIB kecualikan batch nonaktif. Pengurangan stok FEFO saat
          -- jualan sudah menghormati is_active, jadi batch nonaktif TIDAK bisa
          -- keluar. Menghitungnya di total_stock bikin stok hantu: dashboard
          -- bilang 221 pcs padahal yang bisa dijual cuma 187. Pemilik
          -- mengonfirmasi barangnya memang sudah tidak ada. Data batch TIDAK
          -- diubah — hanya cara menghitungnya.
          COALESCE(SUM(b.qty_current) FILTER (
            WHERE COALESCE(b.is_active, TRUE) = TRUE
          ), 0) AS total_stock,
          MIN(b.expired_date) FILTER (
            WHERE b.qty_current > 0 AND b.expired_date IS NOT NULL
              AND COALESCE(b.is_active, TRUE) = TRUE
          ) AS nearest_expiry,
          COUNT(b.id) FILTER (
            WHERE b.qty_current > 0
              AND b.expired_date IS NOT NULL
              AND b.expired_date >= CURRENT_DATE
              AND b.expired_date < CURRENT_DATE + INTERVAL '90 days'
          ) AS expiring_batches
        FROM inventory_batches b
        WHERE b.product_id = p.id
      ) stats ON TRUE
      LEFT JOIN LATERAL (
        SELECT b.hna, b.batch_no, b.expired_date
        FROM inventory_batches b
        WHERE b.product_id = p.id
          AND COALESCE(b.is_active, TRUE) = TRUE
        ORDER BY b.created_at DESC, b.id DESC
        LIMIT 1
      ) latest ON TRUE
      LEFT JOIN LATERAL (
        -- Nilai persediaan riil: hanya batch yang MASIH berstok, jadi tiap batch
        -- menyumbang HNA-nya sendiri (bukan satu harga "terbaru" dikali total stok)
        SELECT
          SUM(b2.qty_current * b2.hna) AS stock_value,
          -- v1.66.3: nilai persediaan SUDAH termasuk PPN, dihitung PER BATCH sesuai
          -- jenis pajaknya. Batch 'nota' = beli tanpa PPN masukan -> HPP = harga beli
          -- apa adanya, TIDAK dikali (1+rate). Sebelumnya frontend mengalikan 1,11 rata
          -- ke semua batch sehingga nilai persediaan kelebihan Rp 1.083.306 (6 batch nota).
          -- Dilaporkan pd kasus Mika Nasi: 1500 x 190 tampil Rp 316.350, seharusnya Rp 285.000.
          SUM(
            b2.qty_current * b2.hna * CASE
              WHEN COALESCE(b2.tax_type, 'faktur') = 'nota' THEN 1
              ELSE 1 + COALESCE(b2.ppn_rate, 0.11)
            END
          ) AS stock_value_inc_ppn,
          SUM(b2.qty_current * b2.hna) / NULLIF(SUM(b2.qty_current), 0) AS avg_hna,
          MIN(b2.hna) AS min_hna,
          MAX(b2.hna) AS max_hna,
          COUNT(*) AS batch_count,
          -- Rincian harga per tingkat: batch dgn hna + jenis pajak SAMA digabung,
          -- urut lama -> baru. tax_type & ppn_rate ikut dikirim supaya frontend bisa
          -- memakai hppForBatch() dan tidak menebak sendiri.
          (
            SELECT json_agg(
              json_build_object(
                'hna', t.hna, 'qty', t.qty,
                'tax_type', t.tax_type, 'ppn_rate', t.ppn_rate
              )
              ORDER BY t.oldest_created_at
            )
            FROM (
              SELECT b3.hna AS hna,
                COALESCE(b3.tax_type, 'faktur') AS tax_type,
                COALESCE(b3.ppn_rate, 0.11) AS ppn_rate,
                SUM(b3.qty_current) AS qty,
                MIN(b3.created_at) AS oldest_created_at
              FROM inventory_batches b3
              WHERE b3.product_id = p.id
                AND b3.qty_current > 0
                AND COALESCE(b3.is_active, TRUE) = TRUE
              GROUP BY b3.hna, COALESCE(b3.tax_type, 'faktur'), COALESCE(b3.ppn_rate, 0.11)
            ) t
          ) AS batch_cost_tiers
        FROM inventory_batches b2
        WHERE b2.product_id = p.id
          AND b2.qty_current > 0
          AND COALESCE(b2.is_active, TRUE) = TRUE
      ) stockval ON TRUE
      ${whereClause}
      ORDER BY p.name ASC
      LIMIT $${idx}
    `, [...params, limit]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET data template opname per-BATCH (v1.10.3): tiap batch aktif = 1 baris; produk tanpa batch tetap 1 baris (batch/ED null)
router.get('/opname-template', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.id AS product_id, p.code, p.name, p.unit,
             b.id AS batch_id, b.batch_no, b.expired_date, b.qty_current
      FROM product_master p
      LEFT JOIN inventory_batches b ON b.product_id = p.id AND b.is_active = TRUE AND b.qty_current > 0
      WHERE p.is_active = TRUE
      ORDER BY p.name ASC, b.expired_date ASC NULLS LAST, b.id ASC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET single product with batches and mutations
router.get('/products/:id', auth, async (req, res) => {
  try {
    const { rows: [product] } = await pool.query(`
      SELECT p.*,
        latest.hna AS latest_hna,
        latest.batch_no AS latest_batch_no,
        latest.expired_date AS latest_batch_expired_date
      FROM product_master p
      LEFT JOIN LATERAL (
        SELECT b.hna, b.batch_no, b.expired_date
        FROM inventory_batches b
        WHERE b.product_id = p.id
          AND COALESCE(b.is_active, TRUE) = TRUE
        ORDER BY b.created_at DESC, b.id DESC
        LIMIT 1
      ) latest ON TRUE
      WHERE p.id = $1
    `, [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const { rows: batches } = await pool.query(
      'SELECT * FROM inventory_batches WHERE product_id = $1 ORDER BY expired_date ASC NULLS LAST', [req.params.id]
    );
    const { rows: mutations } = await pool.query(
      'SELECT * FROM inventory_mutations WHERE product_id = $1 ORDER BY created_at DESC LIMIT 50', [req.params.id]
    );
    res.json({ ...product, batches, mutations });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CREATE product
router.post('/products', auth, async (req, res) => {
  const { code, name, unit, hna, sell_price, category, min_stock, base_unit, pack_unit, pack_size, sell_price_pack, weight_gram } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nama produk wajib diisi' });
  if (!code?.trim()) return res.status(400).json({ error: 'KODE produk wajib diisi' });
  const normCode = code.trim().toUpperCase();
  try {
    const dup = await pool.query('SELECT id, name FROM product_master WHERE UPPER(TRIM(code)) = $1 LIMIT 1', [normCode]);
    if (dup.rows.length) return res.status(409).json({ error: `KODE "${normCode}" sudah dipakai produk: ${dup.rows[0].name}` });
    // AUDIT-LS-10: nama kembar bikin pencocokan by-nama (faktur/nota/SP) ambigu → blokir
    const dupName = await pool.query(
      'SELECT id, code FROM product_master WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND is_active = TRUE LIMIT 1',
      [name.trim()]
    );
    if (dupName.rows.length) return res.status(409).json({ error: `Nama "${name.trim()}" sudah dipakai produk ber-KODE ${dupName.rows[0].code || dupName.rows[0].id}` });
    const resolvedBaseUnit = base_unit || unit || 'pcs';
    const resolvedPackSize = parseInt(pack_size) || 1;
    const resolvedWeightGram = Math.max(0, parseInt(weight_gram) || 0);
    const { rows } = await pool.query(
      `INSERT INTO product_master (code, name, unit, hna, sell_price, category, min_stock, base_unit, pack_unit, pack_size, sell_price_pack, weight_gram)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [normCode, name.trim(), resolvedBaseUnit, hna || 0, sell_price || 0, category || '', min_stock || 5,
       resolvedBaseUnit, pack_unit || null, resolvedPackSize, sell_price_pack || 0, resolvedWeightGram]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// UPDATE product
router.put('/products/:id', auth, async (req, res) => {
  const { code, name, unit, hna, sell_price, category, min_stock, base_unit, pack_unit, pack_size, sell_price_pack, weight_gram } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nama produk wajib diisi' });
  if (!code?.trim()) return res.status(400).json({ error: 'KODE produk wajib diisi' });
  const normCode = code.trim().toUpperCase();
  try {
    const dup = await pool.query('SELECT id, name FROM product_master WHERE UPPER(TRIM(code)) = $1 AND id <> $2 LIMIT 1', [normCode, req.params.id]);
    if (dup.rows.length) return res.status(409).json({ error: `KODE "${normCode}" sudah dipakai produk: ${dup.rows[0].name}` });
    // AUDIT-LS-10: nama kembar bikin pencocokan by-nama ambigu → blokir (exclude diri sendiri)
    const dupName = await pool.query(
      'SELECT id, code FROM product_master WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND is_active = TRUE AND id <> $2 LIMIT 1',
      [name.trim(), req.params.id]
    );
    if (dupName.rows.length) return res.status(409).json({ error: `Nama "${name.trim()}" sudah dipakai produk ber-KODE ${dupName.rows[0].code || dupName.rows[0].id}` });
    const { rows: [prevRow] } = await pool.query('SELECT name FROM product_master WHERE id = $1', [req.params.id]);
    const resolvedBaseUnit = base_unit || unit || 'pcs';
    const resolvedPackSize = parseInt(pack_size) || 1;
    const resolvedWeightGram = Math.max(0, parseInt(weight_gram) || 0);
    const { rows } = await pool.query(
      `UPDATE product_master SET code=$1, name=$2, unit=$3, hna=$4, sell_price=$5, category=$6, min_stock=$7,
        base_unit=$8, pack_unit=$9, pack_size=$10, sell_price_pack=$11, weight_gram=$12, updated_at=NOW()
       WHERE id=$13 RETURNING *`,
      [normCode, name.trim(), resolvedBaseUnit, hna || 0, sell_price || 0, category || '', min_stock || 5,
       resolvedBaseUnit, pack_unit || null, resolvedPackSize, sell_price_pack || 0, resolvedWeightGram, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    // v1.22.2: rename → nama lama jadi alias (faktur pakai nama lama tetap auto-match)
    if (prevRow?.name && prevRow.name.trim().toLowerCase() !== name.trim().toLowerCase()) {
      await seedProductAlias(pool, rows[0].id, prevRow.name);
    }
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE product (soft)
router.delete('/products/:id', auth, async (req, res) => {
  try {
    const { rowCount } = await pool.query('UPDATE product_master SET is_active = FALSE WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product deactivated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// STOCK IN / OUT
// ══════════════════════════════════════════════════════════════════════════════

// POST stock in (stok masuk)
router.post('/stock-in', auth, async (req, res) => {
  const { product_id, batch_no, expired_date, qty, hna, source_type, source_ref, notes } = req.body;
  if (!product_id || !qty || qty <= 0) return res.status(400).json({ error: 'product_id and qty required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Get product to use its hna as default if not provided
    let finalHna = hna;
    if (!finalHna) {
      const { rows: [product] } = await client.query('SELECT hna FROM product_master WHERE id = $1', [product_id]);
      finalHna = product?.hna || 0;
    }
    
    // Create or update batch
    const { rows: [batch] } = await client.query(
      `INSERT INTO inventory_batches (product_id, batch_no, expired_date, qty_current, hna, source_type, source_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [product_id, batch_no || null, expired_date || null, qty, finalHna, source_type || 'manual', source_ref || null]
    );
    // Record mutation
    await client.query(
      `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, reference_id, notes, created_by)
       VALUES ($1,$2,'in',$3,$4,$5,$6,$7)`,
      [product_id, batch.id, qty, source_type || 'manual', null, notes || '', req.user?.id || null]
    );
    await client.query('COMMIT');
    res.status(201).json(batch);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// POST stock out (stok keluar) — uses FEFO (First Expired, First Out)
router.post('/stock-out', auth, async (req, res) => {
  const { product_id, qty, reference_type, reference_id, notes, selected_batch_id } = req.body;
  if (!product_id || !qty || qty <= 0) return res.status(400).json({ error: 'product_id and qty required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // v1.7.0: kalau user pilih batch manual (override FEFO), single-batch deduction
    if (selected_batch_id) {
      const { rows: [batch] } = await client.query(
        'SELECT * FROM inventory_batches WHERE id = $1 AND product_id = $2 AND COALESCE(is_active, TRUE) = TRUE FOR UPDATE',
        [selected_batch_id, product_id]
      );
      if (!batch) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Batch tidak ditemukan / non-aktif' }); }
      if (batch.qty_current < qty) { await client.query('ROLLBACK'); return res.status(400).json({ error: `Stok batch tidak cukup (tersedia: ${batch.qty_current})` }); }
      await client.query('UPDATE inventory_batches SET qty_current = qty_current - $1 WHERE id = $2', [qty, batch.id]);
      await client.query(
        `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, reference_id, notes, created_by)
         VALUES ($1,$2,'out',$3,$4,$5,$6,$7)`,
        [product_id, batch.id, qty, reference_type || 'manual-batch-pick', reference_id || null,
         notes || `Manual pick batch ${batch.batch_no || batch.id}`, req.user?.id || null]
      );
      await client.query('COMMIT');
      return res.json({ message: `Stok keluar ${qty} dari batch ${batch.batch_no || batch.id}` });
    }
    // Default: FEFO multi-batch deduction.
    // FOR UPDATE: kunci batch supaya stock-out bersamaan (atau barengan nota) tidak
    // baca qty_current yang sama → stok minus. Batch expired SENGAJA ikut (jalur ini
    // juga dipakai buang stok ED) — beda dengan FEFO nota yang filter expired.
    const { rows: batches } = await client.query(
      `SELECT * FROM inventory_batches WHERE product_id = $1 AND qty_current > 0
       AND COALESCE(is_active, TRUE) = TRUE
       ORDER BY expired_date ASC NULLS LAST
       FOR UPDATE`, [product_id]
    );
    let remaining = qty;
    const totalAvailable = batches.reduce((s, b) => s + b.qty_current, 0);
    if (totalAvailable < qty) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Stok tidak cukup. Tersedia: ${totalAvailable}, Diminta: ${qty}` });
    }
    for (const batch of batches) {
      if (remaining <= 0) break;
      const deduct = Math.min(batch.qty_current, remaining);
      await client.query('UPDATE inventory_batches SET qty_current = qty_current - $1 WHERE id = $2', [deduct, batch.id]);
      await client.query(
        `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, reference_id, notes, created_by)
         VALUES ($1,$2,'out',$3,$4,$5,$6,$7)`,
        [product_id, batch.id, deduct, reference_type || 'manual', reference_id || null, notes || '', req.user?.id || null]
      );
      remaining -= deduct;
    }
    await client.query('COMMIT');
    res.json({ message: `Stok keluar ${qty} berhasil (FEFO)` });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ══════════════════════════════════════════════════════════════════════════════
// BATCH CRUD (Phase 1 — direct batch management)
// ══════════════════════════════════════════════════════════════════════════════

// GET batches for a product (full list incl zero-stock & expired, for management view)
router.get('/products/:id/batches', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM inventory_batches
       WHERE product_id = $1 AND COALESCE(is_active, TRUE) = TRUE
       ORDER BY expired_date ASC NULLS LAST, id DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET single product full payload (product + batches + last 20 mutations) — for drawer
router.get('/products/:id/full', auth, async (req, res) => {
  try {
    const { rows: [product] } = await pool.query(`
      SELECT p.*,
        latest.hna AS latest_hna,
        latest.batch_no AS latest_batch_no,
        latest.expired_date AS latest_batch_expired_date
      FROM product_master p
      LEFT JOIN LATERAL (
        SELECT b.hna, b.batch_no, b.expired_date
        FROM inventory_batches b
        WHERE b.product_id = p.id
          AND COALESCE(b.is_active, TRUE) = TRUE
        ORDER BY b.created_at DESC, b.id DESC
        LIMIT 1
      ) latest ON TRUE
      WHERE p.id = $1
    `, [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const { rows: batches } = await pool.query(
      `SELECT * FROM inventory_batches
       WHERE product_id = $1 AND COALESCE(is_active, TRUE) = TRUE
       ORDER BY expired_date ASC NULLS LAST, id DESC`, [req.params.id]
    );
    const { rows: mutations } = await pool.query(
      `SELECT m.*, b.batch_no
       FROM inventory_mutations m
       LEFT JOIN inventory_batches b ON b.id = m.batch_id
       WHERE m.product_id = $1
       ORDER BY m.created_at DESC LIMIT 20`, [req.params.id]
    );
    const totalStock = batches.reduce((s, b) => s + (b.qty_current || 0), 0);
    const inventoryValue = batches.reduce((s, b) => s + (b.qty_current || 0) * (parseFloat(b.hna) || 0), 0);
    // v1.7.0: include tier pricing untuk auto-resolve di SalesOrderList
    const { rows: tiers } = await pool.query(
      'SELECT id, unit, min_qty, max_qty, price FROM product_price_tiers WHERE product_id = $1 ORDER BY unit, min_qty',
      [req.params.id]
    );
    res.json({ ...product, batches, mutations, total_stock: totalStock, inventory_value: inventoryValue, price_tiers: tiers });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// UPDATE batch metadata (batch_no, expired_date, hna, notes — NOT qty_current)
router.put('/batches/:id', auth, async (req, res) => {
  const { batch_no, expired_date, hna, notes } = req.body;
  try {
    // v1.39.0: ambil state lama dulu untuk audit-log perubahan identitas batch
    const { rows: [before] } = await pool.query(
      'SELECT batch_no, expired_date, hna FROM inventory_batches WHERE id = $1',
      [req.params.id]
    );
    if (!before) return res.status(404).json({ error: 'Batch not found' });
    const { rows } = await pool.query(
      `UPDATE inventory_batches
       SET batch_no = $1, expired_date = $2, hna = $3, notes = $4
       WHERE id = $5 RETURNING *`,
      [batch_no || null, expired_date || null, hna || 0, notes || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Batch not found' });
    const after = rows[0];
    // v1.39.0: catat perubahan batch_no / expired_date / hna (fire-and-forget; audit ≠ data inti)
    const ed = (v) => (v ? String(v).slice(0, 10) : null);
    const changes = {};
    if (String(before.batch_no || '') !== String(after.batch_no || ''))
      changes.batch_no = { from: before.batch_no || null, to: after.batch_no || null };
    if (ed(before.expired_date) !== ed(after.expired_date))
      changes.expired_date = { from: ed(before.expired_date), to: ed(after.expired_date) };
    if (Number(before.hna || 0) !== Number(after.hna || 0))
      changes.hna = { from: Number(before.hna || 0), to: Number(after.hna || 0) };
    if (Object.keys(changes).length) {
      pool.query(
        `INSERT INTO batch_audit_log (batch_id, product_id, action, changes, changed_by)
         VALUES ($1, $2, 'edit', $3, $4)`,
        [after.id, after.product_id, JSON.stringify(changes), req.user?.id || null]
      ).catch((e) => console.error('batch_audit_log edit:', e.message));
    }
    // v1.64.1: nota menyimpan salinan teks batch (sales_items.batch_no_snapshot).
    // Kalau batch_no/ED dibetulkan di sini (mis. typo '2651103GU' → '26S1103GU'),
    // nota lama harus ikut benar — kalau tidak, nota selamanya menampilkan typo.
    // Hanya baris yang memang menunjuk batch ini (batch_id_snapshot) yang disentuh.
    if (changes.batch_no || changes.expired_date) {
      const { rowCount: syncedRows } = await pool.query(
        `UPDATE sales_items
            SET batch_no_snapshot = $1, expired_date_snapshot = $2
          WHERE batch_id_snapshot = $3
            AND (COALESCE(batch_no_snapshot,'') IS DISTINCT FROM COALESCE($1::varchar,'')
                 OR expired_date_snapshot IS DISTINCT FROM $2::date)`,
        [after.batch_no || null, after.expired_date || null, after.id]
      );
      if (syncedRows) console.log(`[inventory] batch ${after.id} disinkron ke ${syncedRows} baris nota`);
    }
    res.json(after);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// v1.39.0: riwayat perubahan identitas batch (nomor/ED/HNA)
router.get('/batches/:id/audit', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, batch_id, product_id, action, changes, changed_by, created_at
       FROM batch_audit_log WHERE batch_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE batch (soft) — v1.10.3: kalau masih ada stok, otomatis di-nol-kan (catat mutasi audit) lalu dihapus
router.delete('/batches/:id', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [batch] } = await client.query('SELECT * FROM inventory_batches WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!batch) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Batch not found' }); }
    if (batch.qty_current > 0) {
      // nol-kan stok + audit trail dulu, supaya stok tidak hilang diam-diam
      await client.query(
        `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, notes, created_by)
         VALUES ($1, $2, 'out', $3, 'adjust', $4, $5)`,
        [batch.product_id, batch.id, batch.qty_current, `Hapus batch: stok ${batch.qty_current} → 0`, req.user?.id || null]
      );
      await client.query('UPDATE inventory_batches SET qty_current = 0 WHERE id = $1', [req.params.id]);
    }
    await client.query('UPDATE inventory_batches SET is_active = FALSE WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ message: 'Batch dihapus' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// POST adjust batch qty (manual adjustment — creates audit mutation)
router.post('/batches/:id/adjust', auth, async (req, res) => {
  const { new_qty, reason } = req.body;
  if (new_qty === undefined || new_qty === null || isNaN(parseInt(new_qty))) {
    return res.status(400).json({ error: 'new_qty wajib (angka)' });
  }
  if (parseInt(new_qty) < 0) {
    return res.status(400).json({ error: 'Stok tidak boleh negatif' });
  }
  if (!reason?.trim()) return res.status(400).json({ error: 'Alasan adjustment wajib' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [batch] } = await client.query('SELECT * FROM inventory_batches WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!batch) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Batch not found' }); }
    const oldQty = batch.qty_current;
    const newQty = parseInt(new_qty);
    const diff = newQty - oldQty;
    if (diff === 0) { await client.query('ROLLBACK'); return res.json({ message: 'Tidak ada perubahan', batch }); }
    await client.query('UPDATE inventory_batches SET qty_current = $1 WHERE id = $2', [newQty, req.params.id]);
    await client.query(
      `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, notes, created_by)
       VALUES ($1, $2, $3, $4, 'adjust', $5, $6)`,
      [batch.product_id, batch.id, diff > 0 ? 'in' : 'out', Math.abs(diff), `Adjust: ${oldQty} → ${newQty}. ${reason}`, req.user?.id || null]
    );
    await client.query('COMMIT');
    res.json({ message: `Adjustment ${diff > 0 ? '+' : ''}${diff} berhasil`, batch: { ...batch, qty_current: newQty } });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ══════════════════════════════════════════════════════════════════════════════
// PRICE TIERS (v1.7.0 — grosir tier per product per unit)
// ══════════════════════════════════════════════════════════════════════════════

// GET tiers per produk
router.get('/products/:id/tiers', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, unit, min_qty, max_qty, price FROM product_price_tiers WHERE product_id = $1 ORDER BY unit, min_qty',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT bulk replace tiers — frontend kirim array lengkap, backend DELETE + INSERT atomic
router.put('/products/:id/tiers', auth, async (req, res) => {
  const { tiers } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM product_price_tiers WHERE product_id = $1', [req.params.id]);
    const inserted = [];
    for (const t of (tiers || [])) {
      const unit = (t.unit || '').trim();
      const minQty = parseInt(t.min_qty);
      const price = parseFloat(t.price);
      if (!unit || !minQty || minQty < 1 || !price || price <= 0) continue;
      const maxQty = t.max_qty !== null && t.max_qty !== undefined && t.max_qty !== '' ? parseInt(t.max_qty) : null;
      const { rows } = await client.query(
        'INSERT INTO product_price_tiers (product_id, unit, min_qty, max_qty, price) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [req.params.id, unit, minQty, maxQty, price]
      );
      inserted.push(rows[0]);
    }
    await client.query('COMMIT');
    res.json({ message: 'Tiers updated', tiers: inserted });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ══════════════════════════════════════════════════════════════════════════════
// STOCK OPNAME
// ══════════════════════════════════════════════════════════════════════════════

// GET opname history (with limit)
router.get('/opname', auth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    const { rows } = await pool.query(`
      SELECT so.*, pm.name AS product_name, pm.unit
      FROM stock_opname so
      JOIN product_master pm ON pm.id = so.product_id
      ORDER BY so.opname_date DESC, so.created_at DESC
      LIMIT $1
    `, [limit]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST opname (record stock check)
// Items can be per-batch (preferred) or per-product (legacy fallback):
//   per-batch: { batch_id, physical_qty, notes }
//   per-product: { product_id, physical_qty, notes } — uses FIFO deduct/surplus batch
router.post('/opname', auth, async (req, res) => {
  const { items } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'items required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const results = [];

    for (const item of items) {
      const physicalQty = parseInt(item.physical_qty) || 0;
      if (physicalQty < 0) continue;

      // ─── Per-batch flow (preferred) ───────────────────────────────────────
      if (item.batch_id) {
        const { rows: [batch] } = await client.query(
          'SELECT * FROM inventory_batches WHERE id = $1 FOR UPDATE', [item.batch_id]
        );
        if (!batch) continue;
        const systemQty = batch.qty_current;
        const diff = physicalQty - systemQty;

        const { rows: [record] } = await client.query(
          `INSERT INTO stock_opname (product_id, batch_id, system_qty, physical_qty, difference, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [batch.product_id, batch.id, systemQty, physicalQty, diff, item.notes || '', req.user?.id || null]
        );
        results.push(record);

        if (diff !== 0) {
          await client.query('UPDATE inventory_batches SET qty_current = $1 WHERE id = $2', [physicalQty, batch.id]);
          await client.query(
            `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, reference_id, notes, created_by)
             VALUES ($1,$2,$3,$4,'opname',$5,$6,$7)`,
            [batch.product_id, batch.id, diff > 0 ? 'in' : 'out', Math.abs(diff), record.id,
             `Opname batch ${batch.batch_no || batch.id}: ${systemQty} → ${physicalQty}${item.notes ? ' · ' + item.notes : ''}`,
             req.user?.id || null]
          );
        }
        continue;
      }

      // ─── Per-product flow (legacy fallback) ───────────────────────────────
      if (!item.product_id) continue;
      const { rows: [stock] } = await client.query(
        'SELECT COALESCE(SUM(qty_current), 0) AS system_qty FROM inventory_batches WHERE product_id = $1',
        [item.product_id]
      );
      const systemQty = parseInt(stock.system_qty);
      const diff = physicalQty - systemQty;

      const { rows: [record] } = await client.query(
        `INSERT INTO stock_opname (product_id, system_qty, physical_qty, difference, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [item.product_id, systemQty, physicalQty, diff, item.notes || '', req.user?.id || null]
      );
      results.push(record);

      if (diff !== 0) {
        await client.query(
          `INSERT INTO inventory_mutations (product_id, type, qty, reference_type, reference_id, notes, created_by)
           VALUES ($1,$2,$3,'opname',$4,$5,$6)`,
          [item.product_id, diff > 0 ? 'in' : 'out', Math.abs(diff), record.id,
           `Opname produk (legacy): ${systemQty} → ${physicalQty}`, req.user?.id || null]
        );
        if (diff > 0) {
          await client.query(
            `INSERT INTO inventory_batches (product_id, batch_no, qty_current, source_type, source_ref)
             VALUES ($1, 'OPNAME-ADJ', $2, 'opname', $3)`,
            [item.product_id, diff, `opname-${record.id}`]
          );
        } else {
          let toDeduct = Math.abs(diff);
          const { rows: batches } = await client.query(
            'SELECT * FROM inventory_batches WHERE product_id = $1 AND qty_current > 0 AND COALESCE(is_active, TRUE) = TRUE ORDER BY expired_date ASC NULLS LAST FOR UPDATE',
            [item.product_id]
          );
          for (const b of batches) {
            if (toDeduct <= 0) break;
            const d = Math.min(b.qty_current, toDeduct);
            await client.query('UPDATE inventory_batches SET qty_current = qty_current - $1 WHERE id = $2', [d, b.id]);
            toDeduct -= d;
          }
        }
      }
    }
    await client.query('COMMIT');
    res.status(201).json(results);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ALERTS
// ══════════════════════════════════════════════════════════════════════════════

router.get('/alerts', auth, async (req, res) => {
  try {
    // v1.43.0: "harus dikeluarkan" = stok (qty>0) yang ED-nya ≤4 bulan (120 hari)
    // ATAU sudah lewat ED. Yang sudah expired ikut (paling urgent) → order ASC = expired dulu.
    const { rows: expiring } = await pool.query(`
      SELECT b.*, pm.name AS product_name, pm.unit
      FROM inventory_batches b
      JOIN product_master pm ON pm.id = b.product_id
      WHERE b.qty_current > 0 AND b.expired_date IS NOT NULL
        AND b.expired_date < CURRENT_DATE + INTERVAL '120 days'
      ORDER BY b.expired_date ASC
    `);
    // Low stock products
    const { rows: lowStock } = await pool.query(`
      -- v1.66.2: batch nonaktif tidak bisa dijual, jadi jangan dihitung sebagai
      -- stok — kalau ikut dihitung, produk yang sebenarnya menipis tidak muncul
      -- di peringatan. Sama seperti perbaikan total_stock di daftar produk.
      SELECT pm.*, COALESCE(SUM(b.qty_current) FILTER (
               WHERE COALESCE(b.is_active, TRUE) = TRUE), 0) AS total_stock
      FROM product_master pm
      LEFT JOIN inventory_batches b ON b.product_id = pm.id
      WHERE pm.is_active = TRUE
      GROUP BY pm.id
      HAVING COALESCE(SUM(b.qty_current) FILTER (
               WHERE COALESCE(b.is_active, TRUE) = TRUE), 0) < pm.min_stock
      ORDER BY pm.name
    `);
    res.json({ expiring, lowStock });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET mutations history
router.get('/mutations', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT m.*, pm.name AS product_name, pm.unit
      FROM inventory_mutations m
      JOIN product_master pm ON pm.id = m.product_id
      ORDER BY m.created_at DESC
      LIMIT 100
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET FEFO batch HNA for a product (for auto-fill in sales order)
router.get('/fefo-hna/:productId', auth, async (req, res) => {
  try {
    // 1. Try to get HNA from the FEFO batch (earliest expiry with stock).
    // AUDIT-LS-07: filter samakan dgn FEFO deduct di sales.js — batch nonaktif/expired
    // tidak akan dipakai keluar stok, jadi jangan dipakai sumber harga juga.
    const { rows: [batch] } = await pool.query(`
      SELECT hna, COALESCE(tax_type, 'faktur') AS tax_type
      FROM inventory_batches
      WHERE product_id = $1 AND qty_current > 0
        AND COALESCE(is_active, TRUE) = TRUE
        AND (expired_date IS NULL OR expired_date >= CURRENT_DATE)
      ORDER BY expired_date ASC NULLS LAST
      LIMIT 1
    `, [req.params.productId]);

    // 2. Always fetch product master for fallback (hna + sell_price)
    const { rows: [product] } = await pool.query(
      'SELECT hna, sell_price FROM product_master WHERE id = $1',
      [req.params.productId]
    );

    // 3. Determine the best HNA value (first non-zero wins)
    const batchHna = batch ? parseFloat(batch.hna) : 0;
    const masterHna = product ? parseFloat(product.hna) : 0;
    const sellPrice = product ? parseFloat(product.sell_price) : 0;

    // Priority: batch FEFO HNA → product master HNA → product sell_price → 0
    const finalHna = batchHna || masterHna || sellPrice || 0;

    // tax_type ikut: batch nota = harga beli (HPP tanpa ×1,11); fallback master = faktur.
    res.json({ hna: finalHna, sell_price: sellPrice, tax_type: batchHna ? batch.tax_type : 'faktur' });
  } catch (err) {
    console.error('[Inventory FEFO-HNA] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET all available batches for a product (for batch dropdown in sales/nota)
// Supports include_batch_ids (comma-separated batch IDs) and include_batch_no (comma-separated batch numbers)
// to also include historical (zero/negative stock) batches matching those identifiers
router.get('/batches-by-product/:productId', auth, async (req, res) => {
  try {
    const { include_batch_ids, include_batch_no } = req.query;

    // Parse optional include params
    const extraIds = include_batch_ids
      ? include_batch_ids.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0)
      : [];
    const extraNos = include_batch_no
      ? include_batch_no.split(',').map(s => s.trim()).filter(s => s.length > 0)
      : [];

    // Default: active batches with stock + not expired
    const activeCondition = `(
      qty_current > 0
      AND COALESCE(is_active, TRUE) = TRUE
      AND (expired_date IS NULL OR expired_date >= CURRENT_DATE)
    )`;

    let whereClause = `WHERE product_id = $1 AND ${activeCondition}`;
    const params = [req.params.productId];

    if (extraIds.length > 0 || extraNos.length > 0) {
      const extraClauses = [];
      if (extraIds.length > 0) {
        const placeholders = extraIds.map((_, i) => `$${params.length + 1 + i}`);
        extraClauses.push(`id IN (${placeholders.join(',')})`);
        params.push(...extraIds);
      }
      if (extraNos.length > 0) {
        const placeholders = extraNos.map((_, i) => `$${params.length + 1 + i}`);
        extraClauses.push(`batch_no IN (${placeholders.join(',')})`);
        params.push(...extraNos);
      }
      // Active batches OR historical matches (even if qty_current <= 0)
      whereClause = `WHERE product_id = $1 AND (
        ${activeCondition}
        OR (${extraClauses.join(' OR ')})
      )`;
    }

	    // batch.hna faktur = HNA exc PPN; batch.hna nota = harga beli riil.
	    const { rows } = await pool.query(`
	      SELECT id, batch_no, expired_date, qty_current, hna,
	             COALESCE(tax_type, 'faktur') AS tax_type,
	             COALESCE(ppn_rate, ${tax.PPN_RATE}) AS ppn_rate,
	             CASE
	               WHEN hna <= 0 THEN 0
	               WHEN COALESCE(tax_type, 'faktur') = 'nota' THEN hna
	               ELSE hna * (1 + COALESCE(ppn_rate, ${tax.PPN_RATE}))
	             END AS hpp_inc_ppn,
	             CASE WHEN qty_current <= 0 THEN true ELSE false END AS is_historical
      FROM inventory_batches
      ${whereClause}
      ORDER BY expired_date ASC NULLS LAST
    `, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
