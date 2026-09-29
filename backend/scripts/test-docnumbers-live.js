#!/usr/bin/env node
/**
 * Test LIVE generator nomor dokumen (butuh DATABASE_URL).
 *
 * Kenapa terpisah: `npm test` sengaja tanpa DB (mock). Bug v1.67.24 (SUBSTRING tanpa
 * `::int` → varian regex) hanya bisa ketangkap kalau SQL benar-benar dijalankan ke
 * PostgreSQL. Semua tulisan di test ini berada dalam transaksi yang WAJIB di-ROLLBACK,
 * jadi tidak mengubah data.
 *
 * Jalankan: npm run test:db:docnumbers   (di backend/)
 * Tanpa DATABASE_URL / DB tak terjangkau → SKIP (exit 0).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const readDatabaseUrl = () => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const name of ['.env', '.env.development']) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    const match = fs.readFileSync(file, 'utf8').match(/^DATABASE_URL\s*=\s*(.+)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
};

const { generateMonthlyDocNumber } = require('../utils/docNumbers');

const run = async () => {
  const connectionString = readDatabaseUrl();
  if (!connectionString) {
    console.log('SKIP: DATABASE_URL tidak ditemukan (test live butuh DB).');
    return;
  }

  const { Pool } = require('pg');
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

  const cases = [
    { docType: 'NOTA', prefix: 'HSB-NOTA-', table: 'sales_orders', column: 'order_number', probeName: '__AUDIT_PROBE_NOTA__' },
    { docType: 'PJM', prefix: 'HSB-PJM-', table: 'loans', column: 'loan_number', probeName: '__AUDIT_PROBE_PJM__' },
  ];

  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.log(`SKIP: DB tidak terjangkau (${err.message}).`);
    await pool.end().catch(() => {});
    return;
  }

  let checked = 0;
  for (const c of cases) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const numbers = [];
      for (let i = 1; i <= 3; i += 1) {
        const generated = await generateMonthlyDocNumber(client, c);
        numbers.push(generated);
        // Tiru alur nyata: dokumen dibuat memakai nomor itu di transaksi yang sama.
        if (c.docType === 'NOTA') {
          await client.query(
            `INSERT INTO sales_orders (order_number, sale_date, customer_name, total, is_deleted)
             VALUES ($1, CURRENT_DATE, $2, 0, FALSE)`,
            [generated, c.probeName]
          );
        } else {
          await client.query(
            `INSERT INTO loans (loan_number, loan_date, customer_name, is_deleted)
             VALUES ($1, CURRENT_DATE, $2, FALSE)`,
            [generated, c.probeName]
          );
        }
      }

      const suffixes = numbers.map((n) => parseInt(n.slice(-3), 10));
      assert.strictEqual(new Set(numbers).size, numbers.length, `nomor ${c.docType} duplikat: ${numbers.join(', ')}`);
      for (let i = 1; i < suffixes.length; i += 1) {
        assert.strictEqual(
          suffixes[i],
          suffixes[i - 1] + 1,
          `nomor ${c.docType} tidak naik berurutan: ${numbers.join(', ')}`
        );
      }
      console.log(`  ${c.docType}: ${numbers.join(', ')} → unik & berurutan ✅`);
      checked += 1;
    } finally {
      await client.query('ROLLBACK');
      const leftover = await client.query(
        c.docType === 'NOTA'
          ? 'SELECT COUNT(*)::int AS n FROM sales_orders WHERE customer_name = $1'
          : 'SELECT COUNT(*)::int AS n FROM loans WHERE customer_name = $1',
        [c.probeName]
      );
      assert.strictEqual(leftover.rows[0].n, 0, `probe ${c.docType} tidak ter-rollback (${leftover.rows[0].n} baris tertinggal)`);
      client.release();
    }
  }

  await pool.end();
  console.log(`  Live doc-number probe selesai (${checked} jenis dokumen, semua di-rollback).`);
};

run().catch((err) => {
  console.error('GAGAL:', err.message);
  process.exit(1);
});
