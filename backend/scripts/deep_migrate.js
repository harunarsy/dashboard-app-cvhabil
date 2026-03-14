const { Pool } = require('pg');
require('dotenv').config({ path: '../.env.dev' });

const SUPABASE_CONFIG = {
  connectionString: 'postgresql://postgres.bgaatkxqljvibjosliat:habilsejahtera@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
};

const NEON_CONFIG = {
  connectionString: 'postgresql://neondb_owner:npg_sr8oI4GvWFhV@ep-frosty-glitter-a1kt0apa-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: { rejectUnauthorized: false }
};

const sPool = new Pool(SUPABASE_CONFIG);
const nPool = new Pool(NEON_CONFIG);

async function migrateTable(tableName) {
  console.log(`Migrating table: ${tableName}...`);
  try {
    const { rows } = await sPool.query(`SELECT * FROM ${tableName}`);
    if (rows.length === 0) {
      console.log(`Table ${tableName} is empty. Skipping.`);
      return;
    }

    // Get columns from target table to filter input
    const colRes = await nPool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = $1 AND table_schema = 'public'
    `, [tableName]);
    const validCols = colRes.rows.map(c => c.column_name);

    for (const row of rows) {
      const filteredRow = {};
      validCols.forEach(col => {
        if (Object.prototype.hasOwnProperty.call(row, col)) {
          filteredRow[col] = row[col];
        }
      });

      const cols = Object.keys(filteredRow).join(', ');
      const vals = Object.values(filteredRow);
      const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');

      await nPool.query(
        `INSERT INTO ${tableName} (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
        vals
      );
    }
    console.log(`Successfully migrated ${rows.length} rows to ${tableName}.`);
  } catch (e) {
    console.error(`Error migrating ${tableName}:`, e.message);
  }
}

async function run() {
  const tables = [
    'bug_reports', 'customers', 'distributors', 'employees', 'products', 
    'orders', 'order_items', 'transactions', 'product_master', 'inventory_batches',
    'invoices', 'invoice_items', 'sales_orders', 'sales_items', 'tasks', 'task_history'
  ];

  for (const t of tables) {
    await migrateTable(t);
  }
  console.log('Deep migration finished.');
  process.exit(0);
}

run();
