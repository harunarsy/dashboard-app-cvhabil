"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PPN_RATE = void 0;
exports.hppFromHna = hppFromHna;
exports.dppFromGross = dppFromGross;
exports.ppnFromGross = ppnFromGross;
/**
 * SATU-SATUNYA tempat nilai PPN didefinisikan. Sebelumnya nilai ini ada di
 * frontend/src/utils/rupiah.js DAN backend/utils/tax.js — pernah tidak sinkron
 * saat 0.11 sempat diubah ke 0.12 lalu dikembalikan (v1.55.x).
 */
exports.PPN_RATE = 0.11;
/** HNA (exc PPN) menjadi HPP (inc PPN). Perkalian linear — aman dijumlah dulu. */
function hppFromHna(hna) {
    const n = parseFloat(String(hna));
    if (!Number.isFinite(n))
        return 0;
    return n * (1 + exports.PPN_RATE);
}
/** Dasar Pengenaan Pajak dari harga kotor yang sudah termasuk PPN. */
function dppFromGross(gross) {
    const n = Number(gross) || 0;
    return n / (1 + exports.PPN_RATE);
}
/** Porsi PPN dari harga kotor yang sudah termasuk PPN. */
function ppnFromGross(gross) {
    const n = Number(gross) || 0;
    return n - dppFromGross(n);
}
