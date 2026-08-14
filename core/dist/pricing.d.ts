/**
 * SATU-SATUNYA tempat nilai PPN didefinisikan. Sebelumnya nilai ini ada di
 * frontend/src/utils/rupiah.js DAN backend/utils/tax.js — pernah tidak sinkron
 * saat 0.11 sempat diubah ke 0.12 lalu dikembalikan (v1.55.x).
 */
export declare const PPN_RATE = 0.11;
/** HNA (exc PPN) menjadi HPP (inc PPN). Perkalian linear — aman dijumlah dulu. */
export declare function hppFromHna(hna: unknown): number;
/** Dasar Pengenaan Pajak dari harga kotor yang sudah termasuk PPN. */
export declare function dppFromGross(gross: number): number;
/** Porsi PPN dari harga kotor yang sudah termasuk PPN. */
export declare function ppnFromGross(gross: number): number;
