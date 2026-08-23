const {
  DeepFreezeSafetyError,
  normalizeSql,
} = require('./testTransaction');

function createTransactionalPoolBridge() {
  let activeClient = null;
  let savepointCounter = 0;
  let routeClients = [];

  const requireActiveClient = () => {
    if (!activeClient) {
      throw new DeepFreezeSafetyError(
        'Database access escaped the active deep-freeze transaction',
        'DEEP_FREEZE_CONTEXT_MISSING',
      );
    }
    return activeClient;
  };

  const createRouteClient = () => {
    const outerClient = requireActiveClient();
    const savepoints = [];
    const state = { released: false, savepoints };
    routeClients.push(state);

    const query = async (queryConfig, values) => {
      const sql = normalizeSql(queryConfig);
      if (/^BEGIN\s*;?$/i.test(sql) || /^START TRANSACTION\s*;?$/i.test(sql)) {
        const name = `habil_route_${++savepointCounter}`;
        savepoints.push(name);
        return outerClient.queryRouteControl(`SAVEPOINT ${name}`);
      }
      if (/^(?:COMMIT|END)\s*;?$/i.test(sql)) {
        const name = savepoints.pop();
        if (!name) {
          throw new DeepFreezeSafetyError('Route COMMIT has no matching BEGIN', 'ROUTE_TRANSACTION_UNBALANCED');
        }
        return outerClient.queryRouteControl(`RELEASE SAVEPOINT ${name}`);
      }
      if (/^(?:ROLLBACK|ABORT)\s*;?$/i.test(sql)) {
        const name = savepoints.pop();
        if (!name) {
          throw new DeepFreezeSafetyError('Route ROLLBACK has no matching BEGIN', 'ROUTE_TRANSACTION_UNBALANCED');
        }
        await outerClient.queryRouteControl(`ROLLBACK TO SAVEPOINT ${name}`);
        return outerClient.queryRouteControl(`RELEASE SAVEPOINT ${name}`);
      }
      return outerClient.query(queryConfig, values);
    };

    return new Proxy(outerClient, {
      get(client, property) {
        if (property === 'query') return query;
        if (property === 'release') {
          return () => {
            state.released = true;
          };
        }
        const value = Reflect.get(client, property, client);
        return typeof value === 'function' ? value.bind(client) : value;
      },
    });
  };

  const assertSettled = () => {
    const open = routeClients.filter((state) => state.savepoints.length > 0);
    const unreleased = routeClients.filter((state) => !state.released);
    if (open.length || unreleased.length) {
      throw new DeepFreezeSafetyError(
        `Route transaction leak: ${open.length} open savepoint client(s), ${unreleased.length} unreleased client(s)`,
        'ROUTE_TRANSACTION_LEAK',
      );
    }
  };

  const withClient = async (client, fn) => {
    if (activeClient) {
      throw new DeepFreezeSafetyError('Concurrent deep-freeze HTTP contexts are forbidden', 'DEEP_FREEZE_CONCURRENCY_BLOCKED');
    }
    activeClient = client;
    savepointCounter = 0;
    routeClients = [];

    let value;
    let bodyError;
    let settlementError;
    try {
      value = await fn();
    } catch (error) {
      bodyError = error;
    }
    try {
      assertSettled();
    } catch (error) {
      settlementError = error;
    } finally {
      activeClient = null;
      routeClients = [];
    }

    if (bodyError) throw bodyError;
    if (settlementError) throw settlementError;
    return value;
  };

  const pool = {
    query(...args) {
      return requireActiveClient().query(...args);
    },
    async connect() {
      return createRouteClient();
    },
    on() {},
    async end() {},
  };

  return Object.freeze({ pool, withClient });
}

module.exports = { createTransactionalPoolBridge };
