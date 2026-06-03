/**
 * bootstrap.js — Central awaited schema bootstrap
 *
 * Runs ensureSchema() on all route modules explicitly,
 * instead of relying on import-time fire-and-forget.
 *
 * Usage:
 *   const runBootstrap = require('./bootstrap');
 *   await runBootstrap();
 */
async function runBootstrap() {
  const ROUTE_MODULES = [
    './routes/settings',
    './routes/invoices',
    './routes/inventory',
    './routes/sales',
    './routes/purchaseOrders',
    './routes/onlineStore',
    './routes/ledger',
    './routes/printSettings',
    './routes/distributors',
    './routes/products',
    './routes/bugs',
  ];

  for (const p of ROUTE_MODULES) {
    const mod = require(p);
    if (typeof mod.ensureSchema === 'function') {
      await mod.ensureSchema();
    }
  }
}

module.exports = runBootstrap;
