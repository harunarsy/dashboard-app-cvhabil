import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MONO } from './documents/salesDocumentTheme';

const LOGO_ASPECT = 233.443 / 240;

// ─── Metrik header SP ────────────────────────────────────────────────────
// Satu sumber kebenaran untuk menggambar DAN menguji: nama perusahaan menyusut
// agar muat kolom kiri, judul menyusut agar muat kolom kanan — header dua
// kolom tidak mungkin tabrakan di A4/A5/A6 (bug cetak v1.67.20 SP A6).
export function computeSpHeaderMetrics(doc, {
  format = 'A6',
  companyName = 'CV HABIL SEJAHTERA BERSAMA',
  logoPresent = true,
} = {}) {
  const fmt = String(format).toUpperCase();
  const isA6 = fmt === 'A6';
  const pageWidth = doc.internal.pageSize.getWidth();
  const baseFontSize = isA6 ? 8 : 10;
  const margin = isA6 ? 6 : 12;
  const contentWidth = pageWidth - margin * 2;
  const colGap = isA6 ? 4.5 : 6;
  const logoWidth = isA6 ? 8 : (fmt === 'A5' ? 11 : 14);
  const logoHeight = logoWidth * LOGO_ASPECT;
  const identityX = margin + (logoPresent ? logoWidth + (isA6 ? 2 : 3) : 0);
  const identityMaxW = Math.max(26, contentWidth * 0.6 - (identityX - margin));
  const rightColW = Math.max(24, contentWidth * 0.4 - colGap);

  const fitFontSize = (text, maxW, startSize, minSize) => {
    doc.setFont('helvetica', 'bold');
    let size = startSize;
    doc.setFontSize(size);
    while (size > minSize && doc.getTextWidth(text) > maxW) {
      size = Math.round((size - 0.25) * 100) / 100;
      doc.setFontSize(size);
    }
    return size;
  };

  const title = 'SURAT PESANAN';
  const companySize = fitFontSize(companyName, identityMaxW, baseFontSize + 2, 6.5);
  const titleSize = fitFontSize(title, rightColW, baseFontSize + 2, 6.5);
  const headSize = Math.min(companySize, titleSize);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(headSize);
  return {
    format: fmt,
    isA6,
    pageWidth,
    pageHeight: doc.internal.pageSize.getHeight(),
    margin,
    contentWidth,
    colGap,
    baseFontSize,
    logoWidth,
    logoHeight,
    identityX,
    identityMaxW,
    rightColW,
    headSize,
    companyWidth: doc.getTextWidth(companyName),
    titleWidth: doc.getTextWidth(title),
    companyOverflows: doc.getTextWidth(companyName) > identityMaxW + 0.01,
  };
}

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

  const logoDataUrl = settings.logo_data_url;
  const H = computeSpHeaderMetrics(doc, { format, companyName, logoPresent: Boolean(logoDataUrl) });
  const { isA6, margin, contentWidth, baseFontSize, logoWidth, logoHeight, identityX, identityMaxW, headSize } = H;

  // ─── Header: logo (ter-center vertikal) + identitas (kiri), judul + metadata (kanan)
  const headerTop = margin + headSize * 0.3528 + (isA6 ? 0.8 : 1);
  const idSize = baseFontSize - 1.5;
  const idStep = isA6 ? 3 : 3.6;
  const infoX = pageWidth - margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(headSize);
  doc.setTextColor(...MONO.ink);
  const nameLines = doc.splitTextToSize(companyName, identityMaxW).slice(0, 2);
  const nameStep = headSize * 0.3528 * 1.2;
  nameLines.forEach((line, i) => doc.text(line, identityX, headerTop + nameStep * i));
  let leftBottom = headerTop + nameStep * (nameLines.length - 1);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(idSize);
  doc.setTextColor(...MONO.sub);
  let identityY = leftBottom + idStep;
  const identityLines = [
    `NPWP: ${settings.npwp || '93.813.949.0-609.000'}`,
    settings.address ? String(settings.address) : null,
    settings.phone ? String(settings.phone) : null,
  ].filter(Boolean);
  identityLines.forEach((line) => {
    doc.splitTextToSize(line, identityMaxW).forEach((wrapped) => {
      doc.text(wrapped, identityX, identityY);
      leftBottom = identityY;
      identityY += idStep;
    });
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(headSize);
  doc.setTextColor(...MONO.ink);
  doc.text('SURAT PESANAN', infoX, headerTop, { align: 'right' });
  let rightBottom = headerTop;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(idSize);
  doc.setTextColor(...MONO.sub);
  let metaY = headerTop + idStep;
  doc.text(`No. SP: ${String(order.po_number || '-')}`, infoX, metaY, { align: 'right' });
  rightBottom = metaY;
  metaY += idStep;
  const dateStr = order.order_date
    ? new Date(order.order_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
    : '-';
  doc.text(`Tanggal: ${dateStr}`, infoX, metaY, { align: 'right' });
  rightBottom = metaY;
  metaY += idStep;
  if (order.expected_date) {
    const expDate = new Date(order.expected_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    doc.text(`Est. Tiba: ${expDate}`, infoX, metaY, { align: 'right' });
    rightBottom = metaY;
  }

  // Logo mark H di-center vertikal terhadap blok identitas (pola yang sama
  // dengan nota) supaya tidak menggantung di kiri atas.
  if (logoDataUrl) {
    const blockTop = headerTop - headSize * 0.3528;
    const blockBottom = leftBottom + idSize * 0.3528 * 0.6 + 0.6;
    const logoY = Math.max(margin, (blockTop + blockBottom - logoHeight) / 2);
    try {
      doc.addImage(logoDataUrl, 'PNG', margin, logoY, logoWidth, logoHeight);
    } catch (_) {
      // SP tetap dapat dicetak tanpa gambar bila data logo rusak.
    }
  }

  const dividerY = Math.max(leftBottom, rightBottom) + (isA6 ? 1.6 : 2.2);
  doc.setDrawColor(...MONO.rule);
  doc.setLineWidth(0.4);
  doc.line(margin, dividerY, pageWidth - margin, dividerY);

  // ─── Penerima ────────────────────────────────────────────────────────
  let y = dividerY + (isA6 ? 3.6 : 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(baseFontSize);
  doc.setTextColor(...MONO.ink);
  doc.text('Kepada Yth:', margin, y);
  y += isA6 ? 3 : 3.6;

  doc.setFont('helvetica', 'bold');
  doc.splitTextToSize(String(order.distributor_name || '-'), contentWidth).forEach((line) => {
    doc.text(line, margin, y);
    y += isA6 ? 3 : 3.6;
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(idSize);
  doc.setTextColor(...MONO.sub);
  if (order.distributor_address) {
    doc.splitTextToSize(String(order.distributor_address), contentWidth).forEach((line) => {
      doc.text(line, margin, y);
      y += isA6 ? 2.4 : 3;
    });
  }
  if (salesmanInfo.salesman_name) {
    doc.text(`Up: ${salesmanInfo.salesman_name}`, margin, y);
    y += isA6 ? 2.4 : 3;
  }
  if (salesmanInfo.salesman_phone) {
    doc.text(`Telp: ${salesmanInfo.salesman_phone}`, margin, y);
    y += isA6 ? 2.4 : 3;
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
      fontSize: idSize,
      halign: 'center',
      lineWidth: 0,
    },
    bodyStyles: { lineWidth: 0, fillColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: MONO.zebra },
    styles: {
      fontSize: idSize,
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
    doc.setFontSize(idSize);
    doc.setTextColor(...MONO.sub);
    doc.splitTextToSize(`Catatan: ${String(order.notes)}`, contentWidth).forEach((line) => {
      doc.text(line, margin, finalY);
      finalY += isA6 ? 2.4 : 3;
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
