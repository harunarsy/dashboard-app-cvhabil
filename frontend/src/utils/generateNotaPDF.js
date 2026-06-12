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
  const compactPaper = isA5 || isA6;

  // Compact paper tune-up: A5/A6 tighter spacing + smaller footer/sign blocks.
  const baseFontSize = isA6 ? 7 : (isA5 ? 8 : 10);
  const margin = isA6 ? 5 : (isA5 ? 8 : 12);
  const accentColor = [0, 122, 255]; // Premium Blue

  // ─── Header Section ───────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(baseFontSize + 4);
  doc.setTextColor(...accentColor);
  doc.text(String(companyName), margin, margin + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(baseFontSize - 1);
  doc.setTextColor(40, 40, 40);
  // v1.23.0: NPWP di bawah nama CV — step rapat supaya muat di atas divider
  // (A6 divider margin+18, A4/A5 margin+24)
  const npwp = settings.npwp || '93.813.949.0-609.000';
  const headStep = isA6 ? 3.4 : 4.2;
  let headY = margin + (isA6 ? 8.5 : 9.5);
  doc.text(`NPWP: ${npwp}`, margin, headY);
  headY += headStep;
  doc.text(String(settings.address || '-'), margin, headY);
  headY += headStep;
  doc.text(String(settings.phone || '-'), margin, headY);

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
  doc.setTextColor(50, 50, 50);
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

  // Blue Line Divider — push 2mm A4/A5 (kasih clearance dari JT text descender)
  const dividerY = margin + (isA6 ? 18 : 24);
  doc.setDrawColor(...accentColor);
  doc.setLineWidth(0.4);
  doc.line(margin, dividerY, pageWidth - margin, dividerY);

  // ─── Customer & Payment ───────────────────────────────────────────────
  const customerY = margin + (isA6 ? 23 : 30);
  doc.setFontSize(baseFontSize);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'normal');
  doc.text('Kepada Yth:', margin, customerY);
  doc.setFont('helvetica', 'bold');
  doc.text(String(order.customer_name || '-'), margin + (isA6 ? 16 : 22), customerY);

  // v1.23.0: No. HP lalu Alamat (berlabel) di bawah nama; alamat panjang di-wrap
  // supaya tidak nabrak kolom Metode kanan / ketutupan tabel.
  let addressY = customerY;
  const contactX = margin + (isA6 ? 18 : 22);
  const contactStep = isA6 ? 3.4 : 4.2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(baseFontSize - 2);
  doc.setTextColor(40, 40, 40);
  if (order.customer_phone) {
    addressY += contactStep;
    doc.text(`No. HP: ${String(order.customer_phone)}`, contactX, addressY);
  }
  if (order.customer_address) {
    const maxAddrW = pageWidth - contactX - margin - (isA6 ? 26 : 40);
    const addrLines = doc.splitTextToSize(`Alamat: ${String(order.customer_address)}`, maxAddrW);
    addrLines.forEach((ln) => {
      addressY += contactStep;
      doc.text(ln, contactX, addressY);
    });
  }

  // Payment Method info — pindah ke bawah divider (clear dari JT row)
  if (type !== 'terima') {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(baseFontSize);
    doc.text(`Metode: ${String(order.payment_method || 'Tunai')}`, infoX, margin + (isA6 ? 23 : 30), { align: 'right' });
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

  // v1.8.5.8: tableStartY pushed below customerY (margin+23 A6, margin+30 A4/A5) +3mm
  // v1.23.0: alamat panjang (multi-baris) mendorong tabel ke bawah, bukan ketumpuk
  const tableStartY = Math.max(
    margin + (isA6 ? 24 : (isA5 ? 31 : 33)),
    addressY + (isA6 ? 3 : 4)
  );
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
      fontSize: baseFontSize - (compactPaper ? 1.8 : 1.5),
      cellPadding: isA6 ? 0.45 : (isA5 ? 0.6 : 1.8),
      lineWidth: 0,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: isA6 ? 7 : 10 },
      2: { halign: 'center', cellWidth: isA6 ? 14 : 20 },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
    margin: { left: margin, right: margin },
  });

  // v1.8.5.8: hapus outer rounded PERMANENT. jsPDF native gak support true rounded:
  // - clip API: roundedRect tanpa style default 'S' = stroke vertical-line bug
  // - triangle mask: putih notch visible jelek
  // - thick outer stroke: nyebar ke garis TTD inherit + tebel berlebihan
  // HTML preview pakai CSS overflow:hidden — gak ada equivalent di jsPDF.
  // Match preview style sebisanya: theme striped + blue header bg + body white/gray stripe.
  // Reset lineWidth standar buat sig line + dividers.
  doc.setLineWidth(0.2);

  // ─── Summary ──────────────────────────────────────────────────────────
  const tableEndY = (doc.lastAutoTable?.finalY || 0);
  let finalY = tableEndY > 0 ? tableEndY + (compactPaper ? 3.5 : 5) : margin + (isA6 ? 28 : 50);

  if (type !== 'terima') {
    // v1.8.1: tax-friendly breakdown — DPP (subtotal exc PPN) + PPN 11% + Grand Total
    // Indo practice: harga jual customer = gross (inc PPN). Decompose: GT = DPP + PPN.
    // v1.21.14: ongkir baris terpisah, TIDAK kena PPN. DPP/PPN dihitung dari nilai produk saja.
    const grandTotal = parseFloat(order.total) || 0;
    const ongkir = parseFloat(order.ongkir) || 0;
    const productTotal = grandTotal - ongkir;
    const PPN_RATE = 0.11;
    const dpp = productTotal / (1 + PPN_RATE);
    const ppn = productTotal - dpp;
    const rightX = pageWidth - margin;

    doc.setFontSize(baseFontSize - 1);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(`Subtotal (DPP): ${fmtRp(dpp)}`, rightX, finalY, { align: 'right' });
    finalY += isA6 ? 2.4 : (isA5 ? 3.3 : 4.5);
    doc.text(`PPN 11%: ${fmtRp(ppn)}`, rightX, finalY, { align: 'right' });
    finalY += isA6 ? 2.6 : (isA5 ? 3.6 : 5);
    if (ongkir > 0) {
      doc.text(`Ongkir: ${fmtRp(ongkir)}`, rightX, finalY, { align: 'right' });
      finalY += isA6 ? 2.6 : (isA5 ? 3.6 : 5);
    }

    doc.setFontSize(baseFontSize + 1);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text(`GRAND TOTAL: ${fmtRp(grandTotal)}`, rightX, finalY, { align: 'right' });

    finalY += isA6 ? 2.6 : (isA5 ? 3.6 : 5);
    doc.setFontSize(baseFontSize - 2);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100);
    const words = (angkaKeTerbilang(grandTotal) + " Rupiah").trim();
    doc.text(`Terbilang: ${words}`, margin, finalY);
    finalY += (isA6 ? 2.6 : (isA5 ? 4 : 6));
    doc.setTextColor(0);
  }

  if (order.notes) {
    doc.setFontSize(baseFontSize - 2);
    doc.setTextColor(120);
    doc.text(`Catatan: ${String(order.notes || '')}`, margin, finalY);
    finalY += 5;
    doc.setTextColor(0);
  }

  // v1.8.5.6: A6 sigBlockH 15 (sigGap 4 + sigNameOffset 11). lineH 2.5 keep.
  const lineH = isA6 ? 2.1 : (isA5 ? 2.6 : 4);
  const sigBlockH = isA6 ? 11 : (isA5 ? 14 : 24);
  const footerGap = isA6 ? 1.5 : (isA5 ? 2.5 : 4);

  let bankH = 0;
  if (bankInfo && type !== 'terima') {
    bankH = isA6 ? 7 : (isA5 ? 8 : 10);
    if (qrisText) bankH += isA6 ? 2.5 : (isA5 ? 3.5 : 5);
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
    finalY += isA6 ? 1.2 : (isA5 ? 2 : 3);
    ensureSpace(isA6 ? 2.5 : (isA5 ? 3 : 4));
    doc.setFontSize(baseFontSize - 2);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 59, 48);
    doc.text('NOTE:', margin, finalY);
    finalY += isA6 ? 2.5 : (isA5 ? 3 : 4);
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
    finalY += isA6 ? 2.5 : (isA5 ? 3.5 : 5);
    doc.setFontSize(baseFontSize - 1);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text(`REK ${bankInfo}`, pageWidth / 2, finalY, { align: 'center' });
    finalY += isA6 ? 2.5 : (isA5 ? 3.3 : 4); // explicit advance past REK text height biar gak collide sig
    if (qrisText) {
      doc.text(qrisText, pageWidth / 2, finalY, { align: 'center' });
      finalY += isA6 ? 2.5 : (isA5 ? 3.3 : 4);
    }
  }

  // ─── Signatures ──────────────────────────────────────────────────────
  // v1.8.5.6: sigGap A6 4mm (clear REK text). Sig footprint masih compact 11mm total.
  const sigGap = isA6 ? 2.5 : (isA5 ? 3 : 3);
  const sigLineOffset = isA6 ? 5.5 : (isA5 ? 8.5 : 16);
  const sigNameOffset = isA6 ? 8.5 : (isA5 ? 11 : 21);
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
    doc.setFontSize(isA6 ? 4.5 : (isA5 ? 5 : 6));
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
