/**
 * Bug v1.66.0: `new Date(d + "T00:00:00")` menghasilkan
 * "2026-07-17T00:00:00.000ZT00:00:00" -> Invalid Date di 64 tempat pada
 * halaman Keuangan, karena API mengirim timestamp ISO penuh.
 * Ambil bagian tanggalnya dulu, selalu.
 */
export function parseDateOnly(input: unknown): Date | null {
  if (input === null || input === undefined || input === '') return null;
  const datePart = String(input).split('T')[0];
  const d = new Date(`${datePart}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format Indonesia singkat, mis. "17 Jul 2026". Tidak pernah "Invalid Date". */
export function formatDateID(input: unknown, fallback = '—'): string {
  const d = parseDateOnly(input);
  if (!d) return fallback;
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
