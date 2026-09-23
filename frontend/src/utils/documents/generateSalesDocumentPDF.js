import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';
import {
  buildSalesDocumentViewModel,
  formatDateID,
  formatRupiah,
  hasLegalBuyerData,
  hasProcurementData,
} from './salesDocumentModel';
import { DOCUMENT_PROFILES, MONO } from './salesDocumentTheme';
import {
  buildTableStyles,
  createTailFlow,
  drawContinuationHeader,
  measureTable,
  planTableSplit,
} from './salesDocumentLayout';

const DOCUMENT_TITLE = 'FAKTUR PENJUALAN';
const DOCUMENT_SUBTITLE = 'SALES INVOICE';
const PAYMENT_STATUS_LABELS = { paid: 'Lunas', unpaid: 'Belum Lunas', partial: 'Bayar Sebagian' };

const hasText = (value) => value !== null && value !== undefined && String(value).trim() !== '';

const procurementEntries = (procurement) =>
  [
    ['Sumber', procurement.source],
    ['No. Pesanan Platform', procurement.platformOrderNumber],
    ['No. PO/SP', procurement.purchaseOrderNumber],
    ['No. Paket', procurement.packageNumber],
    ['No. Kontrak/SPK', procurement.contractNumber],
    ['Metode Pengadaan', procurement.procurementMethod],
    ['Instansi', procurement.governmentAgency],
  ].filter(([, value]) => hasText(value));

const formatTerm = (terms) => {
  if (!hasText(terms)) return null;
  return Number.isFinite(Number(terms)) ? `${terms} hari` : String(terms);
};

/**
 * Renderer dokumen penjualan resmi — sinkron, monokrom, print-first.
 * options: { format = 'A4', type = 'nota', settings = {}, vm }
 * `vm` opsional untuk preview yang sudah memiliki view-model Task 6.
 */
export function generateSalesDocumentPDF(order = {}, options = {}) {
  const { format = 'A4', settings = {}, vm: providedVm } = options;
  const profile = DOCUMENT_PROFILES[String(format).toUpperCase()];
  if (!profile) throw new Error(`Unknown sales document format: ${format}`);

  const vm = providedVm || buildSalesDocumentViewModel(order, settings);
  const doc = new jsPDF(profile.orientation, 'mm', profile.paper);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = profile.margin;
  const contentWidth = pageWidth - margin * 2;
  const base = profile.baseFontSize;
  const infoX = pageWidth - margin;
  const metrics = profile.metrics;

  const lineH = metrics.lineH;
  const tableGap = metrics.tableGap;
  const sigGap = metrics.sigGap;
  const sigLineOffset = metrics.sigLineOffset;
  const sigNameOffset = metrics.sigNameOffset;
  const footerGap = metrics.footerGap;
  const detailStep = metrics.detailStep;
  const sectionGap = metrics.sectionGap;

  const drawWrappedLines = (lines, x, startY, width, {
    size = base - 1, color = MONO.sub, style = 'normal', step = detailStep,
  } = {}) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    let y = startY;
    lines.filter((line) => hasText(line)).forEach((line) => {
      const wrapped = doc.splitTextToSize(String(line), width);
      wrapped.forEach((textLine) => {
        doc.text(textLine, x, y);
        y += step;
      });
    });
    return y;
  };

  // ─── Header perusahaan ────────────────────────────────────────────────
  const hasLogo = hasText(vm.identity.logo);
  const logoSize = 14;
  const identityX = hasLogo ? margin + logoSize + 4 : margin;
  const identityMaxW = contentWidth - 78;
  if (hasLogo) {
    try {
      const logoFormat = /^data:image\/jpe?g/i.test(vm.identity.logo) ? 'JPEG' : 'PNG';
      doc.addImage(vm.identity.logo, logoFormat, margin, margin, logoSize, logoSize);
    } catch (error) {
      // Logo pelengkap — dokumen tetap harus bisa dicetak tanpa logo.
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(base + 3);
  doc.setTextColor(...MONO.ink);
  if (hasText(vm.identity.companyName)) {
    const companyLines = doc.splitTextToSize(String(vm.identity.companyName), identityMaxW);
    companyLines.forEach((line, index) => doc.text(line, identityX, margin + 6 + index * metrics.companyStep));
  }

  const identityLines = [];
  if (hasText(vm.identity.npwp)) identityLines.push(`NPWP: ${vm.identity.npwp}`);
  if (hasText(vm.identity.address)) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(base - 1);
    identityLines.push(...doc.splitTextToSize(String(vm.identity.address), identityMaxW));
  }
  const contactLine = [vm.identity.phone, vm.identity.email].filter(hasText).join(' · ');
  if (contactLine) identityLines.push(contactLine);
  const identityNextY = drawWrappedLines(identityLines, identityX, margin + 11, identityMaxW);
  const identityBottomY = identityLines.length ? identityNextY - detailStep : margin + 6;

  // ─── Judul + metadata kanan ───────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(profile.titleFontSize);
  doc.setTextColor(...MONO.ink);
  doc.text(DOCUMENT_TITLE, infoX, margin + 6, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(base - 1);
  doc.setTextColor(...MONO.sub);
  doc.text(DOCUMENT_SUBTITLE, infoX, margin + 11, { align: 'right' });

  let infoY = margin + 15.5;
  let infoRightX = infoX;
  const barcodeValue = hasText(vm.document.orderNumber) ? String(vm.document.orderNumber).trim() : '';
  if (barcodeValue) {
    const barcodeW = metrics.barcodeWidth;
    const barcodeH = metrics.barcodeHeight;
    const barcodeTop = margin + 13;
    try {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, barcodeValue, {
        format: 'CODE128', displayValue: false, margin: 0,
        width: 2, height: 100, background: '#FFFFFF', lineColor: '#000000',
      });
      const dataUrl = canvas.toDataURL('image/png');
      if (dataUrl && dataUrl !== 'data:,') {
        doc.addImage(dataUrl, 'PNG', infoX - barcodeW, barcodeTop, barcodeW, barcodeH);
        if (profile.compactHeader) {
          // Header A5: baris info berdampingan dengan barcode, bukan menumpuk di bawahnya.
          infoRightX = infoX - barcodeW - 4;
        } else {
          infoY = barcodeTop + barcodeH + 3.5;
        }
      }
    } catch (error) {
      // Barcode pelengkap — nomor nota tetap tercetak sebagai teks.
    }
  }

  const infoRows = [];
  if (hasText(vm.document.orderNumber)) {
    infoRows.push({ text: `No: ${vm.document.orderNumber}`, strong: true });
  }
  const saleDate = formatDateID(vm.document.saleDate);
  if (saleDate) infoRows.push({ text: `Tanggal: ${saleDate}` });
  const dueDate = formatDateID(vm.document.dueDate);
  if (dueDate) infoRows.push({ text: `Jatuh Tempo: ${dueDate}` });
  if (hasText(vm.document.paymentStatus)) {
    const status = PAYMENT_STATUS_LABELS[vm.document.paymentStatus] || vm.document.paymentStatus;
    infoRows.push({ text: `Status: ${status}` });
  }
  infoRows.forEach((row) => {
    doc.setFont('helvetica', row.strong ? 'bold' : 'normal');
    doc.setFontSize(base - 1);
    doc.setTextColor(...(row.strong ? MONO.ink : MONO.sub));
    doc.text(row.text, infoRightX, infoY, { align: 'right' });
    infoY += metrics.infoStep;
  });
  const lastInfoY = infoRows.length ? infoY - metrics.infoStep : margin + 11;

  const dividerY = Math.max(margin + metrics.dividerMin, lastInfoY + 4, identityBottomY + 2);
  doc.setDrawColor(...MONO.rule);
  doc.setLineWidth(0.4);
  doc.line(margin, dividerY, pageWidth - margin, dividerY);

  // ─── Para pihak ───────────────────────────────────────────────────────
  let cursorY = dividerY + 6;
  const billingAddress = vm.buyer.billingAddress;
  const shippingAddress = vm.buyer.shippingAddress;
  const legalBuyer = hasLegalBuyerData(vm.buyer);
  const distinctAddresses = Boolean(
    hasText(billingAddress) && hasText(shippingAddress) && billingAddress !== shippingAddress,
  );
  const hasBuyerInfo = Boolean(
    hasText(vm.buyer.displayName) || hasText(vm.buyer.legalName) || legalBuyer
      || hasText(billingAddress) || hasText(vm.buyer.phone) || hasText(vm.buyer.email),
  );
  const showFormalParties = profile.showParties2Col && (legalBuyer || distinctAddresses);

  let procurementRendered = false;
  if (showFormalParties) {
    const columnGap = 8;
    const columnW = (contentWidth - columnGap) / 2;
    const columns = [{ x: margin, title: 'Ditagihkan kepada', address: billingAddress }];
    if (distinctAddresses) {
      columns.push({ x: margin + columnW + columnGap, title: 'Dikirim kepada', address: shippingAddress });
    }
    let partiesBottomY = cursorY;
    columns.forEach((column) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(base);
      doc.setTextColor(...MONO.ink);
      doc.text(column.title, column.x, cursorY);
      let y = cursorY + 5;
      const buyerName = vm.buyer.legalName || vm.buyer.displayName;
      if (hasText(buyerName)) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(base);
        doc.setTextColor(...MONO.ink);
        doc.splitTextToSize(String(buyerName), columnW).forEach((line) => {
          doc.text(line, column.x, y);
          y += 4.6;
        });
      }
      const details = [];
      if (hasText(vm.buyer.npwpOrNik)) details.push(`NPWP/NIK: ${vm.buyer.npwpOrNik}`);
      if (hasText(vm.buyer.picName)) {
        const position = hasText(vm.buyer.picPosition) ? ` (${vm.buyer.picPosition})` : '';
        details.push(`UP: ${vm.buyer.picName}${position}`);
      }
      if (hasText(vm.buyer.workUnit)) details.push(`Satuan Kerja: ${vm.buyer.workUnit}`);
      if (hasText(column.address)) details.push(column.address);
      if (hasText(vm.buyer.phone)) details.push(vm.buyer.phone);
      if (hasText(vm.buyer.email)) details.push(vm.buyer.email);
      const nextY = drawWrappedLines(details, column.x, y, columnW);
      const bottomY = details.length ? nextY - detailStep : y - 4.6;
      partiesBottomY = Math.max(partiesBottomY, bottomY);
    });
    cursorY = partiesBottomY + sectionGap;
  } else if (hasBuyerInfo) {
    // Profil compact (A5): customer dan referensi utama berdampingan dalam dua kolom.
    const refEntries = profile.customerRefs2Col && hasProcurementData(vm.procurement)
      ? procurementEntries(vm.procurement).slice(0, profile.maxProcurementRefs)
      : [];
    const columnGap = 8;
    const customerW = refEntries.length ? (contentWidth - columnGap) / 2 : contentWidth;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(base);
    doc.setTextColor(...MONO.ink);
    doc.text('Kepada Yth:', margin, cursorY);
    const nameX = margin + 22;
    const nameW = customerW - 22;
    let y = cursorY;
    if (hasText(vm.buyer.displayName)) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(base);
      doc.setTextColor(...MONO.ink);
      doc.splitTextToSize(String(vm.buyer.displayName), nameW).forEach((line) => {
        doc.text(line, nameX, y);
        y += metrics.nameStep;
      });
    }
    const details = [];
    if (hasText(vm.buyer.phone)) details.push(vm.buyer.phone);
    if (hasText(billingAddress)) details.push(billingAddress);
    const nextY = drawWrappedLines(details, nameX, y + 0.6, nameW);
    let partiesBottomY = details.length ? nextY - detailStep : y - metrics.nameStep;

    if (refEntries.length) {
      const refX = margin + customerW + columnGap;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(base);
      doc.setTextColor(...MONO.ink);
      doc.text('Referensi', refX, cursorY);
      let refY = cursorY + metrics.nameStep;
      refEntries.forEach(([label, value]) => {
        doc.splitTextToSize(`${label}: ${value}`, customerW).forEach((line) => {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(base - 2);
          doc.setTextColor(...MONO.sub);
          doc.text(line, refX, refY);
          refY += detailStep;
        });
      });
      partiesBottomY = Math.max(partiesBottomY, refY - detailStep);
      procurementRendered = true;
    }
    cursorY = partiesBottomY + sectionGap;
  }

  // ─── Referensi pengadaan ──────────────────────────────────────────────
  if (!procurementRendered && hasProcurementData(vm.procurement)) {
    const entries = procurementEntries(vm.procurement).slice(0, profile.maxProcurementRefs);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(base);
    doc.setTextColor(...MONO.ink);
    doc.text('Referensi Pengadaan', margin, cursorY);
    doc.setDrawColor(...MONO.rule);
    doc.setLineWidth(0.2);
    doc.line(margin, cursorY + 1.8, pageWidth - margin, cursorY + 1.8);

    const columnGap = 8;
    const columnW = (contentWidth - columnGap) / 2;
    const rowCount = Math.ceil(entries.length / 2);
    const rows = [];
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const rowEntries = [];
      for (let columnIndex = 0; columnIndex < 2; columnIndex += 1) {
        const entry = entries[columnIndex * rowCount + rowIndex];
        if (entry) {
          rowEntries.push({
            x: margin + columnIndex * (columnW + columnGap),
            wrapped: doc.splitTextToSize(`${entry[0]}: ${entry[1]}`, columnW),
          });
        }
      }
      rows.push({
        rowEntries,
        height: Math.max(...rowEntries.map((entry) => entry.wrapped.length)) * detailStep + 1,
      });
    }
    let rowY = cursorY + metrics.procurementLead;
    rows.forEach((row) => {
      row.rowEntries.forEach((entry) => {
        entry.wrapped.forEach((line, index) => {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(base - 2);
          doc.setTextColor(...MONO.sub);
          doc.text(line, entry.x, rowY + index * detailStep);
        });
      });
      rowY += row.height;
    });
    cursorY = rowY + sectionGap - 1;
  }

  // ─── Tabel barang ─────────────────────────────────────────────────────
  const withDiscount = vm.items.some((item) => Number(item.discount) > 0);
  const tableHead = [[
    'No', 'Nama Barang', 'Qty', 'Satuan', 'Harga Satuan',
    ...(withDiscount ? ['Diskon'] : []), 'Jumlah',
  ]];
  const tableBody = vm.items.map((item, index) => {
    const nameLines = [hasText(item.name) ? item.name : ''];
    const meta = [];
    if (hasText(item.code)) meta.push(`Kode: ${item.code}`);
    if (profile.batchMetaMode !== 'never') {
      if (hasText(item.batchNumber)) meta.push(`Batch: ${item.batchNumber}`);
      const expired = formatDateID(item.expiredDate);
      if (expired) meta.push(`ED: ${expired}`);
    }
    if (meta.length) nameLines.push(meta.join(' · '));
    return [
      index + 1,
      nameLines.join('\n'),
      item.qty,
      hasText(item.unit) ? item.unit : 'pcs',
      formatRupiah(item.unitPrice),
      ...(withDiscount ? [Number(item.discount) > 0 ? formatRupiah(item.discount) : ''] : []),
      formatRupiah(item.lineTotal),
    ];
  });

  const tableStartY = Math.max(margin + metrics.tableStartOffset, cursorY);

  // ─── Tail: ukur sebelum tabel diletakkan (port generateNotaPDF 441-519) ─
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(base - 2);
  const notesText = hasText(vm.document.notes) ? String(vm.document.notes).trim() : '';
  const notesLines = notesText
    ? doc.splitTextToSize(`Catatan: ${notesText}`, contentWidth)
    : [];
  const ketentuanText = hasText(vm.identity.ketentuan) ? String(vm.identity.ketentuan).trim() : '';
  const ketentuanRows = ketentuanText
    ? ketentuanText.split('\n').filter((line) => line.trim()).map((line, index) => ({
        wrapped: doc.splitTextToSize(`${index + 1}. ${line.trim()}`, contentWidth),
      }))
    : [];

  const sections = [];

  const summaryStep = metrics.summaryStep;
  const summaryRows = [];
  if (!vm.totals.ppnExcluded) {
    summaryRows.push({ text: `DPP: ${formatRupiah(vm.totals.dpp)}`, advance: summaryStep - 0.5 });
    summaryRows.push({
      text: `PPN ${Math.round(vm.totals.vatRate * 100)}%: ${formatRupiah(vm.totals.vatAmount)}`,
      advance: summaryStep,
    });
  }
  if (Number(vm.totals.discountTotal) > 0) {
    summaryRows.push({ text: `Diskon: ${formatRupiah(vm.totals.discountTotal)}`, advance: summaryStep });
  }
  if (Number(vm.totals.shippingCharge) > 0) {
    summaryRows.push({ text: `Ongkir: ${formatRupiah(vm.totals.shippingCharge)}`, advance: summaryStep });
  }
  if (Number(vm.totals.paymentFee) > 0) {
    summaryRows.push({ text: `Biaya Lain: ${formatRupiah(vm.totals.paymentFee)}`, advance: summaryStep });
  }
  summaryRows.push({
    text: `GRAND TOTAL: ${formatRupiah(vm.totals.grandTotal)}`,
    advance: summaryStep + 0.2,
    strong: true,
  });
  const summaryHeight = summaryRows.reduce((sum, row) => sum + row.advance, 0);
  const drawSummaryRows = (startY) => {
    let y = startY;
    summaryRows.forEach((row) => {
      doc.setFont('helvetica', row.strong ? 'bold' : 'normal');
      doc.setFontSize(row.strong ? base + 1 : base - 1);
      doc.setTextColor(...(row.strong ? MONO.ink : MONO.sub));
      doc.text(row.text, infoX, y, { align: 'right' });
      y += row.advance;
    });
  };

  const paymentRows = [];
  if (hasText(vm.payment.method)) paymentRows.push(`Metode: ${vm.payment.method}`);
  const accountParts = [];
  if (hasText(vm.payment.bankName)) accountParts.push(vm.payment.bankName);
  if (hasText(vm.payment.accountNumber)) accountParts.push(vm.payment.accountNumber);
  if (hasText(vm.payment.accountName)) accountParts.push(`a/n ${vm.payment.accountName}`);
  if (accountParts.length) paymentRows.push(`Rekening: ${accountParts.join(' ')}`);
  const termText = formatTerm(vm.payment.terms);
  if (termText) paymentRows.push(`Termin: ${termText}`);

  if (profile.splitTail) {
    // A5: nilai di kanan, terbilang + rekening di kiri pada satu band yang sama.
    // 58 mm cukup untuk baris "GRAND TOTAL: Rp 5.500.000" (baris terlebar).
    const tailColumnGap = 8;
    const leftColumnW = contentWidth - 58 - tailColumnGap;
    const leftTailRows = [
      { text: `Terbilang: ${vm.totals.amountInWords}`, style: 'italic' },
      ...paymentRows.map((line) => ({ text: line, style: 'normal' })),
    ].map((row) => ({ ...row, lines: doc.splitTextToSize(row.text, leftColumnW) }));
    const leftHeight = leftTailRows.reduce((sum, row) => sum + row.lines.length * detailStep, 0);
    const sectionHeight = Math.max(summaryHeight, leftHeight) + 6;
    sections.push({
      height: sectionHeight,
      draw(flow) {
        const startY = flow.y;
        drawSummaryRows(startY);
        let y = startY;
        leftTailRows.forEach((row) => {
          doc.setFont('helvetica', row.style);
          doc.setFontSize(base - 2);
          doc.setTextColor(...MONO.sub);
          row.lines.forEach((line) => {
            doc.text(line, margin, y);
            y += detailStep;
          });
        });
        flow.y = startY + sectionHeight;
      },
    });
  } else {
    sections.push({
      height: summaryHeight + 6,
      draw(flow) {
        drawSummaryRows(flow.y);
        flow.y += summaryHeight;
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(base - 2);
        doc.setTextColor(...MONO.sub);
        doc.text(`Terbilang: ${vm.totals.amountInWords}`, margin, flow.y);
        flow.y += summaryStep + 1;
      },
    });

    const paymentRowLines = paymentRows.map((line) => doc.splitTextToSize(line, contentWidth));
    if (paymentRows.length) {
      sections.push({
        height: sectionGap + metrics.headingStep
          + paymentRowLines.reduce((sum, lines) => sum + lines.length, 0) * detailStep,
        draw(flow) {
          flow.y += sectionGap;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(base - 1);
          doc.setTextColor(...MONO.ink);
          doc.text('Pembayaran', margin, flow.y);
          flow.y += metrics.headingStep;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(base - 2);
          doc.setTextColor(...MONO.sub);
          paymentRowLines.forEach((lines) => {
            lines.forEach((line) => {
              doc.text(line, margin, flow.y);
              flow.y += detailStep;
            });
          });
        },
      });
    }
  }

  const taxRows = [];
  if (profile.showTaxRef && hasText(vm.taxReference.number)) {
    taxRows.push(`Nomor: ${vm.taxReference.number}`);
    const taxDate = formatDateID(vm.taxReference.date);
    if (taxDate) taxRows.push(`Tanggal: ${taxDate}`);
    if (hasText(vm.taxReference.status)) taxRows.push(`Status: ${vm.taxReference.status}`);
  }
  const taxRowLines = taxRows.map((line) => doc.splitTextToSize(line, contentWidth));
  if (taxRows.length) {
    sections.push({
      height: sectionGap + metrics.headingStep
        + taxRowLines.reduce((sum, lines) => sum + lines.length, 0) * detailStep,
      draw(flow) {
        flow.y += sectionGap;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(base - 1);
        doc.setTextColor(...MONO.ink);
        doc.text('Referensi Faktur Pajak', margin, flow.y);
        flow.y += metrics.headingStep;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(base - 2);
        doc.setTextColor(...MONO.sub);
        taxRowLines.forEach((lines) => {
          lines.forEach((line) => {
            doc.text(line, margin, flow.y);
            flow.y += detailStep;
          });
        });
      },
    });
  }

  if (notesLines.length) {
    sections.push({
      height: sectionGap + notesLines.length * lineH,
      draw(flow) {
        flow.y += sectionGap;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(base - 2);
        doc.setTextColor(...MONO.sub);
        notesLines.forEach((line) => {
          doc.text(line, margin, flow.y);
          flow.y += lineH;
        });
      },
    });
  }

  if (ketentuanRows.length) {
    sections.push({
      height: sectionGap + metrics.headingStep
        + ketentuanRows.reduce((sum, row) => sum + row.wrapped.length * lineH, 0),
      draw(flow) {
        flow.y += sectionGap;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(base - 1);
        doc.setTextColor(...MONO.ink);
        doc.text('Ketentuan', margin, flow.y);
        flow.y += metrics.headingStep;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(base - 2);
        doc.setTextColor(...MONO.sub);
        ketentuanRows.forEach((row) => {
          row.wrapped.forEach((line) => {
            doc.text(line, margin, flow.y);
            flow.y += lineH;
          });
        });
      },
    });
  }

  const tailContentH = sections.reduce((sum, section) => sum + section.height, 0);
  const tailContentBottomY = pageHeight - 4 - footerGap;
  const tailLimitY = tailContentBottomY - sigNameOffset;
  const continuationLineY = margin + 11;
  const continuationTableStartY = continuationLineY + 5;
  const tailFitsSinglePage = continuationTableStartY + tailContentH + sigGap <= tailLimitY;
  const tailTableEndY = tailFitsSinglePage
    ? tailLimitY - tailContentH - sigGap - tableGap
    : pageHeight - margin;
  const tailTableBottomMargin = tailFitsSinglePage
    ? Math.max(margin, pageHeight - tailTableEndY)
    : margin;

  const continuationCtx = {
    pageWidth,
    margin,
    baseFontSize: base,
    companyName: vm.identity.companyName || '',
    orderNumber: vm.document.orderNumber || '',
    title: DOCUMENT_TITLE,
    continuationLineY,
  };
  const drawPageContinuationHeader = () => drawContinuationHeader(doc, continuationCtx);

  const { headHeight, bodyHeights } = measureTable(profile, tableHead, tableBody, { withDiscount });
  const completeTableEndY = tableStartY + headHeight
    + bodyHeights.reduce((sum, height) => sum + height, 0);
  const tableFitsWithTail = completeTableEndY <= tailTableEndY;
  const { initialRows } = planTableSplit({
    bodyHeights,
    firstPageCapacity: pageHeight - margin - tableStartY - headHeight,
    finalPageCapacity: tailTableEndY - continuationTableStartY - headHeight,
  });
  const splitTableForTail = tailFitsSinglePage && !tableFitsWithTail && initialRows > 0;

  const tableStyles = buildTableStyles(profile, { withDiscount });
  const renderTable = (body, startY, bottomMargin) => {
    autoTable(doc, {
      ...tableStyles,
      head: tableHead,
      startY,
      body,
      margin: {
        top: continuationTableStartY,
        right: margin,
        bottom: bottomMargin,
        left: margin,
      },
      willDrawPage: () => {
        if (doc.getNumberOfPages() > 1) drawPageContinuationHeader();
      },
    });
  };

  if (splitTableForTail) {
    renderTable(tableBody.slice(0, initialRows), tableStartY, margin);
    doc.addPage();
    renderTable(tableBody.slice(initialRows), continuationTableStartY, tailTableBottomMargin);
  } else {
    renderTable(tableBody, tableStartY, tailTableBottomMargin);
  }

  doc.setLineWidth(0.2);

  // ─── Tail hanya di halaman terakhir ───────────────────────────────────
  const tableEndY = doc.lastAutoTable?.finalY || 0;
  const flow = createTailFlow(doc, {
    startY: tableEndY > 0 ? tableEndY + tableGap : margin + 50,
    bottomLimit: tailContentBottomY,
    continuationTableStartY,
    onPageAdded: drawPageContinuationHeader,
  });

  const tailFitsOnCurrentPage = flow.y + tailContentH + sigGap + sigNameOffset
    <= pageHeight - 4 - footerGap;
  if (!tailFitsOnCurrentPage) flow.addPage();
  sections.forEach((section) => {
    if (!tailFitsSinglePage) flow.ensure(section.height);
    section.draw(flow);
  });

  if (!tailFitsSinglePage) flow.ensure(sigGap + sigNameOffset + 2);
  const sigY = flow.y + sigGap;
  // A5 memakai dua area tanda tangan: penerima dan Habil (spec §7).
  const signatureSlots = [
    { label: 'Penerima,', name: vm.signatures.recipientName },
    { label: 'Pemeriksa,', name: vm.signatures.examinerName },
    { label: 'Hormat kami,', name: vm.signatures.issuerName },
  ];
  const signatureColumns = Math.max(1, Math.min(profile.signatureCount, signatureSlots.length));
  const visibleSlots = signatureColumns >= signatureSlots.length
    ? signatureSlots
    : [signatureSlots[0], signatureSlots[signatureSlots.length - 1]].slice(0, signatureColumns);
  const signatureColumnW = contentWidth / signatureColumns;
  visibleSlots.forEach((slot, index) => {
    const centerX = margin + signatureColumnW * (index + 0.5);
    const halfLine = Math.min(signatureColumnW / 2 - 8, 32);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(base - 1);
    doc.setTextColor(...MONO.ink);
    doc.text(slot.label, centerX, sigY, { align: 'center' });
    doc.setDrawColor(...MONO.rule);
    doc.setLineWidth(0.2);
    doc.line(centerX - halfLine, sigY + sigLineOffset, centerX + halfLine, sigY + sigLineOffset);
    if (hasText(slot.name)) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(base - 2);
      doc.setTextColor(...MONO.sub);
      doc.text(String(slot.name), centerX, sigY + sigNameOffset, { align: 'center' });
    }
  });

  // ─── Footer nomor halaman ─────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(Math.max(6, base - 3));
    doc.setTextColor(...MONO.faint);
    doc.text(`Halaman ${page} dari ${pageCount}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
  }

  return doc;
}
