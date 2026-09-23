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
  if (engine === 'v2') {
    const { generateSalesDocumentPDF } = await import('./generateSalesDocumentPDF');
    const logo_data_url = await getMonochromeLogoDataUrl();
    const doc = generateSalesDocumentPDF(order, { format, type, settings: { ...settings, logo_data_url } });
    return { doc, blob: doc.output('blob'), engine, filename };
  }
  const { generateNotaPDF } = await import('../generateNotaPDF');
  const doc = generateNotaPDF(order, { format, type, settings });
  return { doc, blob: doc.output('blob'), engine, filename };
}
