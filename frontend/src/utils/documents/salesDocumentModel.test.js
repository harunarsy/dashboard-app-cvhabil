import { describe, expect, it } from 'vitest';
import {
  LEGACY_PPN_RATE,
  buildSalesDocumentViewModel,
  computeTotals,
  formatDateID,
  formatQtyDisplay,
  formatRupiah,
  groupSaleItems,
  hasLegalBuyerData,
  hasProcurementData,
  parseBankInfo,
} from './salesDocumentModel';
import { SALES_DOCUMENT_FIXTURES } from './__fixtures__/salesDocumentFixtures';

const fixture = (id) => SALES_DOCUMENT_FIXTURES.find((f) => f.id === id);

const item = (over = {}) => ({
  product_name: 'Produk Nutrisi Vanila 174 g',
  qty: 12, qty_in_unit: 12, unit: 'pcs', unit_price: 72000,
  batch_no_snapshot: '26T0506GU', expired_date_snapshot: '2027-12-02',
  ...over,
});

describe('computeTotals', () => {
  it('memisahkan DPP dan PPN dari nilai produk, ongkir tidak kena PPN', () => {
    const totals = computeTotals({ total: 1110000, ongkir: 100000, ppn_rate: 0.11, items: [] });
    expect(totals.shippingCharge).toBe(100000);
    expect(Math.round(totals.dpp)).toBe(909910);
    expect(Math.round(totals.vatAmount)).toBe(100090);
    expect(totals.grandTotal).toBe(1110000);
  });

  it('memakai tarif snapshot order, bukan konstanta', () => {
    const totals = computeTotals({ total: 1120000, ppn_rate: 0.12, items: [] });
    expect(totals.vatRate).toBe(0.12);
  });

  it('fallback 0.11 untuk order lama tanpa ppn_rate', () => {
    const totals = computeTotals({ total: 1110000, items: [] });
    expect(totals.vatRate).toBe(LEGACY_PPN_RATE);
    expect(Math.round(totals.dpp)).toBe(1000000);
  });

  it('ppn_excluded menyembunyikan DPP/PPN tanpa mengubah grand total', () => {
    const totals = computeTotals({ total: 500000, ppn_excluded: true, items: [] });
    expect(totals.ppnExcluded).toBe(true);
    expect(totals.dpp).toBe(0);
    expect(totals.vatAmount).toBe(0);
    expect(totals.grandTotal).toBe(500000);
  });

  it('payment_fee hanya dibebankan saat mode pass_on', () => {
    expect(computeTotals({ total: 100000, payment_fee: 2500, payment_fee_mode: 'pass_on', items: [] }).paymentFee).toBe(2500);
    expect(computeTotals({ total: 100000, payment_fee: 2500, payment_fee_mode: 'absorb', items: [] }).paymentFee).toBe(0);
  });

  it('productGross mengecualikan ongkir dan fee pass-on, terbilang ikut grand total', () => {
    const totals = computeTotals({
      total: 527500, ongkir: 25000, payment_fee: 2500, payment_fee_mode: 'pass_on', ppn_rate: 0.11, items: [],
    });
    expect(totals.productGross).toBe(500000);
    expect(totals.amountInWords).toBe('Lima Ratus Dua Puluh Tujuh Ribu Lima Ratus Rupiah');
  });

  it('pecahan rupiah dibulatkan ke bilangan bulat untuk terbilang', () => {
    const totals = computeTotals({ total: 1234567.89, ppn_rate: 0.11, items: [] });
    expect(totals.grandTotal).toBe(1234567.89);
    expect(totals.amountInWords).toBe('Satu Juta Dua Ratus Tiga Puluh Empat Ribu Lima Ratus Enam Puluh Delapan Rupiah');
  });
});

describe('groupSaleItems', () => {
  it('menggabungkan baris dengan snapshot batch identik', () => {
    const rows = groupSaleItems([item(), item()]);
    expect(rows).toHaveLength(1);
    expect(rows[0].qty).toBe(24);
  });

  it('tidak menggabungkan baris tanpa snapshot batch', () => {
    expect(groupSaleItems([
      { product_name: 'A', qty: 1, unit_price: 1000 },
      { product_name: 'A', qty: 1, unit_price: 1000 },
    ])).toHaveLength(2);
  });

  it('ikut menjumlahkan qty_in_unit saat baris digabung', () => {
    const rows = groupSaleItems([item({ qty_in_unit: 2 }), item({ qty_in_unit: 3 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].qty).toBe(24);
    expect(rows[0].qty_in_unit).toBe(5);
  });

  it('tidak menggabungkan baris dengan nomor batch berbeda', () => {
    const rows = groupSaleItems([item(), item({ batch_no_snapshot: '26T0506GV' })]);
    expect(rows).toHaveLength(2);
  });
});

describe('buildSalesDocumentViewModel', () => {
  it('mengisi kontrak spec §5 dari order + settings', () => {
    const { order, settings } = fixture('instansi-formal');
    const vm = buildSalesDocumentViewModel(order, settings);
    expect(vm.document.orderNumber).toBe(order.order_number);
    expect(vm.identity.companyName).toBe('CV HABIL SEJAHTERA BERSAMA');
    expect(vm.identity.npwp).toBe('93.813.949.0-609.000');
    expect(vm.buyer.npwpOrNik).toBe(order.buyer_npwp);
    expect(vm.procurement.governmentAgency).toBe(order.government_agency);
    expect(vm.totals.grandTotal).toBe(order.total);
    expect(vm.payment.bankName).toBe('BCA');
    expect(vm.payment.accountNumber).toBe('5603004174');
    expect(vm.signatures.issuerName).toBe(settings.signer_name);
  });

  it('menyembunyikan kelompok kosong tanpa nilai teknis', () => {
    const { order, settings } = fixture('single-item');
    const vm = buildSalesDocumentViewModel(order, settings);
    expect(vm.procurement.source).toBeNull();
    expect(vm.buyer.npwpOrNik).toBeNull();
    expect(vm.taxReference.number).toBeNull();
    expect(vm.document.dueDate).toBeNull();
    expect(vm.payment.terms).toBeNull();

    const stringValues = [];
    const walk = (value) => {
      if (typeof value === 'string') stringValues.push(value);
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    };
    walk(vm);
    expect(stringValues.filter((s) => s === 'undefined' || s === 'null')).toEqual([]);
  });

  it('alamat tagihan dan pengiriman jatuh ke alamat customer bila kosong', () => {
    const { order, settings } = fixture('single-item');
    const vm = buildSalesDocumentViewModel(order, settings);
    expect(vm.buyer.billingAddress).toBe(order.customer_address);
    expect(vm.buyer.shippingAddress).toBe(order.customer_address);
  });

  it('item memakai qty tampilan (qty_in_unit) dan line total harga x qty', () => {
    const { order, settings } = fixture('five-items');
    const vm = buildSalesDocumentViewModel(order, settings);
    expect(vm.items.map((line) => [line.qty, line.unit, line.unitPrice, line.lineTotal])).toEqual([
      [12, 'pcs', 72000, 864000],
      [3, 'botol', 95000, 285000],
      [6, 'pcs', 88000, 528000],
      [1, 'box', 165000, 165000],
      [4, 'pack', 21000, 84000],
    ]);
  });

  it('metode pembayaran default Tunai saat order tidak menyebutkan', () => {
    const { settings } = fixture('single-item');
    const vm = buildSalesDocumentViewModel({ total: 0, payment_method: '' }, settings);
    expect(vm.payment.method).toBe('Tunai');
    expect('paymentMethod' in vm.document).toBe(false);
  });

  it('identity menyimpan satu nama logo saja', () => {
    const { settings } = fixture('single-item');
    const vm = buildSalesDocumentViewModel(
      { total: 0 },
      { ...settings, logo_data_url: 'data:image/png;base64,AAAA' },
    );
    expect(vm.identity.logo).toBe('data:image/png;base64,AAAA');
    expect('logoDataUrl' in vm.identity).toBe(false);
  });

  it('membawa catatan order dan ketentuan settings ke view-model', () => {
    const { order, settings } = fixture('single-item');
    const vm = buildSalesDocumentViewModel({ ...order, notes: 'Titip ke resepsionis' }, settings);
    expect(vm.document.notes).toBe('Titip ke resepsionis');
    expect(vm.identity.ketentuan).toBe(settings.ketentuan);
  });

  it('catatan dan ketentuan kosong menjadi null', () => {
    const vm = buildSalesDocumentViewModel({ total: 0, notes: '   ' }, { ketentuan: '' });
    expect(vm.document.notes).toBeNull();
    expect(vm.identity.ketentuan).toBeNull();
  });

  it('menggabungkan baris batch identik dan membiarkan baris tanpa batch terpisah', () => {
    const { settings } = fixture('single-item');
    const merged = buildSalesDocumentViewModel(
      { total: 144000, items: [item({ qty: 1, qty_in_unit: 1 }), item({ qty: 1, qty_in_unit: 1 })] },
      settings,
    );
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0].qty).toBe(2);

    const vm = buildSalesDocumentViewModel(fixture('no-batch-meta').order, fixture('no-batch-meta').settings);
    expect(vm.items).toHaveLength(3);
  });

  it('tidak ada string teknis bocor pada semua fixture', () => {
    for (const { order, settings } of SALES_DOCUMENT_FIXTURES) {
      const vm = buildSalesDocumentViewModel(order, settings);
      const stringValues = [];
      const walk = (value) => {
        if (typeof value === 'string') stringValues.push(value);
        else if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === 'object') Object.values(value).forEach(walk);
      };
      walk(vm);
      expect(stringValues.filter((s) => s === 'undefined' || s === 'null')).toEqual([]);
    }
  });
});

describe('formatting', () => {
  it('formatRupiah memakai pemisah id-ID', () => {
    expect(formatRupiah(1234567)).toBe('Rp 1.234.567');
  });

  it('formatRupiah mendukung jumlah desimal', () => {
    expect(formatRupiah(1234567.891, 2)).toBe('Rp 1.234.567,89');
  });

  it('formatDateID stabil untuk tanggal ISO', () => {
    expect(formatDateID('2026-09-13')).toBe('13 Sep 2026');
  });

  it('formatQtyDisplay memakai qty_in_unit', () => {
    expect(formatQtyDisplay({ qty: 12, qty_in_unit: 2, unit: 'karton' })).toBe('2 karton');
  });

  it('formatQtyDisplay default satuan pcs', () => {
    expect(formatQtyDisplay({ qty: 5 })).toBe('5 pcs');
  });

  it('parseBankInfo memecah bank / nama / nomor rekening', () => {
    expect(parseBankInfo('BCA CV HABIL SEJAHTERA BERSAMA 5603004174')).toEqual({
      bankName: 'BCA', accountName: 'CV HABIL SEJAHTERA BERSAMA',
      accountNumber: '5603004174', raw: 'BCA CV HABIL SEJAHTERA BERSAMA 5603004174',
    });
  });

  it('parseBankInfo mengosongkan field yang tidak cocok pola', () => {
    expect(parseBankInfo('BCA')).toEqual({
      bankName: null, accountName: null, accountNumber: null, raw: 'BCA',
    });
  });
});

describe('hasProcurementData / hasLegalBuyerData', () => {
  it('true saat referensi pengadaan dan data legal pembeli terisi', () => {
    const { order, settings } = fixture('instansi-formal');
    const vm = buildSalesDocumentViewModel(order, settings);
    expect(hasProcurementData(vm.procurement)).toBe(true);
    expect(hasLegalBuyerData(vm.buyer)).toBe(true);
  });

  it('false saat semua field kosong', () => {
    const { order, settings } = fixture('single-item');
    const vm = buildSalesDocumentViewModel(order, settings);
    expect(hasProcurementData(vm.procurement)).toBe(false);
    expect(hasLegalBuyerData(vm.buyer)).toBe(false);
  });
});

describe('fixtures', () => {
  it('menyediakan 10 fixture unik sesuai daftar spec §14', () => {
    expect(SALES_DOCUMENT_FIXTURES.map((f) => f.id)).toEqual([
      'single-item',
      'five-items',
      'many-items-multipage',
      'long-names',
      'no-batch-meta',
      'ppn-excluded',
      'ppn-rate-snapshot-12',
      'ongkir-and-fee',
      'instansi-formal',
      'large-rounded-amounts',
    ]);
  });

  it('setiap fixture membawa label, order, dan settings', () => {
    for (const { label, order, settings } of SALES_DOCUMENT_FIXTURES) {
      expect(typeof label).toBe('string');
      expect(Array.isArray(order.items)).toBe(true);
      expect(typeof settings.signer_name).toBe('string');
    }
  });
});
