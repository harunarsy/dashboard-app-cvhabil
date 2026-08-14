import { hppFromHna, formatDateID } from '@habil/core';
import { useProducts } from '../hooks/useProducts';

// Format Rupiah, inc PPN — bulat ke bawah tanpa desimal, sesuai tampilan v1.
const rp = (n: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
  }).format(n || 0);

export default function Inventory() {
  const { data = [], isLoading, error } = useProducts();

  if (isLoading) return <p>Memuat…</p>;
  if (error) return <p role="alert">Gagal memuat: {(error as Error).message}</p>;

  // stock_value per produk exc PPN → jumlah HPP (inc PPN). hppFromHna linear,
  // jadi jumlah-lalu-konversi = konversi-lalu-jumlah — cocok dengan angka acuan v1.
  const totalNilai = data.reduce((s, p) => s + hppFromHna(p.stock_value), 0);

  return (
    <div>
      <h2>Inventory</h2>
      <p>{data.length} produk · total nilai {rp(totalNilai)}</p>
      <table>
        <thead>
          <tr><th>Kode</th><th>Nama</th><th>Stok</th><th>HPP</th><th>ED terdekat</th></tr>
        </thead>
        <tbody>
          {data.map((p) => {
            const tiers = p.batch_cost_tiers ?? [];
            // Tier terakhir = batch terbaru (backend sudah urut lama→baru) — itu HNA berjalan.
            const utama = tiers.length ? tiers[tiers.length - 1].hna : 0;
            return (
              <tr key={p.id}>
                <td>{p.code}</td>
                <td>{p.name}</td>
                <td>{Number(p.total_stock)} {p.base_unit || p.unit || 'pcs'}</td>
                <td>
                  {rp(hppFromHna(utama))}
                  {tiers.length > 1 && (
                    <div style={{ fontSize: 11, color: '#888' }}>
                      {tiers.map((t, i) => (
                        <div key={i}>{t.qty} @ {rp(hppFromHna(t.hna))}</div>
                      ))}
                    </div>
                  )}
                </td>
                <td>{formatDateID(p.nearest_expiry)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
