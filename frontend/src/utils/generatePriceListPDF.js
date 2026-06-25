import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmtRp = (n) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0,
}).format(n || 0);

const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
  : '';

// Daftar Harga A4 portrait — dokumen keluar (customer-facing): TANPA HPP/margin.
// rows: [{ code, name, base_unit, price, pack_unit, pack_size, pack_price }]
export function generatePriceListPDF(rows, options = {}) {
  const { settings = {}, effectiveDate = null } = options;
  const companyName = settings.company_name || settings.shop_name || 'CV HABIL SEJAHTERA BERSAMA';
  const npwp = settings.npwp || '93.813.949.0-609.000';
  const address = settings.address || '';
  const phone = settings.phone || '';

  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const accentColor = [0, 122, 255];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...accentColor);
  doc.text(String(companyName), pageWidth / 2, margin + 4, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  doc.text(`NPWP: ${npwp}`, pageWidth / 2, margin + 9, { align: 'center' });
  if (address) doc.text(String(address), pageWidth / 2, margin + 13.5, { align: 'center' });
  if (phone) doc.text(String(phone), pageWidth / 2, margin + 18, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.text('DAFTAR HARGA', pageWidth / 2, margin + 25, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  const effStr = effectiveDate ? fmtDate(effectiveDate) : fmtDate(new Date());
  doc.text(`Berlaku per: ${effStr}`, pageWidth / 2, margin + 30, { align: 'center' });

  doc.setDrawColor(...accentColor);
  doc.setLineWidth(0.5);
  doc.line(margin, margin + 33, pageWidth - margin, margin + 33);

  const tableData = rows.map((r, i) => {
    const base = r.base_unit || 'pcs';
    const eceran = `${fmtRp(r.price)} / ${base}`;
    // Isi/Karton + Harga/Karton dibuat kolom terpisah (jelas dibaca customer).
    const hasPack = r.pack_size > 1 && r.pack_unit;
    const isiKarton = hasPack ? `${r.pack_size} ${base}` : '-';
    const hargaKarton = r.pack_price > 0 && hasPack ? fmtRp(r.pack_price) : '-';
    return [i + 1, r.code || '-', r.name, eceran, isiKarton, hargaKarton];
  });

  autoTable(doc, {
    startY: margin + 37,
    head: [['No', 'Kode', 'Nama Produk', 'Harga Eceran', 'Isi/Karton', 'Harga/Karton']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: accentColor, textColor: 255, fontStyle: 'bold',
      fontSize: 8.5, halign: 'center', lineWidth: 0,
    },
    bodyStyles: { lineWidth: 0, fillColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 248, 250] },
    styles: { fontSize: 8.5, cellPadding: 1.6, lineWidth: 0 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      1: { cellWidth: 28, fontStyle: 'bold' },
      3: { halign: 'right', cellWidth: 33 },
      4: { halign: 'center', cellWidth: 22 },
      5: { halign: 'right', cellWidth: 33 },
    },
    margin: { left: margin, right: margin },
    didDrawPage: () => {
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(7.5);
      doc.setTextColor(150, 150, 150);
      doc.setFont('helvetica', 'normal');
      doc.text(
        'Harga dapat berubah sewaktu-waktu tanpa pemberitahuan. dengan senang hati melayani anda',
        pageWidth / 2, pageHeight - 8, { align: 'center' },
      );
    },
  });

  return doc;
}
