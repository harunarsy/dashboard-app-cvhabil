const { buildRestockItems } = require('../utils/insightRules');

const RESTOCK_SQL = `
  WITH sold AS (
    SELECT
      LOWER(TRIM(si.product_name)) AS nname,
      SUM(CASE WHEN so.sale_date >= CURRENT_DATE - INTERVAL '30 days'
        THEN COALESCE(si.qty, 0) ELSE 0 END) AS pcs30,
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
    pm.id AS product_id,
    pm.code,
    pm.name,
    pm.base_unit,
    pm.pack_unit,
    pm.pack_size,
    pm.min_stock,
    COALESCE(st.stock, 0) AS stock,
    COALESCE(sd.pcs30, 0) AS pcs30,
    COALESCE(sd.pcs90, 0) AS pcs90
  FROM product_master pm
  LEFT JOIN sold sd ON sd.nname = LOWER(TRIM(pm.name))
  LEFT JOIN stock st ON st.product_id = pm.id
  WHERE pm.is_active = TRUE
  LIMIT 1000
`;

const DORMANT_SQL = `
  WITH orders AS (
    SELECT
      so.customer_id,
      so.sale_date,
      so.total,
      so.sale_date - LAG(so.sale_date) OVER (
        PARTITION BY so.customer_id ORDER BY so.sale_date
      ) AS gap
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
  )
  SELECT
    a.customer_id,
    a.order_count,
    a.last_order_date,
    a.avg_total,
    a.median_gap,
    (CURRENT_DATE - a.last_order_date)::int AS days_silent,
    c.name
  FROM agg a
  JOIN customers c ON c.id = a.customer_id
  WHERE (CURRENT_DATE - a.last_order_date) > $1
  ORDER BY days_silent DESC
  LIMIT 100
`;

const WEEKLY_SQL = `
  SELECT
    SUM(CASE WHEN sale_date >= CURRENT_DATE - INTERVAL '7 days'
      THEN COALESCE(total, 0) ELSE 0 END) AS revenue_this,
    SUM(CASE WHEN sale_date < CURRENT_DATE - INTERVAL '7 days'
          AND sale_date >= CURRENT_DATE - INTERVAL '14 days'
      THEN COALESCE(total, 0) ELSE 0 END) AS revenue_previous,
    COUNT(CASE WHEN sale_date >= CURRENT_DATE - INTERVAL '7 days'
      THEN 1 END)::int AS orders_this,
    COUNT(CASE WHEN sale_date < CURRENT_DATE - INTERVAL '7 days'
          AND sale_date >= CURRENT_DATE - INTERVAL '14 days'
      THEN 1 END)::int AS orders_previous
  FROM sales_orders
  WHERE is_deleted = false
    AND status = 'final'
    AND sale_date >= CURRENT_DATE - INTERVAL '14 days'
`;

const normalizeDormantRows = (rows) =>
  rows.map((row) => ({
    customer_id: row.customer_id,
    name: row.name,
    order_count: Number(row.order_count) || 0,
    median_interval_days:
      row.median_gap === null
        ? null
        : Math.round(Number(row.median_gap) || 0),
    days_silent: Number(row.days_silent) || 0,
    last_order_date: row.last_order_date,
    avg_total: Math.round(Number(row.avg_total) || 0),
  }));

const normalizeWeeklyRow = (row = {}) => ({
  revenue_this: Number(row.revenue_this) || 0,
  revenue_previous: Number(row.revenue_previous) || 0,
  orders_this: Number(row.orders_this) || 0,
  orders_previous: Number(row.orders_previous) || 0,
});

async function loadSmartAssistantData({ query }, scope) {
  const data = { restock: [], dormant: [], weekly: null };

  if (scope === 'overview' || scope === 'inventory') {
    const { rows } = await query(RESTOCK_SQL);
    data.restock = buildRestockItems(rows);
  }

  if (scope === 'overview' || scope === 'customers') {
    const { rows } = await query(DORMANT_SQL, [30]);
    data.dormant = normalizeDormantRows(rows);
  }

  if (scope === 'overview' || scope === 'sales') {
    const { rows } = await query(WEEKLY_SQL);
    data.weekly = normalizeWeeklyRow(rows[0]);
  }

  return data;
}

module.exports = {
  loadSmartAssistantData,
  normalizeDormantRows,
  normalizeWeeklyRow,
};
