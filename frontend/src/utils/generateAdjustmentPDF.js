import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const fmtRp = (value) => new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
}).format(Number(value) || 0);

const safeDate = (value) => {
  if (!value) return "-";
  const raw = String(value).split("T")[0];
  const [year, month, day] = raw.split("-");
  return year && month && day ? `${day}/${month}/${year}` : raw;
};

export function generateAdjustmentPDF(adjustment, options = {}) {
  const format = String(options.format || "A5").toUpperCase();
  const isA6 = format === "A6";
  const doc = new jsPDF("l", "mm", isA6 ? "a6" : "a5");
  const width = doc.internal.pageSize.getWidth();
  const margin = isA6 ? 5 : 8;
  const settings = options.settings || {};
  const title = adjustment.type === "return" ? "RETUR PENJUALAN" : "TUKAR BARANG";
  const items = Array.isArray(adjustment.items) ? adjustment.items : [];
  const returned = items.filter((item) => item.direction === "returned");
  const replacements = items.filter((item) => item.direction === "replacement");

  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 122, 255);
  doc.setFontSize(isA6 ? 10 : 14);
  doc.text(settings.company_name || settings.shop_name || "CV HABIL SEJAHTERA BERSAMA", margin, margin + 5);

  doc.setTextColor(0);
  doc.setFontSize(isA6 ? 9 : 13);
  doc.text(title, width - margin, margin + 5, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(isA6 ? 6.5 : 8);
  const metaY = margin + (isA6 ? 10 : 14);
  const meta = [
    `No Adjustment: ${adjustment.adjustment_number || "-"}`,
    `Nota Asal: ${adjustment.order_number || adjustment.original_order_number || "-"}`,
    `Tanggal: ${safeDate(adjustment.adjustment_date || adjustment.created_at)}`,
    `Status Pembayaran Asal: ${adjustment.payment_status === "paid" ? "LUNAS" : "-"}`,
  ];
  meta.forEach((line, index) => doc.text(line, width - margin, metaY + index * (isA6 ? 3.5 : 4.5), { align: "right" }));

  const customerY = metaY + meta.length * (isA6 ? 3.5 : 4.5) + 2;
  doc.setFont("helvetica", "bold");
  doc.text(`Customer: ${adjustment.customer_name || "-"}`, margin, customerY);
  doc.setFont("helvetica", "normal");
  doc.text(`Alasan: ${adjustment.reason || "-"}`, margin, customerY + (isA6 ? 3.5 : 4.5));

  const rows = [
    ...returned.map((item) => [
      "RETUR",
      item.product_name_snapshot || item.product_name || "-",
      item.qty_in_unit || item.qty_base || 0,
      item.unit || "pcs",
      item.batch_no || item.original_batch_no || "-",
      safeDate(item.expired_date || item.original_expired_date),
      fmtRp(item.line_amount),
      item.condition || "saleable",
    ]),
    ...replacements.map((item) => [
      "GANTI",
      item.product_name_snapshot || item.product_name || "-",
      item.qty_in_unit || item.qty_base || 0,
      item.unit || "pcs",
      item.batch_no || item.replacement_batch_no || "-",
      safeDate(item.expired_date || item.replacement_expired_date),
      fmtRp(item.line_amount),
      item.source_invoice_number || item.source_invoice_id || "-",
    ]),
  ];
  const returnedValue = returned.reduce((sum, item) => sum + (Number(item.line_amount) || 0), 0);
  const replacementValue = replacements.reduce((sum, item) => sum + (Number(item.line_amount) || 0), 0);

  autoTable(doc, {
    startY: customerY + (isA6 ? 7 : 9),
    head: [["Jenis", "Produk", "Qty", "Unit", "Batch", "ED", "Nilai", "Keterangan"]],
    body: rows.length ? rows : [["-", "Tidak ada item", "-", "-", "-", "-", fmtRp(0), "-"]],
    theme: "grid",
    margin: { left: margin, right: margin },
    styles: { font: "helvetica", fontSize: isA6 ? 5.5 : 7, cellPadding: isA6 ? 1.2 : 1.8, overflow: "linebreak" },
    headStyles: { fillColor: [0, 122, 255], textColor: 255, fontStyle: "bold" },
    columnStyles: { 1: { cellWidth: isA6 ? 38 : 55 }, 7: { cellWidth: isA6 ? 22 : 30 } },
  });

  const finalY = (doc.lastAutoTable?.finalY || customerY) + (isA6 ? 5 : 7);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(isA6 ? 7 : 9);
  doc.text(`Nilai Retur: ${fmtRp(returnedValue)}`, margin, finalY);
  doc.text(`Nilai Pengganti: ${fmtRp(replacementValue)}`, margin, finalY + (isA6 ? 3.5 : 5));
  const settlement = Number(adjustment.additional_charge) > 0
    ? `Tambahan Bayar: ${fmtRp(adjustment.additional_charge)}`
    : `Refund: ${fmtRp(adjustment.refund_amount)}`;
  doc.text(settlement, width - margin, finalY, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text("Dokumen penyesuaian. Nota asal tetap menjadi dokumen transaksi utama.", margin, finalY + (isA6 ? 9 : 13));
  return doc;
}
