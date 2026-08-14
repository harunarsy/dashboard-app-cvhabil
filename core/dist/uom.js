"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toBaseQty = toBaseQty;
exports.displayQty = displayQty;
/**
 * Ubah qty yang diketik operator (dalam `unit`) menjadi satuan dasar.
 * Bug v1.65.2: harga per karton tersimpan sebagai harga per pcs karena
 * konversi ini tersebar di banyak berkas. Di sini satu-satunya tempatnya.
 */
function toBaseQty(qtyInUnit, unit, product) {
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
function displayQty(item, _product) {
    const qty = Number(item.qty_in_unit ?? item.qty) || 0;
    return { qty, unit: item.unit || 'pcs' };
}
