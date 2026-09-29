/**
 * Status skema DB vs daftar migrasi di kode (v1.67.24).
 *
 * Kenapa ada: pernah kejadian kode membaca kolom migrasi baru SEBELUM migrasinya
 * diterapkan → endpoint error dan "Inventory tampak kosong" tanpa suara. Sekarang
 * status ini dicek saat boot dan dilaporkan di /api/health supaya keterlambatan
 * migrasi langsung kelihatan, bukan jadi bug misterius.
 */

const { listRouteSchemaMigrations } = require('../migrations/routeSchemas');

const buildSchemaStatus = async (query) => {
  const expected = listRouteSchemaMigrations();
  const expectedLatest = expected[expected.length - 1] || null;

  try {
    const { rows } = await query('SELECT id FROM schema_migrations ORDER BY id');
    const applied = rows.map((row) => row.id);
    const appliedSet = new Set(applied);
    const missing = expected.filter((id) => !appliedSet.has(id));
    return {
      ok: missing.length === 0,
      expectedLatest,
      latestApplied: applied.length ? applied[applied.length - 1] : null,
      missingCount: missing.length,
      missing: missing.slice(0, 5),
    };
  } catch (err) {
    // Tabel belum ada / DB belum siap → status tidak diketahui (jangan bikin boot gagal).
    return {
      ok: false,
      expectedLatest,
      latestApplied: null,
      missingCount: expected.length,
      error: err.message,
    };
  }
};

module.exports = { buildSchemaStatus };
