const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');

const getServerError = (err) => (
  process.env.NODE_ENV === 'production' ? 'Terjadi kesalahan server' : err.message
);

const handleServerError = (res, err, label) => {
  console.error(`[Ledger] ${label}:`, err);
  return res.status(500).json({ error: getServerError(err) });
};

const parseAmount = (value, fallback = 0) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const validateAmount = (label, value) => {
  if (!Number.isFinite(value)) return `${label} harus berupa angka`;
  if (value < 0) return `${label} tidak boleh negatif`;
  return null;
};

// All ledger routes are Direktur-only
router.use(auth, roleGuard('direktur'));

// GET all entries with optional filters
router.get('/', async (req, res) => {
  const { month, category, account } = req.query;
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 200, 1), 1000);
    let query = 'SELECT * FROM ledger_entries WHERE 1=1';
    const params = [];
    if (month) { params.push(month); query += ` AND DATE_TRUNC('month', entry_date) = $${params.length}::date`; }
    if (category) { params.push(category); query += ` AND category = $${params.length}`; }
    if (account) { params.push(`%${account}%`); query += ` AND account_name ILIKE $${params.length}`; }
    if (req.query.needs_review === '1') { query += ' AND needs_review = TRUE'; }
    if (req.query.q) { params.push(`%${req.query.q}%`); query += ` AND description ILIKE $${params.length}`; }
    query += ' ORDER BY entry_date DESC, id DESC';
    params.push(limit);
    query += ` LIMIT $${params.length}`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { return handleServerError(res, err, 'list entries'); }
});

// GET summary (balance sheet overview)
router.get('/summary', async (req, res) => {
  try {
    const { rows: byCategory } = await pool.query(`
      SELECT category,
        SUM(debit) AS total_debit, SUM(credit) AS total_credit,
        SUM(debit) - SUM(credit) AS balance
      FROM ledger_entries
      GROUP BY category
      ORDER BY category
    `);
    const { rows: monthly } = await pool.query(`
      SELECT DATE_TRUNC('month', entry_date) AS month,
        SUM(debit) AS total_debit, SUM(credit) AS total_credit,
        SUM(debit) - SUM(credit) AS net
      FROM ledger_entries
      GROUP BY DATE_TRUNC('month', entry_date)
      ORDER BY month DESC LIMIT 12
    `);
    const { rows: [totals] } = await pool.query(`
      SELECT SUM(debit) AS total_debit, SUM(credit) AS total_credit,
        SUM(debit) - SUM(credit) AS net_balance
      FROM ledger_entries
    `);
    res.json({ byCategory, monthly, totals: totals || { total_debit: 0, total_credit: 0, net_balance: 0 } });
  } catch (err) { return handleServerError(res, err, 'summary'); }
});

// CREATE entry
router.post('/', async (req, res) => {
  const { entry_date, account_name, description, debit, credit, category, reference_type, reference_id } = req.body;
  if (!account_name?.trim()) return res.status(400).json({ error: 'Account name required' });
  const parsedDebit = parseAmount(debit, 0);
  const parsedCredit = parseAmount(credit, 0);
  const debitError = validateAmount('Debit', parsedDebit);
  const creditError = validateAmount('Kredit', parsedCredit);
  if (debitError || creditError) return res.status(400).json({ error: debitError || creditError });
  if (parsedDebit === 0 && parsedCredit === 0) {
    return res.status(400).json({ error: 'Debit atau kredit harus diisi' });
  }
  if (parsedDebit > 0 && parsedCredit > 0) {
    return res.status(400).json({ error: 'Debit dan kredit tidak boleh sama-sama terisi' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO ledger_entries (entry_date, account_name, description, debit, credit, category, reference_type, reference_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [entry_date || new Date(), account_name.trim(), description || '', parsedDebit, parsedCredit, category || 'general', reference_type || null, reference_id || null, req.user?.id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { return handleServerError(res, err, 'create entry'); }
});

// UPDATE entry
router.put('/:id', async (req, res) => {
  const { entry_date, account_name, description, debit, credit, category } = req.body;
  const parsedDebit = debit === undefined ? undefined : parseAmount(debit);
  const parsedCredit = credit === undefined ? undefined : parseAmount(credit);
  const debitError = parsedDebit === undefined ? null : validateAmount('Debit', parsedDebit);
  const creditError = parsedCredit === undefined ? null : validateAmount('Kredit', parsedCredit);
  if (debitError || creditError) return res.status(400).json({ error: debitError || creditError });
  if (parsedDebit > 0 && parsedCredit > 0) {
    return res.status(400).json({ error: 'Debit dan kredit tidak boleh sama-sama terisi' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE ledger_entries SET entry_date=COALESCE($1,entry_date), account_name=COALESCE($2,account_name),
       description=COALESCE($3,description), debit=COALESCE($4,debit), credit=COALESCE($5,credit),
       category=COALESCE($6,category) WHERE id=$7 RETURNING *`,
      [entry_date, account_name, description, parsedDebit, parsedCredit, category, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Entry not found' });
    res.json(rows[0]);
  } catch (err) { return handleServerError(res, err, 'update entry'); }
});

// DELETE entry
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM ledger_entries WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Entry deleted' });
  } catch (err) { return handleServerError(res, err, 'delete entry'); }
});

// ═══════════ Buku Besar 2.0 (v1.64.0) ═══════════

// Kategori kanonik (dari kebiasaan Excel Harun).
const LEDGER_CATEGORIES = ['KULAK', 'LABA KOTOR PENJUALAN', 'GAJI KARYAWAN', 'OPERASIONAL',
  'BENSIN', 'LISTRIK/PLN', 'INTERNET', 'PAJAK', 'MODAL', 'LAIN LAIN'];

// Auto-kategori mutasi bank: (1) kata kunci berita transfer, (2) nama counterparty terkenal.
// masuk (amount>0) vs keluar (amount<0) menentukan beberapa aturan. null = tidak yakin (review).
const autoCategorize = (description, amount) => {
  const d = String(description || '').toUpperCase();
  const isIn = amount > 0;
  // marketplace payout / uang masuk penjualan → KULAK (modal balik; LABA dipecah manual/terpisah)
  if (isIn && /(AIRPAY|SHOPEE|TOKOPEDIA|TIKTOK|GINEE|LAZADA)/.test(d)) return 'KULAK';
  // supplier farmasi/distributor → pembayaran kulakan
  if (!isIn && /(ENSEVAL|ANTARMITRA|PADMATIRTA|BINA SAN PRIMA|PARIT PADANG|MENSA BINA|TIGARAKSA|APL|ANUGERAH PHARM|SAWAH BESAR|KALBE|DOS NI ROHA)/.test(d)) return 'KULAK';
  if (/(GAJI|UPAH)/.test(d) && !isIn) return 'GAJI KARYAWAN';
  if (/(BENSIN|PERTAMINA|SPBU|SOLAR|PERTALITE)/.test(d)) return 'BENSIN';
  if (/(PLN|LISTRIK|TOKEN|PDAM| AIR )/.test(d)) return 'LISTRIK/PLN';
  if (/(INTERNET|INDIHOME|BIZNET|WIFI|MYREPUBLIC|FIRST MEDIA)/.test(d)) return 'INTERNET';
  if (/(PAJAK|KPP|DJP|MPN|PPN|PPH)/.test(d)) return 'PAJAK';
  if (/(BIAYA ADM|ADMIN FEE)/.test(d)) return 'OPERASIONAL';
  if (/\bBUNGA\b/.test(d)) return isIn ? 'LAIN LAIN' : 'PAJAK';
  if (/(OPERASIONAL|LAKBAN|PACKING|KARDUS|DUS |PLASTIK|BUBBLE|SERVIS|SERVICE|EKSPEDISI|ONGKIR|KURIR|JNE|JNT|J&T|SICEPAT|LALAMOVE)/.test(d)) return 'OPERASIONAL';
  return null;
};

// POST /import — bulk mutasi hasil parse e-statement (JSON kecil dari frontend/script).
// Body: { rows: [{ entry_date, amount(signed), description, bank_ref, tax_scope? }] }
// Dedup by bank_ref. Auto-kategori; gagal tebak → needs_review.
router.post('/import', async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ error: 'rows kosong' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let inserted = 0; let skipped = 0; let autoCat = 0; let review = 0;
    for (const r of rows) {
      const amount = Number(r.amount);
      if (!r.entry_date || !Number.isFinite(amount) || amount === 0) { skipped += 1; continue; }
      const cat = r.category || autoCategorize(r.description, amount);
      const { rowCount } = await client.query(
        `INSERT INTO ledger_entries (entry_date, account_name, description, debit, credit, category,
           tax_scope, source, bank_ref, needs_review, auto_cat, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'estatement',$8,$9,$10,$11)
         ON CONFLICT (bank_ref) WHERE bank_ref IS NOT NULL DO NOTHING`,
        [r.entry_date, r.account_name || 'Bank BCA', String(r.description || '').slice(0, 500),
         amount > 0 ? amount : 0, amount < 0 ? -amount : 0, cat,
         r.tax_scope === 'non_ppn' ? 'non_ppn' : 'ppn', r.bank_ref || null,
         !cat, !!cat && !r.category, req.user?.id || null]);
      if (rowCount) { inserted += 1; if (cat && !r.category) autoCat += 1; if (!cat) review += 1; }
      else skipped += 1;
    }
    await client.query('COMMIT');
    res.json({ inserted, skipped_duplicate: skipped, auto_categorized: autoCat, needs_review: review });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    return handleServerError(res, err, 'import');
  } finally { client.release(); }
});

// PATCH /bulk-category — kategorikan banyak entri sekaligus (workflow review cepat).
router.patch('/bulk-category', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => parseInt(x, 10)).filter(Number.isFinite) : [];
  const category = req.body?.category;
  const taxScope = ['ppn', 'non_ppn'].includes(req.body?.tax_scope) ? req.body.tax_scope : null;
  if (!ids.length || (!category && !taxScope)) return res.status(400).json({ error: 'ids + category/tax_scope wajib' });
  try {
    const { rowCount } = await pool.query(
      `UPDATE ledger_entries SET category = COALESCE($1, category),
         tax_scope = COALESCE($2, tax_scope), needs_review = FALSE, auto_cat = FALSE
       WHERE id = ANY($3)`, [category || null, taxScope, ids]);
    res.json({ updated: rowCount });
  } catch (err) { return handleServerError(res, err, 'bulk-category'); }
});

// GET /monthly-report?month=YYYY-MM — laporan amplop ala Excel:
// laba kotor (entri LABA KOTOR PENJUALAN) → alokasi pct per amplop − pengeluaran + carry-over
// berantai dari bulan-bulan sebelumnya. Dipisah tax_scope (ppn / non_ppn) + pembanding laba sistem.
router.get('/monthly-report', async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : null;
  if (!month) return res.status(400).json({ error: 'month=YYYY-MM wajib' });
  try {
    const tax = require('../utils/tax');
    const unitHppCostSql = tax.hppSqlForSalesItem('si');
    const [{ rows: targets }, { rows: monthsAgg }, { rows: [sys] }] = await Promise.all([
      pool.query(`SELECT * FROM ledger_budget_targets WHERE active = TRUE ORDER BY sort_order, id`),
      // agregat per bulan × scope × kategori sampai bulan diminta (buat rantai carry-over)
      pool.query(`
        SELECT TO_CHAR(DATE_TRUNC('month', entry_date), 'YYYY-MM') AS ym, tax_scope, category,
               SUM(debit) AS debit, SUM(credit) AS credit
        FROM ledger_entries
        WHERE entry_date < (DATE '${month}-01' + INTERVAL '1 month')
        GROUP BY 1, 2, 3`),
      // pembanding: laba sistem bulan tsb dari nota (recompute HPP incl-PPN, pola dashboard)
      pool.query(`
        SELECT COALESCE(SUM(COALESCE(si.qty_in_unit, si.qty, 0) * (COALESCE(si.unit_price, 0) - ${unitHppCostSql})), 0)
          + COALESCE((SELECT SUM(COALESCE(so2.ongkir,0) - COALESCE(so2.ongkir_cost,0)
              - CASE WHEN so2.payment_fee_mode='absorb' THEN COALESCE(so2.payment_fee,0) ELSE 0 END)
              FROM sales_orders so2 WHERE so2.is_deleted=false AND so2.status='final'
                AND DATE_TRUNC('month', so2.sale_date) = DATE '${month}-01'), 0) AS laba_nota
        FROM sales_orders so JOIN sales_items si ON si.sales_order_id = so.id
        WHERE so.is_deleted = false AND so.status = 'final'
          AND DATE_TRUNC('month', so.sale_date) = DATE '${month}-01'`),
    ]);

    // susun per scope: bulan-bulan terurut → rantai lebihan per amplop
    const months = [...new Set(monthsAgg.map((r) => r.ym))].sort();
    const buildScope = (scope) => {
      const get = (ym, cat) => monthsAgg.find((r) => r.ym === ym && r.tax_scope === scope && r.category === cat) || {};
      const catExpense = (ym, matchCats) => matchCats.reduce((s, c) => {
        const r = get(ym, c); return s + (parseFloat(r.credit) || 0);
      }, 0);
      const labaOf = (ym) => parseFloat(get(ym, 'LABA KOTOR PENJUALAN').debit) || 0;
      const carry = {}; // per amplop
      let report = null;
      for (const ym of months) {
        if (ym > month) break;
        const laba = labaOf(ym);
        const rows = targets.map((t) => {
          const matchCats = String(t.match_categories || '').split(',').map((s) => s.trim()).filter(Boolean);
          const alokasi = laba * parseFloat(t.pct);
          const keluar = catExpense(ym, matchCats);
          const prev = carry[t.name] || 0;
          const sisa = alokasi - keluar + prev;
          carry[t.name] = sisa;
          return { name: t.name, pct: parseFloat(t.pct), target_nominal: parseFloat(t.target_nominal) || 0,
            alokasi: Math.round(alokasi), pengeluaran: Math.round(keluar), lebihan_sebelumnya: Math.round(prev),
            sisa: Math.round(sisa) };
        });
        if (ym === month) {
          // pengeluaran non-amplop (kategori yg tak ter-map, exclude KULAK & LABA)
          const mapped = new Set(targets.flatMap((t) => String(t.match_categories || '').split(',').map((s) => s.trim())));
          const others = monthsAgg.filter((r) => r.ym === ym && r.tax_scope === scope
            && r.category && !mapped.has(r.category)
            && !['KULAK', 'LABA KOTOR PENJUALAN'].includes(r.category) && parseFloat(r.credit) > 0)
            .map((r) => ({ category: r.category, pengeluaran: Math.round(parseFloat(r.credit)) }));
          const totalKeluar = rows.reduce((s, r) => s + r.pengeluaran, 0) + others.reduce((s, o) => s + o.pengeluaran, 0);
          report = { laba_kotor: Math.round(laba), envelopes: rows, non_envelope: others,
            total_pengeluaran: totalKeluar, laba_bersih: Math.round(laba - totalKeluar) };
        }
      }
      return report || { laba_kotor: 0, envelopes: [], non_envelope: [], total_pengeluaran: 0, laba_bersih: 0 };
    };

    res.json({
      month,
      ppn: buildScope('ppn'),
      non_ppn: buildScope('non_ppn'),
      pembanding_sistem: { laba_nota: Math.round(parseFloat(sys?.laba_nota) || 0) },
      categories: LEDGER_CATEGORIES,
    });
  } catch (err) { return handleServerError(res, err, 'monthly-report'); }
});

// ── Target amplop CRUD ──
router.get('/targets', async (req, res) => {
  try { const { rows } = await pool.query('SELECT * FROM ledger_budget_targets ORDER BY sort_order, id'); res.json(rows); }
  catch (err) { return handleServerError(res, err, 'targets'); }
});
router.post('/targets', async (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'name wajib' });
  try {
    const { rows: [row] } = await pool.query(
      `INSERT INTO ledger_budget_targets (name, pct, target_nominal, match_categories, sort_order, active)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6,TRUE))
       ON CONFLICT (name) DO UPDATE SET pct=EXCLUDED.pct, target_nominal=EXCLUDED.target_nominal,
         match_categories=EXCLUDED.match_categories, sort_order=EXCLUDED.sort_order, active=EXCLUDED.active
       RETURNING *`,
      [b.name, parseFloat(b.pct) || 0, parseFloat(b.target_nominal) || 0, b.match_categories || '', parseInt(b.sort_order, 10) || 0, b.active]);
    res.status(201).json(row);
  } catch (err) { return handleServerError(res, err, 'save target'); }
});
router.delete('/targets/:id', async (req, res) => {
  try { const { rowCount } = await pool.query('DELETE FROM ledger_budget_targets WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' }); res.json({ deleted: true }); }
  catch (err) { return handleServerError(res, err, 'delete target'); }
});

// ── Karyawan + gaji ──
router.get('/employees', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT e.*, COALESCE(sp.total_paid, 0) AS total_paid, sp.last_paid
      FROM employees e
      LEFT JOIN (SELECT employee_id, SUM(amount) total_paid, MAX(pay_date) last_paid
                 FROM salary_payments GROUP BY employee_id) sp ON sp.employee_id = e.id
      ORDER BY e.active DESC, e.name`);
    res.json(rows);
  } catch (err) { return handleServerError(res, err, 'employees'); }
});
router.post('/employees', async (req, res) => {
  const b = req.body || {};
  if (!b.name?.trim()) return res.status(400).json({ error: 'Nama wajib' });
  try {
    const { rows: [row] } = await pool.query(
      `INSERT INTO employees (name, role, daily_wage, monthly_salary, active)
       VALUES ($1,$2,$3,$4,COALESCE($5,TRUE))
       ON CONFLICT (name) DO UPDATE SET role=EXCLUDED.role, daily_wage=EXCLUDED.daily_wage,
         monthly_salary=EXCLUDED.monthly_salary, active=EXCLUDED.active RETURNING *`,
      [b.name.trim(), b.role || null, parseFloat(b.daily_wage) || 0, parseFloat(b.monthly_salary) || 0, b.active]);
    res.status(201).json(row);
  } catch (err) { return handleServerError(res, err, 'save employee'); }
});
router.get('/salaries', async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : null;
  try {
    const params = []; let where = '';
    if (month) { where = `WHERE DATE_TRUNC('month', sp.pay_date) = DATE '${month}-01'`; }
    const { rows } = await pool.query(`
      SELECT sp.*, e.name AS employee_name FROM salary_payments sp
      JOIN employees e ON e.id = sp.employee_id ${where}
      ORDER BY sp.pay_date DESC, sp.id DESC LIMIT 500`, params);
    res.json(rows);
  } catch (err) { return handleServerError(res, err, 'salaries'); }
});
router.post('/salaries', async (req, res) => {
  const b = req.body || {};
  const employeeId = parseInt(b.employee_id, 10);
  const amount = parseFloat(b.amount);
  if (!Number.isFinite(employeeId) || !Number.isFinite(amount) || amount <= 0 || !b.pay_date) {
    return res.status(400).json({ error: 'employee_id, pay_date, amount wajib' });
  }
  try {
    const { rows: [row] } = await pool.query(
      `INSERT INTO salary_payments (employee_id, pay_date, amount, status, note, created_by)
       VALUES ($1,$2,$3,COALESCE($4,'SUDAH BAYAR'),$5,$6) RETURNING *`,
      [employeeId, b.pay_date, amount, b.status, b.note || null, req.user?.id || null]);
    res.status(201).json(row);
  } catch (err) { return handleServerError(res, err, 'save salary'); }
});
router.delete('/salaries/:id', async (req, res) => {
  try { const { rowCount } = await pool.query('DELETE FROM salary_payments WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' }); res.json({ deleted: true }); }
  catch (err) { return handleServerError(res, err, 'delete salary'); }
});

// ── Hutang piutang di luar transaksi ──
router.get('/loans', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM personal_loans ORDER BY person, loan_date, id');
    // running total per orang
    const byPerson = {};
    const out = rows.map((r) => {
      const amt = parseFloat(r.amount) || 0;
      byPerson[r.person] = (byPerson[r.person] || 0) + amt;
      return { ...r, running_total: Math.round(byPerson[r.person]) };
    });
    const summary = Object.entries(byPerson).map(([person, total]) => ({ person, outstanding: Math.round(total) }));
    res.json({ rows: out, summary });
  } catch (err) { return handleServerError(res, err, 'loans'); }
});
router.post('/loans', async (req, res) => {
  const b = req.body || {};
  const amount = parseFloat(b.amount);
  if (!b.person?.trim() || !b.loan_date || !Number.isFinite(amount) || amount === 0) {
    return res.status(400).json({ error: 'person, loan_date, amount wajib (+ pinjam / − cicil)' });
  }
  try {
    const { rows: [row] } = await pool.query(
      `INSERT INTO personal_loans (person, loan_date, amount, note, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [b.person.trim(), b.loan_date, amount, b.note || null, b.status || (amount > 0 ? 'PINJAM' : 'CICIL'), req.user?.id || null]);
    res.status(201).json(row);
  } catch (err) { return handleServerError(res, err, 'save loan'); }
});
router.delete('/loans/:id', async (req, res) => {
  try { const { rowCount } = await pool.query('DELETE FROM personal_loans WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' }); res.json({ deleted: true }); }
  catch (err) { return handleServerError(res, err, 'delete loan'); }
});

module.exports = router;
