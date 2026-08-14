# Habil V2 Slice 1 — Fondasi `core/` + Inventory Read-Only

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun paket `core/` berisi aturan bisnis Habil dalam TypeScript, membuktikannya dipakai v1 dan lolos build Vercel, lalu menampilkan halaman Inventory read-only di aplikasi Vite baru dengan angka yang identik dengan v1.

**Architecture:** `core/` adalah paket TypeScript berdiri sendiri yang di-build ke `dist/` dan dipasang ke `frontend/` (CRA, v1) serta `web/` (Vite, v2) lewat dependensi `file:../core`. Aturan bisnis hanya ditulis sekali di sana. Backend Express tidak diubah pada slice ini.

**Tech Stack:** TypeScript 5, Vitest, Vite, React 19, npm `file:` dependency.

## Global Constraints

- Bahasa komentar dan pesan commit: **Bahasa Indonesia**.
- `PPN_RATE = 0.11` — nilai tunggal, hanya boleh didefinisikan di `core/src/pricing.ts`.
- Slice 1 **read-only**: tidak ada satu pun `INSERT`/`UPDATE`/`DELETE` ke database.
- Backend (`backend/`) **tidak diubah** pada slice ini.
- v1 (`frontend/`) tetap jalan sepanjang slice; tidak boleh ada perubahan yang merusaknya.
- Setiap task diakhiri commit tersendiri.
- Angka acuan paritas (data produksi, 14 Agu 2026): **83 produk**, stok `TS-CLS-160SCT` = **187**, total nilai persediaan = **Rp 226.120.468** inc PPN.

---

### Task 1: Buat paket `core/` dengan aturan satuan (UoM)

**Files:**
- Create: `core/package.json`
- Create: `core/tsconfig.json`
- Create: `core/src/uom.ts`
- Create: `core/src/index.ts`
- Test: `core/src/uom.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `toBaseQty(qtyInUnit: number, unit: string, product: PackInfo): number`, `displayQty(item: QtyFields, product?: PackInfo): { qty: number; unit: string }`, tipe `PackInfo`, `QtyFields`.

- [ ] **Step 1: Buat `core/package.json`**

```json
{
  "name": "@habil/core",
  "version": "0.1.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Buat `core/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "node",
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 3: Pasang dependensi**

```bash
cd core && npm install
```

- [ ] **Step 4: Tulis test yang gagal**

Buat `core/src/uom.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toBaseQty, displayQty } from './uom';

const omela = { base_unit: 'pcs', pack_unit: 'karton', pack_size: 12 };
const beras = { base_unit: 'pcs', pack_unit: null, pack_size: 1 };

describe('toBaseQty', () => {
  it('4 karton produk pack_size 12 menjadi 48 pcs', () => {
    expect(toBaseQty(4, 'karton', omela)).toBe(48);
  });

  it('qty dalam satuan dasar tidak dikalikan', () => {
    expect(toBaseQty(48, 'pcs', omela)).toBe(48);
  });

  it('produk tanpa pack_unit tidak pernah dikalikan', () => {
    expect(toBaseQty(10, 'karton', beras)).toBe(10);
  });
});

describe('displayQty', () => {
  it('memakai qty_in_unit kalau ada — BUKAN qty base', () => {
    expect(displayQty({ qty: 48, qty_in_unit: 4, unit: 'karton' }))
      .toEqual({ qty: 4, unit: 'karton' });
  });

  it('qty_in_unit null jatuh ke qty', () => {
    expect(displayQty({ qty: 10, qty_in_unit: null, unit: 'pcs' }))
      .toEqual({ qty: 10, unit: 'pcs' });
  });

  it('qty_in_unit undefined jatuh ke qty', () => {
    expect(displayQty({ qty: 10, unit: 'pcs' }))
      .toEqual({ qty: 10, unit: 'pcs' });
  });
});
```

- [ ] **Step 5: Jalankan test, pastikan GAGAL**

Run: `cd core && npx vitest run src/uom.test.ts`
Expected: FAIL — `Failed to resolve import "./uom"`

- [ ] **Step 6: Tulis implementasi minimal**

Buat `core/src/uom.ts`:

```ts
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
```

- [ ] **Step 7: Buat `core/src/index.ts`**

```ts
export * from './uom';
```

- [ ] **Step 8: Jalankan test, pastikan LULUS**

Run: `cd core && npx vitest run`
Expected: PASS — 6 test

- [ ] **Step 9: Pastikan build menghasilkan `dist/`**

Run: `cd core && npm run build && ls dist`
Expected: ada `index.js`, `index.d.ts`, `uom.js`, `uom.d.ts`

- [ ] **Step 10: Commit**

```bash
git add core/
git commit -m "feat(core): paket aturan bisnis + konversi satuan

toBaseQty & displayQty diekstrak jadi satu sumber kebenaran.
Test diambil dari bug nyata: HPP Omela 12x lipat (v1.65.2) dan
draft WA '48 karton' (v1.65.4)."
```

---

### Task 2: Aturan harga — HNA, HPP, PPN

**Files:**
- Create: `core/src/pricing.ts`
- Modify: `core/src/index.ts`
- Test: `core/src/pricing.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `PPN_RATE: 0.11`, `hppFromHna(hna: unknown): number`, `dppFromGross(gross: number): number`, `ppnFromGross(gross: number): number`.

- [ ] **Step 1: Verifikasi nilai PPN di v1 sebelum menyalin**

Run: `grep -rn "PPN_RATE" frontend/src/utils/rupiah.js backend/utils/tax.js`
Catat nilainya. Kalau bukan `0.11`, pakai nilai yang ADA dan perbarui Global Constraints di rencana ini.

- [ ] **Step 2: Tulis test yang gagal**

Buat `core/src/pricing.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PPN_RATE, hppFromHna, dppFromGross, ppnFromGross } from './pricing';

describe('hppFromHna', () => {
  it('menambahkan PPN 11%', () => {
    expect(hppFromHna(85500)).toBeCloseTo(94905, 2);
    expect(hppFromHna(87400)).toBeCloseTo(97014, 2);
  });

  it('string angka tetap dihitung', () => {
    expect(hppFromHna('85500')).toBeCloseTo(94905, 2);
  });

  it('nilai tidak sah jadi 0, bukan NaN', () => {
    expect(hppFromHna(null)).toBe(0);
    expect(hppFromHna(undefined)).toBe(0);
    expect(hppFromHna('abc')).toBe(0);
  });

  it('linear — menjumlah dulu sama dengan menjumlah sesudah', () => {
    const a = hppFromHna(100) + hppFromHna(200);
    const b = hppFromHna(300);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('dpp & ppn dari harga kotor', () => {
  it('memecah gross jadi DPP + PPN', () => {
    const gross = 11189300;
    expect(dppFromGross(gross)).toBeCloseTo(10080450, 0);
    expect(ppnFromGross(gross)).toBeCloseTo(1108850, 0);
  });

  it('DPP + PPN kembali jadi gross', () => {
    const gross = 11189300;
    expect(dppFromGross(gross) + ppnFromGross(gross)).toBeCloseTo(gross, 2);
  });
});

describe('PPN_RATE', () => {
  it('bernilai 0.11', () => {
    expect(PPN_RATE).toBe(0.11);
  });
});
```

- [ ] **Step 3: Jalankan test, pastikan GAGAL**

Run: `cd core && npx vitest run src/pricing.test.ts`
Expected: FAIL — modul `./pricing` tidak ada

- [ ] **Step 4: Tulis implementasi**

Buat `core/src/pricing.ts`:

```ts
/**
 * SATU-SATUNYA tempat nilai PPN didefinisikan. Sebelumnya nilai ini ada di
 * frontend/src/utils/rupiah.js DAN backend/utils/tax.js — pernah tidak sinkron
 * saat 0.11 sempat diubah ke 0.12 lalu dikembalikan (v1.55.x).
 */
export const PPN_RATE = 0.11;

/** HNA (exc PPN) menjadi HPP (inc PPN). Perkalian linear — aman dijumlah dulu. */
export function hppFromHna(hna: unknown): number {
  const n = parseFloat(String(hna));
  if (!Number.isFinite(n)) return 0;
  return n * (1 + PPN_RATE);
}

/** Dasar Pengenaan Pajak dari harga kotor yang sudah termasuk PPN. */
export function dppFromGross(gross: number): number {
  const n = Number(gross) || 0;
  return n / (1 + PPN_RATE);
}

/** Porsi PPN dari harga kotor yang sudah termasuk PPN. */
export function ppnFromGross(gross: number): number {
  const n = Number(gross) || 0;
  return n - dppFromGross(n);
}
```

- [ ] **Step 5: Tambahkan ke `core/src/index.ts`**

```ts
export * from './uom';
export * from './pricing';
```

- [ ] **Step 6: Jalankan seluruh test, pastikan LULUS**

Run: `cd core && npx vitest run`
Expected: PASS — semua test uom + pricing

- [ ] **Step 7: Commit**

```bash
git add core/
git commit -m "feat(core): aturan harga HNA/HPP/PPN

PPN_RATE jadi satu nilai tunggal. Sebelumnya didefinisikan terpisah di
frontend/utils/rupiah.js dan backend/utils/tax.js."
```

---

### Task 3: Aturan tanggal

**Files:**
- Create: `core/src/dates.ts`
- Modify: `core/src/index.ts`
- Test: `core/src/dates.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `parseDateOnly(input: unknown): Date | null`, `formatDateID(input: unknown, fallback?: string): string`.

- [ ] **Step 1: Tulis test yang gagal**

Buat `core/src/dates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseDateOnly, formatDateID } from './dates';

describe('parseDateOnly', () => {
  it('menerima timestamp ISO penuh dari API', () => {
    const d = parseDateOnly('2026-07-17T00:00:00.000Z');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(6);
    expect(d!.getDate()).toBe(17);
  });

  it('menerima YYYY-MM-DD polos', () => {
    const d = parseDateOnly('2026-07-17');
    expect(d!.getDate()).toBe(17);
  });

  it('nilai kosong jadi null', () => {
    expect(parseDateOnly(null)).toBeNull();
    expect(parseDateOnly('')).toBeNull();
    expect(parseDateOnly(undefined)).toBeNull();
  });

  it('nilai ngawur jadi null, BUKAN Invalid Date', () => {
    expect(parseDateOnly('bukan tanggal')).toBeNull();
  });
});

describe('formatDateID', () => {
  it('memformat timestamp ISO penuh', () => {
    expect(formatDateID('2026-07-17T00:00:00.000Z')).toBe('17 Jul 2026');
  });

  it('tidak pernah menghasilkan tulisan Invalid Date', () => {
    expect(formatDateID('ngawur')).toBe('—');
    expect(formatDateID(null)).toBe('—');
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `cd core && npx vitest run src/dates.test.ts`
Expected: FAIL — modul `./dates` tidak ada

- [ ] **Step 3: Tulis implementasi**

Buat `core/src/dates.ts`:

```ts
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
```

- [ ] **Step 4: Tambahkan ke `core/src/index.ts`**

```ts
export * from './uom';
export * from './pricing';
export * from './dates';
```

- [ ] **Step 5: Jalankan seluruh test**

Run: `cd core && npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add core/
git commit -m "feat(core): parsing & format tanggal

Menangkap bug Invalid Date 64x di halaman Keuangan (v1.66.0) — API
mengirim timestamp ISO penuh, kode lama menggabungnya mentah."
```

---

### Task 4: Aturan persediaan — batch aktif, nilai stok, rincian harga

**Files:**
- Create: `core/src/inventory.ts`
- Modify: `core/src/index.ts`
- Test: `core/src/inventory.test.ts`

**Interfaces:**
- Consumes: —
- Produces: tipe `Batch`, fungsi `sellableBatches(batches: Batch[]): Batch[]`, `totalStock(batches: Batch[]): number`, `stockValue(batches: Batch[]): number`, `costTiers(batches: Batch[]): Array<{ hna: number; qty: number }>`, `fefoBatch(batches: Batch[]): Batch | null`.

- [ ] **Step 1: Tulis test yang gagal**

Buat `core/src/inventory.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sellableBatches, totalStock, stockValue, costTiers, fefoBatch } from './inventory';

// Data nyata TS-CLS-160SCT per 14 Agu 2026
const tropicana = [
  { id: 1, qty_current: 2,   hna: 85500, expired_date: '2027-01-31', is_active: false, created_at: '2026-04-15' },
  { id: 2, qty_current: 28,  hna: 85500, expired_date: '2029-03-31', is_active: true,  created_at: '2026-06-22' },
  { id: 3, qty_current: 159, hna: 87400, expired_date: '2029-03-31', is_active: true,  created_at: '2026-07-21' },
  { id: 4, qty_current: 0,   hna: 85500, expired_date: '2029-03-30', is_active: true,  created_at: '2026-08-06' },
];

describe('sellableBatches', () => {
  it('membuang batch nonaktif dan batch kosong', () => {
    const s = sellableBatches(tropicana);
    expect(s.map(b => b.id)).toEqual([2, 3]);
  });

  it('is_active undefined dianggap aktif', () => {
    const s = sellableBatches([{ id: 9, qty_current: 5, hna: 100, expired_date: null, created_at: '2026-01-01' }]);
    expect(s).toHaveLength(1);
  });
});

describe('totalStock', () => {
  it('hanya menjumlah batch yang bisa dijual — bukan 189', () => {
    expect(totalStock(tropicana)).toBe(187);
  });
});

describe('stockValue', () => {
  it('menjumlah qty x hna per batch, bukan satu harga dikali total', () => {
    // 28*85500 + 159*87400 = 2394000 + 13896600
    expect(stockValue(tropicana)).toBe(16290600);
  });
});

describe('costTiers', () => {
  it('menggabungkan batch berharga sama, urut lama ke baru', () => {
    expect(costTiers(tropicana)).toEqual([
      { hna: 85500, qty: 28 },
      { hna: 87400, qty: 159 },
    ]);
  });

  it('jumlah qty tiap tier sama dengan totalStock', () => {
    const sum = costTiers(tropicana).reduce((s, t) => s + t.qty, 0);
    expect(sum).toBe(totalStock(tropicana));
  });
});

describe('fefoBatch', () => {
  it('ED paling awal di antara yang bisa dijual', () => {
    expect(fefoBatch(tropicana)!.id).toBe(2);
  });

  it('tidak ada stok jadi null', () => {
    expect(fefoBatch([])).toBeNull();
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `cd core && npx vitest run src/inventory.test.ts`
Expected: FAIL — modul `./inventory` tidak ada

- [ ] **Step 3: Tulis implementasi**

Buat `core/src/inventory.ts`:

```ts
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
export function sellableBatches(batches: Batch[]): Batch[] {
  return (batches || []).filter(
    b => Number(b.qty_current) > 0 && (b.is_active ?? true) === true,
  );
}

export function totalStock(batches: Batch[]): number {
  return sellableBatches(batches).reduce((s, b) => s + Number(b.qty_current), 0);
}

/** Nilai persediaan exc PPN = Σ(qty × hna) per batch — BUKAN satu harga × total stok. */
export function stockValue(batches: Batch[]): number {
  return sellableBatches(batches).reduce(
    (s, b) => s + Number(b.qty_current) * (parseFloat(String(b.hna)) || 0),
    0,
  );
}

/** Rincian harga beli: batch berharga sama digabung, urut dari paling lama. */
export function costTiers(batches: Batch[]): Array<{ hna: number; qty: number }> {
  const map = new Map<number, { hna: number; qty: number; oldest: string }>();
  for (const b of sellableBatches(batches)) {
    const hna = parseFloat(String(b.hna)) || 0;
    const created = String(b.created_at ?? '');
    const found = map.get(hna);
    if (found) {
      found.qty += Number(b.qty_current);
      if (created && created < found.oldest) found.oldest = created;
    } else {
      map.set(hna, { hna, qty: Number(b.qty_current), oldest: created });
    }
  }
  return [...map.values()]
    .sort((a, b) => (a.oldest < b.oldest ? -1 : a.oldest > b.oldest ? 1 : 0))
    .map(({ hna, qty }) => ({ hna, qty }));
}

/** Batch yang akan keluar duluan: ED paling awal, null di akhir. */
export function fefoBatch(batches: Batch[]): Batch | null {
  const s = sellableBatches(batches);
  if (!s.length) return null;
  return [...s].sort((a, b) => {
    if (!a.expired_date) return 1;
    if (!b.expired_date) return -1;
    if (a.expired_date === b.expired_date) return a.id - b.id;
    return a.expired_date < b.expired_date ? -1 : 1;
  })[0];
}
```

- [ ] **Step 4: Tambahkan ke `core/src/index.ts`**

```ts
export * from './uom';
export * from './pricing';
export * from './dates';
export * from './inventory';
```

- [ ] **Step 5: Jalankan seluruh test**

Run: `cd core && npx vitest run`
Expected: PASS — semua modul

- [ ] **Step 6: Commit**

```bash
git add core/
git commit -m "feat(core): aturan persediaan — batch aktif, nilai stok, rincian harga

Menangkap bug v1.66.2: stok hantu 168 unit dari batch nonaktif, dan
nilai persediaan yang dihitung satu harga dikali seluruh stok."
```

---

### Task 5: Buktikan `core/` bisa dipakai v1 dan lolos build Vercel

Task paling berisiko, sengaja diletakkan lebih awal. Kalau `file:../core` tidak ikut ter-build di Vercel, kita ganti pendekatan **sekarang** — saat belum ada apa pun yang dibangun di atasnya.

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/utils/rupiah.js`
- Test: `frontend/src/utils/rupiah.test.js` (buat)

**Interfaces:**
- Consumes: `hppFromHna`, `PPN_RATE` dari `@habil/core`
- Produces: bukti bahwa CRA dan Vercel bisa me-resolve `@habil/core`

- [ ] **Step 1: Pasang `core` sebagai dependensi v1**

```bash
cd core && npm run build
cd ../frontend && npm install ../core
```

Periksa `frontend/package.json` kini memuat `"@habil/core": "file:../core"`.

- [ ] **Step 2: Tulis test yang membuktikan v1 memakai core**

Buat `frontend/src/utils/rupiah.test.js`:

```js
import { hppFromHna, PPN_RATE } from "./rupiah";

test("PPN_RATE berasal dari @habil/core", () => {
  expect(PPN_RATE).toBe(0.11);
});

test("hppFromHna memberi hasil yang sama dengan core", () => {
  expect(hppFromHna(85500)).toBeCloseTo(94905, 2);
  expect(hppFromHna(87400)).toBeCloseTo(97014, 2);
});

test("nilai tidak sah tetap 0", () => {
  expect(hppFromHna("abc")).toBe(0);
});
```

- [ ] **Step 3: Jalankan test, pastikan LULUS dengan implementasi lama**

Run: `npm --prefix frontend test -- --watchAll=false --testPathPattern=rupiah`
Expected: PASS — memastikan test-nya benar sebelum sumbernya diganti.

- [ ] **Step 4: Alihkan `rupiah.js` supaya memakai core**

Di `frontend/src/utils/rupiah.js`, ganti definisi lokal `PPN_RATE` dan `hppFromHna` dengan re-export:

```js
// v2 Slice 1: aturan harga pindah ke @habil/core. Berkas ini tinggal
// meneruskan, supaya v1 dan v2 memakai perhitungan yang sama persis.
export { PPN_RATE, hppFromHna } from "@habil/core";
```

Sisa isi berkas (`fmtRp`, dll) dibiarkan.

- [ ] **Step 5: Jalankan SELURUH test v1**

Run: `npm --prefix frontend test -- --watchAll=false`
Expected: PASS — 13 test lama + 3 test baru. Kalau ada yang gagal, `hppFromHna` core berbeda perilaku dari yang lama; perbaiki core, bukan test.

- [ ] **Step 6: Pastikan build v1 masih jalan**

Run: `CI=true npm --prefix frontend run build`
Expected: `Compiled successfully.`

- [ ] **Step 7: Commit dan push ke cabang uji**

```bash
git add core/ frontend/package.json frontend/package-lock.json frontend/src/utils/rupiah.js frontend/src/utils/rupiah.test.js
git commit -m "feat(v1): pakai @habil/core untuk aturan harga

Membuktikan paket core bisa di-resolve CRA lewat dependensi file:.
PPN_RATE tidak lagi didefinisikan dua kali."
git checkout -b uji/core-vercel
git push origin uji/core-vercel
```

- [ ] **Step 8: GERBANG — verifikasi Vercel Preview**

Buka Vercel, tunggu Preview Deployment cabang `uji/core-vercel` selesai.

- **Kalau build BERHASIL:** merge ke `main`, lanjut Task 6.
- **Kalau build GAGAL** dengan `Cannot find module '@habil/core'`: Root Directory `frontend/` tidak menyertakan `../core`. Hentikan dan laporkan ke pemilik — pilihan penggantinya: (a) aktifkan "Include files outside root directory" di Vercel, (b) ubah Root Directory jadi akar repo lalu sesuaikan Build Command, atau (c) publikasikan `core` ke npm registry privat. Jangan lanjut sebelum diputuskan.

---

### Task 6: Scaffold aplikasi Vite `web/`

**Files:**
- Create: `web/` (hasil scaffold Vite)
- Modify: `web/package.json`
- Create: `web/.env.example`

**Interfaces:**
- Consumes: `@habil/core`
- Produces: aplikasi React+TS yang jalan di `localhost:5173` dan bisa mengimpor `@habil/core`

- [ ] **Step 1: Scaffold**

```bash
npm create vite@latest web -- --template react-ts
cd web && npm install
```

- [ ] **Step 2: Pasang core dan dependensi yang dibutuhkan**

```bash
cd web
npm install ../core
npm install axios @tanstack/react-query
```

- [ ] **Step 3: Buat `web/.env.example`**

```
VITE_API_URL=https://habil-backend.vercel.app/api
```

Salin jadi `.env` lokal dengan nilai yang sama.

- [ ] **Step 4: Buktikan core terpakai — ganti isi `web/src/App.tsx`**

```tsx
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
```

- [ ] **Step 5: Jalankan dan verifikasi angkanya**

Run: `cd web && npm run dev`
Buka `http://localhost:5173`.
Expected: tertulis `HPP dari HNA 87.400: 97014.00` dan `Total stok contoh: 187`

- [ ] **Step 6: Pastikan build produksi jalan**

Run: `cd web && npm run build`
Expected: build sukses, ada folder `dist/`

- [ ] **Step 7: Commit**

```bash
git add web/
git commit -m "feat(web): scaffold aplikasi Vite + React + TypeScript

Membuktikan @habil/core bisa diimpor dari sisi v2."
```

---

### Task 7: Login dan pemanggilan API di `web/`

**Files:**
- Create: `web/src/lib/api.ts`
- Create: `web/src/lib/auth.tsx`
- Create: `web/src/pages/Login.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `VITE_API_URL`
- Produces: `api` (instance axios ber-token), `useAuth()` mengembalikan `{ token, user, login, logout }`

- [ ] **Step 1: Verifikasi bentuk respons login sebelum menulis kode**

Run: `grep -n "res.json" backend/routes/auth.js | head -5`
Pastikan field token benar bernama `token`. Kalau bukan, sesuaikan `data.token` di Step 3.

- [ ] **Step 2: Buat `web/src/lib/api.ts`**

```ts
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('habil_v2_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('habil_v2_token');
      window.location.reload();
    }
    return Promise.reject(err);
  },
);
```

Kunci `habil_v2_token` sengaja berbeda dari v1 supaya sesi beta dan sesi v1 tidak saling menendang saat dibuka bersamaan.

- [ ] **Step 3: Buat `web/src/lib/auth.tsx`**

```tsx
import { createContext, useContext, useState, type ReactNode } from 'react';
import { api } from './api';

interface User { id: number; username: string; role: string }
interface AuthValue {
  token: string | null;
  user: User | null;
  login: (u: string, p: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthValue | null>(null);

function decode(token: string): User | null {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem('habil_v2_token'),
  );
  const user = token ? decode(token) : null;

  const login = async (username: string, password: string) => {
    const { data } = await api.post('/auth/login', { username, password });
    localStorage.setItem('habil_v2_token', data.token);
    setToken(data.token);
  };

  const logout = () => {
    localStorage.removeItem('habil_v2_token');
    setToken(null);
  };

  return <Ctx.Provider value={{ token, user, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return v;
}
```

- [ ] **Step 4: Buat `web/src/pages/Login.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';

export default function Login() {
  const { login } = useAuth();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await login(u, p);
    } catch (e2: any) {
      setErr(e2.response?.data?.error || 'Login gagal');
    }
  };

  return (
    <form onSubmit={submit} style={{ padding: 24, maxWidth: 320, fontFamily: 'system-ui' }}>
      <h1>Habil Beta V2</h1>
      <input value={u} onChange={(e) => setU(e.target.value)} placeholder="Username" />
      <input value={p} onChange={(e) => setP(e.target.value)} type="password" placeholder="Password" />
      <button type="submit">Masuk</button>
      {err && <p role="alert" style={{ color: 'crimson' }}>{err}</p>}
    </form>
  );
}
```

- [ ] **Step 5: Rangkai di `web/src/App.tsx`**

```tsx
import { AuthProvider, useAuth } from './lib/auth';
import Login from './pages/Login';

function Shell() {
  const { user, logout } = useAuth();
  if (!user) return <Login />;
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <p>Masuk sebagai {user.username} ({user.role}) <button onClick={logout}>Keluar</button></p>
      <p>Halaman Inventory menyusul di Task 8.</p>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
```

- [ ] **Step 6: Uji manual**

Run: `cd web && npm run dev`
Login dengan akun direktur. Expected: nama dan peran tampil, tombol Keluar berfungsi.

- [ ] **Step 7: Commit**

```bash
git add web/
git commit -m "feat(web): login + klien API

Token disimpan di kunci habil_v2_token supaya sesi beta tidak menendang
sesi v1 yang dibuka bersamaan."
```

---

### Task 8: Halaman Inventory read-only

**Files:**
- Create: `web/src/hooks/useProducts.ts`
- Create: `web/src/pages/Inventory.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `api` dari `../lib/api`; `hppFromHna`, `formatDateID` dari `@habil/core`
- Produces: `useProducts()` mengembalikan `ProductRow[]`; komponen `Inventory`

- [ ] **Step 1: Buat `web/src/hooks/useProducts.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface ProductRow {
  id: number;
  code: string | null;
  name: string;
  base_unit: string | null;
  unit: string | null;
  total_stock: number | string;
  stock_value: number | string;
  batch_cost_tiers: Array<{ hna: number; qty: number }> | null;
  nearest_expiry: string | null;
}

export function useProducts() {
  return useQuery<ProductRow[]>({
    queryKey: ['products'],
    queryFn: async () => (await api.get('/inventory/products?limit=2000')).data,
    staleTime: 2 * 60 * 1000,
  });
}
```

- [ ] **Step 2: Buat `web/src/pages/Inventory.tsx`**

```tsx
import { hppFromHna, formatDateID } from '@habil/core';
import { useProducts } from '../hooks/useProducts';

const rp = (n: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
  }).format(n || 0);

export default function Inventory() {
  const { data = [], isLoading, error } = useProducts();

  if (isLoading) return <p>Memuat…</p>;
  if (error) return <p role="alert">Gagal memuat: {(error as Error).message}</p>;

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
```

- [ ] **Step 3: Pasang QueryClient dan halaman di `web/src/App.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './lib/auth';
import Login from './pages/Login';
import Inventory from './pages/Inventory';

const qc = new QueryClient();

function Shell() {
  const { user, logout } = useAuth();
  if (!user) return <Login />;
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <p>{user.username} ({user.role}) <button onClick={logout}>Keluar</button></p>
      <Inventory />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 4: Uji manual dan bandingkan dengan v1**

Run: `cd web && npm run dev`
Buka berdampingan dengan `habil-dashboard.vercel.app/inventory`.
Expected: jumlah produk **83**, stok `TS-CLS-160SCT` **187**, total nilai **Rp 226.120.468**, rincian Tropicana `28 @ Rp 94.905` dan `159 @ Rp 97.014`.

- [ ] **Step 5: Commit**

```bash
git add web/
git commit -m "feat(web): halaman Inventory read-only

Memakai aturan dari @habil/core. Read-only — tidak ada tulis ke database."
```

---

### Task 9: Skrip uji paritas v1 vs core

**Files:**
- Create: `scripts/paritas-inventory.mjs`

**Interfaces:**
- Consumes: API produksi; `totalStock`, `stockValue`, `costTiers` dari `core/dist`
- Produces: laporan cocok/tidak, keluar dengan kode 1 kalau ada beda

- [ ] **Step 1: Verifikasi nama endpoint batch**

Run: `grep -nE "router.get\('/batches" backend/routes/inventory.js`
Catat path persisnya untuk dipakai di Step 2.

- [ ] **Step 2: Buat `scripts/paritas-inventory.mjs`**

```js
// Membandingkan angka yang dihitung @habil/core dengan yang dikirim backend.
// READ-ONLY. Jalankan: node scripts/paritas-inventory.mjs <TOKEN>
import { totalStock, stockValue, costTiers } from '../core/dist/index.js';

const token = process.argv[2];
if (!token) {
  console.error('Pakai: node scripts/paritas-inventory.mjs <TOKEN>');
  process.exit(1);
}

const BASE = 'https://habil-backend.vercel.app/api';
const get = async (p) => {
  const r = await fetch(BASE + p, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`${p} -> HTTP ${r.status}`);
  return r.json();
};

const produk = await get('/inventory/products?limit=2000');
let beda = 0;

for (const p of produk) {
  const raw = await get(`/inventory/batches/${p.id}`);
  const list = Array.isArray(raw) ? raw : raw.batches || [];

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

console.log(`\nDiperiksa ${produk.length} produk. Beda: ${beda}.`);
process.exit(beda === 0 ? 0 : 1);
```

- [ ] **Step 3: Jalankan**

```bash
cd core && npm run build && cd ..
node scripts/paritas-inventory.mjs <TOKEN_DIREKTUR>
```

Expected: `Diperiksa 83 produk. Beda: 0.`
Kalau ada beda, `core/` dan backend tidak sepakat — perbaiki sampai nol sebelum lanjut.

- [ ] **Step 4: Commit**

```bash
git add scripts/paritas-inventory.mjs
git commit -m "test: skrip paritas Inventory core vs backend

Membandingkan perhitungan @habil/core dengan angka backend di data
produksi. READ-ONLY."
```

---

### Task 10: Deploy beta ke Vercel dengan pengunci akses

**Files:**
- Create: `web/vercel.json`

**Interfaces:**
- Consumes: build `web/`
- Produces: `habil-beta.vercel.app` yang terkunci untuk publik

- [ ] **Step 1: Buat `web/vercel.json`**

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

- [ ] **Step 2: Buat proyek Vercel baru**

Dashboard Vercel → New Project → repo yang sama → Root Directory `web/` → nama proyek `habil-beta`.
Tambahkan env var `VITE_API_URL = https://habil-backend.vercel.app/api`.

- [ ] **Step 3: Aktifkan pengunci akses**

Vercel → Project Settings → Deployment Protection → aktifkan **Password Protection** (atau Vercel Authentication).
Tanpa langkah ini, beta terbuka untuk publik.

- [ ] **Step 4: Verifikasi terkunci**

Buka `habil-beta.vercel.app` di jendela penyamaran.
Expected: halaman kunci, bukan layar login Habil.

- [ ] **Step 5: Verifikasi angka di beta produksi**

Setelah membuka kunci dan login: **83 produk**, stok `TS-CLS-160SCT` **187**, total nilai **Rp 226.120.468**.

- [ ] **Step 6: Commit**

```bash
git add web/vercel.json
git commit -m "chore(web): konfigurasi deploy beta Vercel"
```

---

## Definisi selesai untuk Slice 1

- [ ] `core/` punya 4 modul dengan seluruh test lulus
- [ ] v1 memakai `core/` untuk aturan harga; 13 test lama tetap lulus; build sukses
- [ ] Build Vercel v1 hijau dengan dependensi `file:../core`
- [ ] `habil-beta.vercel.app` hidup, terkunci, menampilkan Inventory
- [ ] Skrip paritas melaporkan **Beda: 0** di 83 produk
- [ ] Tidak ada satu pun tulis ke database sepanjang slice ini

## Di luar cakupan Slice 1

Menulis data · pengaman penanda beta (dibangun sebelum Slice 2) · Customer, Distributor,
Faktur, Nota, Dashboard · perbaikan `system_qty` opname · penataan visual (Slice 1 memakai
HTML polos; gaya menyusul setelah angkanya terbukti benar).
