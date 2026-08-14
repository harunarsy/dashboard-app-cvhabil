import { describe, it, expect } from 'vitest';
import { parseDateOnly, formatDateID } from './dates';

describe('parseDateOnly', () => {
  it('menerima timestamp ISO penuh dari API', () => {
    const d = parseDateOnly('2026-07-17T00:00:00.000Z');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(6);
    expect(d!.getDate()).toBe(17);
  });

  it('menerima YYYY-MM-DD polos', () => {
    const d = parseDateOnly('2026-07-17');
    expect(d!.getDate()).toBe(17);
  });

  it('nilai kosong jadi null', () => {
    expect(parseDateOnly(null)).toBeNull();
    expect(parseDateOnly('')).toBeNull();
    expect(parseDateOnly(undefined)).toBeNull();
  });

  it('nilai ngawur jadi null, BUKAN Invalid Date', () => {
    expect(parseDateOnly('bukan tanggal')).toBeNull();
  });
});

describe('formatDateID', () => {
  it('memformat timestamp ISO penuh', () => {
    expect(formatDateID('2026-07-17T00:00:00.000Z')).toBe('17 Jul 2026');
  });

  it('tidak pernah menghasilkan tulisan Invalid Date', () => {
    expect(formatDateID('ngawur')).toBe('—');
    expect(formatDateID(null)).toBe('—');
  });
});
