// v1.22.3 (AUDIT-CA-03): data-backfill di ensureSchema dulunya jalan ULANG di setiap
// cold start serverless (full-scan UPDATE dll) — padahal migrasi one-time yang sudah
// lama selesai. Helper ini menandai migrasi yang sudah jalan di tabel schema_meta.
// Kalau suatu backfill perlu di-rerun (datanya berubah), bump key-nya (mis. _v2).
const runOnce = async (pool, key, fn) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_meta (
        key VARCHAR(100) PRIMARY KEY,
        done_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const { rows } = await pool.query('SELECT 1 FROM schema_meta WHERE key = $1', [key]);
    if (rows.length > 0) return false;
    await fn();
    await pool.query(
      'INSERT INTO schema_meta (key) VALUES ($1) ON CONFLICT (key) DO NOTHING',
      [key]
    );
    return true;
  } catch (err) {
    // Gagal backfill ≠ fatal untuk start app — biarkan dicoba lagi di cold start berikutnya.
    console.error(`migrationOnce[${key}]:`, err.message);
    return false;
  }
};

module.exports = { runOnce };
