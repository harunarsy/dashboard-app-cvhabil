// Generate PDF Berita Acara Stok Opname (v1.10.5)
// Landscape A4 — hasil opname: hanya batch yang berubah (Sistem vs Fisik + Selisih).
// Dicetak sbg bukti/arsip setelah opname disimpan.
// NOTE: jsPDF helvetica = ASCII only — JANGAN pakai emoji.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

// rows: [{ code, product_name, batch_no, expired_date, qty_current, physical_qty, notes }]
export const generateOpnamePDF = (rows, options = {}) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Tidak ada perubahan opname untuk di-export');
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
  doc.text('BERITA ACARA STOK OPNAME', pageWidth - margin, margin + 4, { align: 'right' });

  const totalSelisih = rows.reduce((s, r) => s + ((parseInt(r.physical_qty) || 0) - (parseInt(r.qty_current) || 0)), 0);
  const productCount = new Set(rows.map(r => r.product_name)).size;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  const meta = [
    `Tanggal: ${fmtDate(new Date())}`,
    `Produk Berubah: ${productCount}`,
    `Batch Berubah: ${rows.length}`,
    `Total Selisih: ${totalSelisih > 0 ? '+' : ''}${totalSelisih}`,
  ];
  doc.text(meta.join('  |  '), margin, margin + 10);

  // Divider
  doc.setDrawColor(...accentColor);
  doc.setLineWidth(0.4);
  doc.line(margin, margin + 14, pageWidth - margin, margin + 14);

  // ─── Tabel ──────────────────────────────────────────────────────────
  const head = [[
    'No', 'Kode', 'Nama Produk', 'No. Batch', 'ED',
    'Stok Sistem', 'Stok Fisik', 'Selisih', 'Catatan',
  ]];

  const body = rows.map((r, i) => {
    const sys = parseInt(r.qty_current) || 0;
    const fis = parseInt(r.physical_qty) || 0;
    const sel = fis - sys;
    return [
      i + 1,
      r.code || '-',
      r.product_name || '-',
      r.batch_no || '(kosong)',
      r.expired_date ? fmtDate(r.expired_date) : '(kosong)',
      String(sys),
      String(fis),
      `${sel > 0 ? '+' : ''}${sel}`,
      r.notes || '',
    ];
  });

  autoTable(doc, {
    startY: margin + 18,
    head,
    body,
    theme: 'grid',
    headStyles: { fillColor: accentColor, textColor: 255, fontStyle: 'bold', fontSize: 8.5, halign: 'center', cellPadding: 2 },
    bodyStyles: { fontSize: 8, cellPadding: 2, minCellHeight: 7, lineColor: [200, 200, 200], lineWidth: 0.1 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      1: { halign: 'left', cellWidth: 20 },
      2: { halign: 'left', cellWidth: 58 },
      3: { halign: 'left', cellWidth: 28 },
      4: { halign: 'center', cellWidth: 22 },
      5: { halign: 'center', cellWidth: 22 },
      6: { halign: 'center', cellWidth: 22 },
      7: { halign: 'center', cellWidth: 18 },
      8: { halign: 'left' },
    },
    margin: { left: margin, right: margin, bottom: 38 },
  });

  // ─── Footer: page# + tanda tangan ───────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
  }

  doc.setPage(totalPages);
  const sigLabelY = pageHeight - 31;
  const sigLineY = sigLabelY + 11;
  doc.setFontSize(8); doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'normal');
  doc.text('Diperiksa oleh:', margin, sigLabelY);
  doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.2);
  doc.line(margin + 28, sigLineY, margin + 95, sigLineY);
  doc.text('Disetujui oleh:', pageWidth - margin - 95, sigLabelY);
  doc.line(pageWidth - margin - 65, sigLineY, pageWidth - margin, sigLineY);

  return doc;
};
