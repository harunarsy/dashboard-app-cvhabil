// Generate PDF Laporan Ringkasan Nota Penjualan (multi-select bulk export, v1.7.0)
// Landscape A4, tabel agregat + Grand Total + detail items per nota
// NOTE: jsPDF helvetica = ASCII only — JANGAN pakai emoji (render gibberish + break letter spacing)
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmtRp = (n, decimals = 0) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n || 0);
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

  // ─── Tabel Ringkasan + Inline Item Sub-rows (v1.7.1: layout structured columns) ─
  // Per request: items detail INLINE + tampilan lebih clean (column-aligned, bukan 1 line wrap)
  // Sub-row pakai 5 cells distinct: empty(3) | produk | qty | harga | HPP(colSpan2) | subtotal
  const SUBROW_BG = [248, 249, 252];
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
    const items = Array.isArray(o.items) ? o.items : [];
    items.forEach(it => {
      const qtyShow = it.qty_in_unit !== undefined && it.qty_in_unit !== null
        ? parseFloat(it.qty_in_unit)
        : (it.qty || 0);
      const unit = it.unit || 'pcs';
      const hppStr = parseFloat(it.unit_hpp) > 0 ? `HPP/pcs (inc PPN): ${fmtRp(it.unit_hpp, 2)}` : '';
      const subStyle = { fillColor: SUBROW_BG, fontSize: 8 };
      bodyRows.push([
        { content: '', styles: subStyle },
        { content: '', styles: subStyle },
        { content: '', styles: subStyle },
        { content: it.product_name || '-', styles: {
          ...subStyle, textColor: [40, 40, 40], halign: 'left',
          cellPadding: { top: 2.5, right: 4, bottom: 2.5, left: 8 },
        } },
        { content: `${qtyShow} ${unit}`, styles: {
          ...subStyle, textColor: [80, 80, 80], halign: 'center',
        } },
        { content: fmtRp(it.unit_price), styles: {
          ...subStyle, textColor: [80, 80, 80], halign: 'right',
        } },
        { content: hppStr, colSpan: 2, styles: {
          ...subStyle, fontSize: 7.5, textColor: [140, 140, 140], halign: 'right', fontStyle: 'italic',
        } },
        { content: fmtRp(it.subtotal), styles: {
          ...subStyle, textColor: [0, 122, 255], halign: 'right', fontStyle: 'bold',
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
      0: { halign: 'center', cellWidth: 8 },
      1: { fontStyle: 'bold', textColor: [0, 122, 255], cellWidth: 38 },
      2: { cellWidth: 20 },
      3: { cellWidth: 50 },
      4: { halign: 'center', cellWidth: 22 },
      5: { halign: 'right', cellWidth: 28, fontStyle: 'bold' },
      6: { halign: 'center', cellWidth: 22 },
      7: { halign: 'center', cellWidth: 22 },
      8: { halign: 'center', cellWidth: 30 },
    },
    didParseCell: (data) => {
      // Style Bayar column (only for main rows where cell.raw is string)
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
