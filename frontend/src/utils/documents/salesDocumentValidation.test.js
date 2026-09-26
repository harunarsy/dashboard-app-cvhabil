import { describe, expect, it } from 'vitest';
import { validateSalesDocument } from './salesDocumentValidation';
import { DOCUMENT_PROFILES } from './salesDocumentTheme';

const item = (over = {}) => ({
  product_name: 'Produk Nutrisi Vanila 174 g',
  qty: 1,
  qty_in_unit: 1,
  unit: 'pcs',
  unit_price: 72000,
  ...over,
});

const order = (over = {}) => ({
  order_number: 'HSB-NOTA-2609001',
  sale_date: '2026-09-13',
  due_date: null,
  payment_method: 'Tunai',
  payment_terms: null,
  customer_name: 'Toko Sehat',
  customer_address: 'Jl. Rungkut Asri No. 21, Surabaya',
  billing_address: '',
  shipping_address: '',
  total: 72000,
  ongkir: 0,
  payment_fee: 0,
  payment_fee_mode: 'absorb',
  ppn_excluded: false,
  ppn_rate: 0.11,
  items: [item()],
  ...over,
});

const codes = (list) => list.map((entry) => entry.code);

describe('validateSalesDocument — blockers', () => {
  it('nomor nota kosong → blocker missing_order_number', () => {
    const { blockers } = validateSalesDocument({ order: order({ order_number: '   ' }) });
    expect(codes(blockers)).toContain('missing_order_number');
  });

  it('A4 tanpa alamat customer → blocker incomplete_a4_identity', () => {
    const { blockers } = validateSalesDocument({
      order: order({ customer_address: '', billing_address: '', shipping_address: '' }),
      format: 'A4',
    });
    expect(codes(blockers)).toContain('incomplete_a4_identity');
  });

  it('A4 tanpa nama customer → blocker incomplete_a4_identity', () => {
    const { blockers } = validateSalesDocument({
      order: order({ customer_name: '' }),
      format: 'A4',
    });
    expect(codes(blockers)).toContain('incomplete_a4_identity');
  });

  it('A4 dengan shipping_address saja tetap lolos identitas', () => {
    const { blockers } = validateSalesDocument({
      order: order({ customer_address: '', shipping_address: 'Jl. Manyar No. 1, Surabaya' }),
      format: 'A4',
    });
    expect(codes(blockers)).not.toContain('incomplete_a4_identity');
  });

  it('A5 tanpa alamat bukan blocker — identitas wajib hanya untuk A4', () => {
    const { blockers } = validateSalesDocument({
      order: order({ customer_address: '', billing_address: '', shipping_address: '' }),
      format: 'A5',
    });
    expect(blockers).toEqual([]);
  });

  it('A4 lengkap + total konsisten → tanpa blocker', () => {
    const { blockers } = validateSalesDocument({
      order: order({ billing_address: 'Jl. Rungkut Asri No. 21, Surabaya' }),
      format: 'A4',
    });
    expect(blockers).toEqual([]);
  });

  it('order lengkap A5 → tanpa blocker', () => {
    const { blockers } = validateSalesDocument({ order: order() });
    expect(blockers).toEqual([]);
  });

  it('total 0 → blocker inconsistent_totals', () => {
    const { blockers } = validateSalesDocument({ order: order({ total: 0 }) });
    expect(codes(blockers)).toContain('inconsistent_totals');
  });

  it('tanda terima memvalidasi barang, bukan nominal transaksi', () => {
    const result = validateSalesDocument({
      order: order({ total: 0, items: [item({ unit_price: 0 })] }),
      type: 'terima', format: 'A5',
    });
    expect(codes(result.blockers)).not.toContain('inconsistent_totals');
    expect(result.blockers).toEqual([]);
  });

  it('tanda terima menolak daftar barang kosong', () => {
    const result = validateSalesDocument({ order: order({ items: [] }), type: 'terima' });
    expect(codes(result.blockers)).toContain('missing_items');
  });

  it('total bukan angka → blocker inconsistent_totals', () => {
    const { blockers } = validateSalesDocument({ order: order({ total: 'bukan angka' }) });
    expect(codes(blockers)).toContain('inconsistent_totals');
  });

  it('total negatif → blocker inconsistent_totals', () => {
    const { blockers } = validateSalesDocument({ order: order({ total: -5000 }) });
    expect(codes(blockers)).toContain('inconsistent_totals');
  });

  it('ongkir + fee pass_on yang konsisten → tanpa blocker', () => {
    const { blockers } = validateSalesDocument({
      order: order({ total: 99500, ongkir: 25000, payment_fee: 2500, payment_fee_mode: 'pass_on' }),
    });
    expect(blockers).toEqual([]);
  });

  it('ppn_excluded dengan total 0 → tetap blocker inconsistent_totals', () => {
    const { blockers } = validateSalesDocument({
      order: order({ total: 0, ppn_excluded: true }),
    });
    expect(codes(blockers)).toContain('inconsistent_totals');
  });

  it('tanpa argumen tetap mengembalikan bentuk { blockers, warnings }', () => {
    const result = validateSalesDocument();
    expect(Array.isArray(result.blockers)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(codes(result.blockers)).toContain('missing_order_number');
  });
});

describe('validateSalesDocument — warnings', () => {
  it('payment_terms terisi tanpa due_date → warning missing_due_date', () => {
    const { warnings } = validateSalesDocument({ order: order({ payment_terms: 'Net 14' }) });
    expect(codes(warnings)).toContain('missing_due_date');
  });

  it('payment_method Kredit tanpa due_date → warning missing_due_date', () => {
    const { warnings } = validateSalesDocument({ order: order({ payment_method: 'Kredit' }) });
    expect(codes(warnings)).toContain('missing_due_date');
  });

  it('payment_method Tempo tanpa due_date → warning missing_due_date', () => {
    const { warnings } = validateSalesDocument({ order: order({ payment_method: 'Tempo 30 hari' }) });
    expect(codes(warnings)).toContain('missing_due_date');
  });

  it('transaksi tempo dengan due_date terisi → tanpa warning missing_due_date', () => {
    const { warnings } = validateSalesDocument({
      order: order({ payment_terms: 'Net 14', due_date: '2026-09-30' }),
    });
    expect(codes(warnings)).not.toContain('missing_due_date');
  });

  it('transaksi tunai tanpa due_date → tanpa warning missing_due_date', () => {
    const { warnings } = validateSalesDocument({ order: order() });
    expect(codes(warnings)).not.toContain('missing_due_date');
  });

  it('referensi pengadaan 50 karakter → warning long_procurement_ref', () => {
    const { warnings } = validateSalesDocument({
      order: order({ purchase_order_number: `PO-${'9'.repeat(47)}` }),
    });
    expect(codes(warnings)).toContain('long_procurement_ref');
  });

  it('referensi pengadaan ≤ 40 karakter → tanpa warning', () => {
    const { warnings } = validateSalesDocument({
      order: order({ contract_number: 'SPK/045/RSUD/IX/2026' }),
    });
    expect(codes(warnings)).not.toContain('long_procurement_ref');
  });

  it('20 item di A6 (rekomendasi 5) → warning item_count_not_ideal dengan saran ukuran lebih besar', () => {
    const { warnings } = validateSalesDocument({
      order: order({ items: Array.from({ length: 20 }, () => item()) }),
      format: 'A6',
    });
    expect(codes(warnings)).toContain('item_count_not_ideal');
    const warning = warnings.find((entry) => entry.code === 'item_count_not_ideal');
    expect(warning.message).toBe(
      'Jumlah item (20) melebihi 5 untuk A6; pertimbangkan ukuran yang lebih besar.',
    );
  });

  it('jumlah item tepat di batas rekomendasi → tanpa warning', () => {
    const recommended = DOCUMENT_PROFILES.A5.recommendedItems;
    const { warnings } = validateSalesDocument({
      order: order({ items: Array.from({ length: recommended }, () => item()) }),
      format: 'A5',
    });
    expect(codes(warnings)).not.toContain('item_count_not_ideal');
  });

  it('order bersih → blockers dan warnings kosong', () => {
    const result = validateSalesDocument({ order: order() });
    expect(result).toEqual({ blockers: [], warnings: [] });
  });

  it('setiap entri punya code dan message non-kosong', () => {
    const { blockers, warnings } = validateSalesDocument({
      order: order({
        order_number: '',
        total: 0,
        payment_terms: 'Net 30',
        purchase_order_number: '9'.repeat(50),
        items: Array.from({ length: 20 }, () => item()),
      }),
      format: 'A4',
    });
    expect(blockers.length).toBeGreaterThan(0);
    expect(warnings.length).toBeGreaterThan(0);
    [...blockers, ...warnings].forEach((entry) => {
      expect(typeof entry.code).toBe('string');
      expect(entry.code.length).toBeGreaterThan(0);
      expect(typeof entry.message).toBe('string');
      expect(entry.message.length).toBeGreaterThan(0);
    });
  });
});

describe('validasi total berbasis item', () => {
  const base = { order_number: 'X', customer_name: 'A', customer_address: 'Jl', ppn_rate: 0.11 };
  it('memblokir saat total tidak cocok dengan jumlah item + ongkir + fee', () => {
    const r = validateSalesDocument({ order: { ...base, total: 600000, ongkir: 0,
      items: [{ qty: 2, unit_price: 250000 }] } });
    expect(r.blockers.map((b) => b.code)).toContain('inconsistent_totals');
  });
  it('lolos saat cocok (termasuk qty_in_unit dan fee pass_on)', () => {
    const r = validateSalesDocument({ order: { ...base, total: 500000, ongkir: 20000,
      payment_fee: 5000, payment_fee_mode: 'pass_on',
      items: [{ qty: 10, qty_in_unit: 2, unit_price: 237500 }] } });
    expect(r.blockers).toEqual([]);
  });
  it('menolak total 0 / negatif / bukan angka meski ppn_excluded aktif', () => {
    for (const total of [0, -5, 'abc']) {
      const r = validateSalesDocument({ order: { ...base, ppn_excluded: true, total,
        items: [{ qty: 1, unit_price: 1000 }] } });
      expect(r.blockers.map((b) => b.code), `total=${total}`).toContain('inconsistent_totals');
    }
  });
  it('ppn_excluded dengan total valid dan item cocok tidak diblokir', () => {
    const r = validateSalesDocument({ order: { ...base, ppn_excluded: true, total: 1000,
      items: [{ qty: 1, unit_price: 1000 }] } });
    expect(r.blockers).toEqual([]);
  });
  it('tanpa item: lewati cek item-vs-total (tidak bisa diverifikasi)', () => {
    const r = validateSalesDocument({ order: { ...base, total: 1000, items: [] } });
    expect(r.blockers).toEqual([]);
  });
});
