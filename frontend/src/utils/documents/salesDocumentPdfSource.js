import { getMonochromeLogoDataUrl } from './monochromeLogo';

export function resolveSalesPdfRoute({ format, type, documentsV2 }) {
  return { engine: type === 'nota' && (format === 'A4' || documentsV2) ? 'v2' : 'legacy' };
}

export function salesPdfFilename({ type, orderNumber }) {
  return `${type === 'terima' ? 'TT' : 'Nota'}_${orderNumber}.pdf`;
}

export async function buildSalesDocumentPdf(order, { format = 'A5', type = 'nota', settings = {}, documentsV2 = false } = {}) {
  const { engine } = resolveSalesPdfRoute({ format, type, documentsV2 });
  const filename = salesPdfFilename({ type, orderNumber: order.order_number });
  const logo_data_url = await getMonochromeLogoDataUrl();
  let doc;
  if (engine === 'v2') {
    const { generateSalesDocumentPDF } = await import('./generateSalesDocumentPDF');
    doc = generateSalesDocumentPDF(order, { format, type, settings: { ...settings, logo_data_url } });
  } else {
    const { generateNotaPDF } = await import('../generateNotaPDF');
    doc = generateNotaPDF(order, { format, type, settings: { ...settings, logo_data_url } });
  }
  // Judul metadata PDF = nama file (tanpa ekstensi). Chrome memakai judul ini sebagai
  // nama file pada "Simpan sebagai PDF" dari dialog cetak — tanpa ini nama jadi UUID
  // blob URL. Berlaku untuk kedua engine; kegagalan metadata tidak fatal.
  try {
    doc.setDocumentProperties?.({ title: filename.replace(/\.pdf$/i, ''), creator: 'Habil Operational' });
  } catch (_) { /* metadata opsional */ }
  return { doc, blob: doc.output('blob'), engine, filename };
}
