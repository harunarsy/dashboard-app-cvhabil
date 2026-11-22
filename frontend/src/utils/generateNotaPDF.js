import { formatExpiry } from "./expiry";
import { formatDateOnly } from "./dateOnly";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
// v1.65.1: barcode nomor nota. Impor STATIS (bukan dynamic import) supaya
// generateNotaPDF tetap sinkron — mengubahnya jadi async berarti mengubah
// signature API yang dipakai 2 komponen. Modul ini sendiri sudah lazy-loaded,
// jadi jsbarcode ikut chunk PDF, tidak membebani bundle utama.
import JsBarcode from 'jsbarcode';
import { angkaKeTerbilang } from './angkaKeTerbilang';
import { MONO } from './documents/salesDocumentTheme';
import { PDF_FONT, lineHeightMm, baselineOffsetMm } from './documents/pdfFontMetrics';

const fmtRp = (n, decimals = 0) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n || 0);

export function generateNotaPDF(order, options = {}) {
  try {
    console.log('[generateNotaPDF] Starting with order:', order);
    const {
      format = 'A4',
      type = 'nota',
      settings = {}
    } = options;

    // Normalize keys — handle both old (shop_name/footer) and new (company_name/footer_text) formats
    const companyName = settings.company_name || settings.shop_name || 'CV HABIL SEJAHTERA BERSAMA';
    const footerText = settings.footer_text || settings.footer || '';
    const signerName = settings.signer_name || '';
    const bankInfo = settings.bank_info || '';
    const qrisText = settings.qris_text || '';
    const ketentuan = settings.ketentuan || '';

    console.log('[generateNotaPDF] Format:', format, 'Type:', type);

    const fmt = String(format).toUpperCase();
    const isA5 = fmt === 'A5';
    const isA6 = fmt === 'A6';
    const compactLandscape = (type === 'nota' || type === 'terima') && (isA5 || isA6);
    const shortPage = compactLandscape && isA6;
    const orientation = compactLandscape ? 'l' : 'p';
    const doc = new jsPDF(orientation, 'mm', fmt.toLowerCase());
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    console.log('[generateNotaPDF] Page dimensions - Width:', pageWidth, 'Height:', pageHeight);

    // ─── Tipografi & geometri ───────────────────────────────────────────
    // A6 landscape has only 105 mm of height. Keep the document title at
    // 12pt, with a compact print scale for rows and supporting information.
    const bodySize = shortPage ? 10 : PDF_FONT.body;
    const metaSize = shortPage ? 8 : (compactLandscape ? 9 : PDF_FONT.meta);
    const microSize = PDF_FONT.micro;
    const lineH = lineHeightMm(bodySize, shortPage ? 1.05 : undefined);
    const metaLineFactor = compactLandscape ? 1.05 : 1.25;
    const metaLineH = lineHeightMm(metaSize, metaLineFactor);
    const margin = isA6 ? 5 : (isA5 ? 8 : 12);
    const accentColor = MONO.ink;
    const logoDataUrl = settings.logo_data_url;
    const logoWidth = isA6 ? 9 : (isA5 ? 11 : 14);
    const identityX = logoDataUrl ? margin + logoWidth + 2 : margin;
    const contentWidth = pageWidth - margin * 2;
    const rightColW = isA6 ? 42 : Math.min(60, contentWidth * 0.42);
    const identityMaxW = compactLandscape
      ? pageWidth - margin - rightColW - 3 - identityX
      : Math.max(40, contentWidth - rightColW - 3);

    let headY = margin + baselineOffsetMm(bodySize);
    if (logoDataUrl) {
      const logoHeight = logoWidth * (233.443 / 240);
      const textTop = margin;
      const textBottom = headY + (2 * metaLineH) + 2;
      const logoY = Math.max(margin, (textTop + textBottom - logoHeight) / 2);
      try {
        doc.addImage(logoDataUrl, 'PNG', margin, logoY, logoWidth, logoHeight);
      } catch (error) {
        // Nota tetap dapat dicetak tanpa gambar bila data logo rusak.
      }
    }

    // ─── Header Section ─────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(bodySize);
    doc.setTextColor(...accentColor);
    const wrappedCompany = doc.splitTextToSize(String(companyName), identityMaxW);
    const companyLines = compactLandscape ? wrappedCompany : wrappedCompany.slice(0, 2);
    companyLines.forEach((line, i) => doc.text(line, identityX, headY + lineH * i));
    headY += lineH * (companyLines.length - 1);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(metaSize);
    doc.setTextColor(40, 40, 40);
    const npwp = settings.npwp || '93.813.949.0-609.000';
    for (const field of [`NPWP: ${npwp}`, settings.address || '-', settings.phone || '-']) {
      const lines = compactLandscape ? doc.splitTextToSize(String(field), identityMaxW) : [String(field)];
      for (const line of lines) {
        headY += metaLineH;
        doc.text(line, identityX, headY);
      }
    }

    // Doc Info (Top Right)
    // v1.54.0: type 'pinjaman' — Nota Pinjaman (bukan tagihan): tanpa breakdown
    // PPN, tanpa metode bayar/bank, total = nilai barang, jatuh tempo = batas pengembalian.
    const isLoan = type === 'pinjaman';
    const infoX = pageWidth - margin;
    const docTitle = type === 'terima' ? 'TANDA TERIMA' : (isLoan ? 'NOTA PINJAMAN' : 'NOTA PENJUALAN');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(PDF_FONT.body);
    doc.setTextColor(0);
    const titleY = margin + baselineOffsetMm(PDF_FONT.body);
    doc.text(docTitle, infoX, titleY, { align: 'right' });

    // v1.65.1: barcode nomor nota — di bawah judul, di atas baris "No:".
    let infoShift = 0;
    const barcodeValue = String(order.order_number || '').trim();
    if (barcodeValue && type !== 'terima') {
      const barcodeW = isA6 ? 26 : (isA5 ? 32 : 38);
      const barcodeH = isA6 ? 5 : (isA5 ? 6 : 7);
      try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, barcodeValue, {
          format: 'CODE128', displayValue: false, margin: 0,
          width: 2, height: 100, background: '#FFFFFF', lineColor: '#000000',
        });
        const dataUrl = canvas.toDataURL('image/png');
        if (dataUrl && dataUrl !== 'data:,') {
          doc.addImage(dataUrl, 'PNG', infoX - barcodeW, titleY + 2, barcodeW, barcodeH);
          infoShift = barcodeH + 2;
        }
      } catch (e) {
        // sengaja diabaikan — barcode itu pelengkap, nota tetap harus bisa dicetak
      }
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(metaSize);
    doc.setTextColor(50, 50, 50);
    let infoY = titleY + metaLineH + infoShift;
    doc.text(`No: ${String(order.order_number || '-')}`, infoX, infoY, { align: 'right' });
    const saleDateStr = order.sale_date
      ? formatDateOnly(order.sale_date, { day: '2-digit', month: 'short', year: 'numeric' })
      : '-';
    // v1.8.1: tampilkan Jatuh Tempo di header kalau ada AND non-cash
    // v1.54.0: nota pinjaman → label "Batas Pengembalian" (selalu tampil kalau ada due_date)
    const hasDueDate = Boolean(
      order.due_date && (isLoan || (order.payment_method !== 'Tunai' && type !== 'terima'))
    );
    infoY += metaLineH;
    doc.text(saleDateStr, infoX, infoY, { align: 'right' });

    // Jatuh tempo ditulis penuh pada barisnya sendiri di bawah header, supaya
    // label "Jatuh Tempo Pembayaran" tidak bertabrakan dengan nama perusahaan.
    let dueY = 0;
    if (hasDueDate) {
      const dueStr = formatDateOnly(order.due_date, { day: '2-digit', month: 'short', year: 'numeric' });
      dueY = Math.max(headY, infoY) + metaLineH;
      doc.setTextColor(...MONO.ink);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(metaSize);
      doc.text(`${isLoan ? 'Batas Pengembalian' : 'Jatuh Tempo Pembayaran'}: ${dueStr}`, infoX, dueY, { align: 'right' });
      doc.setTextColor(60, 60, 60);
      doc.setFont('helvetica', 'normal');
    }

    // Garis pembatas mengikuti baris terakhir header (kiri atau kanan).
    const dividerY = Math.max(headY, infoY, dueY) + (shortPage ? 1.2 : (isA6 ? 2.2 : 3));
    doc.setDrawColor(...MONO.rule);
    doc.setLineWidth(0.4);
    doc.line(margin, dividerY, pageWidth - margin, dividerY);

    // ─── Customer & Payment ─────────────────────────────────────────────
    const customerY = dividerY + (isA6 ? 4 : 6);
    doc.setFontSize(bodySize);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    doc.text('Kepada Yth:', margin, customerY);
    // Metode pembayaran sejajar dengan label, di kanan.
    if (type !== 'terima' && !isLoan) {
      const methodText = `Metode: ${String(order.payment_method || 'Tunai')}`;
      doc.setFontSize(metaSize);
      doc.text(methodText, infoX, customerY, { align: 'right' });
      doc.setFontSize(bodySize);
    }

    // sanitasi No. HP: buang karakter sampah (mis. "*", ",") → cuma digit/+/()-/spasi.
    const cleanPhone = (p) =>
      String(p || '').replace(/[^\d+()\-\s]/g, '').replace(/\s+/g, ' ').trim();
    // A6 landscape cukup lebar untuk nama sejajar label.
    let addressY = customerY;
    doc.setFont('helvetica', 'bold');
    const stackCustomer = isA6 && !shortPage;
    const nameOffset = shortPage ? 21 : 24;
    const nameX = stackCustomer ? margin : margin + nameOffset;
    const nameW = stackCustomer ? contentWidth : contentWidth - nameOffset - 34;
    const nameLines = doc.splitTextToSize(String(order.customer_name || '-'), nameW);
    nameLines.forEach((ln, index) => {
      if (stackCustomer || index > 0) addressY += lineH;
      doc.text(ln, nameX, addressY);
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(metaSize);
    doc.setTextColor(40, 40, 40);
    const contactW = contentWidth;
    const phoneClean = cleanPhone(order.customer_phone);
    const contactFields = [phoneClean, String(order.customer_address || '').trim()].filter(Boolean);
    const contactBlocks = compactLandscape ? [contactFields.join(' · ')].filter(Boolean) : contactFields;
    for (const contact of contactBlocks) {
      for (const ln of doc.splitTextToSize(contact, contactW)) {
        addressY += metaLineH;
        doc.text(ln, margin, addressY);
      }
    }

    // ─── Table ──────────────────────────────────────────────────────────
    const items = order.items || [];
    // Cetakan boleh merangkum baris yang identik, tetapi sumber data transaksi
    // tetap per baris. Ini mencegah nota multi-batch membuang satu halaman hanya
    // untuk mengulang produk/batch/ED/harga yang sama (mis. batch diambil dua kali).
    const hasQtyInUnit = (item) => item.qty_in_unit !== undefined && item.qty_in_unit !== null;
    const toNumber = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const displayItems = (() => {
      if (type === 'terima') return items;

      const bySnapshot = new Map();
      const grouped = [];
      items.forEach((item) => {
        // Tanpa snapshot batch yang dapat dipercaya, jangan menyatukan baris.
        // Dengan begitu riwayat lama yang ambigu tetap terlihat apa adanya.
        const hasBatchSnapshot = Boolean(
          item.batch_id_snapshot || item.batch_no_snapshot || item.expired_date_snapshot
        );
        if (!hasBatchSnapshot) {
          grouped.push({ ...item });
          return;
        }

        const key = [
          item.product_id ?? '',
          item.product_name ?? '',
          item.unit ?? '',
          item.unit_base ?? '',
          item.pack_size_at_sale ?? '',
          item.unit_price ?? '',
          item.batch_id_snapshot ?? '',
          item.batch_no_snapshot ?? '',
          item.expired_date_snapshot ?? '',
          item.expired_date_snapshot_precision ?? 'day',
          hasQtyInUnit(item) ? 'unit-qty' : 'base-qty',
        ].join('\u001F');
        const existingIndex = bySnapshot.get(key);
        if (existingIndex === undefined) {
          bySnapshot.set(key, grouped.length);
          grouped.push({ ...item });
          return;
        }

        const existing = grouped[existingIndex];
        existing.qty = toNumber(existing.qty) + toNumber(item.qty);
        if (hasQtyInUnit(existing)) {
          existing.qty_in_unit = toNumber(existing.qty_in_unit) + toNumber(item.qty_in_unit);
        }
      });
      return grouped;
    })();
    // v1.6.0 multi-unit: prefer qty_in_unit + unit (snapshot at sale time) untuk display user-friendly
    // Tampilkan "1 karton" instead of "12 pcs" kalau pack unit dipakai. Append conversion ke nama produk untuk transparency.
    const formatQtyDisplay = (item) => {
      const qtyShow = item.qty_in_unit !== undefined && item.qty_in_unit !== null ? parseFloat(item.qty_in_unit) : (item.qty || 0);
      const unitShow = item.unit || 'pcs';
      return `${qtyShow} ${unitShow}`;
    };
    const formatProductName = (item) => {
      const packSize = parseInt(item.pack_size_at_sale) || 1;
      const qtyInUnit = item.qty_in_unit !== undefined && item.qty_in_unit !== null ? parseFloat(item.qty_in_unit) : null;
      const qtyBase = item.qty || 0;
      const lines = [item.product_name];
      // Sub-line 1: konversi pack→base kalau pack unit dipakai
      if (packSize > 1 && qtyInUnit !== null && qtyInUnit !== qtyBase) {
        lines.push(`(= ${qtyBase} ${item.unit_base || 'pcs'})`);
      }
      // Sub-line 2: ED dulu supaya tetap utuh saat baris terpotong, lalu batch.
      const meta = [];
      const edStr = formatExpiry(item.expired_date_snapshot, item.expired_date_snapshot_precision, "");
      if (edStr) meta.push(`ED: ${edStr}`);
      if (item.batch_no_snapshot) meta.push(`Batch: ${item.batch_no_snapshot}`);
      if (meta.length) lines.push(meta.join(' · '));
      return lines.join('\n');
    };
    // Kertas sempit: utamakan nama barang, qty dan total baris.
    const compactColumns = type !== 'terima' && pageWidth < 170;
    const tableData = displayItems.map((item, index) => {
      if (type === 'terima') {
        return [index + 1, formatProductName(item), formatQtyDisplay(item)];
      }
      const qtyForCalc = item.qty_in_unit !== undefined && item.qty_in_unit !== null ? parseFloat(item.qty_in_unit) : (item.qty || 0);
      const total = fmtRp(qtyForCalc * (item.unit_price || 0));
      if (compactColumns) {
        return [formatProductName(item), formatQtyDisplay(item), total];
      }
      return [index + 1, formatProductName(item), formatQtyDisplay(item), fmtRp(item.unit_price), total];
    });

    const tableHead = type === 'terima'
      ? [['No', 'Nama Barang', 'Qty']]
      : (compactColumns ? [['Nama Barang', 'Qty', 'Total']] : [['No', 'Nama Barang', 'Qty', 'Harga Satuan', 'Total']]);

    // Tabel mulai setelah blok customer, tidak pernah menabrak divider.
    const tableStartY = Math.max(
      dividerY + (shortPage ? 4.5 : 6),
      addressY + (shortPage ? 2 : 4),
    );

    // Ukuran tail (total, catatan, rekening, tanda tangan) dihitung dari
    // tinggi baris 12pt/10pt supaya tidak ada tumpang tindih.
    const footerGap = 2;
    const sigGap = shortPage ? 3 : 5;
    const sigLineOffset = shortPage ? 8 : (compactLandscape ? 12 : (isA6 ? 14 : 16));
    const sigNameOffset = shortPage ? 12 : (compactLandscape ? 16 : 20);
    const sigHalfWidth = isA6 ? 34 : 42;
    const sigCenter = isA6 ? 17 : 21;
    const tableGap = shortPage ? 2.5 : 3;
    const notesTopGap = shortPage ? 1.2 : 2;
    const noteHeadingAdvance = shortPage ? 0 : metaLineH;
    const bankLead = shortPage ? 1.5 : 3;
    const bankLineAdvance = metaLineH;
    const bankAdvance = bankInfo && type !== 'terima' && !isLoan
      ? bankLead + bankLineAdvance + (qrisText ? bankLineAdvance : 0)
      : 0;
    // Sisakan ruang footer supaya nama penanda tangan tidak menabrak teks footer.
    const footerReserveY = footerText ? 6 : 2;
    const compactSigY = pageHeight - 4 - footerReserveY - sigNameOffset;

    doc.setFontSize(metaSize);
    const loanNote = isLoan
      ? doc.splitTextToSize(
        'Barang berstatus PINJAMAN — belum termasuk penjualan. Mohon dikembalikan atau dikonfirmasi pembelian sebelum batas pengembalian.',
        pageWidth - margin * 2
      )
      : [];
    const ketentuanRows = ketentuan && type !== 'terima' && !isLoan
      ? ketentuan.split('\n').filter((line) => line.trim()).map((line, index) => ({
        wrapped: doc.splitTextToSize(`${shortPage && index === 0 ? 'NOTE: ' : ''}${index + 1}. ${line}`, contentWidth),
      }))
      : [];
    const ketentuanBlockH = ketentuanRows.length
      ? notesTopGap + noteHeadingAdvance + ketentuanRows.reduce((height, row) => height + row.wrapped.length * metaLineH, 0)
      : 0;
    const notesLines = order.notes
      ? doc.splitTextToSize(`Catatan: ${String(order.notes || '')}`, pageWidth - margin * 2)
      : [];
    const notesBlockH = notesLines.length ? Math.max(metaLineH, notesLines.length * metaLineH) : 0;

    const summaryAdvance = (() => {
      if (isLoan) {
        return lineH + metaLineH + (loanNote.length * metaLineH);
      }
      if (type === 'terima') return 0;

      let advance = 0;
      if (!order.ppn_excluded) {
        advance += metaLineH * (shortPage ? 1 : 2);
      }
      if ((parseFloat(order.ongkir) || 0) > 0) {
        advance += metaLineH;
      }
      if (order.payment_fee_mode === 'pass_on' && (parseFloat(order.payment_fee) || 0) > 0) {
        advance += metaLineH;
      }
      advance += lineH; // GRAND TOTAL 12pt bold
      const terbilangText = `Terbilang: ${(angkaKeTerbilang(parseFloat(order.total) || 0) + ' Rupiah').trim()}`;
      advance += Math.max(1, doc.splitTextToSize(terbilangText, contentWidth).length) * metaLineH;
      if ((parseInt(order.est_weight_gram) || 0) > 0) {
        advance += metaLineH;
      }
      return advance;
    })();
    const tailContentH = summaryAdvance + notesBlockH + ketentuanBlockH + bankAdvance;
    const tailContentBottomY = shortPage ? pageHeight - 4 - footerReserveY : pageHeight - 4 - footerGap;
    const tailLimitY = tailContentBottomY - sigNameOffset;

    let continuationStarted = false;
    const continuationLineY = margin + baselineOffsetMm(bodySize) + metaLineH + 2;
    const continuationTableStartY = continuationLineY + 4;
    const tailFitsSinglePage = continuationTableStartY + tailContentH + sigGap <= tailLimitY;
    const tailTableEndY = tailFitsSinglePage
      ? tailLimitY - tailContentH - sigGap - tableGap
      : pageHeight - margin;
    const drawContinuationHeader = (pageNumber) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(bodySize);
      doc.setTextColor(...accentColor);
      if (logoDataUrl) {
        const continuationLogoWidth = isA6 ? 6 : 7;
        try {
          doc.addImage(logoDataUrl, 'PNG', margin, margin, continuationLogoWidth, continuationLogoWidth * (233.443 / 240));
        } catch (error) {
          // Halaman lanjutan tetap dapat dicetak tanpa gambar.
        }
      }
      doc.text(String(companyName), logoDataUrl ? margin + (isA6 ? 8 : 9) : margin, margin + baselineOffsetMm(bodySize));

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(metaSize);
      doc.setTextColor(60, 60, 60);
      doc.text(`${docTitle} - Lanjutan`, margin, margin + baselineOffsetMm(bodySize) + metaLineH);
      doc.text(`No: ${String(order.order_number || '-')}`, infoX, margin + baselineOffsetMm(metaSize), { align: 'right' });
      doc.text(`Halaman ${pageNumber}`, infoX, margin + baselineOffsetMm(metaSize) + metaLineH, { align: 'right' });

      doc.setDrawColor(...MONO.rule);
      doc.setLineWidth(0.3);
      doc.line(margin, continuationLineY, pageWidth - margin, continuationLineY);
    };

    const tableStyles = {
      head: tableHead,
      theme: 'striped',
      headStyles: {
        fillColor: MONO.headFill,
        textColor: MONO.ink,
        fontStyle: 'bold',
        fontSize: bodySize,
        halign: 'center',
        lineWidth: 0,
      },
      bodyStyles: {
        lineWidth: 0,
        fillColor: [255, 255, 255],
        fontSize: bodySize,
      },
      alternateRowStyles: { fillColor: MONO.zebra },
      styles: {
        fontSize: bodySize,
        cellPadding: shortPage ? 0.65 : (isA6 ? 1.3 : 1.8),
        lineWidth: 0,
        textColor: MONO.ink,
      },
      rowPageBreak: 'avoid',
      columnStyles: compactColumns
        ? {
          1: { halign: 'center', cellWidth: 21 },
          2: { halign: 'right', cellWidth: 31 },
        }
        : {
          0: { halign: 'center', cellWidth: isA6 ? 7 : 10 },
          2: { halign: 'center', cellWidth: isA6 ? 15 : 18 },
          3: { halign: 'right' },
          4: { halign: 'right' },
        },
    };

    // Use a scratch document to get AutoTable's real wrapped row heights. This
    // lets us retain a one-page nota when it truly fits and balance longer
    // orders across the initial and final table pages.
    const measurementDoc = new jsPDF(orientation, 'mm', fmt.toLowerCase());
    autoTable(measurementDoc, {
      ...tableStyles,
      startY: 0,
      body: tableData,
      margin: { top: 0, right: margin, bottom: 0, left: margin },
    });
    const measuredTable = measurementDoc.lastAutoTable;
    const tableHeadHeight = measuredTable.head.reduce((height, row) => height + row.height, 0);
    const bodyHeights = measuredTable.body.map((row) => row.height);
    const completeTableEndY = tableStartY + tableHeadHeight + bodyHeights.reduce((sum, height) => sum + height, 0);
    const tableFitsWithTail = completeTableEndY <= tailTableEndY;

    let maxFinalRows = 0;
    let finalRowsHeight = 0;
    const finalRowsCapacity = tailTableEndY - continuationTableStartY - tableHeadHeight;
    for (let index = bodyHeights.length - 1; index >= 0; index -= 1) {
      if (finalRowsHeight + bodyHeights[index] > finalRowsCapacity) break;
      finalRowsHeight += bodyHeights[index];
      maxFinalRows += 1;
    }
    // A6 can fit the summary by itself, but not a full table header + row
    // with it. Reserving that space on every page would make AutoTable
    // keep retrying the same row on a fresh page with no usable space.
    const balancedFinalRows = Math.min(
      Math.max(maxFinalRows, 1),
      Math.ceil(tableData.length / 2),
    );
    // Baris yang benar-benar muat di halaman pertama (dibatasi dasar halaman,
    // bukan hanya reservasi tail). Tanpa ini, sisa baris bisa terdorong ke
    // halaman baru yang isinya cuma satu baris.
    const firstPageCapacity = (() => {
      const limit = pageHeight - margin - tableStartY - tableHeadHeight;
      let used = 0;
      let count = 0;
      for (const height of bodyHeights) {
        if (used + height > limit) break;
        used += height;
        count += 1;
      }
      return count;
    })();
    const rowsBeforeTail = Math.max(tableData.length - balancedFinalRows, 0);
    // On compact paper, only the measured suffix may use the reduced page area.
    // The preceding rows can paginate normally with the full bottom margin.
    const initialTableRows = compactLandscape ? rowsBeforeTail : Math.min(rowsBeforeTail, firstPageCapacity);
    const splitTableForTail = tailFitsSinglePage && !tableFitsWithTail && initialTableRows > 0
      && (!compactLandscape || (maxFinalRows > 0 && firstPageCapacity > 0));
    // Don't apply the tail reservation to a table that can't share a page with
    // it. This also keeps a single item on the first page with its customer.
    const reserveTail = tailFitsSinglePage && (!compactLandscape || tableFitsWithTail || splitTableForTail);
    const tailTableBottomMargin = reserveTail ? Math.max(margin, pageHeight - tailTableEndY) : margin;

    const renderTable = (body, startY, bottomMargin) => {
      autoTable(doc, {
        ...tableStyles,
        startY,
        body,
        margin: {
          top: continuationTableStartY,
          right: margin,
          bottom: bottomMargin,
          left: margin,
        },
        willDrawPage: () => {
          if (doc.getNumberOfPages() > 1) {
            continuationStarted = true;
            drawContinuationHeader(doc.getNumberOfPages());
          }
        },
      });
    };

    if (splitTableForTail) {
      renderTable(tableData.slice(0, initialTableRows), tableStartY, margin);
      doc.addPage();
      renderTable(tableData.slice(initialTableRows), continuationTableStartY, tailTableBottomMargin);
    } else {
      renderTable(tableData, tableStartY, tailTableBottomMargin);
    }

    // Reset lineWidth standar buat sig line + dividers.
    doc.setLineWidth(0.2);

    // ─── Summary ──────────────────────────────────────────────────────────
    const tableEndY = (doc.lastAutoTable?.finalY || 0);
    let finalY = tableEndY > 0 ? tableEndY + tableGap : margin + (isA6 ? 30 : 50);
    const addTailContinuationPage = () => {
      doc.addPage();
      continuationStarted = true;
      drawContinuationHeader(doc.getNumberOfPages());
      finalY = continuationTableStartY;
    };
    const ensureTailSpace = (height) => {
      if (finalY + height <= tailContentBottomY) return false;
      addTailContinuationPage();
      return true;
    };
    const tailFitsOnCurrentPage = finalY + tailContentH + sigGap + sigNameOffset <= tailContentBottomY;

    if (!tailFitsOnCurrentPage) {
      addTailContinuationPage();
    }
    if (!tailFitsSinglePage && summaryAdvance && finalY + summaryAdvance > tailContentBottomY) {
      ensureTailSpace(summaryAdvance);
    }

    // Debug behind localStorage flag — set `localStorage.pdfDebug = '1'` di console untuk lihat values
    if (typeof window !== 'undefined' && window.localStorage?.getItem('pdfDebug')) {
      console.log('[generateNotaPDF DEBUG]', {
        format,
        pageHeight,
        margin,
        finalY,
        tailContentH,
        tailTableBottomMargin,
        tableFitsWithTail,
        splitTableForTail,
      });
    }

    if (isLoan) {
      // v1.54.0: pinjaman = bukan tagihan → total nilai barang saja (tanpa DPP/PPN),
      // plus keterangan status barang supaya dokumen tidak disalahartikan sebagai nota jual.
      const totalValue = parseFloat(order.total) || 0;
      const rightX = pageWidth - margin;
      doc.setFontSize(bodySize);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0);
      doc.text(`TOTAL NILAI BARANG: ${fmtRp(totalValue)}`, rightX, finalY, { align: 'right' });
      finalY += lineH;
      doc.setFontSize(metaSize);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100);
      doc.splitTextToSize(`Terbilang: ${(angkaKeTerbilang(totalValue) + ' Rupiah').trim()}`, contentWidth).forEach((line) => {
        doc.text(line, margin, finalY);
        finalY += metaLineH;
      });
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MONO.ink);
      doc.text(loanNote, margin, finalY);
      finalY += loanNote.length * metaLineH;
      doc.setTextColor(0);
    }

    if (type !== 'terima' && !isLoan) {
      // v1.8.1: tax-friendly breakdown — DPP (subtotal exc PPN) + PPN 11% + Grand Total
      // Indo practice: harga jual customer = gross (inc PPN). Decompose: GT = DPP + PPN.
      // v1.21.14: ongkir baris terpisah, TIDAK kena PPN. DPP/PPN dihitung dari nilai produk saja.
      // v1.25.1: biaya kartu kredit pass_on = baris terpisah TANPA PPN (sudah masuk order.total);
      // mode absorb tidak tampil di nota (internal, motong margin).
      const grandTotal = parseFloat(order.total) || 0;
      const ongkir = parseFloat(order.ongkir) || 0;
      const ccFee =
        order.payment_fee_mode === 'pass_on' ? parseFloat(order.payment_fee) || 0 : 0;
      const productTotal = grandTotal - ongkir - ccFee;
      const PPN_RATE = 0.11; // default DPP/PPN nota (rate historis); per-faktur diatur terpisah
      const dpp = productTotal / (1 + PPN_RATE);
      const ppn = productTotal - dpp;
      const rightX = pageWidth - margin;

      doc.setFontSize(metaSize);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      // v1.65.0: nota TANPA PPN (sales_orders.ppn_excluded) — rincian DPP/PPN tidak
      // dicetak, harga tampil apa adanya. GRAND TOTAL sengaja TIDAK diubah.
      if (!order.ppn_excluded) {
        const dppText = `Subtotal (DPP): ${fmtRp(dpp)}`;
        const ppnText = `PPN ${Math.round(PPN_RATE * 100)}%: ${fmtRp(ppn)}`;
        for (const line of shortPage ? [`${dppText}   |   ${ppnText}`] : [dppText, ppnText]) {
          doc.text(line, rightX, finalY, { align: 'right' });
          finalY += metaLineH;
        }
      }
      if (ongkir > 0) {
        doc.text(`Ongkir: ${fmtRp(ongkir)}`, rightX, finalY, { align: 'right' });
        finalY += metaLineH;
      }
      if (ccFee > 0) {
        doc.text(`Biaya Kartu Kredit: ${fmtRp(ccFee)}`, rightX, finalY, { align: 'right' });
        finalY += metaLineH;
      }

      doc.setFontSize(bodySize);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0);
      doc.text(`GRAND TOTAL: ${fmtRp(grandTotal)}`, rightX, finalY, { align: 'right' });

      finalY += lineH;
      doc.setFontSize(metaSize);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100);
      const words = (angkaKeTerbilang(grandTotal) + " Rupiah").trim();
      doc.splitTextToSize(`Terbilang: ${words}`, contentWidth).forEach((line) => {
        doc.text(line, margin, finalY);
        finalY += metaLineH;
      });
      const estWeightGram = Math.max(0, parseInt(order.est_weight_gram) || 0);
      if (estWeightGram > 0) {
        const weightKg = (estWeightGram / 1000).toFixed(2).replace('.', ',');
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 80, 80);
        doc.text(`Estimasi Berat Paket: ${weightKg} kg`, margin, finalY);
        finalY += metaLineH;
      }
      doc.setTextColor(0);
    }

    if (notesLines.length) {
      const setNotesStyle = () => {
        doc.setFontSize(metaSize);
        doc.setTextColor(120);
      };
      setNotesStyle();
      if (tailFitsSinglePage) {
        doc.text(notesLines, margin, finalY, compactLandscape ? { lineHeightFactor: metaLineFactor } : undefined);
        finalY += notesBlockH;
      } else {
        notesLines.forEach((line) => {
          if (ensureTailSpace(metaLineH)) setNotesStyle();
          doc.text(line, margin, finalY);
          finalY += metaLineH;
        });
        finalY += Math.max(0, notesBlockH - notesLines.length * metaLineH);
      }
      doc.setTextColor(0);
    }

    // ─── Ketentuan / Notes ────────────────────────────────────────────────
    if (ketentuanRows.length) {
      if (!tailFitsSinglePage) {
        ensureTailSpace(notesTopGap + noteHeadingAdvance + metaLineH);
      }
      finalY += notesTopGap;
      doc.setFontSize(metaSize);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...MONO.ink);
      if (!shortPage) doc.text('NOTE:', margin, finalY);
      finalY += noteHeadingAdvance;
      doc.setFont('helvetica', 'normal');
      ketentuanRows.forEach(({ wrapped }) => {
        if (tailFitsSinglePage) {
          doc.text(wrapped, margin, finalY, compactLandscape ? { lineHeightFactor: metaLineFactor } : undefined);
          finalY += wrapped.length * metaLineH;
          return;
        }
        wrapped.forEach((line) => {
          if (ensureTailSpace(metaLineH)) {
            doc.setFontSize(metaSize);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...MONO.ink);
          }
          doc.text(line, margin, finalY);
          finalY += metaLineH;
        });
      });
      doc.setTextColor(0);
    }

    // ─── Bank Info ────────────────────────────────────────────────────────
    ensureTailSpace(bankAdvance + sigGap + sigNameOffset);
    if (bankInfo && type !== 'terima' && !isLoan) {
      finalY += bankLead;
      doc.setFontSize(metaSize);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'bold');
      doc.text(`REK ${bankInfo}`, pageWidth / 2, finalY, { align: 'center' });
      finalY += bankLineAdvance;
      if (qrisText) {
        doc.text(qrisText, pageWidth / 2, finalY, { align: 'center' });
        finalY += bankLineAdvance;
      }
    }

    // ─── Signatures ──────────────────────────────────────────────────────
    // v1.66.4: label -> line -> name spacing is intentionally consistent.
    // On a continuation page, keep bank/signature content near the continuation
    // header. Anchoring it to the footer creates a mostly blank second page.
    const sigY = Math.min(
      compactSigY,
      Math.max(finalY + sigGap, type === 'terima' && !continuationStarted ? pageHeight * 0.64 : 0),
    );

    doc.setFontSize(bodySize);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');

    // Left: Customer (Penerima) — pinjaman: Peminjam
    doc.text(isLoan ? 'Peminjam,' : 'Penerima,', margin + sigCenter, sigY, { align: 'center' });
    doc.line(margin, sigY + sigLineOffset, margin + sigHalfWidth, sigY + sigLineOffset);
    doc.text('(                          )', margin + sigCenter, sigY + sigNameOffset, { align: 'center' });

    // Right: Company/Signer (Hormat kami)
    const rightSigX = pageWidth - margin - sigCenter;
    doc.text('Hormat kami,', rightSigX, sigY, { align: 'center' });
    doc.line(pageWidth - margin - sigHalfWidth, sigY + sigLineOffset, pageWidth - margin, sigY + sigLineOffset);
    if (signerName) {
      doc.text(signerName, rightSigX, sigY + sigNameOffset, { align: 'center' });
    }

    // ─── Footer ───────────────────────────────────────────────────────────
    if (footerText) {
      doc.setFontSize(microSize);
      doc.setTextColor(180);
      doc.text(String(footerText), pageWidth / 2, pageHeight - 4, { align: 'center' });
    }

    console.log('[generateNotaPDF] PDF generated successfully');
    return doc;
  } catch (error) {
    console.error('[generateNotaPDF] ERROR:', error.message, error.stack);
    throw error;
  }
}
