import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const config = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8'),
);

describe('vercel.json', () => {
  it('tidak mengarahkan /assets ke index.html', () => {
    const source = config.rewrites?.[0]?.source;
    expect(source).toBeTruthy();
    const rule = new RegExp(`^${source}$`);
    expect(rule.test('/nota-penjualan')).toBe(true);
    expect(rule.test('/assets/index-abc123.js')).toBe(false);
  });

  it('memberi cache immutable untuk aset ber-hash', () => {
    const header = (config.headers || []).find((entry) => entry.source === '/assets/(.*)');
    expect(header).toBeTruthy();
    const cache = header.headers.find((h) => h.key.toLowerCase() === 'cache-control');
    expect(cache.value).toContain('immutable');
    expect(cache.value).toContain('max-age=31536000');
  });
});
