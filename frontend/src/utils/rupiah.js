// Rupiah Indo format helpers — v1.8.0
// Display: "Rp 288.288,25" (titik ribuan, koma desimal — native ID-id)
// Parse:   "Rp 288.288,25" / "288.288,25" / "288288.25" / "288288,25" → 288288.25

export const PPN_RATE = 0.11;

export const formatRupiah = (n, decimals = 2) => {
  if (n === null || n === undefined || n === '') return '';
  const num = typeof n === 'string' ? parseRupiah(n) : parseFloat(n);
  if (isNaN(num)) return '';
  return 'Rp ' + new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};

export const parseRupiah = (str) => {
  if (typeof str === 'number') return str;
  if (str === null || str === undefined) return 0;
  const s = String(str).trim();
  if (!s) return 0;
  const cleaned = s
    .replace(/Rp\s?/gi, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
};

export const formatRupiahDisplay = (n) => formatRupiah(n, 2);
export const formatRupiahCompact = (n) => formatRupiah(n, 0);

export const hppFromHna = (hna) => {
  const n = parseFloat(hna);
  if (isNaN(n)) return 0;
  return n * (1 + PPN_RATE);
};

export const hnaFromHpp = (hpp) => {
  const n = parseFloat(hpp);
  if (isNaN(n)) return 0;
  return n / (1 + PPN_RATE);
};

// v1.22.3: HPP per batch sadar tax_type — batch nota = harga beli riil (TANPA ×1,11).
// Pakai ini (bukan hppFromHna langsung) di mana pun yang dihitung adalah batch.
export const hppForBatch = (batch) =>
  batch?.tax_type === 'nota'
    ? parseFloat(batch?.hna) || 0
    : hppFromHna(batch?.hna);
