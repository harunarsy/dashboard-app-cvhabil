import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmtRp = (n, decimals = 0) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n || 0);

// Helper for Indonesian "Terbilang" (Amount in words)
function angkaKeTerbilang(n) {
  const bilangan = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];
  let temp = "";
  if (n < 12) temp = " " + bilangan[n];
  else if (n < 20) temp = angkaKeTerbilang(n - 10) + " Belas";
  else if (n < 100) temp = angkaKeTerbilang(Math.floor(n / 10)) + " Puluh" + angkaKeTerbilang(n % 10);
  else if (n < 200) temp = " Seratus" + angkaKeTerbilang(n - 100);
  else if (n < 1000) temp = angkaKeTerbilang(Math.floor(n / 100)) + " Ratus" + angkaKeTerbilang(n % 100);
  else if (n < 2000) temp = " Seribu" + angkaKeTerbilang(n - 1000);
  else if (n < 1000000) temp = angkaKeTerbilang(Math.floor(n / 1000)) + " Ribu" + angkaKeTerbilang(n % 1000);
  else if (n < 1000000000) temp = angkaKeTerbilang(Math.floor(n / 1000000)) + " Juta" + angkaKeTerbilang(n % 1000000);
  return temp;
}

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
      return [index + 1, formatProductName(item), formatQtyDisplay(item), item.unit || 'pcs'];
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
    ? [['No', 'Nama Barang', 'Qty', 'Satuan']]
    : [['No', 'Nama Barang', 'Qty', 'Harga Satuan', 'Total']];

  autoTable(doc, {
    startY: margin + 30,
    head: tableHead,
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: accentColor,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: baseFontSize - 1.5,
      halign: 'center',
    },
    styles: {
      fontSize: baseFontSize - 1.5,
      cellPadding: isA6 ? 1 : 1.8
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

  // ─── Pre-calculate space for all remaining elements ───────────────────
  // v1.8.1: sigBlockH dihitung lebih akurat dari sigGap + sigLineOffset + sigNameOffset + bottom buffer
  // Sebelumnya undercount (cuma 20/26) padahal actual 26/40+ → bikin page split misjudge.
  const lineH = isA6 ? 3.5 : 4;
  const sigGapCalc = isA6 ? 5 : 7;
  const sigNameOffsetCalc = isA6 ? 14 : 19;
  const sigBottomBuffer = 4;
  const sigBlockH = sigGapCalc + sigNameOffsetCalc + sigBottomBuffer; // = 23 (A6) atau 30 (A5/A4)
  const footerReserve = footerText ? 8 : 4;

  let ketentuanLines = [];
  let ketentuanH = 0;
  if (ketentuan && type !== 'terima') {
    ketentuanLines = ketentuan.split('\n').filter(l => l.trim());
    ketentuanH = 3 + 4; // top padding + NOTE: label row
    ketentuanLines.forEach((line, i) => {
      const wrapped = doc.splitTextToSize(`${i + 1}. ${line}`, pageWidth - margin * 2);
      ketentuanH += wrapped.length * lineH;
    });
  }

  let bankH = 0;
  if (bankInfo && type !== 'terima') {
    bankH = 5 + 5; // top padding + bank text row
    if (qrisText) bankH += 5;
  }

  // v1.8.1: safety buffer 5mm untuk hindari edge-case overflow
  const safetyBuffer = 5;
  const totalNeeded = ketentuanH + bankH + sigBlockH + footerReserve + safetyBuffer;

  // Single page-break decision — move ALL remaining content together
  if (finalY + totalNeeded > pageHeight - margin) {
    doc.addPage();
    finalY = margin + 5;
  }

  // ─── Ketentuan / Notes ────────────────────────────────────────────────
  if (ketentuan && type !== 'terima') {
    finalY += 3;
    doc.setFontSize(baseFontSize - 2);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 59, 48);
    doc.text('NOTE:', margin, finalY);
    finalY += 4;
    doc.setFont('helvetica', 'normal');
    ketentuanLines.forEach((line, i) => {
      const wrapped = doc.splitTextToSize(`${i + 1}. ${line}`, pageWidth - margin * 2);
      doc.text(wrapped, margin, finalY);
      finalY += wrapped.length * lineH;
    });
    doc.setTextColor(0);
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

  // ─── Signatures (relative to content, not fixed) ──────────────────────
  const sigGap = isA6 ? 5 : 7;
  const sigLineOffset = isA6 ? 10 : 14;
  const sigNameOffset = isA6 ? 14 : 19;
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
