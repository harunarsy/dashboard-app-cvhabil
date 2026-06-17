const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');
const tax = require('../utils/tax');

router.use(auth);

// HPP per-satuan-jual inc PPN, sadar tax_type + rate per-batch (samakan dengan dashboard.js).
// v1.43.0: rate dari snapshot unit_hpp_ppn_rate (NULL → fallback PPN_RATE), bukan global.
const unitHppCostSql = tax.hppSqlForSalesItem('si');

const toPositiveInt = (value, fallback, max) => {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
};

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));

router.get('/customer/:id', async (req, res) => {
  const customerId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(customerId) || customerId <= 0) {
    return res.status(400).json({ error: 'customer id tidak valid' });
  }

  const limit = toPositiveInt(req.query.limit, 6, 12);

  try {
    const { rows } = await pool.query(
      `
        WITH customer_sales AS (
          SELECT id, sale_date
          FROM sales_orders
          WHERE is_deleted = false
            AND status = 'final'
            AND customer_id = $1
        ),
        item_history AS (
          SELECT
            si.product_name,
            COUNT(DISTINCT cs.id) AS order_count,
            COALESCE(SUM(COALESCE(si.qty_in_unit, si.qty, 0)), 0) AS qty_user_total,
            COALESCE(SUM(COALESCE(si.qty, 0)), 0) AS qty_base_total,
            MAX(cs.sale_date) AS last_order_date,
            (ARRAY_AGG(si.unit ORDER BY cs.sale_date DESC, si.id DESC))[1] AS last_unit,
            (ARRAY_AGG(si.unit_price ORDER BY cs.sale_date DESC, si.id DESC))[1] AS last_unit_price,
            AVG(NULLIF(si.unit_price, 0)) AS avg_unit_price
          FROM customer_sales cs
          JOIN sales_items si ON si.sales_order_id = cs.id
          WHERE NULLIF(TRIM(COALESCE(si.product_name, '')), '') IS NOT NULL
          GROUP BY si.product_name
        )
        SELECT
          ih.product_name,
          ih.order_count,
          ih.qty_user_total,
          ih.qty_base_total,
          ih.last_order_date,
          ih.last_unit,
          ih.last_unit_price,
          ih.avg_unit_price,
          pm.id AS product_id,
          pm.code AS product_code,
          pm.base_unit,
          pm.pack_unit,
          pm.pack_size
        FROM item_history ih
        LEFT JOIN LATERAL (
          SELECT id, code, base_unit, pack_unit, pack_size
          FROM product_master
          WHERE is_active = true
            AND LOWER(TRIM(name)) = LOWER(TRIM(ih.product_name))
          ORDER BY updated_at DESC NULLS LAST, id DESC
          LIMIT 1
        ) pm ON true
        ORDER BY ih.order_count DESC, ih.last_order_date DESC NULLS LAST, ih.product_name ASC
        LIMIT $2
      `,
      [customerId, limit],
    );

    res.json({
      customer_id: customerId,
      usually_buys: rows.map((row) => ({
        product_name: row.product_name,
        product_id: row.product_id,
        product_code: row.product_code,
        order_count: Number(row.order_count) || 0,
        qty_user_total: Number(row.qty_user_total) || 0,
        qty_base_total: Number(row.qty_base_total) || 0,
        last_order_date: row.last_order_date,
        last_unit: row.last_unit,
        last_unit_price: Number(row.last_unit_price) || 0,
        avg_unit_price: Number(row.avg_unit_price) || 0,
        base_unit: row.base_unit,
        pack_unit: row.pack_unit,
        pack_size: Number(row.pack_size) || null,
      })),
    });
  } catch (e) {
    console.error('[insights.customer] failed:', e.message);
    res.status(500).json({ error: 'Gagal memuat insight customer' });
  }
});

// ─── #2 Prediksi habis stok / saran restock ──────────────────────────────
// velocity = blend tertimbang (recent 30d bobot 0.7, 31-90d bobot 0.3) dalam BASE PCS.
// days_left = stok pcs / velocity. avg_order_qty = rata-rata 3 pembelian terakhir.
router.get('/restock', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
        WITH sold AS (
          SELECT
            LOWER(TRIM(si.product_name)) AS nname,
            SUM(CASE WHEN so.sale_date >= CURRENT_DATE - INTERVAL '30 days' THEN COALESCE(si.qty, 0) ELSE 0 END) AS pcs30,
            SUM(COALESCE(si.qty, 0)) AS pcs90
          FROM sales_items si
          JOIN sales_orders so ON so.id = si.sales_order_id
          WHERE so.is_deleted = false
            AND so.status = 'final'
            AND so.sale_date >= CURRENT_DATE - INTERVAL '90 days'
            AND NULLIF(TRIM(COALESCE(si.product_name, '')), '') IS NOT NULL
          GROUP BY LOWER(TRIM(si.product_name))
        ),
        stock AS (
          SELECT product_id, SUM(COALESCE(qty_current, 0)) AS stock
          FROM inventory_batches
          WHERE COALESCE(is_active, TRUE) = TRUE
          GROUP BY product_id
        )
        SELECT
          pm.id AS product_id, pm.code, pm.name, pm.base_unit, pm.pack_unit, pm.pack_size, pm.min_stock,
          COALESCE(st.stock, 0) AS stock,
          COALESCE(sd.pcs30, 0) AS pcs30,
          COALESCE(sd.pcs90, 0) AS pcs90,
          ord.avg_order_qty, ord.order_unit
        FROM product_master pm
        LEFT JOIN sold sd ON sd.nname = LOWER(TRIM(pm.name))
        LEFT JOIN stock st ON st.product_id = pm.id
        LEFT JOIN LATERAL (
          SELECT AVG(t.q) AS avg_order_qty, (ARRAY_AGG(t.unit))[1] AS order_unit
          FROM (
            SELECT COALESCE(ii.qty_in_unit, ii.quantity, 0) AS q, ii.unit
            FROM invoice_items ii
            JOIN invoices iv ON iv.id = ii.invoice_id
              AND iv.deleted_at IS NULL
              AND COALESCE(iv.is_draft, FALSE) = FALSE
            WHERE ii.product_id = pm.id
            ORDER BY iv.purchase_date DESC NULLS LAST, ii.id DESC
            LIMIT 3
          ) t
        ) ord ON true
        WHERE pm.is_active = TRUE
      `,
    );

    const items = rows
      .map((r) => {
        const stock = Number(r.stock) || 0;
        const pcs30 = Number(r.pcs30) || 0;
        const pcs90 = Number(r.pcs90) || 0;
        const daily30 = pcs30 / 30;
        const dailyOlder = Math.max(0, pcs90 - pcs30) / 60;
        const velocity = daily30 * 0.7 + dailyOlder * 0.3;
        const daysLeft = velocity > 0 ? stock / velocity : null;
        return {
          product_id: r.product_id,
          code: r.code,
          name: r.name,
          base_unit: r.base_unit,
          pack_unit: r.pack_unit,
          pack_size: Number(r.pack_size) || null,
          min_stock: Number(r.min_stock) || 0,
          stock,
          velocity_per_day: Math.round(velocity * 100) / 100,
          days_left: daysLeft === null ? null : Math.round(daysLeft),
          avg_order_qty: r.avg_order_qty === null ? null : Math.round((Number(r.avg_order_qty) || 0) * 100) / 100,
          order_unit: r.order_unit || r.pack_unit || r.base_unit || 'pcs',
        };
      })
      .filter((r) => r.velocity_per_day > 0 && r.days_left !== null && r.days_left < 21)
      .sort((a, b) => a.days_left - b.days_left);

    res.json({ generated_at: new Date().toISOString(), items });
  } catch (e) {
    console.error('[insights.restock] failed:', e.message);
    res.status(500).json({ error: 'Gagal memuat saran restock' });
  }
});

// ─── #9 Skor kesehatan produk (A–E) ──────────────────────────────────────
// Bobot: pergerakan 30 + margin 30 + tren 20 + risiko ED 20.
router.get('/product-health', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
        WITH sales_agg AS (
          SELECT
            LOWER(TRIM(si.product_name)) AS nname,
            SUM(COALESCE(si.qty, 0)) AS pcs90,
            SUM(COALESCE(si.qty_in_unit, si.qty, 0) * COALESCE(si.unit_price, 0)) AS rev90,
            SUM(COALESCE(si.qty_in_unit, si.qty, 0) * (COALESCE(si.unit_price, 0) - (${unitHppCostSql}))) AS margin90,
            SUM(CASE WHEN so.sale_date >= CURRENT_DATE - INTERVAL '30 days'
                THEN COALESCE(si.qty_in_unit, si.qty, 0) * COALESCE(si.unit_price, 0) ELSE 0 END) AS rev30,
            SUM(CASE WHEN so.sale_date < CURRENT_DATE - INTERVAL '30 days'
                  AND so.sale_date >= CURRENT_DATE - INTERVAL '60 days'
                THEN COALESCE(si.qty_in_unit, si.qty, 0) * COALESCE(si.unit_price, 0) ELSE 0 END) AS rev_prev30
          FROM sales_items si
          JOIN sales_orders so ON so.id = si.sales_order_id
          WHERE so.is_deleted = false
            AND so.status = 'final'
            AND so.sale_date >= CURRENT_DATE - INTERVAL '90 days'
          GROUP BY LOWER(TRIM(si.product_name))
        ),
        ed AS (
          SELECT product_id,
            SUM(COALESCE(qty_current, 0)) AS tot_qty,
            SUM(CASE WHEN expired_date IS NOT NULL AND expired_date < CURRENT_DATE + INTERVAL '60 days'
                THEN COALESCE(qty_current, 0) ELSE 0 END) AS ed_qty
          FROM inventory_batches
          WHERE COALESCE(is_active, TRUE) = TRUE
          GROUP BY product_id
        )
        SELECT
          pm.id AS product_id, pm.code, pm.name, pm.category,
          COALESCE(sa.pcs90, 0) AS pcs90,
          COALESCE(sa.rev90, 0) AS rev90,
          COALESCE(sa.margin90, 0) AS margin90,
          COALESCE(sa.rev30, 0) AS rev30,
          COALESCE(sa.rev_prev30, 0) AS rev_prev30,
          COALESCE(ed.tot_qty, 0) AS stock,
          COALESCE(ed.ed_qty, 0) AS ed_qty
        FROM product_master pm
        LEFT JOIN sales_agg sa ON sa.nname = LOWER(TRIM(pm.name))
        LEFT JOIN ed ON ed.product_id = pm.id
        WHERE pm.is_active = TRUE
        ORDER BY pm.name ASC
      `,
    );

    const bandOf = (score) =>
      score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'E';

    const items = rows.map((r) => {
      const stock = Number(r.stock) || 0;
      const pcs90 = Number(r.pcs90) || 0;
      const rev90 = Number(r.rev90) || 0;
      const margin90 = Number(r.margin90) || 0;
      const rev30 = Number(r.rev30) || 0;
      const revPrev30 = Number(r.rev_prev30) || 0;
      const edQty = Number(r.ed_qty) || 0;

      // pergerakan: fraksi stok yang terjual 90 hari (turnover), bounded 0-1
      const movement = pcs90 + stock > 0 ? clamp01(pcs90 / (pcs90 + stock)) : 0;
      // margin: margin% / 25% target
      const marginPct = rev90 > 0 ? margin90 / rev90 : 0;
      const marginScore = clamp01(marginPct / 0.25);
      // tren: rev30 vs rev_prev30
      let trend;
      if (revPrev30 <= 0) trend = rev30 > 0 ? 1 : 0.5;
      else trend = clamp01(0.5 + (rev30 / revPrev30 - 1) * 0.5);
      // risiko ED: 1 - porsi stok yang nyaris expired
      const edShare = stock > 0 ? edQty / stock : 0;
      const edScore = clamp01(1 - edShare);

      const score = Math.round((movement * 0.3 + marginScore * 0.3 + trend * 0.2 + edScore * 0.2) * 100);
      return {
        product_id: r.product_id,
        code: r.code,
        name: r.name,
        category: r.category,
        score,
        grade: bandOf(score),
        metrics: {
          movement: Math.round(movement * 100),
          margin_pct: Math.round(marginPct * 1000) / 10,
          trend: Math.round(trend * 100),
          ed_risk: Math.round(edShare * 100),
          stock,
          sold_90d: pcs90,
        },
      };
    });

    res.json({ generated_at: new Date().toISOString(), items });
  } catch (e) {
    console.error('[insights.product-health] failed:', e.message);
    res.status(500).json({ error: 'Gagal memuat skor kesehatan produk' });
  }
});

// ─── #7 Ringkasan bisnis mingguan ────────────────────────────────────────
// Minggu berjalan (7 hari terakhir) vs 7 hari sebelumnya. Margin = margin produk.
router.get('/weekly-summary', async (req, res) => {
  try {
    const totalsQ = pool.query(
      `
        SELECT
          SUM(CASE WHEN so.sale_date >= CURRENT_DATE - INTERVAL '7 days'
              THEN COALESCE(si.qty_in_unit, si.qty, 0) * COALESCE(si.unit_price, 0) ELSE 0 END) AS rev_this,
          SUM(CASE WHEN so.sale_date < CURRENT_DATE - INTERVAL '7 days'
                AND so.sale_date >= CURRENT_DATE - INTERVAL '14 days'
              THEN COALESCE(si.qty_in_unit, si.qty, 0) * COALESCE(si.unit_price, 0) ELSE 0 END) AS rev_prev,
          SUM(CASE WHEN so.sale_date >= CURRENT_DATE - INTERVAL '7 days'
              THEN COALESCE(si.qty_in_unit, si.qty, 0) * (COALESCE(si.unit_price, 0) - (${unitHppCostSql})) ELSE 0 END) AS margin_this,
          SUM(CASE WHEN so.sale_date < CURRENT_DATE - INTERVAL '7 days'
                AND so.sale_date >= CURRENT_DATE - INTERVAL '14 days'
              THEN COALESCE(si.qty_in_unit, si.qty, 0) * (COALESCE(si.unit_price, 0) - (${unitHppCostSql})) ELSE 0 END) AS margin_prev,
          COUNT(DISTINCT CASE WHEN so.sale_date >= CURRENT_DATE - INTERVAL '7 days' THEN so.id END) AS orders_this,
          COUNT(DISTINCT CASE WHEN so.sale_date < CURRENT_DATE - INTERVAL '7 days'
              AND so.sale_date >= CURRENT_DATE - INTERVAL '14 days' THEN so.id END) AS orders_prev
        FROM sales_orders so
        JOIN sales_items si ON si.sales_order_id = so.id
        WHERE so.is_deleted = false
          AND so.status = 'final'
          AND so.sale_date >= CURRENT_DATE - INTERVAL '14 days'
      `,
    );

    // Resolusi nama canonical: produk yang pernah di-rename simpan nama lama di
    // snapshot sales_items. Map ke nama master via (1) match nama langsung,
    // (2) product_aliases. Tanpa ini, 1 produk bisa kebaca 2x (lama vs baru).
    const moversQ = pool.query(
      `
        SELECT
          COALESCE(pm_direct.name, pm_alias.name, si.product_name) AS name,
          SUM(CASE WHEN so.sale_date >= CURRENT_DATE - INTERVAL '7 days'
              THEN COALESCE(si.qty_in_unit, si.qty, 0) * COALESCE(si.unit_price, 0) ELSE 0 END) AS rev_this,
          SUM(CASE WHEN so.sale_date < CURRENT_DATE - INTERVAL '7 days'
                AND so.sale_date >= CURRENT_DATE - INTERVAL '14 days'
              THEN COALESCE(si.qty_in_unit, si.qty, 0) * COALESCE(si.unit_price, 0) ELSE 0 END) AS rev_prev
        FROM sales_orders so
        JOIN sales_items si ON si.sales_order_id = so.id
        LEFT JOIN product_master pm_direct
          ON LOWER(TRIM(pm_direct.name)) = LOWER(TRIM(si.product_name))
        LEFT JOIN product_aliases pa
          ON LOWER(TRIM(pa.alias_name)) = LOWER(TRIM(si.product_name))
        LEFT JOIN product_master pm_alias ON pm_alias.id = pa.product_id
        WHERE so.is_deleted = false
          AND so.status = 'final'
          AND so.sale_date >= CURRENT_DATE - INTERVAL '14 days'
          AND NULLIF(TRIM(COALESCE(si.product_name, '')), '') IS NOT NULL
        GROUP BY COALESCE(pm_direct.name, pm_alias.name, si.product_name)
      `,
    );

    const [{ rows: tRows }, { rows: mRows }] = await Promise.all([totalsQ, moversQ]);
    const t = tRows[0] || {};
    const revThis = Number(t.rev_this) || 0;
    const revPrev = Number(t.rev_prev) || 0;
    const marginThis = Number(t.margin_this) || 0;
    const marginPrev = Number(t.margin_prev) || 0;

    const movers = mRows
      .map((r) => ({
        name: r.name,
        rev_this: Number(r.rev_this) || 0,
        rev_prev: Number(r.rev_prev) || 0,
        delta: (Number(r.rev_this) || 0) - (Number(r.rev_prev) || 0),
      }))
      .filter((m) => m.rev_this > 0 || m.rev_prev > 0);

    const topUp = [...movers].filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3);
    const topDown = [...movers].filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3);

    res.json({
      generated_at: new Date().toISOString(),
      revenue: { this_week: revThis, prev_week: revPrev },
      margin: { this_week: marginThis, prev_week: marginPrev },
      margin_pct: {
        this_week: revThis > 0 ? Math.round((marginThis / revThis) * 1000) / 10 : 0,
        prev_week: revPrev > 0 ? Math.round((marginPrev / revPrev) * 1000) / 10 : 0,
      },
      orders: { this_week: Number(t.orders_this) || 0, prev_week: Number(t.orders_prev) || 0 },
      top_up: topUp,
      top_down: topDown,
    });
  } catch (e) {
    console.error('[insights.weekly-summary] failed:', e.message);
    res.status(500).json({ error: 'Gagal memuat ringkasan mingguan' });
  }
});

// ─── #10 Sering dibeli bersama (market basket) ───────────────────────────
router.get('/copurchase', async (req, res) => {
  const productName = String(req.query.product_name || '').trim();
  if (!productName) return res.json({ product_name: '', items: [] });
  try {
    const { rows } = await pool.query(
      `
        WITH base AS (
          SELECT DISTINCT si.sales_order_id
          FROM sales_items si
          JOIN sales_orders so ON so.id = si.sales_order_id
          WHERE so.is_deleted = false
            AND so.status = 'final'
            AND so.sale_date >= CURRENT_DATE - INTERVAL '180 days'
            AND LOWER(TRIM(si.product_name)) = LOWER(TRIM($1))
        ),
        base_count AS (SELECT COUNT(*)::int AS c FROM base)
        SELECT
          (ARRAY_AGG(si2.product_name ORDER BY si2.id))[1] AS name,
          COUNT(DISTINCT si2.sales_order_id)::int AS co_count,
          (SELECT c FROM base_count) AS base_count
        FROM sales_items si2
        JOIN base b ON b.sales_order_id = si2.sales_order_id
        WHERE LOWER(TRIM(si2.product_name)) <> LOWER(TRIM($1))
          AND NULLIF(TRIM(COALESCE(si2.product_name, '')), '') IS NOT NULL
        GROUP BY LOWER(TRIM(si2.product_name))
        HAVING COUNT(DISTINCT si2.sales_order_id) >= 3
        ORDER BY co_count DESC
        LIMIT 3
      `,
      [productName],
    );
    const items = rows.map((r) => ({
      name: r.name,
      co_count: Number(r.co_count) || 0,
      base_count: Number(r.base_count) || 0,
      confidence: r.base_count > 0 ? Math.round((Number(r.co_count) / Number(r.base_count)) * 100) : 0,
    }));
    res.json({ product_name: productName, items });
  } catch (e) {
    console.error('[insights.copurchase] failed:', e.message);
    res.status(500).json({ error: 'Gagal memuat saran bundling' });
  }
});

// ─── #3 Baseline anomali — penjualan (qty + harga) ───────────────────────
router.get('/baselines/sales', async (req, res) => {
  const productName = String(req.query.product_name || '').trim();
  const customerName = String(req.query.customer_name || '').trim();
  if (!productName) return res.json({ n_samples: 0 });
  try {
    const params = [productName];
    let custFilter = '';
    if (customerName) {
      params.push(customerName);
      custFilter = `AND LOWER(TRIM(so.customer_name)) = LOWER(TRIM($2))`;
    }
    const { rows } = await pool.query(
      `
        SELECT
          COUNT(*)::int AS n,
          AVG(q) AS qty_mean,
          STDDEV_SAMP(q) AS qty_std,
          AVG(price) AS price_mean
        FROM (
          SELECT
            COALESCE(si.qty_in_unit, si.qty, 0) AS q,
            NULLIF(si.unit_price, 0) AS price
          FROM sales_items si
          JOIN sales_orders so ON so.id = si.sales_order_id
          WHERE so.is_deleted = false
            AND so.status = 'final'
            AND so.sale_date >= CURRENT_DATE - INTERVAL '180 days'
            AND LOWER(TRIM(si.product_name)) = LOWER(TRIM($1))
            ${custFilter}
        ) t
      `,
      params,
    );
    const r = rows[0] || {};
    res.json({
      n_samples: Number(r.n) || 0,
      qty_mean: r.qty_mean === null ? null : Math.round((Number(r.qty_mean) || 0) * 100) / 100,
      qty_std: r.qty_std === null ? null : Math.round((Number(r.qty_std) || 0) * 100) / 100,
      price_mean: r.price_mean === null ? null : Math.round(Number(r.price_mean) || 0),
    });
  } catch (e) {
    console.error('[insights.baselines.sales] failed:', e.message);
    res.status(500).json({ error: 'Gagal memuat baseline penjualan' });
  }
});

// ─── #3 Baseline anomali — pembelian (HNA faktur) ────────────────────────
router.get('/baselines/purchase', async (req, res) => {
  const productId = Number.parseInt(req.query.product_id, 10);
  if (!Number.isFinite(productId) || productId <= 0) return res.json({ n_samples: 0 });
  try {
    const { rows } = await pool.query(
      `
        SELECT
          COUNT(*)::int AS n,
          AVG(h) AS hna_mean,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY h) AS hna_median
        FROM (
          SELECT NULLIF(COALESCE(ii.hna_per_item, ii.hna, 0), 0) AS h
          FROM invoice_items ii
          JOIN invoices iv ON iv.id = ii.invoice_id
            AND iv.deleted_at IS NULL
            AND COALESCE(iv.is_draft, FALSE) = FALSE
          WHERE ii.product_id = $1
            AND iv.purchase_date >= CURRENT_DATE - INTERVAL '365 days'
        ) t
        WHERE h IS NOT NULL
      `,
      [productId],
    );
    const r = rows[0] || {};
    res.json({
      n_samples: Number(r.n) || 0,
      hna_mean: r.hna_mean === null ? null : Math.round(Number(r.hna_mean) || 0),
      hna_median: r.hna_median === null ? null : Math.round(Number(r.hna_median) || 0),
    });
  } catch (e) {
    console.error('[insights.baselines.purchase] failed:', e.message);
    res.status(500).json({ error: 'Gagal memuat baseline pembelian' });
  }
});

// ─── #5 Radar customer hilang / churn ────────────────────────────────────
router.get('/churn', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
        WITH orders AS (
          SELECT
            so.customer_id,
            so.sale_date,
            so.total,
            so.sale_date - LAG(so.sale_date) OVER (PARTITION BY so.customer_id ORDER BY so.sale_date) AS gap
          FROM sales_orders so
          WHERE so.is_deleted = false
            AND so.status = 'final'
            AND so.customer_id IS NOT NULL
        ),
        agg AS (
          SELECT
            customer_id,
            COUNT(*)::int AS order_count,
            MAX(sale_date) AS last_order_date,
            AVG(total) AS avg_total,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap) AS median_gap
          FROM orders
          GROUP BY customer_id
          HAVING COUNT(*) >= 3
        )
        SELECT
          a.customer_id, a.order_count, a.last_order_date, a.avg_total, a.median_gap,
          (CURRENT_DATE - a.last_order_date)::int AS days_silent,
          c.name, c.phone
        FROM agg a
        JOIN customers c ON c.id = a.customer_id
        WHERE a.median_gap IS NOT NULL
          AND a.median_gap > 0
          AND (CURRENT_DATE - a.last_order_date) > 2 * a.median_gap
        ORDER BY days_silent DESC
        LIMIT 20
      `,
    );
    res.json({
      generated_at: new Date().toISOString(),
      items: rows.map((r) => ({
        customer_id: r.customer_id,
        name: r.name,
        phone: r.phone,
        order_count: Number(r.order_count) || 0,
        median_interval_days: Math.round(Number(r.median_gap) || 0),
        days_silent: Number(r.days_silent) || 0,
        last_order_date: r.last_order_date,
        avg_total: Math.round(Number(r.avg_total) || 0),
      })),
    });
  } catch (e) {
    console.error('[insights.churn] failed:', e.message);
    res.status(500).json({ error: 'Gagal memuat radar customer' });
  }
});

// ─── #6 Fee marketplace belajar dari settlement nyata ────────────────────
// Nota channel='online' hanya generik (bukan per-platform), jadi fee aktual = blended.
// UI menawarkan apply ke profil online (shopee / tokopedia_tiktok) pilihan operator.
router.get('/effective-fees', async (req, res) => {
  try {
    const settleQ = pool.query(
      `
        SELECT
          COUNT(*)::int AS n,
          SUM(COALESCE(total, 0)) AS gross,
          SUM(COALESCE(settlement_amount, 0)) AS net
        FROM sales_orders
        WHERE is_deleted = false
          AND status = 'final'
          AND LOWER(TRIM(COALESCE(channel, ''))) = 'online'
          AND settlement_amount IS NOT NULL
          AND settlement_amount > 0
          AND total > 0
          AND sale_date >= CURRENT_DATE - INTERVAL '90 days'
      `,
    );
    const profilesQ = pool.query(
      `SELECT id, platform, category_key, label, safe_effective_fee_rate, source
       FROM marketplace_fee_profiles
       WHERE active = TRUE AND platform <> 'offline'
       ORDER BY platform, category_key`,
    );
    const [{ rows: sRows }, { rows: pRows }] = await Promise.all([settleQ, profilesQ]);
    const s = sRows[0] || {};
    const gross = Number(s.gross) || 0;
    const net = Number(s.net) || 0;
    const n = Number(s.n) || 0;
    const actualFeeRate = gross > 0 ? Math.max(0, Math.min(0.99, 1 - net / gross)) : null;
    res.json({
      n_samples: n,
      actual_fee_rate: actualFeeRate === null ? null : Math.round(actualFeeRate * 10000) / 10000,
      profiles: pRows.map((p) => ({
        id: p.id,
        platform: p.platform,
        category_key: p.category_key,
        label: p.label,
        current_rate: Number(p.safe_effective_fee_rate) || 0,
        source: p.source,
      })),
    });
  } catch (e) {
    console.error('[insights.effective-fees] failed:', e.message);
    res.status(500).json({ error: 'Gagal memuat fee efektif' });
  }
});

module.exports = router;
