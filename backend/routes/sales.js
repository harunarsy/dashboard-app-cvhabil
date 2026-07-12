const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');
const tax = require('../utils/tax');
const uom = require('../utils/uom');
const { runOnce } = require('../utils/migrationOnce');
const formDrafts = require('../utils/formDrafts');
const { generateMonthlyDocNumber } = require('../utils/docNumbers');

// ─── Auto-create tables ─────────────────────────────────────────────────────
const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_orders (
      id SERIAL PRIMARY KEY,
      order_number VARCHAR(50) UNIQUE NOT NULL,
      customer_id INT,
      customer_name VARCHAR(150) NOT NULL,
      customer_address TEXT,
      sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
      total DECIMAL(15,2) DEFAULT 0,
      payment_method VARCHAR(20) DEFAULT 'Tunai',
      payment_details TEXT,
      status VARCHAR(20) DEFAULT 'draft',
      pdf_status VARCHAR(20) DEFAULT 'belum_dicetak',
      notes TEXT,
      is_deleted BOOLEAN DEFAULT FALSE,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sales_items (
      id SERIAL PRIMARY KEY,
      sales_order_id INT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
      product_name VARCHAR(255) NOT NULL,
      qty INT NOT NULL DEFAULT 1,
      unit VARCHAR(30) DEFAULT 'pcs',
      unit_price DECIMAL(15,2) NOT NULL DEFAULT 0,
      subtotal DECIMAL(15,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_sales_orders_date ON sales_orders(sale_date DESC);
    CREATE INDEX IF NOT EXISTS idx_sales_orders_customer ON sales_orders(customer_name);
    CREATE INDEX IF NOT EXISTS idx_sales_items_order ON sales_items(sales_order_id);
    CREATE INDEX IF NOT EXISTS idx_sales_orders_active_status_date
      ON sales_orders(is_deleted, status, sale_date DESC);
  `);
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(30)`);
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS channel VARCHAR(10) DEFAULT 'offline'`);
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS due_date DATE`);
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS payment_terms INTEGER`);
	    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS gross_profit DECIMAL(15,2) DEFAULT 0`);
	    await pool.query(`ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS unit_hpp DECIMAL(15,2) DEFAULT 0`);
	    await pool.query(`ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS unit_hpp_tax_type VARCHAR(20) DEFAULT 'faktur'`);
	    // v1.43.0: snapshot rate PPN batch saat jual → gross profit sadar rate per-batch (NULL=11% historis).
	    await pool.query(`ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS unit_hpp_ppn_rate DECIMAL(5,4)`);
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'unpaid'`);
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP`);
    // v1.6.0 multi-unit packaging: snapshot qty di unit input + pack_size saat sale
    await pool.query(`ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS qty_in_unit DECIMAL(15,4)`);
    await pool.query(`ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS pack_size_at_sale INT`);
    // v1.7.0: batch_no + ED snapshot per item (untuk display di PDF Nota — Image #17 feedback)
    await pool.query(`ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS batch_no_snapshot VARCHAR(100)`);
    await pool.query(`ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS expired_date_snapshot DATE`);
    // v1.22.3 (AUDIT-CA-08): di DB fresh, document_counters belum ada (dulu cuma dibuat
    // via scripts/neon_migration.sql) → ALTER di bawah gagal senyap dan nomor nota mati.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS document_counters (
        doc_type VARCHAR(20) PRIMARY KEY,
        prefix VARCHAR(30),
        last_number INTEGER DEFAULT 0,
        last_yymm VARCHAR(4),
        is_active BOOLEAN DEFAULT TRUE
      )
    `);
    // v1.8.1: counter YYMM dynamic — track bulan terakhir generate untuk auto-reset tiap bulan baru
    await pool.query(`ALTER TABLE document_counters ADD COLUMN IF NOT EXISTS last_yymm VARCHAR(4)`);
    // v1.8.3 hotfix: soft-deleted nota TETAP nge-block unique constraint → nomor gak bisa re-use.
    // Drop full UNIQUE, replace dengan partial UNIQUE INDEX (hanya enforce kalau is_deleted=FALSE).
    try {
      await pool.query(`ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS sales_orders_order_number_key`);
    } catch (e) { /* sudah didrop, abaikan */ }
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS sales_orders_order_number_active_idx
                      ON sales_orders(order_number) WHERE is_deleted = FALSE`);
    // v1.21.14: ongkir nota-level (ditagih ke customer) + ongkir_cost (biaya kurir asli, internal)
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS ongkir DECIMAL(15,2) DEFAULT 0`);
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS ongkir_cost DECIMAL(15,2) DEFAULT 0`);
    // v1.25.1: fee metode bayar (kartu kredit dkk). mode 'absorb' = margin dipotong
    // (harga customer tetap); 'pass_on' = tagihan di-gross-up supaya net tetap utuh.
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS payment_fee_rate NUMERIC(7,5) DEFAULT 0`);
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS payment_fee_mode VARCHAR(10) DEFAULT 'absorb'`);
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS payment_fee DECIMAL(15,2) DEFAULT 0`);
    // v1.27.x (#6 fee belajar): uang yang BENAR-BENAR masuk dari marketplace (opsional,
    // diisi operator) → fee efektif nyata = 1 - settlement/total.
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS settlement_amount DECIMAL(15,2)`);
    // v1.31.0: snapshot estimasi berat paket nota (produk per base unit + kemasan manual).
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS package_weight_gram INT DEFAULT 0`);
    await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS est_weight_gram INT DEFAULT 0`);
    // v1.16.2+: batch_id_snapshot for tracking selected batch in sales_items
    await pool.query(`ALTER TABLE sales_items ADD COLUMN IF NOT EXISTS batch_id_snapshot INT`);
	    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sales_items_batch_snapshot ON sales_items(batch_id_snapshot)`);
    // v1.23.0: nota tersimpan = dokumen sah. Status 'draft' lama itu accidental
    // (default DB; 'final' cuma ke-set kalau nota pernah diedit) → nota LUNAS yang
    // tak pernah diedit hilang dari Dashboard (filter paid AND final). Backfill +
    // ganti default. Draft beneran sekarang hidup di form_drafts (bukan dokumen).
    await pool.query(`ALTER TABLE sales_orders ALTER COLUMN status SET DEFAULT 'final'`);
    await runOnce(pool, 'sales_orders_status_final_v1', async () => {
      await pool.query(`UPDATE sales_orders SET status = 'final' WHERE status = 'draft'`);
    });
    // Data Migration one-time (AUDIT-CA-03): backfill berat — jangan rerun tiap cold start.
    await runOnce(pool, 'sales_items_backfill_v1', async () => {
      // Safe backfill: only where unique match exists (batch_no + expired_date + product_name)
      await pool.query(`
        UPDATE sales_items si
        SET batch_id_snapshot = b.id
        FROM inventory_batches b
        JOIN product_master p ON p.id = b.product_id
        WHERE si.batch_id_snapshot IS NULL
          AND si.batch_no_snapshot IS NOT NULL
          AND LOWER(TRIM(p.name)) = LOWER(TRIM(si.product_name))
          AND b.batch_no = si.batch_no_snapshot
          AND (b.expired_date = si.expired_date_snapshot OR (b.expired_date IS NULL AND si.expired_date_snapshot IS NULL))
          AND (SELECT COUNT(*) FROM inventory_batches b2
               WHERE b2.product_id = p.id
               AND b2.batch_no = si.batch_no_snapshot
               AND (b2.expired_date = si.expired_date_snapshot OR (b2.expired_date IS NULL AND si.expired_date_snapshot IS NULL))
          ) = 1
      `);
      await pool.query(`
        UPDATE sales_items si
        SET unit_hpp_tax_type = COALESCE(b.tax_type, 'faktur')
        FROM inventory_batches b
        WHERE si.batch_id_snapshot = b.id
          AND (si.unit_hpp_tax_type IS NULL OR si.unit_hpp_tax_type = 'faktur')
          AND COALESCE(b.tax_type, 'faktur') = 'nota'
      `);
    });
};
if (process.env.NODE_ENV !== 'test') ensureSchema().catch(e => console.error('sales ensureSchema:', e));

// v1.8.1: format HSB-NOTA-{YYMM}{NNN} reset per bulan + sync ke MAX bulan berjalan.
// v1.54.0: logic dipindah ke utils/docNumbers.js (dipakai juga nomor pinjaman HSB-PJM).
const generateOrderNumber = (client) => generateMonthlyDocNumber(client, {
  docType: 'NOTA', prefix: 'HSB-NOTA-', table: 'sales_orders', column: 'order_number',
});

// ─── resolveSelectedBatchForSale ──────────────────────────────────────────
// Priority: selected_batch_id > batch_id_snapshot > batch_no_snapshot + expired_date > batch_no_snapshot only
const resolveSelectedBatchForSale = async (client, productId, item) => {
  // AUDIT-LS-08: batch soft-delete tidak boleh dipotong stoknya. Expired SENGAJA
  // tetap boleh — edit nota lama me-resolve snapshot batch yang kini sudah ED;
  // memblok bikin nota lama tidak bisa diedit.
  const numericBatchId = Number.parseInt(item.selected_batch_id || item.batch_id_snapshot, 10);
  if (Number.isFinite(numericBatchId) && numericBatchId > 0) {
    const { rows: [batch] } = await client.query(
      `SELECT * FROM inventory_batches
       WHERE id = $1 AND product_id = $2 AND COALESCE(is_active, TRUE) = TRUE FOR UPDATE`,
      [numericBatchId, productId]
    );
    if (batch) return { batch, source: 'id' };
  }

  const batchNo = item.batch_no_snapshot || item._selected_batch;
  const expiredDate = item.expired_date_snapshot;

  if (batchNo) {
    if (expiredDate) {
      const { rows } = await client.query(
        `SELECT * FROM inventory_batches
         WHERE product_id = $1 AND batch_no = $2 AND COALESCE(is_active, TRUE) = TRUE
         AND (expired_date = $3 OR (expired_date IS NULL AND $3 IS NULL)) FOR UPDATE`,
        [productId, batchNo, expiredDate]
      );
      if (rows.length === 1) return { batch: rows[0], source: 'name_date' };
      if (rows.length > 1) throw Object.assign(new Error('USER: Batch snapshot ambigu, pilih batch ulang.'), { statusCode: 400 });
    }
    // Fallback: batch_no only if unique
    const { rows } = await client.query(
      `SELECT * FROM inventory_batches
       WHERE product_id = $1 AND batch_no = $2 AND COALESCE(is_active, TRUE) = TRUE FOR UPDATE`,
      [productId, batchNo]
    );
    if (rows.length === 1) return { batch: rows[0], source: 'name_only' };
    if (rows.length > 1) throw Object.assign(new Error('USER: Batch snapshot ambigu (multiple batch_no), pilih batch ulang.'), { statusCode: 400 });
  }

  return { batch: null, source: null };
};

// AUDIT-LS-09: validasi item nota — qty wajib angka > 0, harga & HPP wajib angka >= 0.
const validateSaleItems = (items = []) => {
  for (const it of items) {
    const label = String(it.product_name || '').trim() || '(tanpa nama)';
    const qty = parseFloat(it.qty);
    if (!Number.isFinite(qty) || qty <= 0) return `Qty produk "${label}" harus angka lebih dari 0`;
    const price = parseFloat(it.unit_price ?? 0);
    if (!Number.isFinite(price) || price < 0) return `Harga produk "${label}" tidak valid (tidak boleh minus)`;
    const hpp = parseFloat(it.unit_hpp ?? 0);
    if (!Number.isFinite(hpp) || hpp < 0) return `HPP produk "${label}" tidak valid (tidak boleh minus)`;
  }
  return null;
};

// v1.59.0: item yang eksplisit di-tag 'nota' (HPP disimpan SUDAH inc-PPN — mis. produk
// tanpa batch / koreksi manual) TIDAK boleh di-override jadi 'faktur' oleh batch. Kalau
// di-flip ke 'faktur', hppSqlForSalesItem akan meng-gross-up ×1.11 LAGI → PPN DOBEL
// (bug: edit nota bikin HPP mental naik 11% tiap kali disimpan). Hormati tag item dulu;
// batch hanya menentukan tax utk item 'faktur' (HNA exc yang memang perlu gross-up).
const resolveItemHppTaxType = (item = {}, batch = null) => (
  tax.normalizeTaxType(item.unit_hpp_tax_type) === tax.TAX_TYPE_NOTA
    ? tax.TAX_TYPE_NOTA
    : tax.normalizeTaxType(batch?.tax_type || item.unit_hpp_tax_type)
);

const getItemUnitCost = (item = {}) => (
  tax.hppFromHnaByTaxType(item.unit_hpp || 0, item.unit_hpp_tax_type)
);

// v1.23.0: form nota = sumber kontak terbaru → sync balik ke master customer.
// Kunci: customer_id, fallback nama (case-insensitive). Field kosong TIDAK
// menimpa data master. Dipanggil POST-COMMIT via pool: gagal sync ≠ gagal nota.
const syncCustomerContact = async ({ customerId, customerName, phone, address }) => {
  try {
    const phoneVal = String(phone || '').trim();
    const addrVal = String(address || '').trim();
    if (!phoneVal && !addrVal) return;
    if (customerId) {
      await pool.query(
        `UPDATE customers SET phone = COALESCE(NULLIF($1,''), phone),
           address = COALESCE(NULLIF($2,''), address), updated_at = NOW()
         WHERE id = $3`,
        [phoneVal, addrVal, customerId]
      );
    } else if (String(customerName || '').trim()) {
      await pool.query(
        `UPDATE customers SET phone = COALESCE(NULLIF($1,''), phone),
           address = COALESCE(NULLIF($2,''), address), updated_at = NOW()
         WHERE id = (SELECT id FROM customers
                     WHERE LOWER(TRIM(name)) = LOWER(TRIM($3))
                     ORDER BY id ASC LIMIT 1)`,
        [phoneVal, addrVal, customerName]
      );
    }
  } catch (e) { console.error('[sales] syncCustomerContact:', e.message); }
};

// GET all (excluding soft-deleted)
router.get('/', auth, async (req, res) => {
  try {
    // v1.52.6: cap dinaikkan 500→5000 — list nota terus bertambah; default 100 dulu
    // bikin nota lama (April/Mei) kepotong dari list walau ada di DB.
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 5000);
    const { rows } = await pool.query(
      `SELECT s.*, COALESCE(s.customer_phone, MAX(c.phone)) AS customer_phone,
        COALESCE(json_agg(i ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
       FROM sales_orders s
       LEFT JOIN customers c ON s.customer_id = c.id
       LEFT JOIN sales_items i ON i.sales_order_id = s.id
       WHERE s.is_deleted = FALSE
       GROUP BY s.id
       ORDER BY s.sale_date DESC, s.id DESC
       LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single
// ─── Draft form WIP (v1.23.0) — autosave form Buat Nota, mirror draft faktur.
// BUKAN dokumen: tanpa nomor nota, tanpa potong stok, tak tampil di list/Dashboard.
// Wajib di atas '/:id' supaya path '/draft' tidak ketangkap sebagai id.
const getDraftOwnerId = (req) => String(req.user?.id || '');

router.get('/draft', auth, async (req, res) => {
  try {
    const draft = await formDrafts.getDraft(pool, 'nota', getDraftOwnerId(req));
    res.json(draft);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/draft', auth, async (req, res) => {
  try {
    await formDrafts.saveDraft(pool, 'nota', getDraftOwnerId(req), req.body?.draft_data);
    res.json({ saved: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/draft/clear', auth, async (req, res) => {
  try {
    await formDrafts.clearDraft(pool, 'nota', getDraftOwnerId(req));
    res.json({ cleared: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET trash — nota yang sudah di-soft-delete (is_deleted=TRUE).
// Wajib di atas '/:id' supaya '/trash' tidak ketangkap sebagai id.
router.get('/trash', auth, async (req, res) => {
  try {
    // v1.52.7: sertakan items + telepon (sama spt list utama) supaya modal Trash
    // bisa tampilkan detail lengkap (produk, batch/ED, margin, status bayar).
    const { rows } = await pool.query(
      `SELECT s.*, COALESCE(s.customer_phone, MAX(c.phone)) AS customer_phone,
        COUNT(i.id) AS item_count,
        COALESCE(json_agg(i ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
       FROM sales_orders s
       LEFT JOIN customers c ON s.customer_id = c.id
       LEFT JOIN sales_items i ON i.sales_order_id = s.id
       WHERE s.is_deleted = TRUE
       GROUP BY s.id
       ORDER BY s.updated_at DESC, s.id DESC
       LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, COALESCE(s.customer_phone, MAX(c.phone)) AS customer_phone,
        COALESCE(json_agg(i ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
       FROM sales_orders s
       LEFT JOIN customers c ON s.customer_id = c.id
       LEFT JOIN sales_items i ON i.sales_order_id = s.id
       WHERE s.id = $1 AND s.is_deleted = FALSE
       GROUP BY s.id`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Nota not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// v1.25.1: fee metode bayar (kartu kredit dkk) — rate desimal (2,5% = 0.025), clamp 0–0.5.
// 'pass_on': customer bayar (total + fee), provider motong rate dari nominal tagihan
// → fee = total × r/(1−r) supaya net yang diterima tetap = total (margin utuh).
// 'absorb': harga customer tetap, fee = total × r dipotong dari margin.
const parsePaymentFee = (body) => {
  const rate = Math.min(0.5, Math.max(0, parseFloat(body.payment_fee_rate) || 0));
  const mode = body.payment_fee_mode === 'pass_on' ? 'pass_on' : 'absorb';
  return { rate, mode };
};
const computePaymentFee = (baseTotal, rate, mode) =>
  rate > 0 && baseTotal > 0
    ? (mode === 'pass_on' ? (baseTotal * rate) / (1 - rate) : baseTotal * rate)
    : 0;

// POST create
router.post('/', auth, async (req, res) => {
  const { customer_id, customer_name, customer_address, customer_phone, sale_date, notes, items, payment_method, payment_details, order_number: manualOrderNumber, channel: rawChannel, due_date, payment_terms, ongkir: rawOngkir, ongkir_cost: rawOngkirCost, package_weight_gram: rawPackageWeightGram } = req.body;
  const channel = ['offline', 'online'].includes(rawChannel) ? rawChannel : 'offline';
  // v1.21.14: ongkir = biaya yang DITAGIH ke customer (masuk total + nota PDF);
  // ongkir_cost = biaya kurir asli (internal, buat hitung untung; TIDAK di nota).
  const ongkir = Math.max(0, parseFloat(rawOngkir) || 0);
  const ongkirCost = Math.max(0, parseFloat(rawOngkirCost) || 0);
  const packageWeightGram = Math.max(0, parseInt(rawPackageWeightGram) || 0);
  // Validasi SEBELUM BEGIN — return di dalam transaksi meninggalkan koneksi idle-in-transaction
  if (!customer_name?.trim()) return res.status(400).json({ error: 'Nama customer wajib diisi' });
  if (!items?.length) return res.status(400).json({ error: 'Minimal 1 produk diperlukan' });
  // AUDIT-LS-09: qty negatif/non-angka lolos = total & laba korup tapi stok tidak keluar
  const itemError = validateSaleItems(items);
  if (itemError) return res.status(400).json({ error: itemError });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderNumber = manualOrderNumber ? manualOrderNumber : await generateOrderNumber(client);
    
    if (manualOrderNumber) {
      const match = manualOrderNumber.match(/\d+$/);
      if (match) {
        const manualInt = parseInt(match[0], 10);
        await client.query(
          "UPDATE document_counters SET last_number = $1 WHERE doc_type = 'NOTA' AND last_number < $1",
          [manualInt]
        );
      }
    }

    let total = 0;
    let gross_profit = 0;
	    items.forEach(it => {
	      total += (it.qty || 1) * (it.unit_price || 0);
	      gross_profit += (it.qty || 1) * ((it.unit_price || 0) - getItemUnitCost(it));
	    });
    // v1.21.14: ongkir ditagih masuk total; untung ongkir = ditagih - biaya asli.
    total += ongkir;
    gross_profit += (ongkir - ongkirCost);
    // v1.25.1: fee kartu kredit — pass_on nambah tagihan (margin utuh),
    // absorb motong margin (harga customer tetap).
    const { rate: pfRate, mode: pfMode } = parsePaymentFee(req.body);
    const paymentFee = computePaymentFee(total, pfRate, pfMode);
    if (pfMode === 'pass_on') total += paymentFee;
    else gross_profit -= paymentFee;

    // v1.53.1: auto-link customer_id dari nama kalau tidak dikirim (nama diketik
    // manual) & cocok TEPAT 1 customer → history/CRM (dormant, customer card) akurat.
    let resolvedCustomerId = customer_id || null;
    if (!resolvedCustomerId && customer_name?.trim()) {
      const { rows: cm } = await client.query(
        `SELECT id FROM customers WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 2`,
        [customer_name],
      );
      if (cm.length === 1) resolvedCustomerId = cm[0].id;
    }
    const { rows } = await client.query(
      `INSERT INTO sales_orders (order_number, customer_id, customer_name, customer_address, customer_phone, sale_date, total, gross_profit, notes, payment_method, payment_details, created_by, channel, due_date, payment_terms, ongkir, ongkir_cost, payment_fee_rate, payment_fee_mode, payment_fee, package_weight_gram, est_weight_gram, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'final') RETURNING *`,
      [orderNumber, resolvedCustomerId, customer_name.trim(), customer_address || '', customer_phone || '', sale_date || new Date(), total, gross_profit, notes || '', payment_method || 'Tunai', payment_details || '', req.user?.id || null, channel, due_date || null, payment_terms || null, ongkir, ongkirCost, pfRate, pfMode, paymentFee, packageWeightGram, 0]
    );
    const order = rows[0];

    // v1.6.0 multi-unit + v1.7.0 batch snapshot + v1.16.2 selected_batch safety
    const productMap = new Map();
    for (const it of items) {
      if (productMap.has(it.product_name)) continue;
      let { rows: [p] } = await client.query(
        'SELECT id, name, base_unit, pack_unit, pack_size, weight_gram FROM product_master WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND is_active = TRUE ORDER BY id ASC LIMIT 1',
        [it.product_name]
      );
      if (!p) {
        // v1.22.2: fallback alias — nota dengan nama produk lama tetap resolve
        const { rows: [pa] } = await client.query(
          `SELECT pm.id, pm.name, pm.base_unit, pm.pack_unit, pm.pack_size, pm.weight_gram
           FROM product_aliases a
           JOIN product_master pm ON pm.id = a.product_id AND pm.is_active = TRUE
           WHERE LOWER(TRIM(a.alias_name)) = LOWER(TRIM($1)) LIMIT 1`,
          [it.product_name]
        );
        p = pa;
      }
      if (!p) continue;
      productMap.set(it.product_name, { ...p });
    }

    // Insert items with batch snapshot (using resolveSelectedBatchForSale + FEFO fallback)
    const itemBatchInfo = []; // track for stock-out phase
    let actualItemGross = 0; // AUDIT-LS-06: gross dari tax_type batch AKTUAL, bukan payload
    let estimatedWeightGram = packageWeightGram;
    for (const it of items) {
      const product = productMap.get(it.product_name);
      const qtyInUnit = parseFloat(it.qty) || 1;
      const qtyBase = product ? uom.toBase(qtyInUnit, it.unit, product) : qtyInUnit;
      const packSize = product?.pack_size || 1;
      const subtotal = qtyInUnit * (it.unit_price || 0);
      if (product) estimatedWeightGram += qtyBase * (Math.max(0, parseInt(product.weight_gram) || 0));

      let snapshotBatchId = null;
      let snapshotBatchNo = null;
      let snapshotExpiredDate = null;
      let snapshotTaxType = tax.normalizeTaxType(it.unit_hpp_tax_type);
      let snapshotPpnRate = null;

      if (product) {
        const resolved = await resolveSelectedBatchForSale(client, product.id, it);
        if (resolved.batch) {
          // Deduct from this exact batch (resolved by id, name+date, or name only)
          if (resolved.batch.qty_current < qtyBase) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Stok batch tidak cukup untuk ${product.name} (tersedia: ${resolved.batch.qty_current})` });
          }
          snapshotBatchId = resolved.batch.id;
          snapshotBatchNo = resolved.batch.batch_no;
          snapshotExpiredDate = resolved.batch.expired_date;
          snapshotTaxType = resolveItemHppTaxType(it, resolved.batch);
          snapshotPpnRate = resolved.batch.ppn_rate ?? null;
          itemBatchInfo.push({ product, selectedBatchId: resolved.batch.id, qtyBase, qtyInUnit, unit: it.unit || product.base_unit || 'pcs', isSelected: true });
        } else {
          // FEFO fallback (existing behavior)
          const { rows: [firstBatch] } = await client.query(
            `SELECT id, batch_no, expired_date, tax_type, ppn_rate FROM inventory_batches
             WHERE product_id = $1 AND qty_current > 0 AND COALESCE(is_active, TRUE) = TRUE
             AND (expired_date IS NULL OR expired_date >= CURRENT_DATE)
             ORDER BY expired_date ASC NULLS LAST LIMIT 1`,
            [product.id]
          );
          snapshotBatchId = firstBatch?.id || null;
          snapshotBatchNo = firstBatch?.batch_no || null;
          snapshotExpiredDate = firstBatch?.expired_date || null;
          snapshotTaxType = resolveItemHppTaxType(it, firstBatch);
          snapshotPpnRate = firstBatch?.ppn_rate ?? null;
          itemBatchInfo.push({ product, qtyBase, qtyInUnit, unit: it.unit || product.base_unit || 'pcs', isSelected: false });
        }
      } else {
        itemBatchInfo.push({ product: null, qtyBase: 0, qtyInUnit, unit: 'pcs', isSelected: false });
      }

      actualItemGross += qtyInUnit * ((it.unit_price || 0) - tax.hppFromHnaByRate(it.unit_hpp || 0, snapshotTaxType, snapshotPpnRate));

      await client.query(
        `INSERT INTO sales_items (sales_order_id, product_name, qty, unit, unit_price, unit_hpp, unit_hpp_tax_type, subtotal, qty_in_unit, pack_size_at_sale, batch_id_snapshot, batch_no_snapshot, expired_date_snapshot, unit_hpp_ppn_rate)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [order.id, it.product_name, qtyBase, it.unit || 'pcs', it.unit_price || 0, it.unit_hpp || 0, snapshotTaxType, subtotal, qtyInUnit, packSize,
         snapshotBatchId, snapshotBatchNo, snapshotExpiredDate, snapshotPpnRate]
      );
    }

    // AUDIT-LS-06: simpan gross_profit versi snapshot (konsisten dgn recompute Dashboard)
    // v1.25.1: fee absorb ikut motong snapshot (pass_on netral — fee dibayar customer)
    await client.query(
      'UPDATE sales_orders SET gross_profit = $1, est_weight_gram = $2 WHERE id = $3',
      [actualItemGross + (ongkir - ongkirCost) - (pfMode === 'absorb' ? paymentFee : 0), Math.round(estimatedWeightGram), order.id]
    );

    // ─── Auto Stock-Out (FEFO or Selected Batch): Nota Penjualan → Inventory ───
    for (const ibi of itemBatchInfo) {
      if (!ibi.product || ibi.qtyBase <= 0) continue;
      const { product, qtyBase, qtyInUnit, unit: displayUnit, isSelected } = ibi;

      if (isSelected) {
        // Deduct from selected batch (already locked above)
        await client.query('UPDATE inventory_batches SET qty_current = qty_current - $1 WHERE id = $2', [qtyBase, ibi.selectedBatchId]);
        await client.query(
          `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, reference_id, notes, qty_unit, qty_in_unit)
           VALUES ($1, $2, 'out', $3, 'nota', $4, $5, $6, $7)`,
          [product.id, ibi.selectedBatchId, qtyBase, order.id,
           `Stok keluar (batch terpilih) dari nota ${orderNumber}${displayUnit !== product.base_unit ? ` (${qtyInUnit} ${displayUnit})` : ''}`,
           displayUnit, qtyInUnit]
        );
      } else {
        // Default FEFO multi-batch deduction
        const { rows: batches } = await client.query(
          `SELECT * FROM inventory_batches
           WHERE product_id = $1 AND qty_current > 0
           AND COALESCE(is_active, TRUE) = TRUE
           AND (expired_date IS NULL OR expired_date >= CURRENT_DATE)
           ORDER BY expired_date ASC NULLS LAST
           FOR UPDATE`,
          [product.id]
        );
        let remaining = qtyBase;
        for (const batch of batches) {
          if (remaining <= 0) break;
          const deduct = Math.min(batch.qty_current, remaining);
          await client.query('UPDATE inventory_batches SET qty_current = qty_current - $1 WHERE id = $2', [deduct, batch.id]);
          await client.query(
            `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, reference_id, notes, qty_unit, qty_in_unit)
             VALUES ($1, $2, 'out', $3, 'nota', $4, $5, $6, $7)`,
            [product.id, batch.id, deduct, order.id,
             `Stok keluar FEFO dari nota ${orderNumber}${displayUnit !== product.base_unit ? ` (${qtyInUnit} ${displayUnit})` : ''}`,
             displayUnit, qtyInUnit]
          );
          remaining -= deduct;
        }
        if (remaining > 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Stok ${product.name} tidak mencukupi (kurang: ${remaining} ${product.base_unit || 'pcs'})` });
        }
      }
    }

    await client.query('COMMIT');

    // v1.23.0: kontak dari form nota nge-sync balik ke master customer.
    // POST-COMMIT via pool: gagal sync tidak boleh membatalkan nota.
    await syncCustomerContact({
      customerId: customer_id,
      customerName: customer_name,
      phone: customer_phone,
      address: customer_address,
    });

    // Return the full order with items
    const result = await pool.query(
      `SELECT s.*, COALESCE(s.customer_phone, MAX(c.phone)) AS customer_phone,
        COALESCE(json_agg(i ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
       FROM sales_orders s LEFT JOIN customers c ON s.customer_id = c.id
       LEFT JOIN sales_items i ON i.sales_order_id = s.id
       WHERE s.id = $1 GROUP BY s.id`, [order.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[sales] rollback failed:', rollbackErr);
    }
    if (err.code === '23505' && (err.constraint === 'sales_orders_order_number_key' || err.message.includes('order_number'))) {
      return res.status(400).json({ error: 'Nomor Nota sudah digunakan. Gunakan nomor lain.' });
    }
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message.replace('USER: ','') });
    return res.status(500).json({ error: err.message });
  } finally {
    try {
      client.release();
    } catch (releaseErr) {
      console.error('[sales] client release failed:', releaseErr);
    }
  }
});

// PUT update
router.put('/:id', auth, async (req, res) => {
  const { customer_id, customer_name, customer_address, customer_phone, sale_date, notes, items, status, payment_method, payment_details, channel: rawChannel, due_date, payment_terms, ongkir: rawOngkir, ongkir_cost: rawOngkirCost, package_weight_gram: rawPackageWeightGram } = req.body;
  const channel = ['offline', 'online'].includes(rawChannel) ? rawChannel : 'offline';
  const ongkir = Math.max(0, parseFloat(rawOngkir) || 0);
  const ongkirCost = Math.max(0, parseFloat(rawOngkirCost) || 0);
  const packageWeightGram = Math.max(0, parseInt(rawPackageWeightGram) || 0);
  // Validasi SEBELUM BEGIN — return di dalam transaksi meninggalkan koneksi idle-in-transaction
  if (!customer_name?.trim()) return res.status(400).json({ error: 'Nama customer wajib diisi' });
  if (!items?.length) return res.status(400).json({ error: 'Minimal 1 produk diperlukan' });
  // AUDIT-LS-09: qty negatif/non-angka lolos = total & laba korup tapi stok tidak keluar
  const itemError = validateSaleItems(items);
  if (itemError) return res.status(400).json({ error: itemError });

  // v1.54.0: nota hasil konversi pinjaman TIDAK boleh diedit itemnya — PUT me-reverse
  // mutasi 'nota' (yang tidak ada) lalu potong stok baru → stok kepotong DOBEL.
  // Pelunasan tetap bisa via PATCH payment-status. Hapus nota → status balik dipinjam.
  const { rows: [loanCheck] } = await pool.query(
    'SELECT source_loan_id FROM sales_orders WHERE id = $1 AND is_deleted = FALSE', [req.params.id]
  );
  if (loanCheck?.source_loan_id) {
    return res.status(400).json({ error: 'Nota hasil konversi pinjaman tidak bisa diedit. Hapus nota ini (item kembali berstatus dipinjam), lalu konversi ulang dari menu Pinjaman.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let total = 0;
    let gross_profit = 0;
	    items.forEach(it => {
	      total += (it.qty || 1) * (it.unit_price || 0);
	      gross_profit += (it.qty || 1) * ((it.unit_price || 0) - getItemUnitCost(it));
	    });
    // v1.21.14: ongkir ditagih masuk total; untung ongkir = ditagih - biaya asli.
    total += ongkir;
    gross_profit += (ongkir - ongkirCost);
    // v1.25.1: fee kartu kredit (lihat POST)
    const { rate: pfRate, mode: pfMode } = parsePaymentFee(req.body);
    const paymentFee = computePaymentFee(total, pfRate, pfMode);
    if (pfMode === 'pass_on') total += paymentFee;
    else gross_profit -= paymentFee;

    // v1.53.1: auto-link customer_id by name (mirror create) supaya history/CRM akurat.
    let resolvedCustomerId = customer_id || null;
    if (!resolvedCustomerId && customer_name?.trim()) {
      const { rows: cm } = await client.query(
        `SELECT id FROM customers WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 2`,
        [customer_name],
      );
      if (cm.length === 1) resolvedCustomerId = cm[0].id;
    }
    const { rowCount } = await client.query(
      `UPDATE sales_orders SET customer_id=$1, customer_name=$2, customer_address=$3, customer_phone=$4, sale_date=$5, total=$6, gross_profit=$7, notes=$8, status=$9, payment_method=$10, payment_details=$11, channel=$12, due_date=$13, payment_terms=$14, ongkir=$15, ongkir_cost=$16, payment_fee_rate=$17, payment_fee_mode=$18, payment_fee=$19, package_weight_gram=$20, est_weight_gram=0, updated_at=NOW()
       WHERE id=$21 AND is_deleted=FALSE`,
      [resolvedCustomerId, customer_name.trim(), customer_address || '', customer_phone || '', sale_date || new Date(), total, gross_profit, notes || '', status || 'final', payment_method || 'Tunai', payment_details || '', channel, due_date || null, payment_terms || null, ongkir, ongkirCost, pfRate, pfMode, paymentFee, packageWeightGram, req.params.id]
    );
    if (!rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Nota not found' }); }

    // v1.8.1: STOCK SYNC — reverse-old + apply-new pattern (mirror DELETE behavior).
    // 1) Reverse semua mutations type='out' untuk nota ini → return qty ke batch.
    const { rows: outMutations } = await client.query(
      `SELECT batch_id, product_id, qty FROM inventory_mutations
       WHERE reference_type = 'nota' AND reference_id = $1 AND type = 'out' AND batch_id IS NOT NULL`,
      [req.params.id]
    );
    for (const m of outMutations) {
      await client.query(
        'UPDATE inventory_batches SET qty_current = qty_current + $1 WHERE id = $2',
        [m.qty, m.batch_id]
      );
    }
    // 2) Hapus mutations lama (out + nota-cancelled in) supaya gak duplicate audit trail
    await client.query(
      `DELETE FROM inventory_mutations WHERE reference_type IN ('nota', 'nota-cancelled') AND reference_id = $1`,
      [req.params.id]
    );

    // Replace items
    await client.query('DELETE FROM sales_items WHERE sales_order_id = $1', [req.params.id]);
    // v1.6.0 multi-unit + v1.7.0 batch snapshot + v1.16.2 selected_batch safety
    // v1.8.1: re-snapshot batch_no/expired_date on edit (sebelumnya PUT gak update snapshot)
    const productMap = new Map();
    for (const it of items) {
      if (productMap.has(it.product_name)) continue;
      let { rows: [p] } = await client.query(
        'SELECT id, name, base_unit, pack_unit, pack_size, weight_gram FROM product_master WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND is_active = TRUE ORDER BY id ASC LIMIT 1',
        [it.product_name]
      );
      if (!p) {
        // v1.22.2: fallback alias — nota dengan nama produk lama tetap resolve
        const { rows: [pa] } = await client.query(
          `SELECT pm.id, pm.name, pm.base_unit, pm.pack_unit, pm.pack_size, pm.weight_gram
           FROM product_aliases a
           JOIN product_master pm ON pm.id = a.product_id AND pm.is_active = TRUE
           WHERE LOWER(TRIM(a.alias_name)) = LOWER(TRIM($1)) LIMIT 1`,
          [it.product_name]
        );
        p = pa;
      }
      if (!p) continue;
      productMap.set(it.product_name, { ...p });
    }

    // Fetch order number once for mutation notes
    const { rows: [orderInfo] } = await client.query('SELECT order_number FROM sales_orders WHERE id = $1', [req.params.id]);
    const orderNumber = orderInfo?.order_number || `#${req.params.id}`;

    // Insert items with batch snapshot (using resolveSelectedBatchForSale + FEFO fallback)
    const itemBatchInfo = []; // track for stock-out phase
    let actualItemGross = 0; // AUDIT-LS-06: gross dari tax_type batch AKTUAL, bukan payload
    let estimatedWeightGram = packageWeightGram;
    for (const it of items) {
      const product = productMap.get(it.product_name);
      const qtyInUnit = parseFloat(it.qty) || 1;
      const qtyBase = product ? uom.toBase(qtyInUnit, it.unit, product) : qtyInUnit;
      const packSize = product?.pack_size || 1;
      const subtotal = qtyInUnit * (it.unit_price || 0);
      if (product) estimatedWeightGram += qtyBase * (Math.max(0, parseInt(product.weight_gram) || 0));

      let snapshotBatchId = null;
      let snapshotBatchNo = null;
      let snapshotExpiredDate = null;
      let snapshotTaxType = tax.normalizeTaxType(it.unit_hpp_tax_type);
      let snapshotPpnRate = null;

      if (product) {
        const resolved = await resolveSelectedBatchForSale(client, product.id, it);
        if (resolved.batch) {
          // Deduct from this exact batch (resolved by id, name+date, or name only)
          if (resolved.batch.qty_current < qtyBase) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Stok batch tidak cukup untuk ${product.name} (tersedia: ${resolved.batch.qty_current})` });
          }
          snapshotBatchId = resolved.batch.id;
          snapshotBatchNo = resolved.batch.batch_no;
          snapshotExpiredDate = resolved.batch.expired_date;
          snapshotTaxType = resolveItemHppTaxType(it, resolved.batch);
          snapshotPpnRate = resolved.batch.ppn_rate ?? null;
          itemBatchInfo.push({ product, selectedBatchId: resolved.batch.id, qtyBase, qtyInUnit, unit: it.unit || product.base_unit || 'pcs', isSelected: true });
        } else {
          // FEFO fallback (existing behavior)
          const { rows: [firstBatch] } = await client.query(
            `SELECT id, batch_no, expired_date, tax_type, ppn_rate FROM inventory_batches
             WHERE product_id = $1 AND qty_current > 0 AND COALESCE(is_active, TRUE) = TRUE
             AND (expired_date IS NULL OR expired_date >= CURRENT_DATE)
             ORDER BY expired_date ASC NULLS LAST LIMIT 1`,
            [product.id]
          );
          snapshotBatchId = firstBatch?.id || null;
          snapshotBatchNo = firstBatch?.batch_no || null;
          snapshotExpiredDate = firstBatch?.expired_date || null;
          snapshotTaxType = resolveItemHppTaxType(it, firstBatch);
          snapshotPpnRate = firstBatch?.ppn_rate ?? null;
          itemBatchInfo.push({ product, qtyBase, qtyInUnit, unit: it.unit || product.base_unit || 'pcs', isSelected: false });
        }
      } else {
        itemBatchInfo.push({ product: null, qtyBase: 0, qtyInUnit, unit: 'pcs', isSelected: false });
      }

      actualItemGross += qtyInUnit * ((it.unit_price || 0) - tax.hppFromHnaByRate(it.unit_hpp || 0, snapshotTaxType, snapshotPpnRate));

      await client.query(
        `INSERT INTO sales_items (sales_order_id, product_name, qty, unit, unit_price, unit_hpp, unit_hpp_tax_type, subtotal, qty_in_unit, pack_size_at_sale, batch_id_snapshot, batch_no_snapshot, expired_date_snapshot, unit_hpp_ppn_rate)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [req.params.id, it.product_name, qtyBase, it.unit || 'pcs', it.unit_price || 0, it.unit_hpp || 0, snapshotTaxType, subtotal, qtyInUnit, packSize,
         snapshotBatchId, snapshotBatchNo, snapshotExpiredDate, snapshotPpnRate]
      );
    }

    // AUDIT-LS-06: simpan gross_profit versi snapshot (konsisten dgn recompute Dashboard)
    // v1.25.1: fee absorb ikut motong snapshot (pass_on netral — fee dibayar customer)
    await client.query(
      'UPDATE sales_orders SET gross_profit = $1, est_weight_gram = $2 WHERE id = $3',
      [actualItemGross + (ongkir - ongkirCost) - (pfMode === 'absorb' ? paymentFee : 0), Math.round(estimatedWeightGram), req.params.id]
    );

    // 3) Apply-new stock-out: selected batch or FEFO deduct + INSERT mutations
    for (const ibi of itemBatchInfo) {
      if (!ibi.product || ibi.qtyBase <= 0) continue;
      const { product, qtyBase, qtyInUnit, unit: displayUnit, isSelected } = ibi;

      if (isSelected) {
        // Deduct from selected batch (already locked above)
        await client.query('UPDATE inventory_batches SET qty_current = qty_current - $1 WHERE id = $2', [qtyBase, ibi.selectedBatchId]);
        await client.query(
          `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, reference_id, notes, qty_unit, qty_in_unit)
           VALUES ($1, $2, 'out', $3, 'nota', $4, $5, $6, $7)`,
          [product.id, ibi.selectedBatchId, qtyBase, req.params.id,
           `Stok keluar (batch terpilih) dari nota ${orderNumber} (edit-resync)${displayUnit !== product.base_unit ? ` (${qtyInUnit} ${displayUnit})` : ''}`,
           displayUnit, qtyInUnit]
        );
      } else {
        // Default FEFO multi-batch deduction
        const { rows: batches } = await client.query(
          `SELECT * FROM inventory_batches
           WHERE product_id = $1 AND qty_current > 0
           AND COALESCE(is_active, TRUE) = TRUE
           AND (expired_date IS NULL OR expired_date >= CURRENT_DATE)
           ORDER BY expired_date ASC NULLS LAST
           FOR UPDATE`,
          [product.id]
        );
        let remaining = qtyBase;
        for (const batch of batches) {
          if (remaining <= 0) break;
          const deduct = Math.min(batch.qty_current, remaining);
          await client.query('UPDATE inventory_batches SET qty_current = qty_current - $1 WHERE id = $2', [deduct, batch.id]);
          await client.query(
            `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, reference_id, notes, qty_unit, qty_in_unit)
             VALUES ($1, $2, 'out', $3, 'nota', $4, $5, $6, $7)`,
            [product.id, batch.id, deduct, req.params.id,
             `Stok keluar FEFO dari nota ${orderNumber} (edit-resync)${displayUnit !== product.base_unit ? ` (${qtyInUnit} ${displayUnit})` : ''}`,
             displayUnit, qtyInUnit]
          );
          remaining -= deduct;
        }
        if (remaining > 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Stok ${product.name} tidak mencukupi (kurang: ${remaining} ${product.base_unit || 'pcs'})` });
        }
      }
    }

    await client.query('COMMIT');

    // v1.23.0: mirror POST — kontak form Edit Nota nge-sync balik ke master customer.
    await syncCustomerContact({
      customerId: customer_id,
      customerName: customer_name,
      phone: customer_phone,
      address: customer_address,
    });

    const result = await pool.query(
      `SELECT s.*, COALESCE(s.customer_phone, MAX(c.phone)) AS customer_phone,
        COALESCE(json_agg(i ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
       FROM sales_orders s LEFT JOIN customers c ON s.customer_id = c.id
       LEFT JOIN sales_items i ON i.sales_order_id = s.id
       WHERE s.id = $1 GROUP BY s.id`, [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message.replace('USER: ','') });
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE (soft) — v1.7.1: reverse stock (return ke batch asal) + soft-delete nota
router.delete('/:id', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Cek nota exists + active
    const { rows: [existing] } = await client.query(
      'SELECT id, order_number FROM sales_orders WHERE id = $1 AND is_deleted = FALSE', [req.params.id]
    );
    if (!existing) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Nota not found' }); }

    // Reverse stock: fetch semua mutations type='out' untuk nota ini, return qty ke batch
    const { rows: outMutations } = await client.query(
      `SELECT batch_id, product_id, qty FROM inventory_mutations
       WHERE reference_type = 'nota' AND reference_id = $1 AND type = 'out' AND batch_id IS NOT NULL`,
      [req.params.id]
    );
    for (const m of outMutations) {
      await client.query(
        'UPDATE inventory_batches SET qty_current = qty_current + $1 WHERE id = $2',
        [m.qty, m.batch_id]
      );
      await client.query(
        `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, reference_id, notes, created_by)
         VALUES ($1, $2, 'in', $3, 'nota-cancelled', $4, $5, $6)`,
        [m.product_id, m.batch_id, m.qty, req.params.id,
         `Reversal dari nota ${existing.order_number} dihapus`, req.user?.id || null]
      );
    }

    // v1.54.0: nota hasil konversi pinjaman dihapus → stok TIDAK berubah (tidak ada
    // mutasi 'nota'; barang masih di customer) — item kembali berstatus DIPINJAM.
    // to_regclass guard: tabel loan belum ada (deploy lama) → jangan pecahin delete nota.
    const { rows: [{ to_regclass: lcTable }] } = await client.query(`SELECT to_regclass('loan_conversions')`);
    let revertedLoans = 0;
    if (lcTable) {
      const { rows: convs } = await client.query(
        `UPDATE loan_conversions SET is_reverted = TRUE
         WHERE sales_order_id = $1 AND is_reverted = FALSE
         RETURNING loan_id, loan_item_id, qty`,
        [req.params.id]
      );
      for (const cv of convs) {
        await client.query(
          'UPDATE loan_items SET qty_purchased = GREATEST(0, qty_purchased - $1) WHERE id = $2',
          [cv.qty, cv.loan_item_id]
        );
      }
      const loanIds = [...new Set(convs.map(cv => cv.loan_id))];
      for (const loanId of loanIds) {
        await client.query(
          `UPDATE loans SET status = CASE
             WHEN NOT EXISTS (SELECT 1 FROM loan_items li WHERE li.loan_id = loans.id
                              AND li.qty - li.qty_returned - li.qty_purchased > 0)
             THEN 'selesai' ELSE 'aktif' END,
           updated_at = NOW()
           WHERE id = $1 AND is_deleted = FALSE`,
          [loanId]
        );
      }
      revertedLoans = convs.length;
    }

    // Soft-delete nota
    await client.query(
      'UPDATE sales_orders SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1', [req.params.id]
    );
    await client.query('COMMIT');
    res.json({
      message: revertedLoans
        ? `Nota ${existing.order_number} dihapus — ${revertedLoans} item kembali berstatus dipinjam (stok tidak berubah)`
        : `Nota ${existing.order_number} dihapus + ${outMutations.length} mutasi stok dikembalikan`,
      reverted_mutations: outMutations.length,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message.replace('USER: ','') });
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// RESTORE nota dari trash. Karena DELETE me-reverse stok (qty balik ke batch +
// mutasi 'nota-cancelled'), restore HARUS re-deduct stok dari batch yang sama
// supaya stok tidak dobel. Kalau stok batch sudah terpakai (kurang) → tolak,
// jangan korup inventory.
router.put('/:id/restore', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [existing] } = await client.query(
      'SELECT id, order_number FROM sales_orders WHERE id = $1 AND is_deleted = TRUE', [req.params.id]
    );
    if (!existing) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Nota tidak ada di trash' }); }

    // Qty yg HARUS dipotong ulang = stok yg masih "outstanding" dikembalikan ke
    // batch oleh delete, yaitu net (reversal delete 'nota-cancelled' in) −
    // (re-deduct restore sebelumnya 'nota-restored' out). Net ini aman untuk
    // siklus delete→restore→delete berapa kali pun (tidak dobel-hitung).
    const { rows: reversals } = await client.query(
      `SELECT batch_id, product_id,
         SUM(CASE WHEN reference_type = 'nota-cancelled' AND type = 'in' THEN qty
                  WHEN reference_type = 'nota-restored'  AND type = 'out' THEN -qty
                  ELSE 0 END) AS qty
       FROM inventory_mutations
       WHERE reference_id = $1 AND batch_id IS NOT NULL
         AND reference_type IN ('nota-cancelled', 'nota-restored')
       GROUP BY batch_id, product_id
       HAVING SUM(CASE WHEN reference_type = 'nota-cancelled' AND type = 'in' THEN qty
                       WHEN reference_type = 'nota-restored'  AND type = 'out' THEN -qty
                       ELSE 0 END) > 0`,
      [req.params.id]
    );

    // Guard: pastikan tiap batch masih punya stok cukup untuk di-deduct ulang.
    for (const r of reversals) {
      const { rows: [b] } = await client.query(
        'SELECT qty_current FROM inventory_batches WHERE id = $1 FOR UPDATE', [r.batch_id]
      );
      if (!b || Number(b.qty_current) < Number(r.qty)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Tidak bisa restore: stok salah satu batch nota ini sudah terpakai (tersedia ${b ? b.qty_current : 0}, butuh ${r.qty}). Koreksi stok dulu lewat Stok Opname.`,
        });
      }
    }

    // Re-deduct stok + catat mutasi 'out' (reference_type 'nota-restored' supaya
    // delete berikutnya tidak ikut me-reverse mutasi restore ini).
    for (const r of reversals) {
      await client.query(
        'UPDATE inventory_batches SET qty_current = qty_current - $1 WHERE id = $2',
        [r.qty, r.batch_id]
      );
      await client.query(
        `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, reference_id, notes, created_by)
         VALUES ($1, $2, 'out', $3, 'nota-restored', $4, $5, $6)`,
        [r.product_id, r.batch_id, r.qty, req.params.id,
         `Restore nota ${existing.order_number} dari trash`, req.user?.id || null]
      );
    }

    // v1.54.0: restore nota hasil konversi pinjaman → re-apply qty_purchased di loan.
    // Guard: kalau sisa pinjaman sudah diretur/dikonversi lain sementara nota di trash,
    // re-apply bakal bikin qty dobel → tolak restore dengan pesan jelas.
    const { rows: [{ to_regclass: lcTable }] } = await client.query(`SELECT to_regclass('loan_conversions')`);
    if (lcTable) {
      const { rows: convs } = await client.query(
        `SELECT lc.id, lc.loan_id, lc.loan_item_id, lc.qty, li.product_name,
                li.qty AS item_qty, li.qty_returned, li.qty_purchased
         FROM loan_conversions lc JOIN loan_items li ON li.id = lc.loan_item_id
         WHERE lc.sales_order_id = $1 AND lc.is_reverted = TRUE FOR UPDATE OF lc, li`,
        [req.params.id]
      );
      for (const cv of convs) {
        const room = Number(cv.item_qty) - Number(cv.qty_returned) - Number(cv.qty_purchased);
        if (Number(cv.qty) > room) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Tidak bisa restore: sisa pinjaman ${cv.product_name} sudah diretur/dikonversi lain (butuh ${cv.qty}, sisa ${room}). Void nota ini permanen atau koreksi pinjamannya dulu.`,
          });
        }
      }
      for (const cv of convs) {
        await client.query('UPDATE loan_items SET qty_purchased = qty_purchased + $1 WHERE id = $2', [cv.qty, cv.loan_item_id]);
        await client.query('UPDATE loan_conversions SET is_reverted = FALSE WHERE id = $1', [cv.id]);
      }
      for (const loanId of [...new Set(convs.map(cv => cv.loan_id))]) {
        await client.query(
          `UPDATE loans SET status = CASE
             WHEN NOT EXISTS (SELECT 1 FROM loan_items li WHERE li.loan_id = loans.id
                              AND li.qty - li.qty_returned - li.qty_purchased > 0)
             THEN 'selesai' ELSE 'aktif' END,
           updated_at = NOW()
           WHERE id = $1 AND is_deleted = FALSE`,
          [loanId]
        );
      }
    }

    await client.query(
      'UPDATE sales_orders SET is_deleted = FALSE, updated_at = NOW() WHERE id = $1', [req.params.id]
    );
    await client.query('COMMIT');
    res.json({
      message: `Nota ${existing.order_number} dipulihkan + ${reversals.length} mutasi stok dipotong ulang`,
      restored_mutations: reversals.length,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// PATCH pdf status
router.patch('/:id/pdf-status', auth, async (req, res) => {
  const { pdf_status } = req.body;
  if (!pdf_status) return res.status(400).json({ error: 'pdf_status required' });
  try {
    const { rowCount } = await pool.query(
      'UPDATE sales_orders SET pdf_status = $1, updated_at = NOW() WHERE id = $2 AND is_deleted = FALSE',
      [pdf_status, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Nota not found' });
    res.json({ message: 'Status PDF diperbarui' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH payment status
router.patch('/:id/payment-status', auth, async (req, res) => {
  const { payment_status } = req.body;
  if (!['unpaid', 'paid'].includes(payment_status)) {
    return res.status(400).json({ error: 'payment_status must be unpaid or paid' });
  }
  try {
    let paid_at = null;
    if (payment_status === 'paid') {
      if (req.body.paid_at) {
        const d = new Date(req.body.paid_at);
        if (isNaN(d.getTime())) return res.status(400).json({ error: 'Format tanggal paid_at tidak valid' });
        paid_at = d;
      } else {
        paid_at = new Date();
      }
    }
    const { rowCount } = await pool.query(
      'UPDATE sales_orders SET payment_status = $1, paid_at = $2, updated_at = NOW() WHERE id = $3 AND is_deleted = FALSE',
      [payment_status, paid_at, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Nota not found' });
    res.json({ message: 'Status pembayaran diperbarui', payment_status, paid_at });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
