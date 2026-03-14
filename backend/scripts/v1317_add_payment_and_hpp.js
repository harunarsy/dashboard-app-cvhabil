require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const pool = require('../config/database');

async function migrate() {
  console.log('--- Database Migration v1.3.17 ---');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Checking sales_orders for new columns...');
    
    // Add columns to sales_orders
    await client.query(`
      ALTER TABLE sales_orders 
      ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'unpaid',
      ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP NULL,
      ADD COLUMN IF NOT EXISTS gross_profit DECIMAL(15,2) DEFAULT 0
    `);
    console.log('sales_orders columns checked/added.');

    // Add column to sales_items
    console.log('Checking sales_items for unit_hpp...');
    await client.query(`
      ALTER TABLE sales_items 
      ADD COLUMN IF NOT EXISTS unit_hpp DECIMAL(15,2) DEFAULT 0
    `);
    console.log('sales_items column checked/added.');

    // Initialize gross_profit for existing paid orders if possible
    // (Optional: for now we just leave them at 0 or handle in future logic)

    await client.query('COMMIT');
    console.log('Migration completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

migrate();
