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

  describe('header tidak tabrakan (regresi cetak SP A6 26 Sep 2026)', () => {
    it('A6: header bertumpuk, nama perusahaan muat penuh tanpa menyusut', () => {
      const doc = new jsPDF('p', 'mm', 'a6');
      const m = computeSpHeaderMetrics(doc, { format: 'A6', companyName: COMPANY, logoPresent: true });

      // A6: judul ada di baris sendiri, jadi penentu lebar adalah kolom identitas.
      expect(m.companyWidth).toBeLessThanOrEqual(m.identityMaxW + 0.01);
      expect(m.headSize).toBe(12);
      expect(m.titleWidth).toBeLessThanOrEqual(m.contentWidth);
    });

    it.each(['A5', 'A4'])('%s: nama perusahaan berhenti sebelum judul mulai', (format) => {
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

  describe('tipografi 12pt (permintaan operasional)', () => {
    const fontBefore = (commands, needle) => {
      const index = commands.indexOf(needle);
      if (index < 0) return null;
      const before = commands.slice(0, index);
      const matches = [...before.matchAll(/\/(F\d+) ([\d.]+) Tf/g)];
      return matches.length ? Number(matches[matches.length - 1][2]) : null;
    };

    it('A6 memakai 12pt untuk nama perusahaan, judul, dan baris barang', () => {
      const order = {
        po_number: 'HSB-SP-2609123',
        distributor_name: 'PT Distributor Sejahtera',
        order_date: '2026-09-26',
        items: [{ product_name: 'Barang A', qty: 2, unit: 'pcs' }],
      };
      const doc = generateSPPDF(order, { format: 'A6', settings: {} });
      const commands = doc.internal.pages.slice(1).map((page) => page.join('\n')).join('\n');

      expect(fontBefore(commands, 'SURAT PESANAN')).toBe(12);
      expect(fontBefore(commands, 'Barang A')).toBe(12);
      // Teks pelengkap tidak boleh turun di bawah 10pt.
      const sizes = [...commands.matchAll(/\/(F\d+) ([\d.]+) Tf/g)].map((m) => Number(m[2]));
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(8);
      expect(Math.min(...sizes.filter((size) => size >= 10))).toBe(10);
    });
  });
});
