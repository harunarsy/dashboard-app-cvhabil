const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const tax = require('../utils/tax');
const uom = require('../utils/uom');
const formDrafts = require('../utils/formDrafts');
const { generateMonthlyDocNumber } = require('../utils/docNumbers');

// v1.65.0: Normalisasi ppn_excluded ke boolean (terima true/false dan string 'true'/'false')
const normalizeBooleanField = (val) => {
  if (val === true || val === 'true') return true;
  if (val === false || val === 'false' || val === undefined || val === null) return false;
  return Boolean(val);
};

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

router.get('/:id/adjustments', auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT sa.*,
            COALESCE(sa.original_order_number, so.order_number) AS order_number,
            COALESCE(sa.original_customer_name, so.customer_name) AS customer_name,
            COALESCE(sa.original_payment_status, so.payment_status) AS payment_status,
            ss.id AS settlement_id, ss.type AS settlement_type,
            ss.amount AS settlement_amount, ss.settlement_status,
            ss.payment_method AS settlement_payment_method,
            ss.settlement_date,
            COALESCE(json_agg(sai ORDER BY sai.id) FILTER (WHERE sai.id IS NOT NULL), '[]') AS items
     FROM sales_adjustments sa
     JOIN sales_orders so ON so.id = sa.original_sales_order_id
     LEFT JOIN sales_adjustment_items sai ON sai.adjustment_id = sa.id
     LEFT JOIN LATERAL (
       SELECT id, type, amount, settlement_status, payment_method, settlement_date
       FROM sales_settlements
       WHERE adjustment_id = sa.id
       ORDER BY id DESC
       LIMIT 1
     ) ss ON TRUE
     WHERE sa.original_sales_order_id = $1
     GROUP BY sa.id, so.order_number, so.customer_name, so.payment_status,
              ss.id, ss.type, ss.amount, ss.settlement_status,
              ss.payment_method, ss.settlement_date
     ORDER BY sa.created_at DESC`,
    [req.params.id],
  );
  res.json(rows);
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
  const { customer_id, customer_name, customer_address, customer_phone, sale_date, notes, items, payment_method, payment_details, order_number: manualOrderNumber, channel: rawChannel, due_date, payment_terms, ongkir: rawOngkir, ongkir_cost: rawOngkirCost, package_weight_gram: rawPackageWeightGram, ppn_excluded: rawPpnExcluded } = req.body;
  const channel = ['offline', 'online'].includes(rawChannel) ? rawChannel : 'offline';
  // v1.65.0: Normalisasi ppn_excluded — jika nilai TRUE, tandai siapa + kapan
  const ppnExcluded = normalizeBooleanField(rawPpnExcluded);
  const ppnMarkedBy = ppnExcluded ? (req.user?.id || null) : null;
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
    // v1.65.0: Tambah ppn_excluded + audit tracking (ppn_marked_by, ppn_marked_at)
    const { rows } = await client.query(
      `INSERT INTO sales_orders (order_number, customer_id, customer_name, customer_address, customer_phone, sale_date, total, gross_profit, notes, payment_method, payment_details, created_by, channel, due_date, payment_terms, ongkir, ongkir_cost, payment_fee_rate, payment_fee_mode, payment_fee, package_weight_gram, est_weight_gram, ppn_excluded, ppn_marked_by, ppn_marked_at, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,'final') RETURNING *`,
      [orderNumber, resolvedCustomerId, customer_name.trim(), customer_address || '', customer_phone || '', sale_date || new Date(), total, gross_profit, notes || '', payment_method || 'Tunai', payment_details || '', req.user?.id || null, channel, due_date || null, payment_terms || null, ongkir, ongkirCost, pfRate, pfMode, paymentFee, packageWeightGram, 0, ppnExcluded, ppnMarkedBy, ppnExcluded ? new Date() : null]
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

// PATCH notes-only update: safe metadata correction for paid/final notes.
router.patch('/:id/notes', auth, async (req, res) => {
  const notes = typeof req.body.notes === 'string' ? req.body.notes : null;
  if (notes === null) return res.status(400).json({ error: 'notes wajib berupa teks' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [existing] } = await client.query('SELECT id, notes FROM sales_orders WHERE id = $1 AND is_deleted = FALSE FOR UPDATE', [req.params.id]);
    if (!existing) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Nota not found' }); }
    const { rows: [updated] } = await client.query('UPDATE sales_orders SET notes = $1, updated_at = NOW() WHERE id = $2 RETURNING id, order_number, notes, payment_status, paid_at, total, gross_profit', [notes, req.params.id]);
    await client.query('INSERT INTO sales_audit_log (sales_order_id, action, changed_by, before_snapshot, after_snapshot, note) VALUES ($1, $2, $3, $4, $5, $6)', [req.params.id, 'NOTES_UPDATE', req.user?.id || null, JSON.stringify({ notes: existing.notes }), JSON.stringify({ notes }), 'Notes-only update; inventory and payment fields untouched']);
    await client.query('COMMIT');
    res.json(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// POST return/exchange adjustment. The original paid sale and its mutations stay intact.
router.post('/:id/adjustments', auth, async (req, res) => {
  const {
    type = 'exchange',
    reason,
    notes = null,
    adjustment_date: adjustmentDate = null,
    payment_method: paymentMethod = null,
    idempotency_key: idempotencyKey,
    items = [],
  } = req.body || {};

  if (!['return', 'exchange', 'price_difference'].includes(type)) {
    return res.status(400).json({ error: 'type harus return, exchange, atau price_difference' });
  }
  if (!String(reason || '').trim()) return res.status(400).json({ error: 'Alasan penyesuaian wajib diisi' });
  if (type === 'price_difference' && !Number.isFinite(Number(req.body?.difference_amount))) {
    return res.status(400).json({ error: 'difference_amount wajib berupa angka untuk koreksi nominal' });
  }
  if (type !== 'price_difference' && (!Array.isArray(items) || items.length === 0)) {
    return res.status(400).json({ error: 'Minimal satu item adjustment diperlukan' });
  }
  if (!String(idempotencyKey || '').trim()) {
    return res.status(400).json({ error: 'idempotency_key wajib diisi agar retry tidak menggandakan retur' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [existingAdjustment] } = await client.query(
      'SELECT * FROM sales_adjustments WHERE idempotency_key = $1 FOR UPDATE',
      [String(idempotencyKey).trim()],
    );
    if (existingAdjustment) {
      const { rows: settlementRows } = await client.query(
        'SELECT * FROM sales_settlements WHERE adjustment_id = $1 ORDER BY id',
        [existingAdjustment.id],
      );
      await client.query('ROLLBACK');
      return res.status(200).json({
        adjustment: existingAdjustment,
        refund_amount: Number(existingAdjustment.refund_amount) || 0,
        additional_charge: Number(existingAdjustment.additional_charge) || 0,
        settlements: settlementRows,
        idempotent_replay: true,
      });
    }
    const { rows: [sale] } = await client.query(
      `SELECT id, order_number, customer_name, sale_date, total, payment_status, paid_at, is_deleted
       FROM sales_orders WHERE id = $1 FOR UPDATE`,
      [req.params.id],
    );
    if (!sale || sale.is_deleted) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Nota not found' });
    }
    if (sale.payment_status !== 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Adjustment hanya dapat dibuat untuk nota lunas' });
    }

    if (type === 'price_difference') {
      const difference = Number(req.body.difference_amount);
      const refundAmount = Math.max(0, -difference);
      const additionalCharge = Math.max(0, difference);
      const { rows: [adjustment] } = await client.query(
        `INSERT INTO sales_adjustments
         (adjustment_number, original_sales_order_id, type, status, reason, adjustment_date,
          original_order_number, original_sale_date, original_total, original_payment_status,
          original_paid_amount, original_paid_at, original_customer_name,
          returned_value, replacement_value, refund_amount, additional_charge, payment_method,
          notes, idempotency_key, created_by, posted_at)
         VALUES ('ADJ-' || TO_CHAR(CURRENT_DATE, 'YYMMDD') || '-' || LPAD(NEXTVAL('sales_adjustments_id_seq')::text, 4, '0'),
          $1, $2, 'posted', $3, COALESCE($4::date, CURRENT_DATE),
          $5, $6, $7, $8, $9, $10, $11,
          0, 0, $12, $13, $14, $15, $16, $17, NOW())
         RETURNING *`,
        [req.params.id, type, String(reason).trim(), adjustmentDate,
          sale.order_number, sale.sale_date, sale.total, sale.payment_status,
          sale.payment_status === 'paid' ? sale.total : 0, sale.paid_at, sale.customer_name,
          refundAmount, additionalCharge, paymentMethod, notes, String(idempotencyKey).trim(), req.user?.id || null],
      );
      if (refundAmount > 0 || additionalCharge > 0) {
        await client.query(
          `INSERT INTO sales_settlements
           (sales_order_id, adjustment_id, type, amount, payment_method, settlement_date, notes, created_by, settlement_status)
           VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7, $8, 'pending')`,
          [req.params.id, adjustment.id, refundAmount > 0 ? 'refund' : 'additional_charge',
            refundAmount || additionalCharge, paymentMethod, adjustmentDate,
            `Settlement dari ${adjustment.adjustment_number}`, req.user?.id || null],
        );
      }
      await client.query('COMMIT');
      return res.status(201).json({ adjustment, refund_amount: refundAmount, additional_charge: additionalCharge });
    }

    const returned = items.filter((item) => item.direction === 'returned');
    const replacements = items.filter((item) => item.direction === 'replacement');
    if (type === 'exchange' && (!returned.length || !replacements.length)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Exchange wajib memiliki item retur dan pengganti' });
    }
    if (type === 'return' && replacements.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Return tidak boleh memiliki item pengganti' });
    }

    const normalized = [];
    let returnedValue = 0;
    let replacementValue = 0;

    for (const item of returned) {
      const qty = Number(item.qty_base);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw Object.assign(new Error('USER: qty retur harus lebih besar dari 0'), { statusCode: 400 });
      }
      const { rows: [original] } = await client.query(
        'SELECT * FROM sales_items WHERE id = $1 AND sales_order_id = $2 FOR UPDATE',
        [item.original_sales_item_id, req.params.id],
      );
      if (!original) throw Object.assign(new Error('USER: Item nota asal tidak ditemukan'), { statusCode: 400 });

      const { rows: [{ returned_qty }] } = await client.query(
        `SELECT COALESCE(SUM(sai.qty_base), 0) AS returned_qty
         FROM sales_adjustment_items sai
         JOIN sales_adjustments sa ON sa.id = sai.adjustment_id
         WHERE sa.original_sales_order_id = $1
           AND sa.status = 'posted'
           AND sai.original_sales_item_id = $2
           AND sai.direction = 'returned'`,
        [req.params.id, original.id],
      );
      const available = Number(original.qty) - Number(returned_qty || 0);
      if (qty > available) {
        throw Object.assign(new Error(`USER: Qty retur melebihi sisa yang dapat diretur (${available})`), { statusCode: 400 });
      }

      const batchId = Number(original.batch_id_snapshot);
      if (!Number.isFinite(batchId)) throw Object.assign(new Error('USER: Batch asal item tidak tersedia'), { statusCode: 400 });
      const { rows: [batch] } = await client.query(
        'SELECT id, product_id, batch_no, expired_date, hna, tax_type, ppn_rate FROM inventory_batches WHERE id = $1 FOR UPDATE',
        [batchId],
      );
      if (!batch) throw Object.assign(new Error('USER: Batch asal tidak ditemukan'), { statusCode: 400 });
      const returnCondition = item.condition || 'saleable';
      if (!['saleable', 'expired', 'damaged', 'quarantine'].includes(returnCondition)) {
        throw Object.assign(new Error('USER: Kondisi retur tidak valid'), { statusCode: 400 });
      }
      if (returnCondition !== 'saleable' && !String(item.condition_reason || '').trim()) {
        throw Object.assign(new Error('USER: Kondisi retur perlu keterangan'), { statusCode: 400 });
      }

      const value = Number(item.qty_in_unit || qty) * Number(original.unit_price || 0);
      returnedValue += value;
      normalized.push({
        direction: 'returned',
        originalSalesItemId: original.id,
        productId: batch.product_id,
        productName: original.product_name,
        originalBatchId: batchId,
        originalBatchNo: batch.batch_no,
        originalExpiredDate: batch.expired_date,
        replacementBatchId: null,
        qty,
        qtyInUnit: Number(item.qty_in_unit || qty),
        unit: item.unit || original.unit || 'pcs',
        unitPrice: Number(original.unit_price || 0),
        value,
        condition: returnCondition,
        conditionReason: item.condition_reason || null,
        sourceInvoiceId: null,
        sourceInvoiceNumber: null,
      });
    }

    for (const item of replacements) {
      const qty = Number(item.qty_base);
      const batchId = Number(item.replacement_batch_id);
      if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(batchId)) {
        throw Object.assign(new Error('USER: qty dan batch replacement wajib valid'), { statusCode: 400 });
      }
      const { rows: [batch] } = await client.query(
        `SELECT b.id, b.product_id, b.qty_current, b.batch_no, b.expired_date, p.name
         FROM inventory_batches b
         JOIN product_master p ON p.id = b.product_id
         WHERE b.id = $1 AND COALESCE(b.is_active, TRUE) = TRUE
         FOR UPDATE`,
        [batchId],
      );
      if (!batch) throw Object.assign(new Error('USER: Batch replacement tidak ditemukan'), { statusCode: 400 });
      if (Number(batch.qty_current) < qty) {
        throw Object.assign(new Error(`USER: Stok replacement tidak cukup (tersedia ${batch.qty_current})`), { statusCode: 400 });
      }
      const sourceInvoiceId = Number(item.source_invoice_id);
      const sourceInvoiceNumber = String(item.source_invoice_number || '').trim();
      if (sourceInvoiceId || sourceInvoiceNumber) {
        const { rowCount } = await client.query(
          `SELECT 1 FROM inventory_mutations
           WHERE batch_id = $1 AND reference_type = 'faktur'
             AND reference_id = COALESCE($2, (SELECT id FROM invoices WHERE invoice_number = $3 LIMIT 1))
             AND type = 'in'
           LIMIT 1`,
          [batchId, Number.isFinite(sourceInvoiceId) && sourceInvoiceId > 0 ? sourceInvoiceId : null, sourceInvoiceNumber || null],
        );
        if (!rowCount) throw Object.assign(new Error('USER: Batch replacement tidak berasal dari invoice yang dipilih'), { statusCode: 400 });
      }
      const unitPrice = Number(item.unit_price || 0);
      const value = Number(item.qty_in_unit || qty) * unitPrice;
      replacementValue += value;
      normalized.push({
        direction: 'replacement',
        originalSalesItemId: null,
        productId: batch.product_id,
        productName: item.product_name || batch.name,
        originalBatchId: null,
        replacementBatchId: batchId,
        replacementBatchNo: batch.batch_no,
        replacementExpiredDate: batch.expired_date,
        qty,
        qtyInUnit: Number(item.qty_in_unit || qty),
        unit: item.unit || 'pcs',
        unitPrice,
        value,
        condition: null,
        sourceInvoiceId: Number.isFinite(sourceInvoiceId) && sourceInvoiceId > 0 ? sourceInvoiceId : null,
        sourceInvoiceNumber: sourceInvoiceNumber || null,
      });
    }

    const refundAmount = Math.max(0, returnedValue - replacementValue);
    const additionalCharge = Math.max(0, replacementValue - returnedValue);
    const { rows: [adjustment] } = await client.query(
      `INSERT INTO sales_adjustments
       (adjustment_number, original_sales_order_id, type, status, reason, adjustment_date,
        original_order_number, original_sale_date, original_total, original_payment_status,
        original_paid_amount, original_paid_at, original_customer_name,
        returned_value, replacement_value, refund_amount, additional_charge, payment_method, notes, idempotency_key, created_by, posted_at)
       VALUES ('ADJ-' || TO_CHAR(CURRENT_DATE, 'YYMMDD') || '-' || LPAD(NEXTVAL('sales_adjustments_id_seq')::text, 4, '0'),
         $1, $2, 'posted', $3, COALESCE($4::date, CURRENT_DATE),
         $5, $6, $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16, $17, $18, $19, NOW())
       RETURNING *`,
      [req.params.id, type, String(reason).trim(), adjustmentDate,
        sale.order_number, sale.sale_date, sale.total, sale.payment_status,
        sale.payment_status === 'paid' ? sale.total : 0, sale.paid_at, sale.customer_name,
        returnedValue, replacementValue, refundAmount, additionalCharge, paymentMethod, notes, String(idempotencyKey).trim(), req.user?.id || null],
    );

    for (const item of normalized) {
      await client.query(
        `INSERT INTO sales_adjustment_items
         (adjustment_id, original_sales_item_id, product_id, product_name_snapshot,
          original_batch_id, replacement_batch_id, qty_base, qty_in_unit, unit,
          unit_price, line_amount, direction, condition, condition_reason, source_invoice_id, source_invoice_number,
          original_batch_no, original_expired_date, replacement_batch_no, replacement_expired_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [adjustment.id, item.originalSalesItemId, item.productId, item.productName,
          item.originalBatchId, item.replacementBatchId, item.qty, item.qtyInUnit,
          item.unit, item.unitPrice, item.value, item.direction, item.condition,
          item.conditionReason, item.sourceInvoiceId, item.sourceInvoiceNumber,
          item.originalBatchNo, item.originalExpiredDate, item.replacementBatchNo, item.replacementExpiredDate],
      );
      const isReturn = item.direction === 'returned';
      const batchId = isReturn ? item.originalBatchId : item.replacementBatchId;
      let mutationBatchId = batchId;
      if (isReturn && item.condition !== 'saleable') {
        const { rows: [quarantineBatch] } = await client.query(
          `INSERT INTO inventory_batches
           (product_id, batch_no, expired_date, qty_current, hna, source_type, source_ref, tax_type, ppn_rate, is_active, notes)
           SELECT product_id, CONCAT(COALESCE(batch_no, 'NO-BATCH'), '-RET-', $1), expired_date, $2, hna,
                  'sale-adjustment-return', $1, tax_type, ppn_rate, FALSE, $3
            FROM inventory_batches WHERE id = $4
            RETURNING id`,
          [adjustment.id, item.qty, item.conditionReason, batchId],
        );
        mutationBatchId = quarantineBatch.id;
      } else {
        await client.query(
          'UPDATE inventory_batches SET qty_current = qty_current ' + (isReturn ? '+' : '-') + ' $1 WHERE id = $2',
          [item.qty, batchId],
        );
      }
      await client.query(
        `INSERT INTO inventory_mutations
         (product_id, batch_id, type, qty, reference_type, reference_id, notes, created_by, qty_unit, qty_in_unit)
         VALUES ($1, $2, $3, $4, 'sale-adjustment', $5, $6, $7, $8, $9)`,
        [item.productId, mutationBatchId, isReturn ? 'in' : 'out', item.qty, adjustment.id,
          `${isReturn ? 'Retur' : 'Replacement'} dari nota ${sale.order_number} (${adjustment.adjustment_number})`,
          req.user?.id || null, item.unit, item.qtyInUnit],
      );
    }

    if (refundAmount > 0 || additionalCharge > 0) {
      await client.query(
        `INSERT INTO sales_settlements
         (sales_order_id, adjustment_id, type, amount, payment_method, settlement_date, notes, created_by, settlement_status)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7, $8, 'pending')`,
        [req.params.id, adjustment.id, refundAmount > 0 ? 'refund' : 'additional_charge',
          refundAmount || additionalCharge, paymentMethod, adjustmentDate,
          `Settlement dari ${adjustment.adjustment_number}`, req.user?.id || null],
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ adjustment, refund_amount: refundAmount, additional_charge: additionalCharge });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message.replace('USER: ', '') });
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

router.post('/adjustments/:adjustmentId/settle', auth, roleGuard('direktur'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [settlement] } = await client.query(
      `SELECT ss.*, sa.adjustment_number, sa.original_sales_order_id
       FROM sales_settlements ss
       JOIN sales_adjustments sa ON sa.id = ss.adjustment_id
       WHERE ss.adjustment_id = $1 AND ss.settlement_status = 'pending'
       FOR UPDATE`,
      [req.params.adjustmentId],
    );
    if (!settlement) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Settlement pending tidak ditemukan' });
    }
    const debit = settlement.type === 'refund' ? Number(settlement.amount) : 0;
    const credit = settlement.type === 'additional_charge' ? Number(settlement.amount) : 0;
    const description = `${settlement.type === 'refund' ? 'Refund' : 'Tambahan pembayaran'} ${settlement.adjustment_number}`;
    const { rows: [entry] } = await client.query(
      `INSERT INTO ledger_entries
       (entry_date, account_name, description, debit, credit, category, reference_type, reference_id, source, auto_cat, created_by)
       VALUES (COALESCE($1::date, CURRENT_DATE), $2, $3, $4, $5, $6, 'sale-adjustment', $7, 'sales-adjustment', TRUE, $8)
       RETURNING *`,
      [req.body?.settlement_date || null, req.body?.account_name || 'Kas/Bank', description, debit, credit, settlement.type, settlement.adjustment_id, req.user?.id || null],
    );
    const { rows: [updated] } = await client.query(
      `UPDATE sales_settlements SET settlement_status = 'confirmed', ledger_entry_id = $1 WHERE id = $2 RETURNING *`,
      [entry.id, settlement.id],
    );
    await client.query('COMMIT');
    res.json({ settlement: updated, ledger_entry: entry });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

router.post('/adjustments/:adjustmentId/void', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [adjustment] } = await client.query(
      `SELECT sa.*, so.order_number
       FROM sales_adjustments sa
       JOIN sales_orders so ON so.id = sa.original_sales_order_id
       WHERE sa.id = $1 FOR UPDATE`,
      [req.params.adjustmentId],
    );
    if (!adjustment) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Adjustment tidak ditemukan' });
    }
    if (adjustment.status !== 'posted') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Hanya adjustment posted yang dapat di-void' });
    }
    const { rows: settlements } = await client.query(
      'SELECT id, settlement_status FROM sales_settlements WHERE adjustment_id = $1 FOR UPDATE',
      [adjustment.id],
    );
    if (settlements.some((settlement) => settlement.settlement_status === 'confirmed')) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Adjustment dengan settlement terkonfirmasi perlu reversal ledger sebelum void' });
    }
    const { rows: mutations } = await client.query(
      `SELECT * FROM inventory_mutations
       WHERE reference_type = 'sale-adjustment' AND reference_id = $1
       ORDER BY id FOR UPDATE`,
      [adjustment.id],
    );
    for (const mutation of mutations) {
      const delta = mutation.type === 'in' ? -Number(mutation.qty) : Number(mutation.qty);
      await client.query('UPDATE inventory_batches SET qty_current = qty_current + $1 WHERE id = $2', [delta, mutation.batch_id]);
      await client.query(
        `INSERT INTO inventory_mutations
         (product_id, batch_id, type, qty, reference_type, reference_id, notes, created_by, qty_unit, qty_in_unit)
         VALUES ($1, $2, $3, $4, 'sale-adjustment-void', $5, $6, $7, $8, $9)`,
        [mutation.product_id, mutation.batch_id, mutation.type === 'in' ? 'out' : 'in', mutation.qty,
          adjustment.id, `Void adjustment ${adjustment.adjustment_number}`, req.user?.id || null, mutation.qty_unit, mutation.qty_in_unit],
      );
    }
    const { rows: [updated] } = await client.query(
      `UPDATE sales_adjustments SET status = 'void', voided_at = NOW() WHERE id = $1 RETURNING *`,
      [adjustment.id],
    );
    await client.query(
      `UPDATE sales_settlements
       SET settlement_status = 'void', notes = CONCAT(COALESCE(notes, ''), ' | void adjustment')
       WHERE adjustment_id = $1 AND settlement_status = 'pending'`,
      [adjustment.id],
    );
    await client.query('COMMIT');
    res.json({ adjustment: updated, reversed_mutations: mutations.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// PUT update
router.put('/:id', auth, async (req, res) => {
  const { customer_id, customer_name, customer_address, customer_phone, sale_date, notes, items, status, payment_method, payment_details, channel: rawChannel, due_date, payment_terms, ongkir: rawOngkir, ongkir_cost: rawOngkirCost, package_weight_gram: rawPackageWeightGram, ppn_excluded: rawPpnExcluded } = req.body;
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

    // v1.65.0: Ambil ppn_excluded lama (untuk tracking perubahan di audit fields)
    const { rows: [noteOld] } = await client.query(
      'SELECT ppn_excluded, payment_status FROM sales_orders WHERE id = $1 AND is_deleted = FALSE FOR UPDATE',
      [req.params.id]
    );
    if (noteOld?.payment_status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Nota lunas tidak bisa diedit langsung. Gunakan Retur/Tukar Barang atau Edit Catatan.' });
    }
    const oldPpnExcluded = noteOld?.ppn_excluded ?? false;
    // Tentukan nilai baru (jika tidak dikirim, pertahankan lama)
    const newPpnExcluded = rawPpnExcluded !== undefined ? normalizeBooleanField(rawPpnExcluded) : oldPpnExcluded;
    // Track perubahan untuk audit fields
    const ppnChanged = newPpnExcluded !== oldPpnExcluded;
    const ppnMarkedBy = ppnChanged ? (req.user?.id || null) : null;
    const ppnMarkedAt = ppnChanged ? new Date() : null;

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
    // v1.65.0: Tambah ppn_excluded + conditional audit tracking (hanya jika berubah)
    const { rowCount } = await client.query(
      `UPDATE sales_orders SET customer_id=$1, customer_name=$2, customer_address=$3, customer_phone=$4, sale_date=$5, total=$6, gross_profit=$7, notes=$8, status=$9, payment_method=$10, payment_details=$11, channel=$12, due_date=$13, payment_terms=$14, ongkir=$15, ongkir_cost=$16, payment_fee_rate=$17, payment_fee_mode=$18, payment_fee=$19, package_weight_gram=$20, est_weight_gram=0, ppn_excluded=$21, ppn_marked_by = CASE WHEN $22::boolean THEN $23 ELSE ppn_marked_by END, ppn_marked_at = CASE WHEN $22::boolean THEN $24::timestamp ELSE ppn_marked_at END, updated_at=NOW()
       WHERE id=$25 AND is_deleted=FALSE`,
      [resolvedCustomerId, customer_name.trim(), customer_address || '', customer_phone || '', sale_date || new Date(), total, gross_profit, notes || '', status || 'final', payment_method || 'Tunai', payment_details || '', channel, due_date || null, payment_terms || null, ongkir, ongkirCost, pfRate, pfMode, paymentFee, packageWeightGram, newPpnExcluded, ppnChanged, ppnMarkedBy, ppnMarkedAt, req.params.id]
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
    // 2) Hapus mutations lama (out + nota-cancelled in + nota-restored out) supaya gak duplicate audit trail
    // v1.64.1: nota-restored ikut dihapus — reverse di atas sudah mengembalikan qty dari mutasi
    // 'nota' out yang outstanding, jadi baris nota-restored jadi yatim dan bikin net restore
    // (cancelled in - restored out) keliru kehitung 0 di edit berikutnya, stok gak kepotong ulang.
    await client.query(
      `DELETE FROM inventory_mutations WHERE reference_type IN ('nota', 'nota-cancelled', 'nota-restored') AND reference_id = $1`,
      [req.params.id]
    );

    // Replace items. Each submitted row resolves and snapshots its own batch.
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

    // The explicit selected batch is authoritative. Do not restore snapshots by
    // product/unit/HPP because different batches can legitimately share HPP.
    // Recompute gross profit from the newly written item snapshots.
    const _hppSqlLock = tax.hppSqlForSalesItem('si');
    const { rows: [_gpLock] } = await client.query(
      `SELECT COALESCE(SUM(COALESCE(si.qty_in_unit, si.qty, 0) * (COALESCE(si.unit_price,0) - (${_hppSqlLock}))), 0) AS g
       FROM sales_items si WHERE si.sales_order_id = $1`,
      [req.params.id]
    );
    actualItemGross = parseFloat(_gpLock.g) || 0;

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
      'SELECT id, order_number, payment_status FROM sales_orders WHERE id = $1 AND is_deleted = FALSE', [req.params.id]
    );
    if (!existing) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Nota not found' }); }
    if (existing.payment_status === 'paid') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Nota lunas tidak bisa dihapus langsung. Gunakan Retur/Tukar Barang atau pembatalan resmi.' }); }

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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [existing] } = await client.query(
      'SELECT payment_status FROM sales_orders WHERE id = $1 AND is_deleted = FALSE FOR UPDATE',
      [req.params.id],
    );
    if (!existing) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Nota not found' });
    }
    if (existing.payment_status === 'paid' && payment_status === 'unpaid') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Pembayaran nota lunas tidak bisa dibatalkan dari jalur biasa. Gunakan adjustment resmi.' });
    }
    let paid_at = null;
    if (payment_status === 'paid') {
      if (req.body.paid_at) {
        const d = new Date(req.body.paid_at);
        if (isNaN(d.getTime())) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Format tanggal paid_at tidak valid' });
        }
        paid_at = d;
      } else {
        paid_at = new Date();
      }
    }
    const { rowCount } = await client.query(
      'UPDATE sales_orders SET payment_status = $1, paid_at = $2, updated_at = NOW() WHERE id = $3 AND is_deleted = FALSE',
      [payment_status, paid_at, req.params.id]
    );
    if (!rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Nota not found' }); }
    await client.query('COMMIT');
    res.json({ message: 'Status pembayaran diperbarui', payment_status, paid_at });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

module.exports = router;
