import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MONO } from './salesDocumentTheme';

// Lebar kolom tabel nota resmi A4. Kolom nama barang dibiarkan auto agar
// ruang sisa jatuh ke sana.
const TABLE_COLUMN_STYLES = {
  withDiscount: {
    0: { halign: 'center', cellWidth: 10 },
    2: { halign: 'center', cellWidth: 16 },
    3: { halign: 'center', cellWidth: 16 },
    4: { halign: 'right', cellWidth: 30 },
    5: { halign: 'right', cellWidth: 22 },
    6: { halign: 'right', cellWidth: 32 },
  },
  withoutDiscount: {
    0: { halign: 'center', cellWidth: 10 },
    2: { halign: 'center', cellWidth: 16 },
    3: { halign: 'center', cellWidth: 16 },
    4: { halign: 'right', cellWidth: 30 },
    5: { halign: 'right', cellWidth: 32 },
  },
  // A6 (spec §8): satuan digabung ke qty → tanpa kolom Satuan/Diskon.
  // No | Nama Barang | Qty | Harga Satuan | Jumlah.
  compact: {
    0: { halign: 'center', cellWidth: 8 },
    2: { halign: 'center', cellWidth: 18 },
    3: { halign: 'right', cellWidth: 26 },
    4: { halign: 'right', cellWidth: 28 },
  },
};

const PT_TO_MM = 1 / 2.83465;
const NAME_COLUMN_INDEX = 1;

export function buildTableStyles(profile, { withDiscount = false } = {}) {
  const tableFontSize = profile.tableFontSize ?? profile.baseFontSize - 1.5;
  const styles = {
    theme: 'grid',
    headStyles: {
      fillColor: MONO.headFill,
      textColor: MONO.ink,
      fontStyle: 'bold',
      fontSize: tableFontSize,
      halign: 'center',
      lineColor: MONO.rule,
      lineWidth: 0.1,
    },
    bodyStyles: {
      fillColor: MONO.white,
      textColor: MONO.ink,
      lineColor: MONO.rule,
      lineWidth: 0.1,
    },
    alternateRowStyles: { fillColor: MONO.zebra },
    styles: {
      fontSize: tableFontSize,
      cellPadding: profile.tableCellPadding,
      textColor: MONO.ink,
      lineColor: MONO.rule,
      lineWidth: 0.1,
    },
    rowPageBreak: 'avoid',
    columnStyles: profile.tableColumns === 'compact'
      ? TABLE_COLUMN_STYLES.compact
      : (withDiscount ? TABLE_COLUMN_STYLES.withDiscount : TABLE_COLUMN_STYLES.withoutDiscount),
  };

  if (profile.batchMetaMode === 'compact') {
    // Baris metadata Batch/ED (baris kedua sel nama) dicetak ulang dengan font
    // lebih kecil lewat didDrawCell; placeholder spasi menjaga tinggi baris
    // tetap dihitung autoTable sehingga measureTable dan render tetap sinkron.
    const metaFontSize = Math.max(5, tableFontSize - 1.2);
    const metaLineHeight = metaFontSize * 1.15 * PT_TO_MM;
    styles.didParseCell = (data) => {
      if (data.section !== 'body' || data.column.index !== NAME_COLUMN_INDEX) return;
      const lines = Array.isArray(data.cell.text) ? data.cell.text : [];
      if (lines.length < 2) return;
      data.cell.metaText = lines.slice(1);
      data.cell.text = [lines[0], ...lines.slice(1).map(() => ' ')];
    };
    styles.didDrawCell = (data) => {
      const metaText = data.cell.metaText;
      if (!metaText || data.section !== 'body' || data.column.index !== NAME_COLUMN_INDEX) return;
      const bottomY = data.cell.y + data.cell.height - data.cell.padding('bottom');
      data.doc.setFont('helvetica', 'normal');
      data.doc.setFontSize(metaFontSize);
      data.doc.setTextColor(...MONO.faint);
      metaText.forEach((line, index) => {
        const lineY = bottomY - (metaText.length - 1 - index) * metaLineHeight - 0.4;
        data.doc.text(line, data.cell.x + data.cell.padding('left'), lineY);
      });
    };
  }

  return styles;
}

// Port generateNotaPDF.js:441-454 — tinggi baris nyata dari autoTable, diukur
// dengan scratch document supaya tabel tahu kapan harus pecah halaman.
export function measureTable(profile, tableHead, tableBody, options = {}) {
  const withDiscount = options.withDiscount ?? tableHead[0].length >= 7;
  const doc = new jsPDF(profile.orientation, 'mm', profile.paper);
  autoTable(doc, {
    ...buildTableStyles(profile, { withDiscount }),
    head: tableHead,
    body: tableBody,
    startY: 0,
    margin: { top: 0, right: profile.margin, bottom: 0, left: profile.margin },
  });
  const measured = doc.lastAutoTable;
  const headHeight = (measured?.head || []).reduce((height, row) => height + row.height, 0);
  const bodyHeights = (measured?.body || []).map((row) => row.height);
  return { headHeight, bodyHeights };
}

// Port generateNotaPDF.js:456-470. `firstPageCapacity` diterima demi kontrak
// interface; logika porting hanya dibatasi kapasitas halaman terakhir dan
// aturan keseimbangan — halaman pertama dibiarkan auto-paginate oleh autoTable.
export function planTableSplit({ bodyHeights, firstPageCapacity, finalPageCapacity }) {
  let finalRows = 0;
  let finalRowsHeight = 0;
  for (let index = bodyHeights.length - 1; index >= 0; index -= 1) {
    if (finalRowsHeight + bodyHeights[index] > finalPageCapacity) break;
    finalRowsHeight += bodyHeights[index];
    finalRows += 1;
  }
  const balancedFinalRows = Math.min(
    Math.max(finalRows, 1),
    Math.ceil(bodyHeights.length / 2),
  );
  return {
    initialRows: Math.max(0, bodyHeights.length - balancedFinalRows),
    finalRows: balancedFinalRows,
  };
}

// Port generateNotaPDF.js:393-409 versi monokrom. Profil dengan
// `continuationCustomer` (A6, spec §8) menambah baris konteks customer agar
// halaman lanjutan tidak kehilangan identitas penerima.
export function drawContinuationHeader(doc, ctx) {
  const {
    pageWidth, margin, baseFontSize, companyName, orderNumber, title,
    continuationLineY, customerName, showCustomer,
  } = ctx;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(baseFontSize + 1);
  doc.setTextColor(...MONO.ink);
  if (companyName) doc.text(String(companyName), margin, margin + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(baseFontSize);
  doc.setTextColor(...MONO.sub);
  doc.text(`${title} - Lanjutan`, margin, margin + 8);
  if (orderNumber) {
    doc.text(`No: ${orderNumber}`, pageWidth - margin, margin + 4, { align: 'right' });
  }
  doc.text(`Halaman ${doc.getNumberOfPages()}`, pageWidth - margin, margin + 8, { align: 'right' });
  if (showCustomer && customerName) {
    doc.setFontSize(Math.max(5, baseFontSize - 1));
    doc.text(`Kepada: ${customerName}`, margin, continuationLineY - 3.5);
  }

  doc.setDrawColor(...MONO.rule);
  doc.setLineWidth(0.3);
  doc.line(margin, continuationLineY, pageWidth - margin, continuationLineY);
}

// Port generateNotaPDF.js:506-519 — kursor vertikal tail dengan reservasi.
export function createTailFlow(doc, ctx) {
  const flow = {
    y: ctx.startY,
    addPage() {
      doc.addPage();
      if (ctx.onPageAdded) ctx.onPageAdded(doc.getNumberOfPages());
      flow.y = ctx.continuationTableStartY;
      return flow.y;
    },
    ensure(height) {
      if (flow.y + height <= ctx.bottomLimit) return false;
      flow.addPage();
      return true;
    },
  };
  return flow;
}
