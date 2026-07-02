// Peminjaman produk (v1.54.0) — "nota gantung": barang & stok sudah keluar,
// belum dihitung penjualan sampai diputuskan: dikembalikan atau dibeli.
// Nomor dokumen HSB-PJM-{YYMM}{NNN} (counter terpisah dari NOTA — tidak nabrak).
// Invariant stok: keluar SEKALI saat pinjam. Konversi ke nota TIDAK potong stok lagi;
// hapus nota hasil konversi TIDAK balikin stok (barang masih di customer) — lihat sales.js.
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');
const tax = require('../utils/tax');
const { generateMonthlyDocNumber } = require('../utils/docNumbers');

const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS loans (
      id SERIAL PRIMARY KEY,
      loan_number VARCHAR(50) NOT NULL,
      customer_id INT,
      customer_name VARCHAR(150) NOT NULL,
      customer_address TEXT,
      customer_phone VARCHAR(30),
      loan_date DATE NOT NULL DEFAULT CURRENT_DATE,
      due_days INT DEFAULT 7,
      due_date DATE,
      status VARCHAR(20) DEFAULT 'aktif',
      total_value DECIMAL(15,2) DEFAULT 0,
      notes TEXT,
      is_deleted BOOLEAN DEFAULT FALSE,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS loan_items (
      id SERIAL PRIMARY KEY,
      loan_id INT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
      product_id INT,
      product_name VARCHAR(255) NOT NULL,
      qty INT NOT NULL,
      unit VARCHAR(30) DEFAULT 'pcs',
      unit_price DECIMAL(15,2) DEFAULT 0,
      unit_hpp DECIMAL(15,2) DEFAULT 0,
      unit_hpp_tax_type VARCHAR(20) DEFAULT 'faktur',
      unit_hpp_ppn_rate DECIMAL(5,4),
      batch_id_snapshot INT,
      batch_no_snapshot VARCHAR(100),
      expired_date_snapshot DATE,
      qty_returned INT DEFAULT 0,
      qty_purchased INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS loan_conversions (
      id SERIAL PRIMARY KEY,
      loan_id INT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
      loan_item_id INT NOT NULL,
      sales_order_id INT NOT NULL,
      qty INT NOT NULL,
      is_reverted BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS loans_number_active_idx
      ON loans(loan_number) WHERE is_deleted = FALSE;
    CREATE INDEX IF NOT EXISTS idx_loan_items_loan ON loan_items(loan_id);
    CREATE INDEX IF NOT EXISTS idx_loan_conversions_order ON loan_conversions(sales_order_id);
  `);
  // Link nota hasil konversi → dokumen pinjaman asal (buat blok edit + revert saat hapus).
  await pool.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS source_loan_id INT`);
};
if (process.env.NODE_ENV !== 'test') ensureSchema().catch(e => console.error('loans ensureSchema:', e));

const outstandingOf = (it) => Number(it.qty) - Number(it.qty_returned) - Number(it.qty_purchased);

// Status derivasi: semua item habis (balik/dibeli) → selesai; selain itu aktif.
const recomputeLoanStatus = async (client, loanId) => {
  await client.query(
    `UPDATE loans SET status = CASE
       WHEN NOT EXISTS (SELECT 1 FROM loan_items li WHERE li.loan_id = loans.id
                        AND li.qty - li.qty_returned - li.qty_purchased > 0)
       THEN 'selesai' ELSE 'aktif' END,
     updated_at = NOW()
     WHERE id = $1 AND is_deleted = FALSE`,
    [loanId]
  );
};

const fetchLoanFull = async (executor, loanId) => {
  const { rows } = await executor.query(
    `SELECT l.*, COALESCE(l.customer_phone, MAX(c.phone)) AS customer_phone,
       COALESCE(json_agg(li ORDER BY li.id) FILTER (WHERE li.id IS NOT NULL), '[]') AS items,
       (SELECT COALESCE(json_agg(json_build_object(
          'sales_order_id', lc.sales_order_id, 'order_number', so.order_number,
          'loan_item_id', lc.loan_item_id, 'qty', lc.qty) ORDER BY lc.id), '[]')
        FROM loan_conversions lc JOIN sales_orders so ON so.id = lc.sales_order_id
        WHERE lc.loan_id = l.id AND lc.is_reverted = FALSE) AS conversions
     FROM loans l
     LEFT JOIN customers c ON l.customer_id = c.id
     LEFT JOIN loan_items li ON li.loan_id = l.id
     WHERE l.id = $1
     GROUP BY l.id`,
    [loanId]
  );
  return rows[0] || null;
};

// GET list (aktif + selesai; void/deleted disembunyikan)
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT l.*, COALESCE(l.customer_phone, MAX(c.phone)) AS customer_phone,
         COALESCE(json_agg(li ORDER BY li.id) FILTER (WHERE li.id IS NOT NULL), '[]') AS items,
         (SELECT COALESCE(json_agg(json_build_object(
            'sales_order_id', lc.sales_order_id, 'order_number', so.order_number,
            'loan_item_id', lc.loan_item_id, 'qty', lc.qty) ORDER BY lc.id), '[]')
          FROM loan_conversions lc JOIN sales_orders so ON so.id = lc.sales_order_id
          WHERE lc.loan_id = l.id AND lc.is_reverted = FALSE) AS conversions
       FROM loans l
       LEFT JOIN customers c ON l.customer_id = c.id
       LEFT JOIN loan_items li ON li.loan_id = l.id
       WHERE l.is_deleted = FALSE
       GROUP BY l.id
       ORDER BY l.loan_date DESC, l.id DESC
       LIMIT 1000`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create — stok keluar per batch TERPILIH (1 item = 1 batch, biar retur
// "batch sama" selalu punya batch asal yang jelas). Tanpa pilihan → FEFO batch
// pertama yang cukup; tidak ada yang cukup → minta pilih manual.
router.post('/', auth, async (req, res) => {
  const { customer_id, customer_name, customer_address, customer_phone,
    loan_date, due_days: rawDueDays, notes, items } = req.body;
  if (!customer_name?.trim()) return res.status(400).json({ error: 'Nama customer wajib diisi' });
  if (!items?.length) return res.status(400).json({ error: 'Minimal 1 produk diperlukan' });
  const dueDays = Math.min(365, Math.max(1, parseInt(rawDueDays) || 7));
  for (const it of items) {
    const label = String(it.product_name || '').trim() || '(tanpa nama)';
    const qty = parseInt(it.qty);
    if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: `Qty produk "${label}" harus angka lebih dari 0` });
    const price = parseFloat(it.unit_price ?? 0);
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: `Harga produk "${label}" tidak valid` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const loanNumber = await generateMonthlyDocNumber(client, {
      docType: 'PJM', prefix: 'HSB-PJM-', table: 'loans', column: 'loan_number',
    });

    // Auto-link customer_id dari nama (mirror nota v1.53.1) → CRM tetap kebaca.
    let resolvedCustomerId = customer_id || null;
    if (!resolvedCustomerId && customer_name?.trim()) {
      const { rows: cm } = await client.query(
        `SELECT id FROM customers WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 2`,
        [customer_name]
      );
      if (cm.length === 1) resolvedCustomerId = cm[0].id;
    }

    const loanDate = loan_date || new Date();
    const { rows: [loan] } = await client.query(
      `INSERT INTO loans (loan_number, customer_id, customer_name, customer_address, customer_phone,
         loan_date, due_days, due_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7, $6::date + $7::int, $8, $9) RETURNING *`,
      [loanNumber, resolvedCustomerId, customer_name.trim(), customer_address || '', customer_phone || '',
       loanDate, dueDays, notes || '', req.user?.id || null]
    );

    let totalValue = 0;
    for (const it of items) {
      const qty = parseInt(it.qty);
      // Resolve produk (nama exact → alias) — wajib ketemu: pinjaman selalu barang inventory.
      let { rows: [product] } = await client.query(
        `SELECT id, name, base_unit FROM product_master
         WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND is_active = TRUE ORDER BY id ASC LIMIT 1`,
        [it.product_name]
      );
      if (!product) {
        const { rows: [pa] } = await client.query(
          `SELECT pm.id, pm.name, pm.base_unit FROM product_aliases a
           JOIN product_master pm ON pm.id = a.product_id AND pm.is_active = TRUE
           WHERE LOWER(TRIM(a.alias_name)) = LOWER(TRIM($1)) LIMIT 1`,
          [it.product_name]
        );
        product = pa;
      }
      if (!product) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Produk "${it.product_name}" tidak ditemukan di inventory` });
      }

      // Resolve batch: pilihan manual → validasi; tanpa pilihan → FEFO pertama yang cukup.
      let batch = null;
      const selectedBatchId = parseInt(it.selected_batch_id);
      if (Number.isFinite(selectedBatchId) && selectedBatchId > 0) {
        const { rows: [b] } = await client.query(
          `SELECT * FROM inventory_batches
           WHERE id = $1 AND product_id = $2 AND COALESCE(is_active, TRUE) = TRUE FOR UPDATE`,
          [selectedBatchId, product.id]
        );
        batch = b;
        if (!batch) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Batch terpilih untuk ${product.name} tidak ditemukan` });
        }
      } else {
        const { rows: [b] } = await client.query(
          `SELECT * FROM inventory_batches
           WHERE product_id = $1 AND qty_current >= $2 AND COALESCE(is_active, TRUE) = TRUE
             AND (expired_date IS NULL OR expired_date >= CURRENT_DATE)
           ORDER BY expired_date ASC NULLS LAST LIMIT 1 FOR UPDATE`,
          [product.id, qty]
        );
        batch = b;
        if (!batch) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Tidak ada satu batch ${product.name} yang cukup untuk ${qty} — pilih batch manual atau pecah jadi beberapa baris` });
        }
      }
      if (Number(batch.qty_current) < qty) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Stok batch ${batch.batch_no || '(tanpa no)'} tidak cukup untuk ${product.name} (tersedia: ${batch.qty_current})` });
      }

      const unitPrice = parseFloat(it.unit_price) || 0;
      totalValue += qty * unitPrice;
      await client.query(
        `INSERT INTO loan_items (loan_id, product_id, product_name, qty, unit, unit_price,
           unit_hpp, unit_hpp_tax_type, unit_hpp_ppn_rate,
           batch_id_snapshot, batch_no_snapshot, expired_date_snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [loan.id, product.id, product.name, qty, product.base_unit || 'pcs', unitPrice,
         batch.hna || 0, tax.normalizeTaxType(batch.tax_type), batch.ppn_rate ?? null,
         batch.id, batch.batch_no, batch.expired_date]
      );

      await client.query('UPDATE inventory_batches SET qty_current = qty_current - $1 WHERE id = $2', [qty, batch.id]);
      await client.query(
        `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, reference_id, notes, created_by)
         VALUES ($1, $2, 'out', $3, 'loan', $4, $5, $6)`,
        [product.id, batch.id, qty, loan.id,
         `Stok keluar pinjaman ${loanNumber} (${customer_name.trim()})`, req.user?.id || null]
      );
    }

    await client.query('UPDATE loans SET total_value = $1 WHERE id = $2', [totalValue, loan.id]);
    await client.query('COMMIT');
    res.status(201).json(await fetchLoanFull(pool, loan.id));
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* noop */ }
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// POST return — kembalikan sebagian/semua. Per item: mode 'same' (qty balik ke
// batch asal) atau 'new' (batch baru: input batch_no + ED; HNA/tax ikut snapshot asal).
router.post('/:id/return', auth, async (req, res) => {
  const { items } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'Minimal 1 item dikembalikan' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [loan] } = await client.query(
      `SELECT * FROM loans WHERE id = $1 AND is_deleted = FALSE FOR UPDATE`, [req.params.id]
    );
    if (!loan) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Dokumen pinjaman tidak ditemukan' }); }

    for (const r of items) {
      const qty = parseInt(r.qty);
      if (!Number.isFinite(qty) || qty <= 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Qty retur harus angka lebih dari 0' }); }
      const { rows: [li] } = await client.query(
        `SELECT * FROM loan_items WHERE id = $1 AND loan_id = $2 FOR UPDATE`,
        [r.loan_item_id, loan.id]
      );
      if (!li) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Item pinjaman tidak ditemukan' }); }
      if (qty > outstandingOf(li)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Qty retur ${li.product_name} melebihi sisa pinjaman (sisa: ${outstandingOf(li)})` });
      }

      let targetBatchId;
      if (r.mode === 'new') {
        if (!String(r.batch_no || '').trim()) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `No. Batch baru wajib diisi untuk retur ${li.product_name}` });
        }
        const { rows: [nb] } = await client.query(
          `INSERT INTO inventory_batches (product_id, batch_no, expired_date, qty_current, hna, source_type, source_ref, tax_type, ppn_rate)
           VALUES ($1,$2,$3,$4,$5,'loan-return',$6,$7,$8) RETURNING id`,
          [li.product_id, String(r.batch_no).trim(), r.expired_date || null, qty,
           li.unit_hpp || 0, loan.loan_number, li.unit_hpp_tax_type, li.unit_hpp_ppn_rate]
        );
        targetBatchId = nb.id;
      } else {
        const { rows: [b] } = await client.query(
          `SELECT id FROM inventory_batches WHERE id = $1 AND COALESCE(is_active, TRUE) = TRUE FOR UPDATE`,
          [li.batch_id_snapshot]
        );
        if (!b) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Batch asal ${li.product_name} sudah tidak ada — pakai mode "batch baru"` });
        }
        await client.query('UPDATE inventory_batches SET qty_current = qty_current + $1 WHERE id = $2', [qty, b.id]);
        targetBatchId = b.id;
      }

      await client.query(
        `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, reference_id, notes, created_by)
         VALUES ($1, $2, 'in', $3, 'loan-return', $4, $5, $6)`,
        [li.product_id, targetBatchId, qty, loan.id,
         `Retur pinjaman ${loan.loan_number} (${loan.customer_name})${r.mode === 'new' ? ` — batch baru ${String(r.batch_no).trim()}` : ''}`,
         req.user?.id || null]
      );
      await client.query(
        `UPDATE loan_items SET qty_returned = qty_returned + $1 WHERE id = $2`, [qty, li.id]
      );
    }

    await recomputeLoanStatus(client, loan.id);
    await client.query('COMMIT');
    res.json(await fetchLoanFull(pool, loan.id));
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* noop */ }
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// POST convert — item pinjaman jadi NOTA PENJUALAN asli (nomor HSB-NOTA normal,
// snapshot harga+HPP dari saat pinjam) TANPA potong stok lagi (sudah keluar saat pinjam).
// Nota hasil konversi dikunci dari edit item (lihat sales.js PUT) supaya stok tidak dobel.
router.post('/:id/convert', auth, async (req, res) => {
  const { items, payment_method, payment_terms, due_date, sale_notes } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'Minimal 1 item dikonversi' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [loan] } = await client.query(
      `SELECT * FROM loans WHERE id = $1 AND is_deleted = FALSE FOR UPDATE`, [req.params.id]
    );
    if (!loan) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Dokumen pinjaman tidak ditemukan' }); }

    // Validasi semua item dulu (fail fast sebelum bikin order)
    const resolvedItems = [];
    for (const c of items) {
      const qty = parseInt(c.qty);
      if (!Number.isFinite(qty) || qty <= 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Qty konversi harus angka lebih dari 0' }); }
      const { rows: [li] } = await client.query(
        `SELECT * FROM loan_items WHERE id = $1 AND loan_id = $2 FOR UPDATE`,
        [c.loan_item_id, loan.id]
      );
      if (!li) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Item pinjaman tidak ditemukan' }); }
      if (qty > outstandingOf(li)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Qty konversi ${li.product_name} melebihi sisa pinjaman (sisa: ${outstandingOf(li)})` });
      }
      resolvedItems.push({ li, qty });
    }

    const orderNumber = await generateMonthlyDocNumber(client, {
      docType: 'NOTA', prefix: 'HSB-NOTA-', table: 'sales_orders', column: 'order_number',
    });

    let total = 0;
    let grossProfit = 0;
    let estWeightGram = 0;
    for (const { li, qty } of resolvedItems) {
      const price = parseFloat(li.unit_price) || 0;
      total += qty * price;
      grossProfit += qty * (price - tax.hppFromHnaByRate(li.unit_hpp || 0, li.unit_hpp_tax_type, li.unit_hpp_ppn_rate));
      const { rows: [pw] } = await client.query('SELECT weight_gram FROM product_master WHERE id = $1', [li.product_id]);
      estWeightGram += qty * Math.max(0, parseInt(pw?.weight_gram) || 0);
    }

    const paymentMethod = String(payment_method || 'Tunai');
    const { rows: [order] } = await client.query(
      `INSERT INTO sales_orders (order_number, customer_id, customer_name, customer_address, customer_phone,
         sale_date, total, gross_profit, notes, payment_method, created_by, channel,
         due_date, payment_terms, est_weight_gram, status, source_loan_id)
       VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,$6,$7,$8,$9,$10,'offline',$11,$12,$13,'final',$14) RETURNING *`,
      [orderNumber, loan.customer_id, loan.customer_name, loan.customer_address || '', loan.customer_phone || '',
       total, grossProfit,
       String(sale_notes || '').trim() || `Konversi dari pinjaman ${loan.loan_number}`,
       paymentMethod, req.user?.id || null,
       due_date || null, payment_terms || null, Math.round(estWeightGram), loan.id]
    );

    for (const { li, qty } of resolvedItems) {
      const price = parseFloat(li.unit_price) || 0;
      const { rows: [pm] } = await client.query('SELECT pack_size FROM product_master WHERE id = $1', [li.product_id]);
      await client.query(
        `INSERT INTO sales_items (sales_order_id, product_name, qty, unit, unit_price, unit_hpp,
           unit_hpp_tax_type, unit_hpp_ppn_rate, subtotal, qty_in_unit, pack_size_at_sale,
           batch_id_snapshot, batch_no_snapshot, expired_date_snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [order.id, li.product_name, qty, li.unit || 'pcs', price, li.unit_hpp || 0,
         li.unit_hpp_tax_type, li.unit_hpp_ppn_rate, qty * price, qty, pm?.pack_size || 1,
         li.batch_id_snapshot, li.batch_no_snapshot, li.expired_date_snapshot]
      );
      await client.query(
        `INSERT INTO loan_conversions (loan_id, loan_item_id, sales_order_id, qty)
         VALUES ($1,$2,$3,$4)`,
        [loan.id, li.id, order.id, qty]
      );
      await client.query(
        `UPDATE loan_items SET qty_purchased = qty_purchased + $1 WHERE id = $2`, [qty, li.id]
      );
    }

    await recomputeLoanStatus(client, loan.id);
    await client.query('COMMIT');
    const loanFull = await fetchLoanFull(pool, loan.id);
    res.status(201).json({ loan: loanFull, order });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* noop */ }
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// DELETE (void) — batalkan pinjaman: sisa outstanding balik ke batch asal.
// Item yang sudah diretur/dikonversi TIDAK disentuh (stoknya/notanya sudah sah).
router.delete('/:id', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [loan] } = await client.query(
      `SELECT * FROM loans WHERE id = $1 AND is_deleted = FALSE FOR UPDATE`, [req.params.id]
    );
    if (!loan) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Dokumen pinjaman tidak ditemukan' }); }

    const { rows: loanItems } = await client.query(
      `SELECT * FROM loan_items WHERE loan_id = $1 FOR UPDATE`, [loan.id]
    );
    let restored = 0;
    for (const li of loanItems) {
      const outstanding = outstandingOf(li);
      if (outstanding <= 0) continue;
      const { rows: [b] } = await client.query(
        `SELECT id FROM inventory_batches WHERE id = $1 AND COALESCE(is_active, TRUE) = TRUE FOR UPDATE`,
        [li.batch_id_snapshot]
      );
      if (!b) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Batch asal ${li.product_name} sudah tidak ada — kembalikan item lewat menu Retur (batch baru) sebelum void` });
      }
      await client.query('UPDATE inventory_batches SET qty_current = qty_current + $1 WHERE id = $2', [outstanding, b.id]);
      await client.query(
        `INSERT INTO inventory_mutations (product_id, batch_id, type, qty, reference_type, reference_id, notes, created_by)
         VALUES ($1, $2, 'in', $3, 'loan-void', $4, $5, $6)`,
        [li.product_id, b.id, outstanding, loan.id,
         `Void pinjaman ${loan.loan_number} — sisa dikembalikan ke stok`, req.user?.id || null]
      );
      restored += outstanding;
    }

    await client.query(
      `UPDATE loans SET is_deleted = TRUE, status = 'void', updated_at = NOW() WHERE id = $1`, [loan.id]
    );
    await client.query('COMMIT');
    res.json({ message: `Pinjaman ${loan.loan_number} dibatalkan — ${restored} unit sisa dikembalikan ke stok` });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* noop */ }
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

module.exports = router;
