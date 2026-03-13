import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function generateSPPDF(order, options = {}) {
  const {
    format = 'A6',
    salesmanInfo = {},
    settings = {
      company_name: 'CV. HABIL SEJAHTERA BERSAMA',
      footer_text: 'Dokumen dicetak otomatis oleh Habil SuperApp'
    }
  } = options;

  // A6 by default, standard is Portrait for Blue Area SP? Actually Landscape is wider for tables.
  // We'll use landscape for A6 to fit the table better
  const doc = new jsPDF('p', 'mm', format.toLowerCase());
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const isA6 = format.toUpperCase() === 'A6';
  
  const baseFontSize = isA6 ? 8 : 10;
  const margin = isA6 ? 8 : 12;
  const accentColor = [0, 122, 255]; // Classic Blue

  // ─── Header Section ───────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(baseFontSize + 4);
  doc.setTextColor(...accentColor);
  doc.text(settings.company_name, pageWidth / 2, margin + 5, { align: 'center' });
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(baseFontSize + 2);
  doc.setTextColor(0);
  doc.text('SURAT PESANAN', pageWidth / 2, margin + 12, { align: 'center' });

  // Blue Line Divider
  doc.setDrawColor(...accentColor);
  doc.setLineWidth(0.5);
  doc.line(margin, margin + 16, pageWidth - margin, margin + 16);

  // ─── Metadata & Info ──────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(baseFontSize);
  doc.setTextColor(30);

  // Kiri: Distributor Info
  const startYInfo = margin + 22;
  doc.text('Kepada Yth:', margin, startYInfo);
  doc.setFont('helvetica', 'bold');
  doc.text(order.distributor_name, margin, startYInfo + 5);
  doc.setFont('helvetica', 'normal');
  
  if (salesmanInfo.salesman_name) {
    doc.text(`Up: ${salesmanInfo.salesman_name}`, margin, startYInfo + 10);
  }
  if (salesmanInfo.salesman_phone) {
    doc.text(`Telp: ${salesmanInfo.salesman_phone}`, margin, startYInfo + 14);
  }

  // Kanan: SP Number & Date
  const infoX = pageWidth - margin;
  doc.text(`No. SP: ${order.po_number}`, infoX, startYInfo, { align: 'right' });
  const dateStr = order.order_date ? new Date(order.order_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
  doc.text(`Tanggal: ${dateStr}`, infoX, startYInfo + 5, { align: 'right' });
  if (order.expected_date) {
    const expDate = new Date(order.expected_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    doc.text(`Est. Tiba: ${expDate}`, infoX, startYInfo + 10, { align: 'right' });
  }

  // ─── Table ────────────────────────────────────────────────────────────
  const items = order.items || [];
  let tableData = items.map((item, index) => {
    return [
      index + 1, 
      item.product_name, 
      item.qty || 0, 
      item.unit || 'pcs',
      item.keterangan || '-' // If there's no keterangan on item, just '-'
    ];
  });

  const tableHead = [['No', 'Nama Barang', 'Qty', 'Satuan', 'Keterangan']];

  autoTable(doc, {
    startY: startYInfo + 18,
    head: tableHead,
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: accentColor,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: baseFontSize - 1,
      halign: 'center',
    },
    styles: { 
      fontSize: baseFontSize - 1, 
      cellPadding: isA6 ? 1.5 : 2 
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: isA6 ? 8 : 10 },
      2: { halign: 'center', cellWidth: isA6 ? 12 : 15 },
      3: { halign: 'center', cellWidth: isA6 ? 15 : 20 },
    },
    margin: { left: margin, right: margin },
  });

  // ─── Footer & Signatures ──────────────────────────────────────────────
  let finalY = doc.lastAutoTable.finalY + 8;
  
  if (order.notes) {
    doc.setFontSize(baseFontSize - 1);
    doc.setTextColor(100);
    doc.text(`Catatan: ${order.notes}`, margin, finalY);
    finalY += 8;
  }

  // Signature Area (Bottom Right)
  const sigY = Math.max(finalY + 10, pageHeight - 35);
  doc.setFontSize(baseFontSize);
  doc.setTextColor(0);
  doc.text('Hormat Kami,', pageWidth - margin - 20, sigY, { align: 'center' });
  
  // Stamp Space
  doc.setDrawColor(200);
  doc.setLineDashPattern([1, 1], 0);
  // Optional: A small guide for stamp if needed, or just leave blank space.
  
  doc.setLineDashPattern([], 0);
  doc.line(pageWidth - margin - 40, sigY + 20, pageWidth - margin, sigY + 20);
  
  const picName = order.pic_name || 'Harun Al Rasyid';
  doc.setFont('helvetica', 'bold');
  doc.text(picName, pageWidth - margin - 20, sigY + 24, { align: 'center' });

  // Global Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(isA6 ? 5 : 6);
  doc.setTextColor(180);
  doc.text(settings.footer_text, pageWidth / 2, pageHeight - 4, { align: 'center' });

  return doc;
}
