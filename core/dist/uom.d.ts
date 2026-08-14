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
export declare function toBaseQty(qtyInUnit: number, unit: string, product: PackInfo): number;
/**
 * Qty yang DITAMPILKAN ke operator. `qty` selalu satuan dasar (pcs);
 * `qty_in_unit` adalah angka yang diketik operator dalam `unit`.
 * Bug v1.65.4: urutan terbalik bikin 4 karton tampil "48 karton".
 */
export declare function displayQty(item: QtyFields, _product?: PackInfo): {
    qty: number;
    unit: string;
};
