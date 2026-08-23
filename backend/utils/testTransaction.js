const { Pool } = require('pg');
const { isDeepStrictEqual } = require('util');
const { isLocalHostname } = require('../config/runtimeEnv');

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
const TEST_DATABASE_PATTERN = /(^|[_-])(test|ci)([_-]|$)/i;
const DDL_PATTERN = /\b(?:CREATE|ALTER|DROP|TRUNCATE|REINDEX|CLUSTER|VACUUM|GRANT|REVOKE|COMMENT)\b/i;
const TRANSACTION_CONTROL_PATTERN = /^\s*(?:BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|ABORT|PREPARE\s+TRANSACTION)\b/i;
const ROUTE_CONTROL_PATTERN = /^(?:SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT) [a-z][a-z0-9_]*$/i;

class DeepFreezeSafetyError extends Error {
  constructor(message, code = 'DEEP_FREEZE_SAFETY_ERROR') {
    super(message);
    this.name = 'DeepFreezeSafetyError';
    this.code = code;
  }
}

function normalizeSql(query) {
  const text = typeof query === 'string' ? query : query?.text;
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function assertSafeTestQuery(query) {
  const sql = normalizeSql(query);
  if (!sql) {
    throw new DeepFreezeSafetyError('Empty SQL is not allowed in deep-freeze tests', 'EMPTY_TEST_QUERY');
  }
  if (DDL_PATTERN.test(sql)) {
    throw new DeepFreezeSafetyError(`DDL is forbidden in deep-freeze tests: ${sql.slice(0, 120)}`, 'TEST_DDL_BLOCKED');
  }
  if (TRANSACTION_CONTROL_PATTERN.test(sql)) {
    throw new DeepFreezeSafetyError(
      'Transaction control belongs to runWithRollback(), not the test body',
      'TEST_TRANSACTION_CONTROL_BLOCKED',
    );
  }
  return sql;
}

function assertDeepFreezeTarget(connectionString = process.env.TEST_DATABASE_URL) {
  if (process.env.NODE_ENV !== 'test') {
    throw new DeepFreezeSafetyError('Deep-freeze writes require NODE_ENV=test', 'TEST_ENV_REQUIRED');
  }
  if (process.env.ALLOW_DEEP_FREEZE_WRITES !== 'true') {
    throw new DeepFreezeSafetyError(
      'Set ALLOW_DEEP_FREEZE_WRITES=true only for an approved disposable test database',
      'TEST_WRITE_FLAG_REQUIRED',
    );
  }
  if (!connectionString) {
    throw new DeepFreezeSafetyError(
      'TEST_DATABASE_URL is required; DATABASE_URL is never used as a fallback',
      'TEST_DATABASE_URL_REQUIRED',
    );
  }

  let target;
  try {
    target = new URL(connectionString);
  } catch (error) {
    throw new DeepFreezeSafetyError(`Invalid TEST_DATABASE_URL: ${error.message}`, 'INVALID_TEST_DATABASE_URL');
  }

  if (!['postgres:', 'postgresql:'].includes(target.protocol)) {
    throw new DeepFreezeSafetyError('TEST_DATABASE_URL must use PostgreSQL', 'INVALID_TEST_DATABASE_PROTOCOL');
  }
  if (!isLocalHostname(target.hostname)) {
    throw new DeepFreezeSafetyError(
      `Remote deep-freeze target is forbidden (${target.hostname})`,
      'REMOTE_TEST_DATABASE_BLOCKED',
    );
  }

  const databaseName = decodeURIComponent(target.pathname.replace(/^\//, ''));
  if (!TEST_DATABASE_PATTERN.test(databaseName)) {
    throw new DeepFreezeSafetyError(
      `Disposable database name must contain test or ci (${databaseName || 'missing'})`,
      'UNSAFE_TEST_DATABASE_NAME',
    );
  }

  return Object.freeze({
    connectionString,
    hostname: target.hostname,
    port: target.port || '5432',
    databaseName,
  });
}

function boundedTimeout(value, fallback, maximum) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > maximum) {
    throw new DeepFreezeSafetyError(
      `Timeout must be between 1 and ${maximum} ms`,
      'INVALID_TEST_TIMEOUT',
    );
  }
  return Math.floor(numeric);
}

function recordQuery(queryLog, sql, source, logger) {
  const entry = Object.freeze({
    index: queryLog.length + 1,
    source,
    sql: normalizeSql(sql).slice(0, 2_000),
  });
  queryLog.push(entry);
  if (typeof logger === 'function') logger(entry);
  return entry;
}

function assertRollbackRestored(before, after, context = 'deep-freeze test') {
  if (isDeepStrictEqual(before, after)) return true;

  const error = new DeepFreezeSafetyError(
    `ROLLBACK FAILED: ${context}: baseline ${JSON.stringify(before)} != after ${JSON.stringify(after)}`,
    'ROLLBACK_FAILED',
  );
  error.before = before;
  error.after = after;
  console.error(`[ROLLBACK FAILED] ${error.message}`);
  throw error;
}

async function createTestClient(options = {}) {
  const target = assertDeepFreezeTarget(options.connectionString || process.env.TEST_DATABASE_URL);
  const timeoutMs = boundedTimeout(options.timeoutMs, DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const lockTimeoutMs = boundedTimeout(options.lockTimeoutMs, DEFAULT_LOCK_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const queryLog = [];
  const ownsPool = !options.pool;
  const pool = options.pool || new Pool({
    connectionString: target.connectionString,
    ssl: false,
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
  });

  let rawClient;
  try {
    rawClient = await pool.connect();
    recordQuery(queryLog, 'BEGIN', 'wrapper', options.logger);
    await rawClient.query('BEGIN');
    recordQuery(queryLog, `SET LOCAL statement_timeout = '${timeoutMs}ms'`, 'wrapper', options.logger);
    await rawClient.query(`SET LOCAL statement_timeout = '${timeoutMs}ms'`);
    recordQuery(queryLog, `SET LOCAL lock_timeout = '${lockTimeoutMs}ms'`, 'wrapper', options.logger);
    await rawClient.query(`SET LOCAL lock_timeout = '${lockTimeoutMs}ms'`);
  } catch (error) {
    rawClient?.release();
    if (ownsPool) await pool.end().catch(() => {});
    throw error;
  }

  let acceptingQueries = true;
  let finalized = false;

  const query = async (queryConfig, values) => {
    if (!acceptingQueries || finalized) {
      throw new DeepFreezeSafetyError('Test transaction is no longer active', 'TEST_TRANSACTION_CLOSED');
    }
    const sql = assertSafeTestQuery(queryConfig);
    recordQuery(queryLog, sql, 'test', options.logger);
    return rawClient.query(queryConfig, values);
  };

  const queryRouteControl = async (statement) => {
    if (!acceptingQueries || finalized) {
      throw new DeepFreezeSafetyError('Test transaction is no longer active', 'TEST_TRANSACTION_CLOSED');
    }
    const sql = normalizeSql(statement);
    if (!ROUTE_CONTROL_PATTERN.test(sql)) {
      throw new DeepFreezeSafetyError(`Unsafe route transaction control: ${sql}`, 'UNSAFE_ROUTE_CONTROL');
    }
    recordQuery(queryLog, sql, 'route-control', options.logger);
    return rawClient.query(sql);
  };

  const rollback = async () => {
    if (finalized) return;
    acceptingQueries = false;
    let rollbackError;
    try {
      recordQuery(queryLog, 'ROLLBACK', 'wrapper', options.logger);
      const result = await rawClient.query('ROLLBACK');
      if (result?.command !== 'ROLLBACK') {
        throw new Error(`Unexpected rollback command result: ${result?.command || 'unknown'}`);
      }
    } catch (error) {
      rollbackError = new DeepFreezeSafetyError(`ROLLBACK FAILED: ${error.message}`, 'ROLLBACK_FAILED');
      rollbackError.cause = error;
    } finally {
      finalized = true;
      rawClient.release();
      if (ownsPool) await pool.end().catch(() => {});
    }
    if (rollbackError) throw rollbackError;
  };

  const wrappedClient = new Proxy(rawClient, {
    get(client, property) {
      if (property === 'query') return query;
      if (property === 'release') return () => {};
      if (property === 'rollback') return rollback;
      if (property === 'queryRouteControl') return queryRouteControl;
      if (property === 'queryLog') return queryLog;
      if (property === 'target') return target;
      if (property === 'disableQueries') return () => { acceptingQueries = false; };
      const value = Reflect.get(client, property, client);
      return typeof value === 'function' ? value.bind(client) : value;
    },
  });

  return wrappedClient;
}

async function runWithRollback(testFn, options = {}) {
  if (typeof testFn !== 'function') {
    throw new TypeError('runWithRollback(testFn) requires a function');
  }

  const timeoutMs = boundedTimeout(options.timeoutMs, DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const client = await createTestClient({ ...options, timeoutMs });
  let timer;
  let value;
  let testError;

  try {
    const timeout = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        client.disableQueries();
        reject(new DeepFreezeSafetyError(`Test exceeded ${timeoutMs} ms`, 'TEST_TIMEOUT'));
      }, timeoutMs);
      timer.unref?.();
    });
    value = await Promise.race([Promise.resolve().then(() => testFn(client)), timeout]);
  } catch (error) {
    testError = error;
  } finally {
    clearTimeout(timer);
    try {
      await client.rollback();
    } catch (rollbackError) {
      rollbackError.testError = testError;
      rollbackError.queryLog = [...client.queryLog];
      throw rollbackError;
    }
  }

  if (testError) {
    testError.queryLog = [...client.queryLog];
    throw testError;
  }

  return { value, queryLog: [...client.queryLog] };
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  DeepFreezeSafetyError,
  assertDeepFreezeTarget,
  assertSafeTestQuery,
  assertRollbackRestored,
  createTestClient,
  normalizeSql,
  runWithRollback,
};
