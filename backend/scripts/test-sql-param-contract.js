#!/usr/bin/env node
/**
 * Kontrak SQL: parameter tanpa cast tidak boleh dipakai di posisi yang butuh TIPE
 * tertentu, karena PostgreSQL memilih overload berdasarkan inferensi tipe.
 *
 * Insiden nyata (v1.67.24): `SUBSTRING(order_number FROM $1)` — tanpa `::int`,
 * PostgreSQL memilih varian `substring(text, text)` (pola REGEX) sehingga hasilnya
 * bukan potongan dari posisi, melainkan teks yang cocok dengan regex "14" → MAX nomor
 * dokumen jadi ngawur dan nomor nota bisa bertabrakan. Test berbasis DB mock TIDAK
 * bisa menangkap kelas bug ini, jadi kontrak statis ini yang menjaganya.
 *
 * Statis (tanpa DB) → ikut berjalan di `npm test`.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const scanDirs = ['routes', 'services', 'utils', 'migrations'];

const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) files.push(full);
  }
};
for (const dir of scanDirs) {
  const full = path.join(root, dir);
  if (fs.existsSync(full)) walk(full);
}

const violations = [];
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file);

  // 1) SUBSTRING(... FROM $n) tanpa ::int → varian regex, bukan posisi karakter.
  const substrRe = /SUBSTRING\s*\([^()]*?\bFROM\s+\$(\d+)\s*(?!\s*::)/gi;
  let match;
  while ((match = substrRe.exec(source)) !== null) {
    const line = source.slice(0, match.index).split('\n').length;
    violations.push(`${rel}:${line} SUBSTRING(... FROM $${match[1]}) tanpa ::int`);
  }

  // 2) INTERVAL $n — interval butuh literal/cast yang jelas, bukan parameter polos.
  const intervalRe = /INTERVAL\s+\$(\d+)/gi;
  while ((match = intervalRe.exec(source)) !== null) {
    const line = source.slice(0, match.index).split('\n').length;
    violations.push(`${rel}:${line} INTERVAL $${match[1]} tanpa cast/literal`);
  }
}

assert.deepStrictEqual(
  violations,
  [],
  `Pola SQL berbahaya ditemukan:\n- ${violations.join('\n- ')}`
);

// 3) Generator nomor dokumen wajib memakai posisi ber-cast (bukti perbaikan v1.67.24).
const docNumbers = fs.readFileSync(path.join(root, 'utils', 'docNumbers.js'), 'utf8');
assert.ok(
  /SUBSTRING\([^)]*FROM \$1::int\)/.test(docNumbers),
  'utils/docNumbers.js harus memakai SUBSTRING(... FROM $1::int)'
);
assert.ok(
  !/CAST\(REPLACE\(/.test(docNumbers),
  'utils/docNumbers.js tidak boleh kembali ke pola CAST(REPLACE(...)) yang error untuk nomor tak berpola'
);

console.log('  SQL param contract: OK (tidak ada SUBSTRING/INTERVAL dengan parameter polos)');
console.log('  Generator nomor dokumen: memakai posisi ::int ✅');
