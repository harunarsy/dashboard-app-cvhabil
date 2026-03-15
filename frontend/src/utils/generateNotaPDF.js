import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmtRp = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);

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
    const raw = options.settings || {};
    const settings = {
      company_name: raw.company_name || raw.shop_name || 'CV HABIL SEJAHTERA BERSAMA',
      address: raw.address || '',
      phone: raw.phone || '',
      footer_text: raw.footer_text || raw.footer || 'Dokumen ini dicetak secara otomatis oleh Dashboard CV Habil'
    };
    const { format = 'A4', type = 'nota' } = options;

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
  console.log('[generateNotaPDF] Header - company_name:', settings.company_name, 'coordinates:', margin, margin + 5);
  doc.text(String(settings.company_name || 'CV HABIL SEJAHTERA BERSAMA'), margin, margin + 5);
  let headerY = margin + 11;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(baseFontSize - 1);
  doc.setTextColor(80, 80, 80);
  if (settings.address && String(settings.address).trim()) {
    doc.text(String(settings.address).trim(), margin, headerY);
    headerY += 6;
  }
  if (settings.phone && String(settings.phone).trim()) {
    doc.text(String(settings.phone).trim(), margin, headerY);
    headerY += 6;
  }

  // Doc Info (Top Right)
  const infoX = pageWidth - margin;
  const docTitle = type === 'terima' ? 'TANDA TERIMA' : 'NOTA PENJUALAN';
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(baseFontSize + 2);
  doc.setTextColor(0);
  // Pushing title slightly higher or on its own line if it's small paper
  const titleY = isA6 ? margin + 4 : margin + 5;
  console.log('[generateNotaPDF] Title - docTitle:', docTitle, 'infoX:', infoX, 'titleY:', titleY);
  doc.text(docTitle, infoX, titleY, { align: 'right' });
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(baseFontSize - 1.5); // Smaller info text
  doc.setTextColor(60, 60, 60);
  console.log('[generateNotaPDF] Order number:', order.order_number, 'coordinates:', infoX, titleY + 5);
  doc.text(`No: ${String(order.order_number || '-')}`, infoX, titleY + 5, { align: 'right' });
  const saleDateStr = order.sale_date 
    ? new Date(order.sale_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) 
    : '-';
  doc.text(saleDateStr, infoX, titleY + 9, { align: 'right' });

  // Blue Line Divider (below header, min margin+22)
  const dividerY = Math.max(margin + 22, headerY + 4);
  doc.setDrawColor(...accentColor);
  doc.setLineWidth(0.4);
  doc.line(margin, dividerY, pageWidth - margin, dividerY);

  // ─── Customer & Payment ───────────────────────────────────────────────
  const customerY = dividerY + 7;
  doc.setFontSize(baseFontSize);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'normal');
  doc.text('Kepada Yth:', margin, customerY);
  doc.setFont('helvetica', 'bold');
  doc.text(String(order.customer_name || '-'), margin + (isA6 ? 18 : 22), customerY);

  // Customer address & phone (only if non-empty)
  let addressY = customerY;
  if (order.customer_address && String(order.customer_address).trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(baseFontSize - 2);
    doc.setTextColor(80, 80, 80);
    addressY += isA6 ? 4 : 5;
    doc.text(String(order.customer_address).trim(), margin + (isA6 ? 18 : 22), addressY);
  }
  if (order.customer_phone && String(order.customer_phone).trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(baseFontSize - 2);
    doc.setTextColor(80, 80, 80);
    addressY += isA6 ? 4 : 5;
    doc.text(`Telp: ${String(order.customer_phone).trim()}`, margin + (isA6 ? 18 : 22), addressY);
  }
  const tableStartY = addressY + (isA6 ? 5 : 6);

  // Payment Method info
  if (type !== 'terima') {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(baseFontSize);
    doc.text(`Metode: ${String(order.payment_method || 'Tunai')}`, infoX, customerY, { align: 'right' });
  }

  // ─── Table ────────────────────────────────────────────────────────────
  const items = order.items || [];
  let tableData = items.map((item, index) => {
    if (type === 'terima') {
      return [index + 1, item.product_name, item.qty || 0, item.unit || 'pcs'];
    }
    return [
      index + 1, 
      item.product_name, 
      item.qty || 0, 
      fmtRp(item.unit_price), 
      fmtRp((item.qty || 0) * (item.unit_price || 0))
    ];
  });

  const tableHead = type === 'terima' 
    ? [['No', 'Nama Barang', 'Qty', 'Satuan']]
    : [['No', 'Nama Barang', 'Qty', 'Harga Satuan', 'Total']];

  autoTable(doc, {
    startY: tableStartY,
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
  console.log('[generateNotaPDF] Summary section - lastAutoTable:', doc.lastAutoTable);
  let finalY = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 5 : pageHeight - 80;
  console.log('[generateNotaPDF] Final Y position:', finalY);
  const isNearBottom = finalY > pageHeight - 40;
  if (isNearBottom) { doc.addPage(); finalY = margin + 10; }

  if (type !== 'terima') {
    doc.setFontSize(baseFontSize);
    doc.setFont('helvetica', 'bold');
    console.log('[generateNotaPDF] Grand total - value:', order.total, 'coordinates:', pageWidth - margin, finalY);
    doc.text(`GRAND TOTAL: ${fmtRp(order.total || 0)}`, pageWidth - margin, finalY, { align: 'right' });
    
    // Terbilang
    finalY += 5;
    doc.setFontSize(baseFontSize - 2);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100);
    const words = (angkaKeTerbilang(order.total || 0) + " Rupiah").trim();
    console.log('[generateNotaPDF] Terbilang text:', words);
    doc.text(`Terbilang: ${words}`, margin, finalY);
    finalY += (isA6 ? 4 : 6);
  }

  if (order.notes) {
    doc.setFontSize(baseFontSize - 2);
    doc.setTextColor(120);
    console.log('[generateNotaPDF] Notes:', order.notes);
    doc.text(`Catatan: ${String(order.notes || '')}`, margin, finalY);
  }

  // ─── Signatures ───────────────────────────────────────────────────────
  const sigY = pageHeight - (isA6 ? 22 : 28);
  doc.setFontSize(baseFontSize - 1);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'normal');
  
  // Left: Customer
  doc.text('Penerima,', margin + (isA6 ? 15 : 20), sigY, { align: 'center' });
  doc.line(margin, sigY + (isA6 ? 10 : 15), margin + (isA6 ? 30 : 45), sigY + (isA6 ? 10 : 15));
  doc.text('(                          )', margin + (isA6 ? 15 : 20), sigY + (isA6 ? 15 : 20), { align: 'center' });

  // Right: Company
  const rightSigX = pageWidth - margin - (isA6 ? 15 : 20);
  doc.line(pageWidth - margin - (isA6 ? 30 : 45), sigY + (isA6 ? 10 : 15), pageWidth - margin, sigY + (isA6 ? 10 : 15));
  doc.text(String(settings.company_name || ''), rightSigX, sigY + (isA6 ? 15 : 20), { align: 'center' });

  // ─── Footer ───────────────────────────────────────────────────────────
  doc.setFontSize(isA6 ? 5 : 6);
  doc.setTextColor(180);
  doc.text(String(settings.footer_text || ''), pageWidth / 2, pageHeight - 4, { align: 'center' });

    console.log('[generateNotaPDF] PDF generated successfully');
    return doc;
  } catch (error) {
    console.error('[generateNotaPDF] ERROR:', error.message, error.stack);
    throw error;
  }
}
