export const normalizeIndonesianPhone = (value = "") => {
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
};

const formatRp = (value) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const fmtEd = (d) => {
  if (!d) return "";
  const dt = new Date(String(d).split("T")[0] + "T00:00:00");
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const buildNotaWaMessage = ({
  form = {},
  items = [],
  total = 0,
  orderNumber = "",
  dueDate = "",
} = {}) => {
  const customer = form.customer_name || "Kak";
  const notaRef = String(orderNumber || form.order_number || "").trim();
  const header = notaRef
    ? `Halo ${customer}, berikut ringkasan nota ${notaRef} dari CV Habil Sejahtera Bersama:`
    : `Halo ${customer}, berikut ringkasan nota dari CV Habil Sejahtera Bersama:`;
  const lines = [header, ""];
  items
    .filter((item) => item?.product_name)
    .forEach((item, idx) => {
      const qty = Number(item.qty ?? item.qty_in_unit) || 0;
      const unit = item.unit || "pcs";
      const price = Number(item.unit_price) || 0;
      lines.push(
        `${idx + 1}. ${item.product_name} — ${qty} ${unit} x ${formatRp(price)} = ${formatRp(qty * price)}`,
      );
      // v1.52.x: info batch + ED per item (kalau ada)
      const batchNo = item._batch_no || item.batch_no_snapshot || "";
      const ed = fmtEd(item._expired_date || item.expired_date_snapshot);
      const meta = [];
      if (batchNo) meta.push(`Batch ${batchNo}`);
      if (ed) meta.push(`ED ${ed}`);
      if (meta.length) lines.push(`   ${meta.join(" · ")}`);
    });
  lines.push("", `Total: ${formatRp(total)}`);
  const dueStr = fmtEd(dueDate || form.due_date);
  if (dueStr) lines.push(`Jatuh tempo pembayaran: ${dueStr}`);
  lines.push("Terima kasih.");
  return lines.join("\n");
};

// Pesan reminder jatuh tempo (buat tombol "WA reminder" per nota di list)
export const buildDueReminderMessage = ({
  customerName = "Kak",
  orderNumber = "",
  total = 0,
  dueDate = "",
} = {}) => {
  const dueStr = fmtEd(dueDate);
  const ref = String(orderNumber || "").trim();
  const lines = [
    `Halo ${customerName}, mengingatkan untuk pembayaran nota ${ref} dari CV Habil Sejahtera Bersama.`,
    "",
    `Total: ${formatRp(total)}`,
  ];
  if (dueStr) lines.push(`Jatuh tempo pembayaran: ${dueStr}`);
  lines.push("", "Mohon konfirmasi bila sudah transfer ya. Terima kasih 🙏");
  return lines.join("\n");
};

// v1.54.0: reminder pinjaman lewat/mendekati batas pengembalian — list sisa barang
// yang masih dipinjam + batas pengembalian.
export const buildLoanReminderMessage = ({
  customerName = "Kak",
  loanNumber = "",
  dueDate = "",
  items = [],
} = {}) => {
  const ref = String(loanNumber || "").trim();
  const lines = [
    `Halo ${customerName}, mengingatkan pinjaman barang ${ref} dari CV Habil Sejahtera Bersama:`,
    "",
  ];
  items
    .filter((it) => it?.product_name && Number(it.outstanding) > 0)
    .forEach((it, idx) => {
      lines.push(
        `${idx + 1}. ${it.product_name} — sisa ${it.outstanding} ${it.unit || "pcs"}`,
      );
      const meta = [];
      if (it.batch_no_snapshot) meta.push(`Batch ${it.batch_no_snapshot}`);
      const ed = fmtEd(it.expired_date_snapshot);
      if (ed) meta.push(`ED ${ed}`);
      if (meta.length) lines.push(`   ${meta.join(" · ")}`);
    });
  const dueStr = fmtEd(dueDate);
  if (dueStr) lines.push("", `Batas pengembalian: ${dueStr}`);
  lines.push(
    "",
    "Mohon dikembalikan atau konfirmasi bila mau diambil (kami buatkan notanya). Terima kasih 🙏",
  );
  return lines.join("\n");
};

export const buildWaUrl = (phone, message) => {
  const normalized = normalizeIndonesianPhone(phone);
  if (!normalized) return "";
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message || "")}`;
};

export const copyTextToClipboard = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
};
