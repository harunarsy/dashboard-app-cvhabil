// Tax constants & helpers — v1.8.0
// HNA = Harga Netto Apotek (raw cost per pcs from distributor, after disc, EXC PPN)
// HPP = Harga Pokok Penjualan (cost per pcs INC PPN) = HNA × (1 + PPN_RATE)

// PPN_RATE = rate DEFAULT (historis stok lama = 11%). Rate aktual per-pembelian disimpan
// per-batch/faktur (kolom ppn_rate). Jangan ubah ini jadi 12% global → bikin HPP stok lama
// ikut 12% (regresi v1.40). PPN penjualan/output diatur terpisah bila perlu.
const PPN_RATE = 0.11;
const TAX_TYPE_FAKTUR = 'faktur';
const TAX_TYPE_NOTA = 'nota';

const normalizeTaxType = (value) => (
  String(value || '').toLowerCase() === TAX_TYPE_NOTA
    ? TAX_TYPE_NOTA
    : TAX_TYPE_FAKTUR
);

const hppFromHna = (hna) => {
  const n = parseFloat(hna);
  if (isNaN(n)) return 0;
  return n * (1 + PPN_RATE);
};

const hppFromHnaByTaxType = (hna, taxType = TAX_TYPE_FAKTUR) => {
  const n = parseFloat(hna);
  if (isNaN(n)) return 0;
  return normalizeTaxType(taxType) === TAX_TYPE_NOTA ? n : hppFromHna(n);
};

const hnaFromHpp = (hpp) => {
  const n = parseFloat(hpp);
  if (isNaN(n)) return 0;
  return n / (1 + PPN_RATE);
};

const hnaFromHppByTaxType = (hpp, taxType = TAX_TYPE_FAKTUR) => {
  const n = parseFloat(hpp);
  if (isNaN(n)) return 0;
  return normalizeTaxType(taxType) === TAX_TYPE_NOTA ? n : hnaFromHpp(n);
};

module.exports = {
  PPN_RATE,
  TAX_TYPE_FAKTUR,
  TAX_TYPE_NOTA,
  normalizeTaxType,
  hppFromHna,
  hppFromHnaByTaxType,
  hnaFromHpp,
  hnaFromHppByTaxType,
};
