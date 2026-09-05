#!/usr/bin/env node
/**
 * staging-migrate.js — STAGING RELEASE GATE, Phase 3.
 *
 * Applies the project's baseline (schema.sql) + route migrations
 * (runRouteSchemaMigrations, up to 20260905_019) to an ISOLATED database,
 * then verifies the adjustment audit columns and proves runner idempotency.
 *
 * SAFETY: never reads backend/.env. Only honors an explicit TEST_DATABASE_URL
 * that MUST point at 127.0.0.1/localhost, MUST contain staging|test|ci in the
 * db name, and MUST NOT match any cloud provider substring.
 * Requires ALLOW_STAGING_MIGRATION=true.
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { runRouteSchemaMigrations } = require('../migrations/routeSchemas');

const CLOUD_PATTERNS = [
  'neon.tech', 'supabase.co', 'supabase.com', 'amazonaws.com', 'rds.amazonaws.com',
  'cloudsql', 'azure.com', 'database.windows.net', 'aivencloud.com', 'elephantsql.com',
  'render.com', 'railway.app', 'planetscale', 'cockroachcloud', 'timescale.cloud',
];

function assertIsolatedTarget(rawUrl) {
  if (!rawUrl) throw new Error('TEST_DATABASE_URL is required (explicit isolated target only)');
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error('TEST_DATABASE_URL is not a valid URL');
  }
  const host = (u.hostname || '').toLowerCase();
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    throw new Error(`Refused: host "${u.hostname}" is not loopback (127.0.0.1/localhost only)`);
  }
  const lowered = rawUrl.toLowerCase();
  for (const pat of CLOUD_PATTERNS) {
    if (lowered.includes(pat)) throw new Error(`Refused: URL matches cloud pattern "${pat}"`);
  }
  const dbName = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (!/(staging|test|ci)/i.test(dbName)) {
    throw new Error(`Refused: database name "${dbName}" lacks a staging|test|ci marker`);
  }
  return { host: u.hostname, port: u.port || '5432', dbName };
}

async function main() {
  if (process.env.ALLOW_STAGING_MIGRATION !== 'true') {
    throw new Error('Set ALLOW_STAGING_MIGRATION=true to enable the staging migration gate');
  }
  const target = assertIsolatedTarget(process.env.TEST_DATABASE_URL);
  console.log(`Isolated target: host=${target.host} port=${target.port} db=${target.dbName}`);

  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
  try {
    // 1. Disposable-DB bootstrap ONLY: project's own canonical baseline file.
    const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
    console.log('Applying baseline schema.sql ...');
    await pool.query(schemaSql);
    console.log('Baseline applied.');

    // 2. Route migrations (first run — must apply through 019).
    console.log('Running route migrations (pass 1) ...');
    const first = await runRouteSchemaMigrations(pool, { logger: { log: (m) => console.log(`  ${m}`) } });
    console.log(`Pass 1: applied=${first.applied.length} skipped=${first.skipped.length}`);
    for (const id of first.applied) console.log(`  applied: ${id}`);
    if (!first.applied.includes('20260905_019_sales_adjustments_void_audit') &&
        !first.skipped.includes('20260905_019_sales_adjustments_void_audit')) {
      throw new Error('Migration 20260905_019_sales_adjustments_void_audit was neither applied nor skipped');
    }

    // 3. Schema verification: audit columns must exist.
    const { rows: cols } = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='sales_adjustments'
       ORDER BY ordinal_position`,
    );
    const names = new Set(cols.map((c) => c.column_name));
    for (const required of ['voided_by', 'voided_at', 'void_reason', 'payload_hash', 'idempotency_key']) {
      if (!names.has(required)) throw new Error(`Missing required column sales_adjustments.${required}`);
      console.log(`  column OK: sales_adjustments.${required}`);
    }
    const { rows: idx } = await pool.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='sales_adjustments' AND indexname='idx_sales_adjustments_idempotency'`,
    );
    if (!idx.length) throw new Error('Missing unique index idx_sales_adjustments_idempotency');
    console.log('  index OK: idx_sales_adjustments_idempotency');

    // 4. Idempotency proof: second run must apply nothing.
    console.log('Running route migrations (pass 2, idempotency proof) ...');
    const second = await runRouteSchemaMigrations(pool, { logger: { log: () => {} } });
    console.log(`Pass 2: applied=${second.applied.length} skipped=${second.skipped.length}`);
    if (second.applied.length !== 0) {
      throw new Error(`Runner is not idempotent: re-applied ${second.applied.join(', ')}`);
    }

    console.log('STAGING MIGRATION GATE: PASS');
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(`STAGING MIGRATION GATE: FAIL — ${err.message}`);
  process.exit(1);
});
