/**
 * Production Migration Runner (v1.2.5)
 * Executes SQL migration on Supabase Production.
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Use DATABASE_URL from environment variables for security
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ Error: DATABASE_URL is not defined in .env');
  process.exit(1);
}

console.log('🚀 Starting Production Migration (v1.2.5-hotfix-2)...');
console.log(`📡 Connecting to: ${connectionString.split('@')[1]}`);

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false // Required for Supabase in many environments
  }
});

const runMigration = async () => {
  const sqlPath = path.join(__dirname, 'migrate_counters_v1.2.2.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  try {
    const client = await pool.connect();
    console.log('✅ Connected to database.');

    console.log('⚙️ Executing SQL migration...');
    await client.query(sql);
    console.log('✅ Migration executed successfully.');

    console.log('🔍 Verifying counters...');
    const res = await client.query('SELECT * FROM document_counters');
    console.table(res.rows);

    client.release();
    console.log('🎊 Recovery Complete!');
  } catch (err) {
    console.error('❌ Migration Failed:', err.message);
  } finally {
    await pool.end();
  }
};

runMigration();
