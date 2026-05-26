import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { angkaKeTerbilang } from './angkaKeTerbilang';

const fmtRp = (n, decimals = 0) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n || 0);

export function generateNotaPDF(order, options = {}) {
  try {
    console.log('[generateNotaPDF] Starting with order:', order);
    const {
      format = 'A4',
      type = 'nota',
      settings = {}
    } = options;

    // Normalize keys — handle both old (shop_name/footer) and new (company_name/footer_text) formats
    const companyName = settings.company_name || settings.shop_name || 'CV HABIL SEJAHTERA BERSAMA';
    const footerText = settings.footer_text || settings.footer || '';
    const signerName = settings.signer_name || '';
    const bankInfo = settings.bank_info || '';
    const qrisText = settings.qris_text || '';
    const ketentuan = settings.ketentuan || '';

    console.log('[generateNotaPDF] Format:', format, 'Type:', type);

    // Enforce Landscape for A5 and A6
    const isA4 = format.toUpperCase() === 'A4';
    const orientation = isA4 ? 'p' : 'l';
    const doc = new jsPDF(orientation, 'mm', format.toLowerCase());
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    console.log('[generateNotaPDF] Page dimensions - Width:', pageWidth, 'Height:', pageHeight);

  const isA6 = format.toUpperCase() === 'A6';
  const isA5 = format.toUpperCase() === 'A5';

  // Scaling factors for landscape A5/A6
  const baseFontSize = isA6 ? 8 : (isA5 ? 9 : 10);
  const margin = isA6 ? 7 : (isA5 ? 10 : 12);
  const accentColor = [0, 122, 255]; // Premium Blue

  // ─── Header Section ───────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(baseFontSize + 4);
  doc.setTextColor(...accentColor);
  doc.text(String(companyName), margin, margin + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(baseFontSize - 1);
  doc.setTextColor(80, 80, 80);
  doc.text(String(settings.address || '-'), margin, margin + 11);

  // Phone number (if available)
  doc.text(String(settings.phone || '-'), margin, margin + 15);

  // Doc Info (Top Right)
  const infoX = pageWidth - margin;
  const docTitle = type === 'terima' ? 'TANDA TERIMA' : 'NOTA PENJUALAN';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(baseFontSize + 2);
  doc.setTextColor(0);
  const titleY = isA6 ? margin + 4 : margin + 5;
  doc.text(docTitle, infoX, titleY, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(baseFontSize - 1.5);
  doc.setTextColor(60, 60, 60);
  doc.text(`No: ${String(order.order_number || '-')}`, infoX, titleY + 5, { align: 'right' });
  const saleDateStr = order.sale_date
    ? new Date(order.sale_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
    : '-';
  doc.text(saleDateStr, infoX, titleY + 9, { align: 'right' });
  // v1.8.1: tampilkan Jatuh Tempo di header kalau ada AND non-cash
  if (order.due_date && order.payment_method !== 'Tunai' && type !== 'terima') {
    const dueStr = new Date(order.due_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    doc.setTextColor(255, 59, 48);
    doc.setFont('helvetica', 'bold');
    doc.text(`JT: ${dueStr}`, infoX, titleY + 13, { align: 'right' });
    doc.setTextColor(60, 60, 60);
    doc.setFont('helvetica', 'normal');
  }

  // Blue Line Divider
  doc.setDrawColor(...accentColor);
  doc.setLineWidth(0.4);
  doc.line(margin, margin + 22, pageWidth - margin, margin + 22);

  // ─── Customer & Payment ───────────────────────────────────────────────
  doc.setFontSize(baseFontSize);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'normal');
  doc.text('Kepada Yth:', margin, margin + 29);
  doc.setFont('helvetica', 'bold');
  doc.text(String(order.customer_name || '-'), margin + (isA6 ? 18 : 22), margin + 29);

  // Customer address (if available)
  let addressY = margin + 29;
  if (order.customer_address) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(baseFontSize - 2);
    doc.setTextColor(80, 80, 80);
    const addrOffset = isA6 ? 4 : 5;
    addressY += addrOffset;
    doc.text(String(order.customer_address), margin + (isA6 ? 18 : 22), addressY);
  }
  if (order.customer_phone) {
    doc.setFontSize(baseFontSize - 2);
    addressY += isA6 ? 4 : 5;
    doc.text(`Telp: ${String(order.customer_phone)}`, margin + (isA6 ? 18 : 22), addressY);
  }

  // Payment Method info
  if (type !== 'terima') {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(baseFontSize);
    doc.text(`Metode: ${String(order.payment_method || 'Tunai')}`, infoX, margin + 25, { align: 'right' });
  }

  // ─── Table ────────────────────────────────────────────────────────────
  const items = order.items || [];
  // v1.6.0 multi-unit: prefer qty_in_unit + unit (snapshot at sale time) untuk display user-friendly
  // Tampilkan "1 karton" instead of "12 pcs" kalau pack unit dipakai. Append conversion ke nama produk untuk transparency.
  const formatQtyDisplay = (item) => {
    const qtyShow = item.qty_in_unit !== undefined && item.qty_in_unit !== null ? parseFloat(item.qty_in_unit) : (item.qty || 0);
    const unitShow = item.unit || 'pcs';
    return `${qtyShow} ${unitShow}`;
  };
  const fmtItemDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
  const formatProductName = (item) => {
    const packSize = parseInt(item.pack_size_at_sale) || 1;
    const qtyInUnit = item.qty_in_unit !== undefined && item.qty_in_unit !== null ? parseFloat(item.qty_in_unit) : null;
    const qtyBase = item.qty || 0;
    const lines = [item.product_name];
    // Sub-line 1: konversi pack→base kalau pack unit dipakai
    if (packSize > 1 && qtyInUnit !== null && qtyInUnit !== qtyBase) {
      lines.push(`  (= ${qtyBase} ${item.unit_base || 'pcs'})`);
    }
    // v1.7.0 Sub-line 2: batch + ED snapshot (kalau ada — skip silently kalau both NULL)
    const meta = [];
    if (item.batch_no_snapshot) meta.push(`Batch: ${item.batch_no_snapshot}`);
    const edStr = fmtItemDate(item.expired_date_snapshot);
    if (edStr) meta.push(`ED: ${edStr}`);
    if (meta.length) lines.push(`  ${meta.join(' · ')}`);
    return lines.join('\n');
  };
  let tableData = items.map((item, index) => {
    if (type === 'terima') {
      // v1.8.5.3: drop Satuan col (formatQtyDisplay sudah include unit "12 pcs")
      return [index + 1, formatProductName(item), formatQtyDisplay(item)];
    }
    const qtyForCalc = item.qty_in_unit !== undefined && item.qty_in_unit !== null ? parseFloat(item.qty_in_unit) : (item.qty || 0);
    return [
      index + 1,
      formatProductName(item),
      formatQtyDisplay(item),
      fmtRp(item.unit_price),
      fmtRp(qtyForCalc * (item.unit_price || 0))
    ];
  });

  const tableHead = type === 'terima'
    ? [['No', 'Nama Barang', 'Qty']]
    : [['No', 'Nama Barang', 'Qty', 'Harga Satuan', 'Total']];

  // v1.8.5.4: kill rounded entirely (triangle mask cause white notch bug, clip cause vertical-line bug).
  // Clean square table: blue header bg + striped body, no outer border. Cukup elegant tanpa bug visual.
  const tableStartY = margin + 30;
  autoTable(doc, {
    startY: tableStartY,
    head: tableHead,
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: accentColor,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: baseFontSize - 1.5,
      halign: 'center',
      lineWidth: 0,
    },
    bodyStyles: {
      lineWidth: 0,
      fillColor: [255, 255, 255],
    },
    alternateRowStyles: { fillColor: [248, 248, 250] },
    styles: {
      fontSize: baseFontSize - 1.5,
      cellPadding: isA6 ? 1 : 1.8,
      lineWidth: 0,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: isA6 ? 8 : 10 },
      2: { halign: 'center', cellWidth: isA6 ? 15 : 20 },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
    margin: { left: margin, right: margin },
  });

  // ─── Summary ──────────────────────────────────────────────────────────
  const tableEndY = (doc.lastAutoTable?.finalY || 0);
  let finalY = tableEndY > 0 ? tableEndY + 5 : margin + (isA6 ? 30 : 50);

  if (type !== 'terima') {
    // v1.8.1: tax-friendly breakdown — DPP (subtotal exc PPN) + PPN 11% + Grand Total
    // Indo practice: harga jual customer = gross (inc PPN). Decompose: GT = DPP + PPN.
    const grandTotal = parseFloat(order.total) || 0;
    const PPN_RATE = 0.11;
    const dpp = grandTotal / (1 + PPN_RATE);
    const ppn = grandTotal - dpp;
    const rightX = pageWidth - margin;

    doc.setFontSize(baseFontSize - 1);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(`Subtotal (DPP): ${fmtRp(dpp)}`, rightX, finalY, { align: 'right' });
    finalY += isA6 ? 3.5 : 4.5;
    doc.text(`PPN 11%: ${fmtRp(ppn)}`, rightX, finalY, { align: 'right' });
    finalY += isA6 ? 4 : 5;

    doc.setFontSize(baseFontSize + 1);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text(`GRAND TOTAL: ${fmtRp(grandTotal)}`, rightX, finalY, { align: 'right' });

    finalY += isA6 ? 4 : 5;
    doc.setFontSize(baseFontSize - 2);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100);
    const words = (angkaKeTerbilang(grandTotal) + " Rupiah").trim();
    doc.text(`Terbilang: ${words}`, margin, finalY);
    finalY += (isA6 ? 4 : 6);
    doc.setTextColor(0);
  }

  if (order.notes) {
    doc.setFontSize(baseFontSize - 2);
    doc.setTextColor(120);
    doc.text(`Catatan: ${String(order.notes || '')}`, margin, finalY);
    finalY += 5;
    doc.setTextColor(0);
  }

  // v1.8.5.4: A4/A5 sig spacious + A6 juga decent (consistent UX TTD + stempel).
  // sigBlockH = sigGap + sigNameOffset (lihat render constants di bawah).
  const lineH = isA6 ? 3.5 : 4;
  const sigBlockH = isA6 ? 18 : 24; // A4/A5: 24mm, A6: 18mm (still room TTD)
  const footerGap = 4; // gap antara sig bottom dan footer text (footer absolute di pageHeight-4)

  let bankH = 0;
  if (bankInfo && type !== 'terima') {
    bankH = 10; // 5mm top pad + 5mm bank text row
    if (qrisText) bankH += 5;
  }
  const tailGroupH = bankH + sigBlockH + footerGap;
  const tailThreshold = pageHeight - margin;

  const ensureSpace = (heightNeeded) => {
    if (finalY + heightNeeded > tailThreshold) {
      doc.addPage();
      finalY = margin + 5;
    }
  };

  // Debug behind localStorage flag — set `localStorage.pdfDebug = '1'` di console untuk lihat values
  if (typeof window !== 'undefined' && window.localStorage?.getItem('pdfDebug')) {
    console.log('[generateNotaPDF DEBUG]', { format, pageHeight, margin, finalY, bankH, sigBlockH, tailGroupH, threshold: tailThreshold });
  }

  // ─── Ketentuan / Notes (adaptive line-by-line) ────────────────────────
  // v1.8.5.4: A6 include ketentuan kembali. Kalau overflow → fallback addPage acceptable.
  if (ketentuan && type !== 'terima') {
    const ketentuanLines = ketentuan.split('\n').filter(l => l.trim());
    finalY += 3;
    ensureSpace(4);
    doc.setFontSize(baseFontSize - 2);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 59, 48);
    doc.text('NOTE:', margin, finalY);
    finalY += 4;
    doc.setFont('helvetica', 'normal');
    ketentuanLines.forEach((line, i) => {
      const wrapped = doc.splitTextToSize(`${i + 1}. ${line}`, pageWidth - margin * 2);
      ensureSpace(wrapped.length * lineH);
      doc.text(wrapped, margin, finalY);
      finalY += wrapped.length * lineH;
    });
    doc.setTextColor(0);
  }

  // Jaga bank + sig + footer satu page (kalau gak fit → addPage SEKALI sebelum bank)
  if (finalY + tailGroupH > pageHeight - margin) {
    doc.addPage();
    finalY = margin + 5;
  }

  // ─── Bank Info ────────────────────────────────────────────────────────
  if (bankInfo && type !== 'terima') {
    finalY += 5;
    doc.setFontSize(baseFontSize - 1);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text(`REK ${bankInfo}`, pageWidth / 2, finalY, { align: 'center' });
    if (qrisText) {
      finalY += 5;
      doc.text(qrisText, pageWidth / 2, finalY, { align: 'center' });
    }
  }

  // ─── Signatures ──────────────────────────────────────────────────────
  // v1.8.5.4: A6 sig juga decent (room TTD walaupun page kecil). A4/A5 tetep spacious.
  const sigGap = isA6 ? 2 : 3;
  const sigLineOffset = isA6 ? 12 : 16; // jarak label "Penerima," ke garis TTD
  const sigNameOffset = isA6 ? 16 : 21; // posisi nama di bawah garis
  const sigHalfWidth = isA6 ? 30 : 45;
  const sigCenter = isA6 ? 15 : 22;
  const sigY = finalY + sigGap;

  doc.setFontSize(baseFontSize - 1);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'normal');

  // Left: Customer (Penerima)
  doc.text('Penerima,', margin + sigCenter, sigY, { align: 'center' });
  doc.line(margin, sigY + sigLineOffset, margin + sigHalfWidth, sigY + sigLineOffset);
  doc.text('(                          )', margin + sigCenter, sigY + sigNameOffset, { align: 'center' });

  // Right: Company/Signer (Hormat kami)
  const rightSigX = pageWidth - margin - sigCenter;
  doc.text('Hormat kami,', rightSigX, sigY, { align: 'center' });
  doc.line(pageWidth - margin - sigHalfWidth, sigY + sigLineOffset, pageWidth - margin, sigY + sigLineOffset);
  if (signerName) {
    doc.text(signerName, rightSigX, sigY + sigNameOffset, { align: 'center' });
  }

  // ─── Footer ───────────────────────────────────────────────────────────
  if (footerText) {
    doc.setFontSize(isA6 ? 5 : 6);
    doc.setTextColor(180);
    doc.text(String(footerText), pageWidth / 2, pageHeight - 4, { align: 'center' });
  }

    console.log('[generateNotaPDF] PDF generated successfully');
    return doc;
  } catch (error) {
    console.error('[generateNotaPDF] ERROR:', error.message, error.stack);
    throw error;
  }
}
