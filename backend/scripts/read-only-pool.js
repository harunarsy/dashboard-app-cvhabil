const { Pool } = require('pg');

/**
 * Test-only pg wrapper that fails closed unless every checked-out connection
 * proves PostgreSQL read-only mode before executing the requested query.
 */
function createReadOnlyPool(config, { context = 'read-only-test' } = {}) {
  const pool = new Pool(config);
  let announced = false;

  return {
    async query(...args) {
      const client = await pool.connect();

      try {
        await client.query('SET default_transaction_read_only = on');
        const verification = await client.query('SHOW transaction_read_only');
        const mode = verification.rows[0]?.transaction_read_only;

        if (mode !== 'on') {
          throw new Error(`[DB Read-Only Guard] ${context}: transaction_read_only=${mode || 'unknown'}`);
        }

        if (!announced) {
          console.log(`[DB Read-Only Guard] ${context}: transaction_read_only=on`);
          announced = true;
        }

        return await client.query(...args);
      } finally {
        client.release();
      }
    },

    async end() {
      return pool.end();
    },
  };
}

module.exports = { createReadOnlyPool };
