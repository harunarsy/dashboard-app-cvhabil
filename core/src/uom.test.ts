import { describe, it, expect } from 'vitest';
import { toBaseQty, displayQty } from './uom';

const omela = { base_unit: 'pcs', pack_unit: 'karton', pack_size: 12 };
const beras = { base_unit: 'pcs', pack_unit: null, pack_size: 1 };

describe('toBaseQty', () => {
  it('4 karton produk pack_size 12 menjadi 48 pcs', () => {
    expect(toBaseQty(4, 'karton', omela)).toBe(48);
  });

  it('qty dalam satuan dasar tidak dikalikan', () => {
    expect(toBaseQty(48, 'pcs', omela)).toBe(48);
  });

  it('produk tanpa pack_unit tidak pernah dikalikan', () => {
    expect(toBaseQty(10, 'karton', beras)).toBe(10);
  });
});

describe('displayQty', () => {
  it('memakai qty_in_unit kalau ada — BUKAN qty base', () => {
    expect(displayQty({ qty: 48, qty_in_unit: 4, unit: 'karton' }))
      .toEqual({ qty: 4, unit: 'karton' });
  });

  it('qty_in_unit null jatuh ke qty', () => {
    expect(displayQty({ qty: 10, qty_in_unit: null, unit: 'pcs' }))
      .toEqual({ qty: 10, unit: 'pcs' });
  });

  it('qty_in_unit undefined jatuh ke qty', () => {
    expect(displayQty({ qty: 10, unit: 'pcs' }))
      .toEqual({ qty: 10, unit: 'pcs' });
  });
});
