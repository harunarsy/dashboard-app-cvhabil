export interface Batch {
    id: number;
    qty_current: number;
    hna: number | string;
    expired_date?: string | null;
    is_active?: boolean | null;
    created_at?: string | null;
}
/**
 * Bug v1.66.2: batch nonaktif ikut dihitung sebagai stok padahal pengurangan
 * FEFO saat jualan mengecualikannya — 168 unit "stok hantu" di 4 produk.
 * Semua perhitungan stok WAJIB lewat fungsi ini.
 */
export declare function sellableBatches(batches: Batch[]): Batch[];
export declare function totalStock(batches: Batch[]): number;
/** Nilai persediaan exc PPN = Σ(qty × hna) per batch — BUKAN satu harga × total stok. */
export declare function stockValue(batches: Batch[]): number;
/** Rincian harga beli: batch berharga sama digabung, urut dari paling lama. */
export declare function costTiers(batches: Batch[]): Array<{
    hna: number;
    qty: number;
}>;
/** Batch yang akan keluar duluan: ED paling awal, null di akhir. */
export declare function fefoBatch(batches: Batch[]): Batch | null;
