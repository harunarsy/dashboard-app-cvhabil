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
  const startIndex = monthPrefix.length + 1;
  const monthPattern = `^${monthPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[0-9]+$`;

  // v1.67.24: kunci per jenis dokumen selama transaksi. Dua permintaan yang membuat
  // dokumen bersamaan dulu bisa membaca counter yang sama lalu bertabrakan di unique
  // index (error 500 ke operator). Kunci ini membuat pembacaan+kenaikan counter serial.
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`habil_doc_number_${docType}`]);

  // Nomor aktif tertinggi bulan ini. Hanya nomor BERPOLA (prefix bulan + digit) yang
  // dihitung; nomor lain (mis. input manual) diabaikan supaya CAST tidak melempar error
  // dan menggagalkan pembuatan dokumen.
  // PENTING: posisi awal WAJIB di-cast `::int`. Tanpa cast, PostgreSQL menerima
  // parameter tanpa tipe sebagai pola REGEX (varian substring(text,text)), bukan
  // posisi karakter — MAX jadi ngawur dan nomor dokumen bisa bertabrakan.
  const readMaxActive = async () => {
    const { rows: [row] } = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(${column} FROM $1::int) AS INTEGER)), 0) AS max_number
       FROM ${table}
       WHERE is_deleted = FALSE AND ${column} ~ $2`,
      [startIndex, monthPattern]
    );
    return Number(row?.max_number || 0);
  };

  // Sync counter ke MAX dokumen aktif bulan ini (dokumen terhapus boleh dipakai ulang).
  const maxActive = await readMaxActive();
  await client.query(
    'UPDATE document_counters SET last_number = $1 WHERE doc_type = $2',
    [maxActive, docType]
  );

  const { rows: [counter] } = await client.query(
    `SELECT last_number, last_yymm FROM document_counters WHERE doc_type = $1`,
    [docType]
  );
  if (!counter) {
    // NB: tanpa kolom is_active — document_counters prod (legacy neon_migration) tidak
    // punya kolom itu; jalur INSERT baru pertama kali kena saat doc_type baru (PJM).
    // Mulai dari MAX+1 (bukan 1) supaya nomor yang sudah terpakai tidak ditabrak.
    const nextNumber = maxActive + 1;
    await client.query(
      `INSERT INTO document_counters (doc_type, prefix, last_number, last_yymm)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (doc_type) DO UPDATE SET last_number = EXCLUDED.last_number, last_yymm = EXCLUDED.last_yymm`,
      [docType, prefix, nextNumber, currentYymm]
    );
    return `${monthPrefix}${String(nextNumber).padStart(pad, '0')}`;
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
    nextNumber = updated?.last_number ?? maxActive + 1;
  }

  return `${monthPrefix}${String(nextNumber).padStart(pad, '0')}`;
};

module.exports = { generateMonthlyDocNumber };
