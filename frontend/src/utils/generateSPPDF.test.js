import { describe, expect, it } from 'vitest';
import { generateSPPDF } from './generateSPPDF';

describe('generateSPPDF', () => {
  it('menghasilkan PDF A6 dengan judul file SP_<po_number> (nama file saat cetak/simpan)', () => {
    const order = {
      po_number: 'HSB-SP-2609001',
      distributor_name: 'PT Distributor Sejahtera',
      order_date: '2026-09-26',
      expected_date: '2026-09-30',
      items: [{ product_name: 'Barang A', qty: 2, unit: 'pcs' }],
    };

    const doc = generateSPPDF(order, { format: 'A6', settings: {} });

    expect(doc.output('blob').size).toBeGreaterThan(0);
    const bytes = new TextDecoder('latin1').decode(new Uint8Array(doc.output('arraybuffer')));
    expect(bytes).toContain('/Title');
    expect(bytes).toContain('SP_HSB-SP-2609001');
  });
});
