// Generate PDF Template Opname Inventory (v1.8.5; v1.10.3 per-batch)
// Landscape A4 — list PER-BATCH (No.Batch + ED per baris) dgn kolom Stok Fisik / Selisih / Catatan kosong.
// Batch/ED kosong tampil "(kosong)" → petugas isi tangan saat opname → balik input ke app.
// Input `rows`: [{ product_id, code, name, unit, batch_id, batch_no, expired_date, qty_current }] (1 baris per batch; produk tanpa batch = 1 baris batch null).
// NOTE: jsPDF helvetica = ASCII only — JANGAN pakai emoji.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '(kosong)';

export const generateInventoryPDF = (rows, options = {}) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Tidak ada produk untuk di-export');
  }
  const productIds = new Set(rows.map(r => r.product_id));

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
  doc.text('STOK OPNAME', pageWidth - margin, margin + 4, { align: 'right' });

  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  const meta = [
    `Total Produk: ${productIds.size}`,
    `Total Baris Batch: ${rows.length}`,
    `Total Stok Sistem: ${rows.reduce((s, r) => s + (parseFloat(r.qty_current) || 0), 0)}`,
  ];
  doc.text(meta.join('  |  '), margin, margin + 10);

  // Tanggal opname (untuk diisi tangan)
  doc.setFontSize(9); doc.setTextColor(0, 0, 0);
  doc.text('Tanggal Opname:', margin, margin + 16);
  doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.3);
  doc.line(margin + 30, margin + 16, margin + 90, margin + 16);

  // Divider
  doc.setDrawColor(...accentColor);
  doc.setLineWidth(0.4);
  doc.line(margin, margin + 19, pageWidth - margin, margin + 19);

  // ─── Tabel Template ─────────────────────────────────────────────────
  const head = [[
    'No', 'Kode', 'Nama Produk', 'Satuan', 'No. Batch', 'ED',
    'Stok Sistem', 'Stok Fisik', 'Selisih', 'Catatan',
  ]];

  const body = rows.map((r, i) => [
    i + 1,
    r.code || '-',
    r.name || '-',
    r.unit || 'pcs',
    r.batch_no || '(kosong)',
    r.expired_date ? fmtDate(r.expired_date) : '(kosong)',
    r.qty_current != null ? String(r.qty_current) : '0',
    '', // Stok Fisik — kosong (diisi tangan)
    '', // Selisih — kosong
    '', // Catatan — kosong
  ]);

  autoTable(doc, {
    startY: margin + 22,
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
      0: { halign: 'center', cellWidth: 9 },
      1: { halign: 'left', cellWidth: 20 },
      2: { halign: 'left', cellWidth: 58 },
      3: { halign: 'center', cellWidth: 14 },
      4: { halign: 'left', cellWidth: 28 },
      5: { halign: 'center', cellWidth: 22 },
      6: { halign: 'center', cellWidth: 20 },
      7: { halign: 'center', cellWidth: 22, fillColor: [250, 250, 250] },
      8: { halign: 'center', cellWidth: 18, fillColor: [250, 250, 250] },
      9: { halign: 'left', fillColor: [250, 250, 250] },
    },
    // v1.8.5.1: bottom margin 28mm reserve buat sig + page# (auto-paginate kalau row gak fit)
    margin: { left: margin, right: margin, bottom: 28 },
  });

  // v1.8.5.1: post-loop render — page# pakai actual final pageCount + sig HANYA di last page bottom
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
  }

  // Sig di last page bottom (positioned aman karena autoTable reserve bottom 28mm)
  doc.setPage(totalPages);
  const sigY = pageHeight - 16;
  doc.setFontSize(8); doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'normal');
  doc.text('Diperiksa oleh:', margin, sigY);
  doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.2);
  doc.line(margin + 28, sigY, margin + 95, sigY);
  doc.text('Disetujui oleh:', pageWidth - margin - 95, sigY);
  doc.line(pageWidth - margin - 65, sigY, pageWidth - margin, sigY);

  return doc;
};
