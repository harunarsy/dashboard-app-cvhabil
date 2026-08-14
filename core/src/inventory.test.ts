import { describe, it, expect } from 'vitest';
import { sellableBatches, totalStock, stockValue, costTiers, fefoBatch } from './inventory';

// Data nyata TS-CLS-160SCT per 14 Agu 2026
const tropicana = [
  { id: 1, qty_current: 2,   hna: 85500, expired_date: '2027-01-31', is_active: false, created_at: '2026-04-15' },
  { id: 2, qty_current: 28,  hna: 85500, expired_date: '2029-03-31', is_active: true,  created_at: '2026-06-22' },
  { id: 3, qty_current: 159, hna: 87400, expired_date: '2029-03-31', is_active: true,  created_at: '2026-07-21' },
  { id: 4, qty_current: 0,   hna: 85500, expired_date: '2029-03-30', is_active: true,  created_at: '2026-08-06' },
];

describe('sellableBatches', () => {
  it('membuang batch nonaktif dan batch kosong', () => {
    const s = sellableBatches(tropicana);
    expect(s.map(b => b.id)).toEqual([2, 3]);
  });

  it('is_active undefined dianggap aktif', () => {
    const s = sellableBatches([{ id: 9, qty_current: 5, hna: 100, expired_date: null, created_at: '2026-01-01' }]);
    expect(s).toHaveLength(1);
  });
});

describe('totalStock', () => {
  it('hanya menjumlah batch yang bisa dijual — bukan 189', () => {
    expect(totalStock(tropicana)).toBe(187);
  });
});

describe('stockValue', () => {
  it('menjumlah qty x hna per batch, bukan satu harga dikali total', () => {
    // 28*85500 + 159*87400 = 2394000 + 13896600
    expect(stockValue(tropicana)).toBe(16290600);
  });
});

describe('costTiers', () => {
  it('menggabungkan batch berharga sama, urut lama ke baru', () => {
    expect(costTiers(tropicana)).toEqual([
      { hna: 85500, qty: 28 },
      { hna: 87400, qty: 159 },
    ]);
  });

  it('jumlah qty tiap tier sama dengan totalStock', () => {
    const sum = costTiers(tropicana).reduce((s, t) => s + t.qty, 0);
    expect(sum).toBe(totalStock(tropicana));
  });
});

describe('fefoBatch', () => {
  it('ED paling awal di antara yang bisa dijual', () => {
    expect(fefoBatch(tropicana)!.id).toBe(2);
  });

  it('tidak ada stok jadi null', () => {
    expect(fefoBatch([])).toBeNull();
  });
});
