import { describe, it, expect } from 'vitest';
import { PPN_RATE, hppFromHna, dppFromGross, ppnFromGross } from './pricing';

describe('hppFromHna', () => {
  it('menambahkan PPN 11%', () => {
    expect(hppFromHna(85500)).toBeCloseTo(94905, 2);
    expect(hppFromHna(87400)).toBeCloseTo(97014, 2);
  });

  it('string angka tetap dihitung', () => {
    expect(hppFromHna('85500')).toBeCloseTo(94905, 2);
  });

  it('nilai tidak sah jadi 0, bukan NaN', () => {
    expect(hppFromHna(null)).toBe(0);
    expect(hppFromHna(undefined)).toBe(0);
    expect(hppFromHna('abc')).toBe(0);
  });

  it('linear — menjumlah dulu sama dengan menjumlah sesudah', () => {
    const a = hppFromHna(100) + hppFromHna(200);
    const b = hppFromHna(300);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('dpp & ppn dari harga kotor', () => {
  it('memecah gross jadi DPP + PPN', () => {
    const gross = 11189300;
    expect(dppFromGross(gross)).toBeCloseTo(10080450, 0);
    expect(ppnFromGross(gross)).toBeCloseTo(1108850, 0);
  });

  it('DPP + PPN kembali jadi gross', () => {
    const gross = 11189300;
    expect(dppFromGross(gross) + ppnFromGross(gross)).toBeCloseTo(gross, 2);
  });
});

describe('PPN_RATE', () => {
  it('bernilai 0.11', () => {
    expect(PPN_RATE).toBe(0.11);
  });
});
