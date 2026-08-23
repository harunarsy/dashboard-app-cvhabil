const pool = require('../config/database');

class ReadOnlyTransactionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReadOnlyTransactionError';
    this.code = 'READ_ONLY_NOT_ENFORCED';
  }
}

async function withReadOnlyTransaction(
  callback,
  { queryTimeoutMs = 3500 } = {},
) {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query('BEGIN READ ONLY');
    transactionStarted = true;

    const { rows } = await client.query('SHOW transaction_read_only');
    if (String(rows?.[0]?.transaction_read_only || '').toLowerCase() !== 'on') {
      throw new ReadOnlyTransactionError(
        'Database transaction could not be proven read-only',
      );
    }

    const query = (text, values = []) =>
      client.query({ text, values, query_timeout: queryTimeoutMs });

    return await callback({ query });
  } finally {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error(
          '[read-only-transaction] rollback failed:',
          rollbackError.message,
        );
      }
    }
    client.release();
  }
}

module.exports = {
  ReadOnlyTransactionError,
  withReadOnlyTransaction,
};
