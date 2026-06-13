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

export const buildNotaWaMessage = ({ form = {}, items = [], total = 0 } = {}) => {
  const customer = form.customer_name || "Kak";
  const lines = [
    `Halo ${customer}, berikut ringkasan nota dari CV Habil:`,
    "",
    ...items
      .filter((item) => item?.product_name)
      .map((item, idx) => {
        const qty = Number(item.qty) || 0;
        const unit = item.unit || "pcs";
        const price = Number(item.unit_price) || 0;
        return `${idx + 1}. ${item.product_name} — ${qty} ${unit} x ${formatRp(price)} = ${formatRp(qty * price)}`;
      }),
    "",
    `Total: ${formatRp(total)}`,
    "Terima kasih.",
  ];
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
