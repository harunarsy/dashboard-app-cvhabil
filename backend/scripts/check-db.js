const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let envFile = '.env';
try {
  const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  if (currentBranch === 'dev' && fs.existsSync(path.join(__dirname, '../.env.dev'))) {
    envFile = '.env.dev';
  }
} catch (e) {}

require('dotenv').config({ path: path.join(__dirname, '../', envFile) });
const { Pool } = require('pg');

const config = process.env.DATABASE_URL 
  ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
  : {
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
    };

const pool = new Pool(config);

console.log('--- Database Connectivity Check ---');
console.log(`Mode: ${process.env.DATABASE_URL ? 'Remote (Cloud)' : 'Local'}`);
console.log(`Host: ${config.host || 'from DATABASE_URL'}`);
console.log('-----------------------------------');

async function check() {
  const start = Date.now();
  let isSuccess = false;
  try {
    console.log('Attempting to connect...');
    const client = await pool.connect();
    isSuccess = true;
    const duration = Date.now() - start;
    
    console.log(`✅ Success! Connection established in ${duration}ms.`);
    
    const res = await client.query('SELECT current_database(), current_user, version()');
    console.log('\nDetails:');
    console.log(`- Database: ${res.rows[0].current_database}`);
    console.log(`- User:     ${res.rows[0].current_user}`);
    console.log(`- Version:  ${res.rows[0].version.split(',')[0]}`);
    
    client.release();
    console.log('\nEverything looks good! You are ready to develop.');
  } catch (err) {
    console.error('\n❌ Connection Failed!');
    console.error(`Error: ${err.message}`);
    
    if (err.code === 'ECONNREFUSED') {
      console.error('\nPOSSIBLE CAUSES:');
      console.error('1. Your local PostgreSQL server is not running.');
      console.error('2. You are trying to connect locally but intended to use Supabase.');
      console.error('   -> ACTION: Add DATABASE_URL to your .env file.');
    } else if (err.message.includes('self signed certificate')) {
      console.error('\nPOSSIBLE CAUSE: SSL setup mismatch.');
      console.error('   -> ACTION: Ensure ssl: { rejectUnauthorized: false } is set in config.');
    } else if (err.code === 'ENOTFOUND' || err.message.includes('Tenant or user not found')) {
      console.error('\nPOSSIBLE CAUSES:');
      console.error('1. DNS resolution failed (Common on IPv4 networks).');
      console.error('2. Supabase Pooler URI is incorrect.');
      console.error('   -> ACTION: Check your internet connection/VPN.');
      console.error('   -> ACTION: Make sure to use the Session Pooler (Port 6543) if you see "Not IPv4 compatible" in Supabase.');
    }
  } finally {
    await pool.end();
    process.exit(isSuccess ? 0 : 1); 
  }
}

check();
