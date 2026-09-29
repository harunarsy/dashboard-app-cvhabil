/**
 * server.js — Entry point. Imports app.js and starts listener.
 */
const app = require('./app');
const http = require('http');
const server = http.createServer(app);

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Backend server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  // v1.67.24: laporkan status skema saat boot supaya keterlambatan migrasi kelihatan
  // (dulu kode membaca kolom baru sebelum migrasi jalan → "Inventory tampak kosong").
  // Dijalankan di sini, BUKAN saat import app.js (invarian project: import tanpa DB).
  const { buildSchemaStatus } = require('./utils/schemaStatus');
  const pool = require('./config/database');
  buildSchemaStatus((sql) => pool.query(sql))
    .then((status) => {
      if (status.ok) {
        console.log(`[schema] OK — migrasi terakhir ${status.latestApplied}`);
        return;
      }
      console.warn(
        `[schema] TERTINGGAL — kode butuh ${status.expectedLatest}, DB punya `
        + `${status.latestApplied || 'tidak ada'} (${status.missingCount} migrasi belum jalan). `
        + 'Jalankan: ALLOW_SCHEMA_MIGRATION=true HABIL_DB_TARGET=prod ALLOW_PROD_LOCAL=true '
        + 'MIGRATION_TARGET_CONFIRM=<host> node scripts/migrate.js'
      );
    })
    .catch(() => {});
});

process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  server.close(() => { console.log('Server closed'); process.exit(0); });
});
