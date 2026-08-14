/**
 * Bug v1.66.0: `new Date(d + "T00:00:00")` menghasilkan
 * "2026-07-17T00:00:00.000ZT00:00:00" -> Invalid Date di 64 tempat pada
 * halaman Keuangan, karena API mengirim timestamp ISO penuh.
 * Ambil bagian tanggalnya dulu, selalu.
 */
export declare function parseDateOnly(input: unknown): Date | null;
/** Format Indonesia singkat, mis. "17 Jul 2026". Tidak pernah "Invalid Date". */
export declare function formatDateID(input: unknown, fallback?: string): string;
