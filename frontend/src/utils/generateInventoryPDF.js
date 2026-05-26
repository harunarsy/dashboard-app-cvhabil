// Generate PDF Template Opname Inventory (v1.8.5)
// Landscape A4 — list produk dgn kolom Stok Fisik / Selisih / Catatan kosong
// Untuk dicetak → user coret-coret di kertas saat opname → balik input ke app.
// NOTE: jsPDF helvetica = ASCII only — JANGAN pakai emoji.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

export const generateInventoryPDF = (products, options = {}) => {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('Tidak ada produk untuk di-export');
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const { settings = {} } = options;
  const companyName = settings.company_name || settings.shop_name || 'CV HABIL SEJAHTERA BERSAMA';
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const accentColor = [0, 122, 255];

  // ─── Header ─────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.setTextColor(...accentColor);
  doc.text(companyName, margin, margin + 4);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text('TEMPLATE STOK OPNAME', pageWidth - margin, margin + 4, { align: 'right' });

  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  const meta = [
    `Tanggal Cetak: ${fmtDate(new Date())}`,
    `Total Produk: ${products.length}`,
    `Total Stok Sistem: ${products.reduce((s, p) => s + (parseFloat(p.total_stock) || 0), 0)}`,
  ];
  doc.text(meta.join('  |  '), margin, margin + 10);

  // Divider
  doc.setDrawColor(...accentColor);
  doc.setLineWidth(0.4);
  doc.line(margin, margin + 13, pageWidth - margin, margin + 13);

  // ─── Tabel Template ─────────────────────────────────────────────────
  const head = [[
    'No', 'Kode', 'Nama Produk', 'Satuan',
    'Stok Sistem', 'ED Terdekat',
    'Stok Fisik', 'Selisih', 'Catatan',
  ]];

  const body = products.map((p, i) => [
    i + 1,
    p.code || '-',
    p.name || '-',
    p.unit || 'pcs',
    p.total_stock != null ? String(p.total_stock) : '0',
    p.nearest_expiry ? fmtDate(p.nearest_expiry) : '-',
    '', // Stok Fisik — kosong
    '', // Selisih — kosong
    '', // Catatan — kosong
  ]);

  autoTable(doc, {
    startY: margin + 16,
    head,
    body,
    theme: 'grid',
    headStyles: {
      fillColor: accentColor,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'center',
      cellPadding: 2,
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: 2,
      minCellHeight: 8, // ruang cukup buat tulisan tangan
      lineColor: [200, 200, 200],
      lineWidth: 0.1,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'left', cellWidth: 22 },
      2: { halign: 'left', cellWidth: 70 },
      3: { halign: 'center', cellWidth: 16 },
      4: { halign: 'center', cellWidth: 22 },
      5: { halign: 'center', cellWidth: 26 },
      6: { halign: 'center', cellWidth: 26, fillColor: [250, 250, 250] },
      7: { halign: 'center', cellWidth: 22, fillColor: [250, 250, 250] },
      8: { halign: 'left', fillColor: [250, 250, 250] },
    },
    margin: { left: margin, right: margin },
    didDrawPage: (data) => {
      // Footer per page
      const pageCount = doc.internal.getNumberOfPages();
      const pageNum = data.pageNumber;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text(`Halaman ${pageNum} dari ${pageCount}`, pageWidth / 2, pageHeight - 5, { align: 'center' });

      // Signature line di footer last page
      if (pageNum === pageCount) {
        const sigY = pageHeight - 18;
        doc.setFontSize(8); doc.setTextColor(60, 60, 60);
        doc.text('Diperiksa oleh:', margin, sigY);
        doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.2);
        doc.line(margin + 28, sigY, margin + 78, sigY);
        doc.text('Disetujui oleh:', pageWidth - margin - 80, sigY);
        doc.line(pageWidth - margin - 52, sigY, pageWidth - margin, sigY);
      }
    },
  });

  return doc;
};
