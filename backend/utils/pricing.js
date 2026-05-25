// Tiered pricing resolver — single source of truth (mirror frontend/src/constants/units.js resolveTierPrice)
// Convention: "highest min_qty wins" — kalau ada overlap, pilih tier dengan min_qty tertinggi yang masih match qty user.
// Contoh: tier [1-4@212k, 5-9@208k, 10+@204k] dengan qty=7 → pilih tier 5-9@208k

const resolveTierPrice = (qty, unit, tiers) => {
  if (!Array.isArray(tiers) || !tiers.length || !qty) return null;
  const q = parseFloat(qty);
  if (!q || q <= 0) return null;
  const matches = tiers
    .filter(t =>
      String(t.unit).toLowerCase() === String(unit).toLowerCase()
      && parseInt(t.min_qty) <= q
      && (t.max_qty === null || t.max_qty === undefined || parseInt(t.max_qty) >= q)
    )
    .sort((a, b) => parseInt(b.min_qty) - parseInt(a.min_qty));
  return matches.length ? parseFloat(matches[0].price) : null;
};

const getTiersForProduct = async (client, productId) => {
  const { rows } = await client.query(
    'SELECT id, unit, min_qty, max_qty, price FROM product_price_tiers WHERE product_id = $1 ORDER BY unit, min_qty',
    [productId]
  );
  return rows;
};

module.exports = { resolveTierPrice, getTiersForProduct };
