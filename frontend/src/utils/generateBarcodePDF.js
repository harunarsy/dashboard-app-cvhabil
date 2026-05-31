// Generate PDF Barcode Sticker (v1.12.1)
// A4 portrait, grid sticker barcode untuk batch/product code.
// Barcode digenerate via jsbarcode lalu dimasukkan ke jsPDF sebagai image.
import jsPDF from 'jspdf';

const mmToPx = (mm, dpi = 96) => Math.max(1, Math.round((mm / 25.4) * dpi));

const wrapLines = (doc, text, maxWidth, maxLines = 2) => {
  const raw = String(text || '').trim();
  if (!raw) return ['-'];
  let lines = doc.splitTextToSize(raw, maxWidth) || [raw];
  if (lines.length <= maxLines) return lines;
  lines = lines.slice(0, maxLines);
  const last = lines[maxLines - 1] || '';
  lines[maxLines - 1] = last.replace(/\s+$/, '');
  if (!lines[maxLines - 1].endsWith('…')) {
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, Math.max(0, lines[maxLines - 1].length - 1)) + '…';
  }
  return lines;
};

const canvasToDataUrl = (canvas) => {
  const dataUrl = canvas.toDataURL('image/png');
  if (!dataUrl || dataUrl === 'data:,') {
    throw new Error('Gagal render barcode');
  }
  return dataUrl;
};

const buildBarcodeDataUrl = async (code) => {
  const jsbarcodeModule = await import('jsbarcode');
  const JsBarcode = jsbarcodeModule.default || jsbarcodeModule;
  const canvas = document.createElement('canvas');
  canvas.width = mmToPx(56);
  canvas.height = mmToPx(18);
  JsBarcode(canvas, String(code), {
    format: 'CODE128',
    displayValue: false,
    margin: 0,
    width: 2,
    height: 40,
    background: '#FFFFFF',
    lineColor: '#000000',
    valid: (valid) => {
      if (!valid) throw new Error(`Kode barcode tidak valid: ${code}`);
    },
  });
  return canvasToDataUrl(canvas);
};

const getLayout = (layout, custom = {}) => {
  if (layout === '33') return { cols: 3, rows: 11, label: '33 per A4 (3×11)' };
  if (layout === 'custom') {
    const cols = Math.max(1, Math.min(6, parseInt(custom.cols, 10) || 3));
    const rows = Math.max(1, Math.min(20, parseInt(custom.rows, 10) || 7));
    return { cols, rows, label: `Custom (${cols}×${rows})` };
  }
  return { cols: 3, rows: 7, label: '21 per A4 (3×7)' };
};

export const generateBarcodePDF = async (items, options = {}) => {
  const rows = Array.isArray(items) ? items.filter(Boolean) : [];
  if (rows.length === 0) {
    throw new Error('Tidak ada produk untuk dicetak');
  }

  const layout = getLayout(options.layout, options.customLayout);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 9;
  const marginY = 10;
  const gapX = 3;
  const gapY = 3;
  const cellWidth = (pageWidth - (marginX * 2) - (gapX * (layout.cols - 1))) / layout.cols;
  const cellHeight = (pageHeight - (marginY * 2) - (gapY * (layout.rows - 1))) / layout.rows;

  const companyName = options.companyName || 'CV HABIL SEJAHTERA BERSAMA';
  const generatedAt = options.generatedAt || new Date();
  const skipped = [];

  const printable = [];
  for (const item of rows) {
    const code = String(item.code || '').trim();
    const qty = Math.max(1, Math.min(100, parseInt(item.qty, 10) || 1));
    if (!code) {
      skipped.push(item);
      continue;
    }
    for (let i = 0; i < qty; i += 1) {
      printable.push({
        code,
        name: String(item.name || '').trim() || '-',
      });
    }
  }

  if (printable.length === 0) {
    throw new Error('Tidak ada produk berkode untuk dicetak');
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(companyName, marginX, 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text(`Barcode Sticker · ${layout.label} · ${generatedAt.toLocaleDateString('id-ID')}`, pageWidth - marginX, 8, { align: 'right' });

  const barcodes = await Promise.all(printable.map(async (item) => ({
    ...item,
    barcodeDataUrl: await buildBarcodeDataUrl(item.code),
  })));

  const topY = 14;
  const innerPad = 1.8;
  const nameFont = 7.8;
  const codeFont = 7;
  const barcodeWidth = cellWidth - innerPad * 2 - 2;

  barcodes.forEach((item, idx) => {
    const slotIndex = idx % (layout.cols * layout.rows);
    const row = Math.floor(slotIndex / layout.cols);
    const col = slotIndex % layout.cols;

    if (idx > 0 && slotIndex === 0) {
      doc.addPage();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(companyName, marginX, 8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(90, 90, 90);
      doc.text(`Barcode Sticker · ${layout.label} · ${generatedAt.toLocaleDateString('id-ID')}`, pageWidth - marginX, 8, { align: 'right' });
    }

    const x = marginX + col * (cellWidth + gapX);
    const y = topY + row * (cellHeight + gapY);
    const boxX = x;
    const boxY = y;

    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.2);
    doc.roundedRect(boxX, boxY, cellWidth, cellHeight, 1.5, 1.5, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(nameFont);
    doc.setTextColor(0, 0, 0);
    const nameLines = wrapLines(doc, item.name, cellWidth - (innerPad * 2), 2);
    const nameY = boxY + 4.4;
    doc.text(nameLines, boxX + innerPad, nameY);

    const codeAreaY = boxY + cellHeight - 3.8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(codeFont);
    doc.setTextColor(70, 70, 70);
    doc.text(item.code.length > 22 ? `${item.code.slice(0, 19)}…` : item.code, boxX + cellWidth / 2, codeAreaY, { align: 'center' });

    const barcodeX = boxX + (cellWidth - barcodeWidth) / 2;
    const nameBlockHeight = Math.max(7, nameLines.length * 3.2);
    const barcodeY = boxY + nameBlockHeight + 3.2;
    const barcodeMaxHeight = Math.max(6, codeAreaY - barcodeY - 2.4);
    const barcodeHeight = Math.max(6, Math.min(cellHeight * 0.38, barcodeMaxHeight));
    doc.addImage(item.barcodeDataUrl, 'PNG', barcodeX, barcodeY, barcodeWidth, barcodeHeight, undefined, 'FAST');
  });

  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
  }

  return {
    doc,
    skippedCount: skipped.length,
    skippedItems: skipped,
    totalPrinted: printable.length,
  };
};
