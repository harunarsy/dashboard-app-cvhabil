/**
 * Live read-only integration test for Habil Smart-Assistant.
 * Requires an explicitly approved HABIL_DB_TARGET and never performs writes.
 */
const assert = require('assert');
const path = require('path');
const {
  ensureDbTargetSafety,
  loadRuntimeEnv,
} = require('../config/runtimeEnv');

loadRuntimeEnv({
  baseDir: path.join(__dirname, '..'),
  context: 'backend/test-smart-assistant-readonly',
  preferDevEnv: true,
});
ensureDbTargetSafety({
  context: 'backend/test-smart-assistant-readonly',
  allowProdSmoke: true,
});

const pool = require('../config/database');
const { loadSmartAssistantData } = require('../services/smartAssistantData');
const {
  buildSmartAssistantResponse,
} = require('../services/smartAssistantEngine');
const { withReadOnlyTransaction } = require('../utils/readOnlyTransaction');

const dbEndpoint = (() => {
  if (!process.env.DATABASE_URL) {
    return {
      provider: 'host',
      port: String(process.env.DB_PORT || ''),
    };
  }
  const url = new URL(process.env.DATABASE_URL);
  return {
    provider: url.hostname.includes('supabase')
      ? 'supabase'
      : url.hostname.includes('neon.tech')
        ? 'neon'
        : 'other',
    port: url.port,
  };
})();

async function run() {
  if (dbEndpoint.provider === 'supabase') {
    assert.strictEqual(
      dbEndpoint.port,
      '6543',
      'Supabase integration must use the session pooler on port 6543',
    );
  } else {
    assert.strictEqual(
      dbEndpoint.provider,
      'neon',
      'Only the approved Neon endpoint or Supabase session pooler may be used',
    );
  }

  const data = await withReadOnlyTransaction(
    (connection) => loadSmartAssistantData(connection, 'overview'),
    { queryTimeoutMs: 8000 },
  );
  const response = buildSmartAssistantResponse(data, {
    requestedScope: 'overview',
    limit: 8,
  });

  assert.strictEqual(response.assistant.mode, 'rule_based');
  assert.strictEqual(response.meta.data_boundary, 'authenticated_read_only');
  assert.ok(response.recommendations.length <= 8);
  assert.ok(
    response.recommendations.every(
      (item) => item.reason && Array.isArray(item.evidence) && item.evidence.length,
    ),
  );

  console.log('✅ transaction_read_only=on verified before assistant queries');
  console.log(
    dbEndpoint.provider === 'supabase'
      ? '✅ Supabase session pooler port=6543 verified'
      : '✅ approved Neon managed endpoint verified',
  );
  console.log(
    `✅ source rows: restock=${data.restock.length}, dormant=${data.dormant.length}, weekly=${data.weekly ? 1 : 0}`,
  );
  console.log(`✅ bounded recommendations=${response.recommendations.length}/8`);
}

run()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(`❌ Smart-Assistant read-only integration failed: ${error.message}`);
    await pool.end();
    process.exit(1);
  });
