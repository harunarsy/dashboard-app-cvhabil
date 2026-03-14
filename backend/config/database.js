const { Pool } = require('pg');


const pool = new Pool(
  process.env.DATABASE_URL 
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
      }
);

// Connection logic logging
const isRemote = !!process.env.DATABASE_URL;
console.log(`[DB] Attempting to connect to ${isRemote ? 'Cloud' : 'Local Host'}...`);

pool.on('connect', () => {
  console.log(`[DB] ✅ Connected to ${isRemote ? 'Cloud' : 'Local'} database successfully.`);
});

pool.on('error', (err) => {
  console.error('[DB] ❌ Unexpected error on idle client:', err.message);
  if (!isRemote && err.code === 'ECONNREFUSED') {
    console.error('[DB] TIP: No local database found. Try adding DATABASE_URL to your .env to use Supabase.');
  }
});

module.exports = pool;