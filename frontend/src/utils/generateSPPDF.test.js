import { describe, expect, it } from 'vitest';
import jsPDF from 'jspdf';
import { generateSPPDF, computeSpHeaderMetrics } from './generateSPPDF';

const COMPANY = 'CV HABIL SEJAHTERA BERSAMA';

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

  describe('header dua kolom tidak tabrakan (regresi cetak SP A6 26 Sep 2026)', () => {
    it.each(['A6', 'A5', 'A4'])('%s: nama perusahaan berhenti sebelum judul mulai', (format) => {
      const doc = new jsPDF('p', 'mm', format.toLowerCase());
      const m = computeSpHeaderMetrics(doc, { format, companyName: COMPANY, logoPresent: true });
      const titleLeft = m.pageWidth - m.margin - m.titleWidth;

      expect(m.identityX + m.companyWidth).toBeLessThanOrEqual(titleLeft - 1);
      if (!m.companyOverflows) {
        expect(m.companyWidth).toBeLessThanOrEqual(m.identityMaxW + 0.01);
      }
      expect(m.titleWidth).toBeLessThanOrEqual(m.rightColW + 0.01);
    });
  });
});
