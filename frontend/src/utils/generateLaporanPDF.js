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
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

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

  // ─── Tabel Ringkasan ────────────────────────────────────────────────
  const tableData = orders.map((o, i) => [
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

  autoTable(doc, {
    startY: 26,
    head: [['No', 'No. Nota', 'Tgl', 'Customer', 'Saluran', 'Total', 'Metode', 'Bayar', 'Status']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [0, 122, 255], textColor: 255, fontStyle: 'bold', fontSize: 9, halign: 'center' },
    bodyStyles: { fontSize: 9, valign: 'middle' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { fontStyle: 'bold', textColor: [0, 122, 255], cellWidth: 32 },
      2: { cellWidth: 24 },
      3: { cellWidth: 60 },
      4: { halign: 'center', cellWidth: 22 },
      5: { halign: 'right', cellWidth: 32, fontStyle: 'bold' },
      6: { cellWidth: 22 },
      7: { halign: 'center', cellWidth: 24 },
      8: { halign: 'center', cellWidth: 18 },
    },
    didParseCell: (data) => {
      if (data.column.index === 7 && data.section === 'body') {
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

  // ─── Detail Items per Nota (v1.7.0 fix request) ────────────────────
  doc.addPage();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text('DETAIL ITEMS PER NOTA', 14, 15);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`Rincian barang, harga, dan HPP setiap nota (${orders.length} nota)`, 14, 21);

  let cursorY = 28;
  const ensureSpace = (needed) => {
    if (cursorY + needed > pageH - 14) {
      doc.addPage();
      cursorY = 15;
    }
  };

  orders.forEach((o, oi) => {
    const items = Array.isArray(o.items) ? o.items : [];
    ensureSpace(items.length > 0 ? 12 + items.length * 5.5 + 10 : 14);

    // Header per nota
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.setTextColor(0, 122, 255);
    doc.text(`${oi + 1}. ${o.order_number}`, 14, cursorY);
    doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(`${o.customer_name || '-'}  |  ${fmtDate(o.sale_date)}  |  ${o.payment_method || '-'}  |  ${o.payment_status === 'paid' ? 'LUNAS' : 'BELUM BAYAR'}`, 50, cursorY);
    cursorY += 4;

    if (items.length > 0) {
      const itemRows = items.map((it, ii) => {
        const qtyShow = it.qty_in_unit !== undefined && it.qty_in_unit !== null
          ? parseFloat(it.qty_in_unit)
          : (it.qty || 0);
        return [
          ii + 1,
          it.product_name || '-',
          qtyShow,
          it.unit || 'pcs',
          fmtRp(it.unit_hpp),
          fmtRp(it.unit_price),
          fmtRp(it.subtotal),
        ];
      });

      autoTable(doc, {
        startY: cursorY,
        head: [['#', 'Produk', 'Qty', 'Satuan', 'HPP', 'Harga', 'Subtotal']],
        body: itemRows,
        theme: 'striped',
        headStyles: { fillColor: [240, 240, 240], textColor: 60, fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8, valign: 'middle' },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 90 },
          2: { cellWidth: 16, halign: 'right' },
          3: { cellWidth: 20 },
          4: { cellWidth: 30, halign: 'right' },
          5: { cellWidth: 30, halign: 'right' },
          6: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
        },
        margin: { left: 14, right: 14 },
      });
      cursorY = doc.lastAutoTable.finalY + 3;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.text(`Total Nota: ${fmtRp(o.total)}`, pageW - 14, cursorY, { align: 'right' });
      cursorY += 8;
    } else {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text('(Tidak ada items terdata di nota ini)', 14, cursorY + 3);
      doc.setTextColor(0, 0, 0);
      cursorY += 8;
    }
  });

  // ─── Save ───────────────────────────────────────────────────────────
  const filename = `laporan-nota-${new Date().toISOString().split('T')[0]}-${orders.length}items.pdf`;
  doc.save(filename);
  return filename;
};
