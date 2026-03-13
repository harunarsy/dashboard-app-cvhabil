const { Client } = require('pg');
require('dotenv').config();

// Use Environment Variable for security
const connectionString = process.env.DATABASE_URL;

const probe = async () => {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to Supabase!');
    
    // Check for databases
    const dbRes = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false;');
    console.log('Available Databases:', dbRes.rows.map(r => r.datname));

    // Check current database
    const currDb = await client.query('SELECT current_database();');
    console.log('Current Database:', currDb.rows[0].current_database);

    // Check for document_counters in the current DB
    try {
      const tableRes = await client.query("SELECT count(*) FROM information_schema.tables WHERE table_name = 'document_counters'");
      if (tableRes.rows[0].count > 0) {
        console.log('✅ table document_counters EXISTS.');
      } else {
        console.log('❌ table document_counters DOES NOT EXIST.');
      }
    } catch (e) {
      console.log('❌ Error checking table:', e.message);
    }

  } catch (err) {
    console.error('❌ Connection Failed:', err.message);
  } finally {
    await client.end();
  }
};

probe();
