import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve('backend/.env.dev');

if (!fs.existsSync(envPath)) {
  console.error('[dev] backend/.env.dev tidak ditemukan. Konfigurasikan database development terlebih dahulu.');
  process.exit(1);
}

const values = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.trimStart().startsWith('#') && line.includes('='))
    .map((line) => {
      const separator = line.indexOf('=');
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
    }),
);

let hostname = values.DB_HOST || '';
if (values.DATABASE_URL) {
  try {
    hostname = new URL(values.DATABASE_URL).hostname;
  } catch {
    console.error('[dev] DATABASE_URL di backend/.env.dev tidak valid.');
    process.exit(1);
  }
}

const isLocal = ['localhost', '127.0.0.1', '::1'].includes(hostname);
const remoteReadOnly = process.env.HABIL_REMOTE_DEV_READ_ONLY === '1';

if (!isLocal && !remoteReadOnly && process.env.ALLOW_REMOTE_DEV_DB !== '1') {
  console.error(`[dev] Backend dibatalkan: database development mengarah ke host remote (${hostname}).`);
  console.error('[dev] Gunakan database lokal/branch dev terpisah atau aktifkan mode remote read-only.');
  process.exit(1);
}

console.log(`[dev] Database target: ${isLocal ? 'local' : (remoteReadOnly ? 'remote read-only' : 'remote override')}.`);
