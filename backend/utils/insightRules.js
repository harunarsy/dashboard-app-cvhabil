const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

const buildRestockItems = (rows, { thresholdDays = 21 } = {}) =>
  rows
    .map((row) => {
      const stock = Number(row.stock) || 0;
      const pcs30 = Number(row.pcs30) || 0;
      const pcs90 = Number(row.pcs90) || 0;
      const daily30 = pcs30 / 30;
      const dailyOlder = Math.max(0, pcs90 - pcs30) / 60;
      const velocity = daily30 * 0.7 + dailyOlder * 0.3;
      const daysLeft = velocity > 0 ? stock / velocity : null;

      return {
        product_id: row.product_id,
        code: row.code,
        name: row.name,
        base_unit: row.base_unit,
        pack_unit: row.pack_unit,
        pack_size: Number(row.pack_size) || null,
        min_stock: Number(row.min_stock) || 0,
        stock,
        velocity_per_day: Math.round(velocity * 100) / 100,
        days_left: daysLeft === null ? null : Math.round(daysLeft),
        avg_order_qty:
          row.avg_order_qty === null || row.avg_order_qty === undefined
            ? null
            : Math.round((Number(row.avg_order_qty) || 0) * 100) / 100,
        order_unit: row.order_unit || row.pack_unit || row.base_unit || 'pcs',
        cheapest_distributor: row.cheapest_distributor || null,
        cheapest_hna:
          row.cheapest_hna === null || row.cheapest_hna === undefined
            ? null
            : Math.round(Number(row.cheapest_hna) || 0),
        cheapest_date: row.cheapest_date || null,
        n_distributors: Number(row.n_distributors) || 0,
      };
    })
    .filter(
      (item) =>
        item.velocity_per_day > 0 &&
        item.days_left !== null &&
        item.days_left < thresholdDays,
    )
    .sort((a, b) => a.days_left - b.days_left);

const productHealthBand = (score) =>
  score >= 80
    ? 'A'
    : score >= 65
      ? 'B'
      : score >= 50
        ? 'C'
        : score >= 35
          ? 'D'
          : 'E';

const buildProductHealthItems = (rows) =>
  rows.map((row) => {
    const stock = Number(row.stock) || 0;
    const pcs90 = Number(row.pcs90) || 0;
    const rev90 = Number(row.rev90) || 0;
    const margin90 = Number(row.margin90) || 0;
    const rev30 = Number(row.rev30) || 0;
    const revPrev30 = Number(row.rev_prev30) || 0;
    const edQty = Number(row.ed_qty) || 0;

    const movement = pcs90 + stock > 0 ? clamp01(pcs90 / (pcs90 + stock)) : 0;
    const marginPct = rev90 > 0 ? margin90 / rev90 : 0;
    const marginScore = clamp01(marginPct / 0.25);
    const trend =
      revPrev30 <= 0
        ? rev30 > 0
          ? 1
          : 0.5
        : clamp01(0.5 + (rev30 / revPrev30 - 1) * 0.5);
    const edShare = stock > 0 ? edQty / stock : 0;
    const edScore = clamp01(1 - edShare);
    const score = Math.round(
      (movement * 0.3 + marginScore * 0.3 + trend * 0.2 + edScore * 0.2) *
        100,
    );

    return {
      product_id: row.product_id,
      code: row.code,
      name: row.name,
      category: row.category,
      score,
      grade: productHealthBand(score),
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

module.exports = {
  buildProductHealthItems,
  buildRestockItems,
  clamp01,
  productHealthBand,
};
