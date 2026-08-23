const assert = require('assert');
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const XLSX = require('xlsx');

let passed = 0;

async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ✅ ${name}`);
}

(async () => {
  await test('Express 5 app and router initialize', () => {
    const app = express();
    app.use(cors());
    app.use(helmet());
    app.get('/health', (_req, res) => res.json({ ok: true }));
    assert.strictEqual(typeof app, 'function');
  });

  await test('JWT sign and verify round-trip', () => {
    const token = jwt.sign({ sub: 1, role: 'admin' }, 'runtime-pilot-secret', { expiresIn: '1m' });
    const payload = jwt.verify(token, 'runtime-pilot-secret');
    assert.strictEqual(payload.sub, 1);
    assert.strictEqual(payload.role, 'admin');
  });

  await test('pg Pool API initializes without connecting', async () => {
    const pool = new Pool({ connectionString: 'postgresql://invalid:invalid@127.0.0.1:1/unused' });
    assert.strictEqual(typeof pool.query, 'function');
    assert.strictEqual(typeof pool.connect, 'function');
    await pool.end();
  });

  await test('HTTP server starts and closes cleanly', async () => {
    const server = http.createServer((_req, res) => res.end('ok'));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    await new Promise((resolve) => server.close(resolve));
  });

  await test('XLSX workbook write/read round-trip', () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([['status', 'ok'], ['runtime', 'bun']]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Compatibility');
    const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const parsed = XLSX.read(bytes, { type: 'buffer' });
    assert.strictEqual(parsed.Sheets.Compatibility.A1.v, 'status');
    assert.strictEqual(parsed.Sheets.Compatibility.B2.v, 'bun');
  });

  console.log(`\n${passed} compatibility checks passed on ${process.versions.bun ? `Bun ${process.versions.bun}` : `Node ${process.version}`}.`);
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
