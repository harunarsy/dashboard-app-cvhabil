// Generate PDF Laporan Ringkasan Nota Penjualan (multi-select bulk export, v1.7.0)
// Landscape A4, tabel agregat + Grand Total + filter info footer
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
  doc.text(`Laporan Nota Penjualan — ${companyName}`, 14, 15);

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  const metaParts = [];
  if (dateRange) metaParts.push(`Periode: ${dateRange}`);
  if (filterInfo) metaParts.push(`Filter: ${filterInfo}`);
  metaParts.push(`Generated: ${fmtDate(new Date())}`);
  metaParts.push(`Total: ${orders.length} nota`);
  doc.text(metaParts.join(' · '), 14, 21);

  // ─── Table ──────────────────────────────────────────────────────────
  const tableData = orders.map((o, i) => [
    i + 1,
    o.order_number,
    fmtDate(o.sale_date),
    o.customer_name || '-',
    o.channel === 'online' ? '🛒 Online' : '🏪 Offline',
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
  doc.text(`✅ Lunas: ${fmtRp(paidTotal)} · ❌ Belum Bayar: ${fmtRp(unpaidTotal)} · Avg per nota: ${fmtRp(grandTotal / orders.length)}`, 14, finalY + 6);

  // ─── Save ───────────────────────────────────────────────────────────
  const filename = `laporan-nota-${new Date().toISOString().split('T')[0]}-${orders.length}items.pdf`;
  doc.save(filename);
  return filename;
};
