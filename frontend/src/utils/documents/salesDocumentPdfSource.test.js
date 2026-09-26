import { describe, expect, it, vi } from 'vitest';
const ONE_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
vi.mock('./monochromeLogo', () => ({ getMonochromeLogoDataUrl: vi.fn(async () => ONE_PIXEL_PNG) }));
import { buildSalesDocumentPdf, resolveSalesPdfRoute, salesPdfFilename } from './salesDocumentPdfSource';
import { SALES_DOCUMENT_FIXTURES } from './__fixtures__/salesDocumentFixtures';

describe('resolveSalesPdfRoute', () => {
  it('A4 selalu v2; A5/A6 mengikuti flag; terima selalu legacy; pinjaman ikut legacy selama flag off', () => {
    expect(resolveSalesPdfRoute({ format: 'A4', type: 'nota', documentsV2: false }).engine).toBe('v2');
    expect(resolveSalesPdfRoute({ format: 'A5', type: 'nota', documentsV2: false }).engine).toBe('legacy');
    expect(resolveSalesPdfRoute({ format: 'A5', type: 'nota', documentsV2: true }).engine).toBe('v2');
    expect(resolveSalesPdfRoute({ format: 'A6', type: 'terima', documentsV2: true }).engine).toBe('legacy');
    expect(resolveSalesPdfRoute({ format: 'A5', type: 'terima', documentsV2: true }).engine).toBe('legacy');
    expect(resolveSalesPdfRoute({ format: 'A4', type: 'terima', documentsV2: true }).engine).toBe('legacy');
  });
});

describe('salesPdfFilename', () => {
  it('menamai file per tipe', () => {
    expect(salesPdfFilename({ type: 'terima', orderNumber: 'X' })).toBe('TT_X.pdf');
    expect(salesPdfFilename({ type: 'nota', orderNumber: 'X' })).toBe('Nota_X.pdf');
  });
});

describe('buildSalesDocumentPdf', () => {
  it('menghasilkan blob PDF dari engine yang benar', async () => {
    const { order, settings } = SALES_DOCUMENT_FIXTURES[0];
    const v2 = await buildSalesDocumentPdf(order, { format: 'A4', settings });
    expect(v2.engine).toBe('v2');
    expect(v2.blob.type).toBe('application/pdf');
    expect(v2.blob.size).toBeGreaterThan(0);
    const legacy = await buildSalesDocumentPdf(order, { format: 'A5', settings });
    expect(legacy.engine).toBe('legacy');
    expect(legacy.blob.size).toBeGreaterThan(0);
  });

  it.each(['A4', 'A5', 'A6'])('tanda terima %s memakai logo dan PDF yang sama untuk preview/cetak', async (format) => {
    const { order, settings } = SALES_DOCUMENT_FIXTURES[0];
    const result = await buildSalesDocumentPdf(order, { format, type: 'terima', settings, documentsV2: true });
    expect(result.engine).toBe('legacy');
    expect(result.filename).toBe(`TT_${order.order_number}.pdf`);
    expect(result.blob.size).toBeGreaterThan(0);
    expect(Object.keys(result.doc.internal.collections.addImage_images || {})).toHaveLength(1);
  });
});
