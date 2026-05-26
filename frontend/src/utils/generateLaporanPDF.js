// Generate PDF Laporan Ringkasan Nota Penjualan (multi-select bulk export, v1.7.0)
// Landscape A4, tabel agregat + Grand Total + detail items per nota
// NOTE: jsPDF helvetica = ASCII only — JANGAN pakai emoji (render gibberish + break letter spacing)
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmtRp = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

export const generateLaporanPDF = (orders, options = {}) => {
  if (!Array.isArray(orders) || orders.length === 0) {
    throw new Error('Tidak ada nota untuk di-export');
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const { companyName = 'HABIL SUPERAPP', filterInfo, dateRange } = options;

  // ─── Header ─────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text(`Laporan Nota Penjualan - ${companyName}`, 14, 15);

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  const metaParts = [];
  if (dateRange) metaParts.push(`Periode: ${dateRange}`);
  if (filterInfo) metaParts.push(`Filter: ${filterInfo}`);
  metaParts.push(`Generated: ${fmtDate(new Date())}`);
  metaParts.push(`Total: ${orders.length} nota`);
  doc.text(metaParts.join(' | '), 14, 21);

  // ─── Tabel Ringkasan + Inline Item Sub-rows ────────────────────────
  // Per request: items detail INLINE di tabel utama (bukan halaman terpisah).
  // Pattern: per nota = 1 main row + N item sub-rows (colSpan 6, lighter style)
  const SUBROW_BG = [250, 250, 252];
  const bodyRows = [];
  orders.forEach((o, i) => {
    // Main row
    bodyRows.push([
      i + 1,
      o.order_number,
      fmtDate(o.sale_date),
      o.customer_name || '-',
      o.channel === 'online' ? 'Online' : 'Offline',
      fmtRp(o.total),
      o.payment_method || '-',
      o.payment_status === 'paid' ? 'Lunas' : 'Belum Bayar',
      o.status === 'final' ? 'Final' : 'Draft',
    ]);
    // Item sub-rows — 3 empty leading + colSpan 5 product line + 1 subtotal
    const items = Array.isArray(o.items) ? o.items : [];
    items.forEach(it => {
      const qtyShow = it.qty_in_unit !== undefined && it.qty_in_unit !== null
        ? parseFloat(it.qty_in_unit)
        : (it.qty || 0);
      const unit = it.unit || 'pcs';
      const priceStr = fmtRp(it.unit_price);
      const hppStr = parseFloat(it.unit_hpp) > 0 ? `  HPP ${fmtRp(it.unit_hpp)}` : '';
      const lineText = `> ${it.product_name || '-'}   |   ${qtyShow} ${unit} @ ${priceStr}${hppStr}`;
      bodyRows.push([
        { content: '', styles: { fillColor: SUBROW_BG } },
        { content: '', styles: { fillColor: SUBROW_BG } },
        { content: '', styles: { fillColor: SUBROW_BG } },
        { content: lineText, colSpan: 5, styles: {
          fillColor: SUBROW_BG, textColor: [80, 80, 80], fontSize: 7.5,
          halign: 'left', cellPadding: { top: 2, right: 4, bottom: 2, left: 6 },
        } },
        { content: fmtRp(it.subtotal), styles: {
          fillColor: SUBROW_BG, textColor: [40, 40, 40], fontSize: 7.5,
          halign: 'right', fontStyle: 'bold',
        } },
      ]);
    });
  });

  autoTable(doc, {
    startY: 26,
    head: [['No', 'No. Nota', 'Tgl', 'Customer', 'Saluran', 'Total', 'Metode', 'Bayar', 'Status']],
    body: bodyRows,
    theme: 'grid',
    headStyles: { fillColor: [0, 122, 255], textColor: 255, fontStyle: 'bold', fontSize: 9, halign: 'center' },
    bodyStyles: { fontSize: 9, valign: 'middle' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      1: { fontStyle: 'bold', textColor: [0, 122, 255], cellWidth: 38 },
      2: { cellWidth: 22 },
      3: { cellWidth: 55 },
      4: { halign: 'center', cellWidth: 20 },
      5: { halign: 'right', cellWidth: 30, fontStyle: 'bold' },
      6: { cellWidth: 22 },
      7: { halign: 'center', cellWidth: 24 },
      8: { halign: 'center', cellWidth: 17 },
    },
    didParseCell: (data) => {
      // Style Bayar column (only for main rows where cell is plain string, not sub-row object)
      if (data.column.index === 7 && data.section === 'body' && typeof data.cell.raw === 'string') {
        data.cell.styles.textColor = data.cell.raw === 'Lunas' ? [52, 199, 89] : [255, 59, 48];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // ─── Footer: Grand Total ────────────────────────────────────────────
  const grandTotal = orders.reduce((s, o) => s + (parseFloat(o.total) || 0), 0);
  const paidTotal = orders.filter(o => o.payment_status === 'paid').reduce((s, o) => s + (parseFloat(o.total) || 0), 0);
  const unpaidTotal = grandTotal - paidTotal;
  const finalY = doc.lastAutoTable.finalY + 8;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(`GRAND TOTAL: ${fmtRp(grandTotal)}`, 14, finalY);

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(
    `Lunas: ${fmtRp(paidTotal)}   |   Belum Bayar: ${fmtRp(unpaidTotal)}   |   Avg per nota: ${fmtRp(grandTotal / orders.length)}`,
    14, finalY + 6
  );

  // ─── Save ───────────────────────────────────────────────────────────
  const filename = `laporan-nota-${new Date().toISOString().split('T')[0]}-${orders.length}items.pdf`;
  doc.save(filename);
  return filename;
};
