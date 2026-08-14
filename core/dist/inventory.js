"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sellableBatches = sellableBatches;
exports.totalStock = totalStock;
exports.stockValue = stockValue;
exports.costTiers = costTiers;
exports.fefoBatch = fefoBatch;
/**
 * Bug v1.66.2: batch nonaktif ikut dihitung sebagai stok padahal pengurangan
 * FEFO saat jualan mengecualikannya — 168 unit "stok hantu" di 4 produk.
 * Semua perhitungan stok WAJIB lewat fungsi ini.
 */
function sellableBatches(batches) {
    return (batches || []).filter(b => Number(b.qty_current) > 0 && (b.is_active ?? true) === true);
}
function totalStock(batches) {
    return sellableBatches(batches).reduce((s, b) => s + Number(b.qty_current), 0);
}
/** Nilai persediaan exc PPN = Σ(qty × hna) per batch — BUKAN satu harga × total stok. */
function stockValue(batches) {
    return sellableBatches(batches).reduce((s, b) => s + Number(b.qty_current) * (parseFloat(String(b.hna)) || 0), 0);
}
/** Rincian harga beli: batch berharga sama digabung, urut dari paling lama. */
function costTiers(batches) {
    const map = new Map();
    for (const b of sellableBatches(batches)) {
        const hna = parseFloat(String(b.hna)) || 0;
        const created = String(b.created_at ?? '');
        const found = map.get(hna);
        if (found) {
            found.qty += Number(b.qty_current);
            if (created && created < found.oldest)
                found.oldest = created;
        }
        else {
            map.set(hna, { hna, qty: Number(b.qty_current), oldest: created });
        }
    }
    return [...map.values()]
        .sort((a, b) => (a.oldest < b.oldest ? -1 : a.oldest > b.oldest ? 1 : 0))
        .map(({ hna, qty }) => ({ hna, qty }));
}
/** Batch yang akan keluar duluan: ED paling awal, null di akhir. */
function fefoBatch(batches) {
    const s = sellableBatches(batches);
    if (!s.length)
        return null;
    return [...s].sort((a, b) => {
        if (!a.expired_date)
            return 1;
        if (!b.expired_date)
            return -1;
        if (a.expired_date === b.expired_date)
            return a.id - b.id;
        return a.expired_date < b.expired_date ? -1 : 1;
    })[0];
}
