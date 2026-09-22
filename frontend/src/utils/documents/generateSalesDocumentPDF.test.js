vi.mock('jsbarcode', () => ({ default: vi.fn() }));

import { generateSalesDocumentPDF } from './generateSalesDocumentPDF';
import { buildSalesDocumentViewModel } from './salesDocumentModel';
import { SALES_DOCUMENT_FIXTURES } from './__fixtures__/salesDocumentFixtures';
import { SALES_DOCUMENT_GOLDEN } from './__fixtures__/salesDocumentGolden';
import { allText, dumpPages } from './__fixtures__/pdfTestUtils';

const ONE_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('generateSalesDocumentPDF', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
      configurable: true,
      value: () => ONE_PIXEL_PNG,
    });
  });

  it('A4 memuat judul formal, identitas, dan nomor nota', () => {
    const { order, settings } = SALES_DOCUMENT_FIXTURES[0];
    const doc = generateSalesDocumentPDF(order, { format: 'A4', settings });
    const text = allText(doc);
    expect(text).toContain('FAKTUR PENJUALAN');
    expect(text).toContain('CV HABIL SEJAHTERA BERSAMA');
    expect(text).toContain(order.order_number);
  });

  it('A4 tidak mencetak placeholder teknis untuk field kosong', () => {
    const { order, settings } = SALES_DOCUMENT_FIXTURES[0];
    const text = allText(generateSalesDocumentPDF(order, { format: 'A4', settings }));
    expect(text).not.toMatch(/undefined|null|NaN/);
    expect(text).not.toContain('Ditagihkan kepada');
  });

  it('field kosong tidak menghasilkan label yatim (kriteria #8)', () => {
    const { order, settings } = SALES_DOCUMENT_FIXTURES[0];
    const text = allText(generateSalesDocumentPDF(order, { format: 'A4', settings }));
    expect(text).not.toContain('NPWP Pembeli:');
    expect(text).not.toContain('No. PO');
  });

  it('nota tanpa PPN menyembunyikan rincian DPP/PPN tanpa mengubah total', () => {
    const { order, settings } = SALES_DOCUMENT_FIXTURES.find((f) => f.id === 'ppn-excluded');
    const text = allText(generateSalesDocumentPDF(order, { format: 'A4', settings }));
    expect(text).not.toContain('DPP:');
    expect(text).not.toContain('PPN ');
    expect(text).toContain('GRAND TOTAL: Rp 500.000');
  });

  it('menerima view-model siap pakai lewat options.vm', () => {
    const { order, settings } = SALES_DOCUMENT_FIXTURES[0];
    const vm = buildSalesDocumentViewModel(order, settings);
    const text = allText(generateSalesDocumentPDF(order, { format: 'A4', settings, vm }));
    expect(text).toContain('HSB-NOTA-2609001');
    expect(text).toContain('GRAND TOTAL: Rp 72.000');
  });

  it('halaman lanjutan membawa konteks dokumen, bukan halaman kosong (kriteria #7)', () => {
    const { order, settings } = SALES_DOCUMENT_FIXTURES.find((f) => f.id === 'many-items-multipage');
    const pages = dumpPages(generateSalesDocumentPDF(order, { format: 'A4', settings }));
    expect(pages).toHaveLength(2);
    expect(pages[0]).not.toContain('GRAND TOTAL:');
    expect(pages[1]).toContain('FAKTUR PENJUALAN - Lanjutan');
    expect(pages[1]).toContain('HSB-NOTA-2609003');
    expect(pages[1]).toContain('GRAND TOTAL:');
    expect(pages[1]).toContain('Penerima,');
  });

  it('daftar item kosong tidak membuat halaman lanjutan kosong', () => {
    const doc = generateSalesDocumentPDF(
      { order_number: 'HSB-NOTA-KOSONG', total: 0, items: [] },
      { format: 'A4' },
    );
    const text = allText(doc);
    expect(doc.getNumberOfPages()).toBe(1);
    expect(text).toContain('GRAND TOTAL: Rp 0');
    expect(text).toContain('Penerima,');
  });

  it('golden render cocok untuk semua fixture (A4)', () => {
    for (const [fixtureId, perFormat] of Object.entries(SALES_DOCUMENT_GOLDEN)) {
      const { order, settings } = SALES_DOCUMENT_FIXTURES.find((f) => f.id === fixtureId);
      const doc = generateSalesDocumentPDF(order, { format: 'A4', settings });
      const golden = perFormat.A4;
      expect(doc.getNumberOfPages(), `${fixtureId} page count`).toBe(golden.pages);
      const text = allText(doc);
      for (const fragment of golden.mustContain) {
        expect(text, `${fixtureId} contains "${fragment}"`).toContain(fragment);
      }
    }
  });
});
