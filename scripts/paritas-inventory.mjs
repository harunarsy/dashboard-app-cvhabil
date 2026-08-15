// Membandingkan angka yang dihitung @habil/core dengan yang dikirim backend,
// untuk SEMUA produk, supaya selisih ketahuan otomatis (bukan dicek manual).
// READ-ONLY — hanya GET. Jalankan: node scripts/paritas-inventory.mjs <TOKEN>
import { totalStock, stockValue, costTiers } from '../core/dist/index.js';

const token = process.argv[2];
if (!token) {
  console.error('Pakai: node scripts/paritas-inventory.mjs <TOKEN>');
  process.exit(1);
}

const BASE = 'https://habil-backend.vercel.app/api';

const get = async (p) => {
  let r;
  try {
    r = await fetch(BASE + p, { headers: { Authorization: `Bearer ${token}` } });
  } catch (err) {
    throw new Error(`${p} -> gagal konek: ${err.message}`);
  }
  if (!r.ok) {
    throw new Error(`${p} -> HTTP ${r.status} ${r.statusText}`);
  }
  return r.json();
};

let produk;
try {
  produk = await get('/inventory/products?limit=2000');
} catch (err) {
  console.error(`Gagal ambil daftar produk: ${err.message}`);
  process.exit(1);
}

let beda = 0;
let galat = 0;

for (const p of produk) {
  let list;
  try {
    // Endpoint yang benar: /inventory/products/:id/batches (bukan /inventory/batches/:id).
    const raw = await get(`/inventory/products/${p.id}/batches`);
    list = Array.isArray(raw) ? raw : raw.batches || [];
  } catch (err) {
    galat++;
    console.log(`GALAT ${p.code ?? p.id}: ${err.message}`);
    continue;
  }

  const stokCore = totalStock(list);
  const stokApi = Number(p.total_stock);
  const nilaiCore = Math.round(stockValue(list));
  const nilaiApi = Math.round(Number(p.stock_value || 0));
  const tierCore = costTiers(list);
  const tierApi = (p.batch_cost_tiers || []).map((t) => ({
    hna: Number(t.hna), qty: Number(t.qty),
  }));

  const cocok =
    stokCore === stokApi &&
    nilaiCore === nilaiApi &&
    JSON.stringify(tierCore) === JSON.stringify(tierApi);

  if (!cocok) {
    beda++;
    console.log(`BEDA ${p.code}: stok core=${stokCore} api=${stokApi} | nilai core=${nilaiCore} api=${nilaiApi}`);
    console.log('   tier core:', JSON.stringify(tierCore));
    console.log('   tier api :', JSON.stringify(tierApi));
  }
}

console.log(`\nDiperiksa ${produk.length} produk. Beda: ${beda}. Galat ambil batch: ${galat}.`);
process.exit(beda === 0 && galat === 0 ? 0 : 1);
