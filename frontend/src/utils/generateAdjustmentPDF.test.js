import { generateAdjustmentPDF } from './generateAdjustmentPDF';

const adjustment = {
  adjustment_number: 'ADJ-260905-0001',
  type: 'exchange',
  order_number: 'HSB-NOTA-2609003',
  original_customer_name: 'AEROFOOD ACS',
  original_total: 1968000,
  original_payment_status: 'paid',
  original_paid_amount: 1968000,
  original_paid_at: '2026-09-02',
  adjustment_date: '2026-09-05',
  reason: 'Barang diretur dan diganti batch baru',
  additional_charge: 10500,
  refund_amount: 0,
  items: [
    {
      direction: 'returned',
      product_name_snapshot: 'Tropicana Slim Kecap Manis 200 ml',
      qty_in_unit: 3,
      unit: 'pcs',
      original_batch_no: 'ANPF03VB',
      original_expired_date: '2026-12-03',
      line_amount: 87000,
      condition: 'expired',
    },
    {
      direction: 'replacement',
      product_name_snapshot: 'Tropicana Slim Kecap Manis 200 ml',
      qty_in_unit: 3,
      unit: 'pcs',
      replacement_batch_no: 'ANQD02VB',
      replacement_expired_date: '2027-10-02',
      line_amount: 97500,
      source_invoice_number: '4844989',
    },
  ],
};

describe('generateAdjustmentPDF', () => {
  for (const format of ['A5', 'A6']) {
    it(`generates ${format} with immutable original-note and adjustment totals`, () => {
      const doc = generateAdjustmentPDF(adjustment, {
        format,
        settings: { company_name: 'CV HABIL SEJAHTERA BERSAMA' },
      });
      const pageText = doc.internal.pages.slice(1).flat().join(' ').replace(/\s/g, ' ');

      expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
      expect(pageText).toContain('HSB-NOTA-2609003');
      expect(pageText).toContain('ADJ-260905-0001');
      expect(pageText).toContain('AEROFOOD ACS');
      expect(pageText).toContain('Tropicana Slim Kecap Manis 200 ml');
      expect(pageText).toContain('ANPF03VB');
      expect(pageText).toContain('ANQD02VB');
      expect(pageText).toContain('4844989');
      expect(pageText).toContain('Rp 1.968.000');
      expect(pageText).toContain('Rp 87.000');
      expect(pageText).toContain('Rp 97.500');
      expect(pageText).toContain('Rp 10.500');
      expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(1000);
    });
  }
});
