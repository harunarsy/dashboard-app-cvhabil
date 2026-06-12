// Unit test pricing engine — murni, tanpa DB. Jalankan: node scripts/test-pricing-engine.js
const {
  recommendPrice,
  psychologicalRound,
  applyPaymentFee,
  resolveFeeProfile,
  DEFAULT_FEE_PROFILES,
} = require('../utils/pricingEngine');

let pass = 0; let fail = 0;
const assert = (label, cond, detail) => {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
};
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;

console.log('1) psychologicalRound');
assert('9.400 → 9.900', psychologicalRound(9400) === 9900, psychologicalRound(9400));
assert('10.100 → 14.900', psychologicalRound(10100) === 14900, psychologicalRound(10100));
assert('47.000 → 49.900', psychologicalRound(47000) === 49900, psychologicalRound(47000));
assert('50.000 → 54.900', psychologicalRound(50000) === 54900, psychologicalRound(50000));
assert('49.900 tetap 49.900', psychologicalRound(49900) === 49900, psychologicalRound(49900));
assert('101.000 → 109.900', psychologicalRound(101000) === 109900, psychologicalRound(101000));
assert('125.000 → 129.900', psychologicalRound(125000) === 129900, psychologicalRound(125000));
assert('131.000 → 139.900', psychologicalRound(131000) === 139900, psychologicalRound(131000));
assert('selalu ≥ input', psychologicalRound(99901) >= 99901, psychologicalRound(99901));

console.log('2) resolveFeeProfile — prioritas source & fallback');
const customProfiles = [
  { platform: 'shopee', category_key: 'food_beverage', safe_effective_fee_rate: 0.17, source: 'historical_order' },
  { platform: 'shopee', category_key: 'food_beverage', safe_effective_fee_rate: 0.185, source: 'official' },
  { platform: 'shopee', category_key: 'default', safe_effective_fee_rate: 0.20, source: 'official' },
];
assert('historical_order menang atas official',
  resolveFeeProfile(customProfiles, 'shopee', 'food_beverage').source === 'historical_order');
assert('kategori tak dikenal → fallback default platform',
  resolveFeeProfile(customProfiles, 'shopee', 'kategori_aneh').category_key === 'default');
assert('default profiles punya 8 entri', DEFAULT_FEE_PROFILES.length === 8, DEFAULT_FEE_PROFILES.length);

console.log('3) recommendPrice — Shopee F&B effective mode (HPP 15.486×12, packing 3.000)');
const r1 = recommendPrice({
  product_name: 'FRISIAN FLAG OMELA 1L', hpp_per_unit: 15486, qty_bundle: 12,
  packing_fee: 3000, platform: 'shopee', category_key: 'food_beverage',
  target_profit_mode: 'healthy',
});
// effective: rate 18.5%, fixed=0. hppTotal=185.832. BEP=(185832+3000)/(1-0.185)=231.696,93
assert('hpp_total = 185.832', r1.hpp_total === 185832, r1.hpp_total);
assert('fixed fee = 0 di mode effective (anti double-count)', r1.fixed_order_fee === 0, r1.fixed_order_fee);
assert('harga_bep ≈ 231.696', near(r1.harga_bep, 231697, 2), r1.harga_bep);
assert('harga_laba_sehat ≈ 265.898', near(r1.harga_laba_sehat, 265898, 3), r1.harga_laba_sehat);
assert('rekomendasi = pembulatan psikologis ke atas', r1.harga_rekomendasi_psikologis === 269900, r1.harga_rekomendasi_psikologis);
assert('estimasi laba positif', r1.estimasi.estimasi_laba > 0, JSON.stringify(r1.estimasi));
assert('margin_laba terisi', r1.estimasi.margin_laba > 0, r1.estimasi.margin_laba);

console.log('4) recommendPrice — mode official Shopee F&B (admin 6.75% + service 10.5% + fixed 1.250)');
const r2 = recommendPrice({
  hpp_per_unit: 10000, qty_bundle: 1, platform: 'shopee', category_key: 'food_beverage',
  fee_mode: 'official', target_profit_mode: 'bep',
});
// rate=0.1725, BEP=(10000+0+0+1250)/(1-0.1725)=13.595,17
assert('fixed fee 1.250 ikut dihitung', r2.fixed_order_fee === 1250, r2.fixed_order_fee);
assert('total rate 17.25%', r2.total_variable_fee_rate === 17.25, r2.total_variable_fee_rate);
assert('harga_bep ≈ 13.595', near(r2.harga_bep, 13595, 2), r2.harga_bep);

console.log('5) warning rugi & fee ≥ 100%');
const r3 = recommendPrice({
  hpp_per_unit: 10000, qty_bundle: 1, platform: 'tokopedia_tiktok',
  seller_discount_rate: 0.4, affiliate_rate: 0.3, campaign_rate: 0.2, // 0.19+0.9 = 109%
});
assert('fee ≥ 100% → harga null + warning', r3.harga_bep === null && r3.warnings.length > 0, JSON.stringify(r3.warnings));

console.log('6) promo_safe Tokopedia/TikTok pakai rate voucher boost 32%');
const r4 = recommendPrice({
  hpp_per_unit: 50000, qty_bundle: 1, platform: 'tokopedia_tiktok', target_profit_mode: 'healthy',
});
// normal 19%: healthy=(50000+7500)/(0.81)=70.987,65 ; promo_safe pakai 32%: (50000+2500)/0.68=77.205,88
assert('harga_aman_promo > harga_laba_sehat saat boost lebih mahal', r4.harga_aman_promo > r4.harga_laba_sehat,
  `${r4.harga_aman_promo} vs ${r4.harga_laba_sehat}`);
assert('harga_aman_promo ≈ 77.206', near(r4.harga_aman_promo, 77206, 2), r4.harga_aman_promo);
// mode thin → harga rekomendasi 64.900; saat boost 32% net = 44.132 < HPP 50.000 → harus ada warning rugi
const r4b = recommendPrice({
  hpp_per_unit: 50000, qty_bundle: 1, platform: 'tokopedia_tiktok', target_profit_mode: 'thin',
});
const adaWarningPromo = r4b.warnings.some((w) => w.includes('RUGI'));
assert('warning potensi rugi saat boost aktif muncul (mode thin)', adaWarningPromo, JSON.stringify(r4b.warnings));
assert('mode healthy 74.900 tetap aman saat boost → tanpa warning rugi',
  !r4.warnings.some((w) => w.includes('RUGI')), JSON.stringify(r4.warnings));

console.log('7) offline: tunai 0%, QRIS 0.7%, kartu kredit 2.5%');
const rTunai = recommendPrice({ hpp_per_unit: 100000, platform: 'offline', target_profit_mode: 'bep' });
assert('tunai BEP = HPP', rTunai.harga_bep === 100000, rTunai.harga_bep);
const rQris = recommendPrice({ hpp_per_unit: 100000, platform: 'offline', category_key: 'qris', target_profit_mode: 'bep' });
assert('QRIS BEP ≈ 100.705', near(rQris.harga_bep, 100705, 2), rQris.harga_bep);
const rCc = recommendPrice({ hpp_per_unit: 100000, platform: 'offline', category_key: 'credit_card', target_profit_mode: 'bep' });
assert('Kartu kredit BEP ≈ 102.564', near(rCc.harga_bep, 102564, 2), rCc.harga_bep);

console.log('8) custom target profit');
const r5 = recommendPrice({
  hpp_per_unit: 20000, qty_bundle: 2, packing_fee: 1000, platform: 'offline',
  target_profit_mode: 'custom', custom_target_profit: 9000,
});
assert('custom: (40000+1000+9000)/1 = 50.000 → 54.900', r5.harga_rekomendasi_psikologis === 54900, r5.harga_rekomendasi_psikologis);

console.log('9) applyPaymentFee — kartu kredit');
const absorb = applyPaymentFee({ amount: 1000000, rate: 0.025, mode: 'absorb' });
assert('absorb: customer bayar 1.000.000', absorb.charged === 1000000, JSON.stringify(absorb));
assert('absorb: net berkurang fee 25.000', absorb.net === 975000 && absorb.fee === 25000, JSON.stringify(absorb));
const passOn = applyPaymentFee({ amount: 1000000, rate: 0.025, mode: 'pass_on' });
assert('pass_on: net tetap 1.000.000', passOn.net === 1000000, JSON.stringify(passOn));
assert('pass_on: charged ≈ 1.025.641', near(passOn.charged, 1025641, 2), JSON.stringify(passOn));
const zeroFee = applyPaymentFee({ amount: 500000, rate: 0 });
assert('rate 0 → tanpa perubahan', zeroFee.charged === 500000 && zeroFee.fee === 0 && zeroFee.net === 500000);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
