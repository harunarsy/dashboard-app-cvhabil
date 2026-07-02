// Nomor dokumen bulanan — single source of truth (v1.54.0).
// Format: {prefix}{YYMM}{NNN} dengan reset per bulan + sync ke MAX dokumen aktif
// bulan berjalan (nomor dokumen terhapus bisa re-use, mirror perilaku nota v1.8.1).
// Dipakai: NOTA (sales_orders.order_number) + PJM (loans.loan_number).
// table/column HARUS string literal dari call site (bukan input user) — diinterpolasi ke SQL.

const generateMonthlyDocNumber = async (client, { docType, prefix, table, column, pad = 3 }) => {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const currentYymm = `${yy}${mm}`;
  const monthPrefix = `${prefix}${currentYymm}`;

  // Sync counter ke MAX dokumen aktif bulan ini. REPLACE prefix (bukan SUBSTRING FROM
  // $param — PG treat param sbg regex, insiden v1.8.3).
  await client.query(
    `UPDATE document_counters
     SET last_number = COALESCE((
       SELECT MAX(CAST(REPLACE(${column}, $1, '') AS INTEGER))
       FROM ${table}
       WHERE is_deleted = FALSE AND ${column} LIKE $2
     ), 0)
     WHERE doc_type = $3`,
    [monthPrefix, `${monthPrefix}%`, docType]
  );

  const { rows: [counter] } = await client.query(
    `SELECT last_number, last_yymm FROM document_counters WHERE doc_type = $1`,
    [docType]
  );
  if (!counter) {
    // NB: tanpa kolom is_active — document_counters prod (legacy neon_migration) tidak
    // punya kolom itu; jalur INSERT baru pertama kali kena saat doc_type baru (PJM).
    await client.query(
      `INSERT INTO document_counters (doc_type, prefix, last_number, last_yymm)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (doc_type) DO UPDATE SET last_number = 1, last_yymm = EXCLUDED.last_yymm`,
      [docType, prefix, currentYymm]
    );
    return `${monthPrefix}${String(1).padStart(pad, '0')}`;
  }

  let nextNumber;
  if (counter.last_yymm && counter.last_yymm !== currentYymm) {
    // Bulan baru → reset ke 1
    nextNumber = 1;
    await client.query(
      `UPDATE document_counters SET last_number = $1, last_yymm = $2 WHERE doc_type = $3`,
      [nextNumber, currentYymm, docType]
    );
  } else {
    const { rows: [updated] } = await client.query(
      `UPDATE document_counters SET last_number = last_number + 1, last_yymm = $1
       WHERE doc_type = $2 RETURNING last_number`,
      [currentYymm, docType]
    );
    nextNumber = updated.last_number;
  }

  return `${monthPrefix}${String(nextNumber).padStart(pad, '0')}`;
};

module.exports = { generateMonthlyDocNumber };
