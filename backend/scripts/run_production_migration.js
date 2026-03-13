/**
 * Production Migration Runner (v1.2.2)
 * Executes SQL migration on Supabase Production.
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Use Port 6543 for Supabase as per Habil Protocol
// Verified from user screenshot: Using aws-1 regional pooler host
const connectionString = 'postgresql://postgres.bgaatkxqljvibjosliat:habilsejahtera@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres';

console.log('🚀 Starting Production Migration (v1.2.2)...');
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
