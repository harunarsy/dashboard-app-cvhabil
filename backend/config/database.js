const { Pool } = require('pg');
const { installPgDateParser } = require('../utils/pgDate');

installPgDateParser();


// SSL dikontrol via objek `ssl` di bawah (rejectUnauthorized:false untuk Neon).
// sslmode di-strip dari connection string agar pg-connection-string tidak emit deprecation
// warning (pg v9 akan ubah arti 'require'→'verify-full'). Perilaku TLS efektif tetap sama.
const stripSslmode = (raw) => {
  try {
    const u = new URL(raw);
    u.searchParams.delete('sslmode');
    return u.toString();
  } catch {
    return raw;
  }
};

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: stripSslmode(process.env.DATABASE_URL), ssl: { rejectUnauthorized: false } }
  : {
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
    };

// Serverless (Vercel): tiap instance warm bikin pool sendiri dan hanya melayani
// 1 request pada satu waktu — max kecil supaya total koneksi seluruh instance
// tidak melewati limit Neon. Lokal/dev: satu proses, max besar aman.
poolConfig.max = process.env.VERCEL ? 5 : 20;
poolConfig.idleTimeoutMillis = 30000;
poolConfig.connectionTimeoutMillis = 5000;

const remoteDevReadOnly = process.env.HABIL_REMOTE_DEV_READ_ONLY === '1' && !!process.env.DATABASE_URL;
if (remoteDevReadOnly) {
  poolConfig.verify = (client, done) => {
    client.query('SET default_transaction_read_only = on', (error) => done(error));
  };
}

const pool = new Pool(poolConfig);

// Connection logic logging
const isRemote = !!process.env.DATABASE_URL;
console.log(`[DB] Attempting to connect to ${isRemote ? 'Cloud' : 'Local Host'}...`);

pool.on('connect', () => {
  console.log(`[DB] ✅ Connected to ${isRemote ? 'Cloud' : 'Local'} database successfully.`);
});

if (remoteDevReadOnly) {
  console.warn('[DB] Remote development connection is READ-ONLY.');
}

pool.on('error', (err) => {
  console.error('[DB] ❌ Unexpected error on idle client:', err.message);
  if (!isRemote && err.code === 'ECONNREFUSED') {
    console.error('[DB] TIP: No local database found. Try adding DATABASE_URL to your .env to use Neon.');
  }
});

module.exports = pool;
