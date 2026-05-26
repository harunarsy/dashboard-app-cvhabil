// Tax constants & helpers — v1.8.0
// HNA = Harga Netto Apotek (raw cost per pcs from distributor, after disc, EXC PPN)
// HPP = Harga Pokok Penjualan (cost per pcs INC PPN) = HNA × (1 + PPN_RATE)

const PPN_RATE = 0.11; // Indonesia PPN 11%

const hppFromHna = (hna) => {
  const n = parseFloat(hna);
  if (isNaN(n)) return 0;
  return n * (1 + PPN_RATE);
};

const hnaFromHpp = (hpp) => {
  const n = parseFloat(hpp);
  if (isNaN(n)) return 0;
  return n / (1 + PPN_RATE);
};

module.exports = { PPN_RATE, hppFromHna, hnaFromHpp };
