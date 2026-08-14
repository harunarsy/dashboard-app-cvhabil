import { hppFromHna, totalStock } from '@habil/core';

export default function App() {
  const contoh = [
    { id: 1, qty_current: 28, hna: 85500, is_active: true, created_at: '2026-06-22' },
    { id: 2, qty_current: 159, hna: 87400, is_active: true, created_at: '2026-07-21' },
  ];
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>Habil Beta V2</h1>
      <p>HPP dari HNA 87.400: {hppFromHna(87400).toFixed(2)}</p>
      <p>Total stok contoh: {totalStock(contoh)}</p>
    </div>
  );
}
