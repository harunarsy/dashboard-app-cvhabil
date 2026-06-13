// Pricing engine — rekomendasi harga jual per marketplace (Shopee / Tokopedia-TikTok / Offline).
// Modul murni: tanpa DB, tanpa side effect. Fee profile datang dari caller (DB marketplace_fee_profiles
// atau DEFAULT_FEE_PROFILES di bawah). Semua rate dalam pecahan desimal (6.75% = 0.0675).
//
// Rumus inti:
//   hppTotal           = hpp_per_unit × qty_bundle
//   totalVariableRate  = variable_fee_rate + seller_discount_rate + affiliate_rate + campaign_rate
//   price              = (hppTotal + packing_fee + target_profit + fixed_order_fee) / (1 − totalVariableRate)
//
// Anti double-count fixed fee:
//   feeMode 'effective' → variable_fee_rate diambil dari safe_effective_fee_rate (sudah memuat
//   komponen fixed dari riwayat transaksi) dan fixed_order_fee DIPAKSA 0.
//   feeMode 'official'  → variable_fee_rate = admin_rate + service_rate, fixed_order_fee dihitung.

const DEFAULT_FEE_PROFILES = [
  // source: 'official' = rate resmi marketplace, 'historical_order' = dihitung dari transaksi nyata,
  // 'manual_override' = di-set manual dari dashboard. Prioritas resolve: historical_order > manual_override > official.
  { platform: 'shopee', category_key: 'food_beverage', label: 'Shopee — Makanan & Minuman', admin_rate: 0.0675, service_rate: 0.105, fixed_order_fee: 1250, safe_effective_fee_rate: 0.185, source: 'official' },
  { platform: 'shopee', category_key: 'health_supplement', label: 'Shopee — Kesehatan & Suplemen', admin_rate: 0.0825, service_rate: 0.105, fixed_order_fee: 1250, safe_effective_fee_rate: 0.195, source: 'official' },
  { platform: 'shopee', category_key: 'default', label: 'Shopee — Umum', admin_rate: 0, service_rate: 0, fixed_order_fee: 1250, safe_effective_fee_rate: 0.20, source: 'official' },
  { platform: 'tokopedia_tiktok', category_key: 'default', label: 'Tokopedia / TikTok — Normal', admin_rate: 0, service_rate: 0, fixed_order_fee: 1250, safe_effective_fee_rate: 0.19, source: 'official' },
  { platform: 'tokopedia_tiktok', category_key: 'voucher_boost_active', label: 'Tokopedia / TikTok — Voucher Boost', admin_rate: 0, service_rate: 0, fixed_order_fee: 1250, safe_effective_fee_rate: 0.32, source: 'official' },
  { platform: 'offline', category_key: 'default', label: 'Offline — Tunai / Transfer', admin_rate: 0, service_rate: 0, fixed_order_fee: 0, safe_effective_fee_rate: 0, source: 'official' },
  { platform: 'offline', category_key: 'qris', label: 'Offline — QRIS', admin_rate: 0, service_rate: 0, fixed_order_fee: 0, safe_effective_fee_rate: 0.007, source: 'official' },
  { platform: 'offline', category_key: 'credit_card', label: 'Offline — Kartu Kredit (EDC)', admin_rate: 0, service_rate: 0, fixed_order_fee: 0, safe_effective_fee_rate: 0.025, source: 'official' },
];

// Target profit default sebagai persen dari hppTotal — bisa dioverride caller.
const PROFIT_RATES = { thin: 0.05, healthy: 0.15 };

const num = (v, fallback = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

// Pembulatan psikologis KE ATAS (tidak pernah di bawah harga hitung → margin tidak tergerus).
// ≤ 20rb: kelipatan 1.000 berakhiran 900 supaya harga kecil tetap kebaca beda.
// > 20rb s/d 100rb: kelipatan 5.000 berakhiran 4.900/9.900
// (24.900, 29.900, 49.900, 54.900, 59.900) · > 100rb: kelipatan 10.000 berakhiran 9.900.
const psychologicalRound = (price) => {
  const p = Math.max(0, num(price));
  if (p <= 0) return 0;
  if (p <= 100) return Math.ceil(p / 100) * 100;
  let step, ending;
  if (p <= 20000) { step = 1000; ending = 900; }
  else if (p <= 100000) { step = 5000; ending = 4900; }
  else { step = 10000; ending = 9900; }
  let candidate = Math.floor(p / step) * step + ending;
  while (candidate < p) candidate += step;
  return candidate;
};

// Resolve profile dari daftar (DB rows atau default). Prioritas source:
// historical_order > manual_override > official, lalu fallback category 'default' platform yang sama.
const SOURCE_PRIORITY = { historical_order: 3, manual_override: 2, official: 1 };
const resolveFeeProfile = (profiles, platform, categoryKey) => {
  const list = (Array.isArray(profiles) && profiles.length ? profiles : DEFAULT_FEE_PROFILES)
    .filter((p) => p.active !== false);
  const byPriority = (rows) =>
    rows.sort((a, b) => (SOURCE_PRIORITY[b.source] || 0) - (SOURCE_PRIORITY[a.source] || 0))[0] || null;
  const exact = byPriority(list.filter((p) => p.platform === platform && p.category_key === (categoryKey || 'default')));
  if (exact) return exact;
  return byPriority(list.filter((p) => p.platform === platform && p.category_key === 'default'));
};

// Hitung harga untuk satu target profit nominal.
const priceFor = ({ hppTotal, packingFee, targetProfit, fixedOrderFee, totalVariableRate }) => {
  if (totalVariableRate >= 1) return null; // fee ≥ 100% → tidak ada harga yang masuk akal
  return (hppTotal + packingFee + targetProfit + fixedOrderFee) / (1 - totalVariableRate);
};

// Simulasi P&L pada harga jual tertentu.
const simulate = ({ price, hppTotal, packingFee, fixedOrderFee, totalVariableRate }) => {
  const gross = num(price);
  const netIncome = gross * (1 - totalVariableRate) - fixedOrderFee;
  const profit = netIncome - hppTotal - packingFee;
  return {
    harga_jual: Math.round(gross),
    estimasi_penghasilan_bersih: Math.round(netIncome),
    estimasi_laba: Math.round(profit),
    margin_laba: gross > 0 ? +(profit / gross * 100).toFixed(2) : 0,
  };
};

/**
 * recommendPrice(input)
 * input: {
 *   product_name, hpp_per_unit, qty_bundle=1, packing_fee=0,
 *   target_profit_mode: 'bep'|'thin'|'healthy'|'promo_safe'|'custom', custom_target_profit,
 *   platform: 'shopee'|'tokopedia_tiktok'|'offline', category_key,
 *   seller_discount_rate=0, affiliate_rate=0, campaign_rate=0,
 *   fee_mode: 'effective' (default) | 'official',
 *   fixed_order_fee, variable_fee_rate,   // override manual; kalau diisi, mengalahkan profile
 *   fee_profiles: rows dari DB (opsional), profit_rates: {thin, healthy} (opsional)
 * }
 */
const recommendPrice = (input = {}) => {
  const warnings = [];
  const hppPerUnit = num(input.hpp_per_unit);
  const qtyBundle = Math.max(1, num(input.qty_bundle, 1));
  const packingFee = num(input.packing_fee);
  const platform = input.platform || 'offline';
  const feeMode = input.fee_mode === 'official' ? 'official' : 'effective';
  const profitRates = { ...PROFIT_RATES, ...(input.profit_rates || {}) };

  if (hppPerUnit <= 0) warnings.push('HPP per unit kosong/nol — hasil hanya valid kalau produk benar-benar tanpa modal.');

  const profile = resolveFeeProfile(input.fee_profiles, platform, input.category_key) || {};

  // Tentukan komponen fee sesuai mode — fixed fee TIDAK pernah dobel.
  let baseVariableRate; let fixedOrderFee;
  if (input.variable_fee_rate !== undefined && input.variable_fee_rate !== null && input.variable_fee_rate !== '') {
    baseVariableRate = num(input.variable_fee_rate);
    fixedOrderFee = num(input.fixed_order_fee);
  } else if (feeMode === 'official') {
    baseVariableRate = num(profile.admin_rate) + num(profile.service_rate);
    fixedOrderFee = input.fixed_order_fee !== undefined ? num(input.fixed_order_fee) : num(profile.fixed_order_fee);
  } else {
    baseVariableRate = num(profile.safe_effective_fee_rate);
    fixedOrderFee = 0; // effective rate sudah memuat fixed fee dari riwayat — jangan dihitung dua kali
  }

  const sellerDiscountRate = num(input.seller_discount_rate);
  const affiliateRate = num(input.affiliate_rate);
  const campaignRate = num(input.campaign_rate);
  const totalVariableRate = baseVariableRate + sellerDiscountRate + affiliateRate + campaignRate;

  const hppTotal = hppPerUnit * qtyBundle;
  const ctx = { hppTotal, packingFee, fixedOrderFee, totalVariableRate };

  if (totalVariableRate >= 1) {
    warnings.push(`Total potongan ${(totalVariableRate * 100).toFixed(1)}% ≥ 100% — tidak ada harga yang bisa untung. Kurangi diskon/campaign.`);
  } else if (totalVariableRate >= 0.5) {
    warnings.push(`Total potongan ${(totalVariableRate * 100).toFixed(1)}% sangat tinggi — harga rekomendasi akan jauh di atas pasar.`);
  }

  const targetThin = hppTotal * num(profitRates.thin, 0.05);
  const targetHealthy = hppTotal * num(profitRates.healthy, 0.15);

  const hargaBep = priceFor({ ...ctx, targetProfit: 0 });
  const hargaThin = priceFor({ ...ctx, targetProfit: targetThin });
  const hargaHealthy = priceFor({ ...ctx, targetProfit: targetHealthy });

  // promo_safe: harga yang tetap memberi laba tipis SAAT skenario promo terburuk aktif
  // (campaign sekarang + voucher boost untuk Tokopedia/TikTok, atau +5% buffer campaign untuk lainnya).
  let promoRate = totalVariableRate;
  if (platform === 'tokopedia_tiktok') {
    const boost = resolveFeeProfile(input.fee_profiles, 'tokopedia_tiktok', 'voucher_boost_active');
    if (boost) promoRate = num(boost.safe_effective_fee_rate) + sellerDiscountRate + affiliateRate + campaignRate;
  } else if (campaignRate === 0 && platform !== 'offline') {
    promoRate = totalVariableRate + 0.05;
  }
  const hargaPromoSafe = promoRate < 1
    ? priceFor({ ...ctx, targetProfit: targetThin, totalVariableRate: promoRate })
    : null;

  // Mode target → harga acuan rekomendasi.
  const mode = input.target_profit_mode || 'healthy';
  let targetProfit;
  if (mode === 'bep') targetProfit = 0;
  else if (mode === 'thin') targetProfit = targetThin;
  else if (mode === 'promo_safe') targetProfit = targetThin;
  else if (mode === 'custom') targetProfit = num(input.custom_target_profit);
  else targetProfit = targetHealthy;

  const rawRecommended = mode === 'promo_safe'
    ? hargaPromoSafe
    : priceFor({ ...ctx, targetProfit });
  const recommended = rawRecommended === null ? null : psychologicalRound(rawRecommended);

  const sim = recommended === null ? null : simulate({ price: recommended, ...ctx });
  if (sim && sim.estimasi_laba < 0) {
    warnings.push('Laba NEGATIF pada harga rekomendasi — naikkan harga atau kurangi biaya.');
  }
  // Cek skenario promo pada harga rekomendasi (bukan pada harga promo_safe).
  if (recommended !== null && promoRate < 1 && promoRate > totalVariableRate) {
    const promoSim = simulate({ price: recommended, ...ctx, totalVariableRate: promoRate });
    if (promoSim.estimasi_laba < 0) {
      warnings.push(`Kalau campaign/voucher boost aktif (potongan ${(promoRate * 100).toFixed(1)}%), harga ini RUGI ${Math.abs(promoSim.estimasi_laba).toLocaleString('id-ID')} per order. Pakai harga aman promo: ${hargaPromoSafe ? psychologicalRound(hargaPromoSafe).toLocaleString('id-ID') : '—'}.`);
    }
  }

  const round = (v) => (v === null ? null : Math.round(v));
  return {
    product_name: input.product_name || null,
    platform,
    category_key: input.category_key || 'default',
    fee_mode: feeMode,
    fee_source: profile.source || null,
    fee_profile_label: profile.label || null,
    hpp_total: Math.round(hppTotal),
    packing_fee: Math.round(packingFee),
    fixed_order_fee: Math.round(fixedOrderFee),
    total_variable_fee_rate: +(totalVariableRate * 100).toFixed(2),
    harga_bep: round(hargaBep),
    harga_laba_tipis: round(hargaThin),
    harga_laba_sehat: round(hargaHealthy),
    harga_aman_promo: round(hargaPromoSafe),
    harga_rekomendasi_psikologis: recommended,
    pembulatan_psikologis: {
      bep: hargaBep === null ? null : psychologicalRound(hargaBep),
      laba_tipis: hargaThin === null ? null : psychologicalRound(hargaThin),
      laba_sehat: hargaHealthy === null ? null : psychologicalRound(hargaHealthy),
      aman_promo: hargaPromoSafe === null ? null : psychologicalRound(hargaPromoSafe),
    },
    estimasi: sim, // pada harga rekomendasi psikologis
    warnings,
  };
};

// Fee kartu kredit / metode bayar pada nota offline:
// mode 'absorb'  → margin dipotong fee (harga ke customer tetap)
// mode 'pass_on' → nominal tagihan di-gross-up supaya net yang diterima tetap = amount
const applyPaymentFee = ({ amount, rate, mode = 'absorb' }) => {
  const a = num(amount); const r = num(rate);
  if (a <= 0 || r <= 0) return { charged: Math.round(a), fee: 0, net: Math.round(a), mode };
  if (mode === 'pass_on') {
    const charged = a / (1 - r);
    return { charged: Math.round(charged), fee: Math.round(charged - a), net: Math.round(a), mode };
  }
  const fee = a * r;
  return { charged: Math.round(a), fee: Math.round(fee), net: Math.round(a - fee), mode };
};

module.exports = {
  DEFAULT_FEE_PROFILES,
  PROFIT_RATES,
  psychologicalRound,
  resolveFeeProfile,
  recommendPrice,
  applyPaymentFee,
};
