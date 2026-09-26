import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MONO } from './documents/salesDocumentTheme';

// Surat Pesanan — satu bahasa desain dengan nota (v1.67.20): tinta monokrom,
// mark H biru sebagai aksen tunggal, tabel headFill/zebra tanpa garis.
export function generateSPPDF(order, options = {}) {
  const {
    format = 'A6',
    salesmanInfo = {},
    settings = {
      company_name: 'CV. HABIL SEJAHTERA BERSAMA',
      footer_text: 'Dokumen dicetak otomatis oleh Habil SuperApp',
    },
  } = options;

  const companyName = settings.company_name || settings.shop_name || 'CV HABIL SEJAHTERA BERSAMA';
  const footerText = settings.footer_text || settings.footer || 'Dokumen dicetak otomatis oleh Habil SuperApp';

  const doc = new jsPDF('p', 'mm', format.toLowerCase());
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const isA6 = format.toUpperCase() === 'A6';
  const baseFontSize = isA6 ? 8 : 10;
  const margin = isA6 ? 8 : 12;
  const step = isA6 ? 3.2 : 3.8;
  const contentWidth = pageWidth - margin * 2;

  // ─── Header: logo + identitas (kiri), judul + metadata (kanan) ──────
  const logoDataUrl = settings.logo_data_url;
  const logoWidth = isA6 ? 9 : 12;
  if (logoDataUrl) {
    const logoHeight = logoWidth * (233.443 / 240);
    try {
      doc.addImage(logoDataUrl, 'PNG', margin, margin, logoWidth, logoHeight);
    } catch (_) {
      // SP tetap dapat dicetak tanpa gambar bila data logo rusak.
    }
  }
  const identityX = margin + (logoDataUrl ? logoWidth + (isA6 ? 2.5 : 3.5) : 0);
  const headerTop = margin + (isA6 ? 3.6 : 4.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(baseFontSize + 2);
  doc.setTextColor(...MONO.ink);
  doc.text(companyName, identityX, headerTop);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(baseFontSize - 1.5);
  doc.setTextColor(...MONO.sub);
  let identityY = headerTop + step;
  const identityMaxW = Math.max(24, pageWidth / 2 - identityX);
  const identityLines = [
    `NPWP: ${settings.npwp || '93.813.949.0-609.000'}`,
    settings.address ? String(settings.address) : null,
    settings.phone ? String(settings.phone) : null,
  ].filter(Boolean);
  identityLines.forEach((line) => {
    doc.splitTextToSize(line, identityMaxW).forEach((wrapped) => {
      doc.text(wrapped, identityX, identityY);
      identityY += step - (isA6 ? 0.4 : 0.2);
    });
  });

  const infoX = pageWidth - margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(baseFontSize + 1);
  doc.setTextColor(...MONO.ink);
  doc.text('SURAT PESANAN', infoX, headerTop, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(baseFontSize - 1.5);
  doc.setTextColor(...MONO.sub);
  let metaY = headerTop + step;
  doc.text(`No. SP: ${String(order.po_number || '-')}`, infoX, metaY, { align: 'right' });
  metaY += step - (isA6 ? 0.4 : 0.2);
  const dateStr = order.order_date
    ? new Date(order.order_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
    : '-';
  doc.text(`Tanggal: ${dateStr}`, infoX, metaY, { align: 'right' });
  metaY += step - (isA6 ? 0.4 : 0.2);
  if (order.expected_date) {
    const expDate = new Date(order.expected_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    doc.text(`Est. Tiba: ${expDate}`, infoX, metaY, { align: 'right' });
    metaY += step - (isA6 ? 0.4 : 0.2);
  }

  const dividerY = Math.max(identityY, metaY) + (isA6 ? 1.2 : 2);
  doc.setDrawColor(...MONO.rule);
  doc.setLineWidth(0.4);
  doc.line(margin, dividerY, pageWidth - margin, dividerY);

  // ─── Penerima ────────────────────────────────────────────────────────
  let y = dividerY + (isA6 ? 4 : 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(baseFontSize);
  doc.setTextColor(...MONO.ink);
  doc.text('Kepada Yth:', margin, y);
  y += step;

  doc.setFont('helvetica', 'bold');
  doc.splitTextToSize(String(order.distributor_name || '-'), contentWidth).forEach((line) => {
    doc.text(line, margin, y);
    y += step;
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(baseFontSize - 1.5);
  doc.setTextColor(...MONO.sub);
  if (order.distributor_address) {
    doc.splitTextToSize(String(order.distributor_address), contentWidth).forEach((line) => {
      doc.text(line, margin, y);
      y += step - 0.6;
    });
  }
  if (salesmanInfo.salesman_name) {
    doc.text(`Up: ${salesmanInfo.salesman_name}`, margin, y);
    y += step - 0.6;
  }
  if (salesmanInfo.salesman_phone) {
    doc.text(`Telp: ${salesmanInfo.salesman_phone}`, margin, y);
    y += step - 0.6;
  }

  // ─── Tabel barang (TANPA harga) ──────────────────────────────────────
  const items = order.items || [];
  // v1.6.0 multi-unit: prefer qty_in_unit (snapshot user-input qty di unit pack/eceran) untuk display
  const formatQtyForSP = (item) => {
    const qtyShow = item.qty_in_unit !== undefined && item.qty_in_unit !== null
      ? parseFloat(item.qty_in_unit)
      : (item.qty || 0);
    return qtyShow;
  };
  // v1.8.0 karton consistency: tampilkan sub-line conversion "(= X pcs)" kalau pack unit dipakai
  const formatProductNameSP = (item) => {
    const qtyInUnit = parseFloat(item.qty_in_unit);
    const qtyBase = parseFloat(item.qty);
    const packSize = parseInt(item.pack_size_at_po) || 1;
    const baseUnit = item.unit_base || 'pcs';
    if (packSize > 1 && !isNaN(qtyInUnit) && !isNaN(qtyBase) && qtyBase !== qtyInUnit) {
      return `${item.product_name}\n(= ${qtyBase} ${baseUnit})`;
    }
    return item.product_name;
  };
  const tableData = items.map((item, index) => [
    index + 1,
    formatProductNameSP(item),
    formatQtyForSP(item),
    item.unit || 'pcs',
  ]);

  autoTable(doc, {
    startY: y + (isA6 ? 2.5 : 3.5),
    head: [['No', 'Nama Barang', 'Qty', 'Satuan']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: MONO.headFill,
      textColor: MONO.ink,
      fontStyle: 'bold',
      fontSize: baseFontSize - 1.5,
      halign: 'center',
      lineWidth: 0,
    },
    bodyStyles: { lineWidth: 0, fillColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: MONO.zebra },
    styles: {
      fontSize: baseFontSize - 1.5,
      cellPadding: isA6 ? 1.2 : 2,
      lineWidth: 0,
      textColor: MONO.ink,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: isA6 ? 8 : 10 },
      2: { halign: 'center', cellWidth: isA6 ? 12 : 15 },
      3: { halign: 'center', cellWidth: isA6 ? 15 : 20 },
    },
    margin: { left: margin, right: margin },
    rowPageBreak: 'avoid',
  });

  // ─── Catatan ─────────────────────────────────────────────────────────
  let finalY = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + (isA6 ? 4 : 5) : pageHeight - 50;
  if (order.notes) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(baseFontSize - 1.5);
    doc.setTextColor(...MONO.sub);
    doc.splitTextToSize(`Catatan: ${String(order.notes)}`, contentWidth).forEach((line) => {
      doc.text(line, margin, finalY);
      finalY += step - 0.6;
    });
  }

  // ─── Tanda tangan (kanan, aman multi-halaman) ────────────────────────
  const signatureLabelToLine = isA6 ? 16 : 20;
  const signatureLineToName = isA6 ? 4 : 5;
  const signatureBlockH = signatureLabelToLine + signatureLineToName + 1;
  const footerReserve = isA6 ? 8 : 10;
  if (finalY + signatureBlockH > pageHeight - footerReserve) {
    doc.addPage();
    finalY = margin + 8;
  }
  const sigCenterX = pageWidth - margin - (isA6 ? 24 : 30);
  const sigHalfWidth = isA6 ? 16 : 20;
  const sigY = Math.max(
    finalY + (isA6 ? 5 : 6),
    pageHeight - footerReserve - signatureLabelToLine - signatureLineToName,
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(baseFontSize);
  doc.setTextColor(...MONO.ink);
  doc.text('Hormat Kami,', sigCenterX, sigY, { align: 'center' });
  doc.setDrawColor(...MONO.ink);
  doc.setLineWidth(0.3);
  doc.line(sigCenterX - sigHalfWidth, sigY + signatureLabelToLine, sigCenterX + sigHalfWidth, sigY + signatureLabelToLine);
  doc.setFont('helvetica', 'bold');
  doc.text(String(order.pic_name || 'Harun Al Rasyid'), sigCenterX, sigY + signatureLabelToLine + signatureLineToName, { align: 'center' });

  // ─── Footer ──────────────────────────────────────────────────────────
  if (footerText) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(isA6 ? 5 : 6);
    doc.setTextColor(...MONO.faint);
    doc.text(String(footerText), pageWidth / 2, pageHeight - 4, { align: 'center' });
  }

  // Judul metadata = nama file (Chrome "Simpan sebagai PDF" memakai judul ini).
  const filename = options.filename || `SP_${order.po_number || 'dokumen'}`;
  try {
    doc.setDocumentProperties?.({ title: filename.replace(/\.pdf$/i, ''), creator: 'Habil SuperApp' });
  } catch (_) {
    /* metadata opsional */
  }

  return doc;
}
