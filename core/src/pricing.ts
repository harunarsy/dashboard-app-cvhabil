/**
 * SATU-SATUNYA tempat nilai PPN didefinisikan. Sebelumnya nilai ini ada di
 * frontend/src/utils/rupiah.js DAN backend/utils/tax.js — pernah tidak sinkron
 * saat 0.11 sempat diubah ke 0.12 lalu dikembalikan (v1.55.x).
 */
export const PPN_RATE = 0.11;

/** HNA (exc PPN) menjadi HPP (inc PPN). Perkalian linear — aman dijumlah dulu. */
export function hppFromHna(hna: unknown): number {
  const n = parseFloat(String(hna));
  if (!Number.isFinite(n)) return 0;
  return n * (1 + PPN_RATE);
}

/** Dasar Pengenaan Pajak dari harga kotor yang sudah termasuk PPN. */
export function dppFromGross(gross: number): number {
  const n = Number(gross) || 0;
  return n / (1 + PPN_RATE);
}

/** Porsi PPN dari harga kotor yang sudah termasuk PPN. */
export function ppnFromGross(gross: number): number {
  const n = Number(gross) || 0;
  return n - dppFromGross(n);
}
