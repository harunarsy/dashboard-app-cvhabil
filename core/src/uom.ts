export interface PackInfo {
  base_unit?: string | null;
  pack_unit?: string | null;
  pack_size?: number | null;
}

export interface QtyFields {
  qty: number;
  qty_in_unit?: number | null;
  unit?: string | null;
}

/**
 * Ubah qty yang diketik operator (dalam `unit`) menjadi satuan dasar.
 * Bug v1.65.2: harga per karton tersimpan sebagai harga per pcs karena
 * konversi ini tersebar di banyak berkas. Di sini satu-satunya tempatnya.
 */
export function toBaseQty(qtyInUnit: number, unit: string, product: PackInfo): number {
  const packSize = Number(product.pack_size) || 1;
  const packUnit = product.pack_unit;
  if (packUnit && unit === packUnit && packSize > 1) {
    return qtyInUnit * packSize;
  }
  return qtyInUnit;
}

/**
 * Qty yang DITAMPILKAN ke operator. `qty` selalu satuan dasar (pcs);
 * `qty_in_unit` adalah angka yang diketik operator dalam `unit`.
 * Bug v1.65.4: urutan terbalik bikin 4 karton tampil "48 karton".
 */
export function displayQty(item: QtyFields, _product?: PackInfo): { qty: number; unit: string } {
  const qty = Number(item.qty_in_unit ?? item.qty) || 0;
  return { qty, unit: item.unit || 'pcs' };
}
