// v1.22.2: alias nama produk — invisible bagi operator.
// Nama distributor lama / nama sebelum rename tetap auto-match ke produk yang benar.

// Simpan alias untuk sebuah produk. Aman dipanggil berulang:
// - skip kalau nama kosong, atau sama dengan nama master aktif mana pun
//   (alias tidak boleh membayangi nama produk lain → ambigu)
// - unique index normalized → ON CONFLICT DO NOTHING (1 alias = 1 produk, selamanya)
const seedProductAlias = async (db, productId, aliasName) => {
  const name = String(aliasName || '').trim();
  const id = Number.parseInt(productId, 10);
  if (!Number.isFinite(id) || id <= 0 || !name) return false;
  try {
    const { rows: clash } = await db.query(
      `SELECT 1 FROM product_master
       WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND is_active = TRUE
       LIMIT 1`,
      [name]
    );
    if (clash.length > 0) return false;
    const { rowCount } = await db.query(
      `INSERT INTO product_aliases (product_id, alias_name)
       VALUES ($1, $2)
       ON CONFLICT ((LOWER(TRIM(alias_name)))) DO NOTHING`,
      [id, name]
    );
    return rowCount > 0;
  } catch (err) {
    // Alias = optimasi pencocokan, bukan data inti — kegagalan tidak boleh
    // menggagalkan transaksi rename/faktur pemanggil.
    console.error('seedProductAlias error:', err.message);
    return false;
  }
};

module.exports = { seedProductAlias };
