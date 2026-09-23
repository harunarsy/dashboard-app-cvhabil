# Habil Official Sales Documents — Fase 2: Perbaikan Bug + Preview PDF Aktual

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menuntaskan tiga bug hasil audit (persistensi print_settings, tarif PPN 0%/pecahan, judul per profil) dengan test-gagal-dulu, lalu menyelesaikan sisa spec §10 (preview PDF aktual dari blob yang sama dengan unduhan/cetak, toolbar, validasi sebelum cetak, responsif) dan mendokumentasikan urutan rollout migrasi 022.

**Architecture:** Tiga perbaikan bedah pada kode Fase 1 (tanpa mengubah API publik). Preview baru memakai satu modul sumber PDF (`salesDocumentPdfSource.js`) yang dipakai bersama oleh preview dan unduhan/cetak sehingga tidak ada dua jalur render. Preview merender blob via `pdfjs-dist` (lazy, worker Vite `?url`). Validasi adalah modul murni (`salesDocumentValidation.js`) yang diuji tanpa DOM.

**Tech Stack:** React 19 + Vite 8, jsPDF (engine lama & baru), `pdfjs-dist` (BARU — hanya untuk preview), Vitest + jsdom + @testing-library/react (sudah dipakai di repo).

**Spec:** `docs/superpowers/specs/2026-09-22-habil-official-sales-documents-design.md` (§10-§11)
**Plan Fase 1:** `docs/superpowers/plans/2026-09-22-habil-official-sales-documents-renderer.md`

## Global Constraints

- **JANGAN push. JANGAN deploy. JANGAN menjalankan migrasi / menulis ke database mana pun.** Harun yang melakukan smoke test.
- **Flag `documents_renderer_v2` tetap `false`.** A5/A6 tetap renderer lama sampai paritas terbukti. `terima`/`pinjaman` tetap jalur lama.
- Renderer lama (`generateNotaPDF.js`) dan HTML preview draft di form (`NotaPreview.jsx`) **tidak dihapus** di fase ini.
- Preview PDF baru dipasang di **modal Opsi Cetak** (alur spec §11: Cetak Dokumen → ukuran → PDF aktual → periksa → unduh/cetak blob yang sama). Panel "Preview Live" di form (draft, saat mengetik) belum diganti — keputusan pemilik, dicatat di laporan.
- Satu snapshot untuk semua aksi: preview, unduh, dan cetak memakai blob yang sama (`buildSalesDocumentPdf` → `doc.output('blob')`). Tidak ada regenerasi setelah tombol ditekan.
- Versi rilis baru: **v1.67.19-stable** (di atas v1.67.18 yang belum di-push). Ikuti `scripts/check-version-consistency.mjs`.
- Test yang gagal dulu WAJIB untuk Task 12, 13, 14 (tiga bug). Tunjukkan bukti RED → GREEN.
- Commit lokal per task di branch `feat/official-sales-documents`. Jangan sentuh file dirty lain (`AGENTS.md`, `.gitignore`, dll).
- Jangan mengklaim pemeriksaan teks/jumlah halaman sebagai bukti visual penuh; verifikasi visual manual = milik Harun.

---

### Task 12: PrintSettings tidak boleh menghapus kunci `nota_layout` yang tidak diedit

**Bug (audit):** `PrintSettings.jsx` `handleSave` (baris 83-107) membangun `nota_layout` dari 8 field form saja; backend `POST /print-settings/bulk` mengganti seluruh `setting_value` (`ON CONFLICT DO UPDATE SET setting_value = $2`). Akibatnya kunci `npwp` (seed migrasi 022), `email`, dan kunci lain di luar form **terhapus setiap kali simpan** → dokumen jatuh ke hardcode NPWP.

**Files:**
- Modify: `frontend/src/components/PrintSettings.jsx` (load ~24-56, save ~83-107)
- Create: `frontend/src/components/PrintSettings.test.jsx`

**Interfaces:**
- Produces: `nota_layout` hasil simpan = gabungan `{ ...layoutAsliDariServer, ...8 field form }`; kunci tak dikenal ikut tersimpan. Field form selalu menang atas nilai lama.

- [ ] **Step 1: Tulis test yang GAGAL (RED)**

`frontend/src/components/PrintSettings.test.jsx` — mock `../services/api`:

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/api', () => ({
  printSettingsAPI: { get: vi.fn(), update: vi.fn(), save: vi.fn() },
  settingsAPI: { getProfitThresholds: vi.fn(), updateProfitThresholds: vi.fn() },
}));

import { printSettingsAPI, settingsAPI } from '../services/api';
import PrintSettings from './PrintSettings';

const OLD_LAYOUT = {
  company_name: 'CV HABIL SEJAHTERA BERSAMA',
  address: 'Jl. Lama No. 1',
  phone: '0851-4117-5248',
  footer_text: 'footer lama',
  signer_name: 'Harun Al Rasyid, S.Kom',
  bank_info: 'BCA CV HABIL SEJAHTERA BERSAMA 5603004174',
  qris_text: 'QRIS',
  ketentuan: 'ketentuan lama',
  npwp: '93.813.949.0-609.000',
  email: 'ops@habil.example',
  future_key: 'jangan-hilang',
};

describe('PrintSettings — preservasi kunci nota_layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    printSettingsAPI.get.mockResolvedValue({ data: { nota_layout: { ...OLD_LAYOUT } } });
    printSettingsAPI.update.mockResolvedValue({ data: { success: true } });
    settingsAPI.getProfitThresholds.mockResolvedValue({ data: {} });
  });

  it('menyimpan field yang diedit tanpa menghapus npwp/email/kunci lain', async () => {
    render(<PrintSettings />);
    const addressInput = await screen.findByDisplayValue('Jl. Lama No. 1');
    fireEvent.change(addressInput, { target: { value: 'Jl. Baru No. 2' } });
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }));

    await waitFor(() => expect(printSettingsAPI.update).toHaveBeenCalledTimes(1));
    const payload = printSettingsAPI.update.mock.calls[0][0];
    expect(payload.nota_layout.address).toBe('Jl. Baru No. 2');
    expect(payload.nota_layout.npwp).toBe('93.813.949.0-609.000');
    expect(payload.nota_layout.email).toBe('ops@habil.example');
    expect(payload.nota_layout.future_key).toBe('jangan-hilang');
    expect(payload.nota_layout.company_name).toBe('CV HABIL SEJAHTERA BERSAMA');
  });
});
```

Catatan: sesuaikan `getByRole`/label dengan struktur form nyata (baca file dulu; tombol simpan ada di sekitar baris 280). Jika nama tombol berbeda, pakai nama yang benar — jangan mengubah test menjadi pencarian longgar yang bisa lolos palsu.

- [ ] **Step 2: Jalankan, pastikan GAGAL**

Run: `cd frontend && npx vitest run src/components/PrintSettings.test.jsx`
Expected: FAIL — `payload.nota_layout.npwp` undefined (kunci terhapus).

- [ ] **Step 3: Implementasi merge**

Di `PrintSettings.jsx`: simpan layout mentah dari server di ref, lalu merge saat simpan.

```jsx
  const rawLayoutRef = useRef(null);
  // di fetchSettings, saat printData.nota_layout ada:
  rawLayoutRef.current = { ...nl };
  // di handleSave:
  const merged = {
    ...(rawLayoutRef.current || {}),
    company_name: settings.company_name,
    address: settings.address,
    phone: settings.phone,
    footer_text: settings.footer_text,
    signer_name: settings.signer_name,
    bank_info: settings.bank_info,
    qris_text: settings.qris_text,
    ketentuan: settings.ketentuan,
  };
  const payload = { nota_layout: merged };
  await printSettingsAPI.update(payload);
  rawLayoutRef.current = merged; // simpan berikutnya tetap membawa kunci penuh
```

Tambahkan `useRef` ke import React yang sudah ada. Jangan ubah field form lain.

- [ ] **Step 4: Jalankan, pastikan LULUS + tidak merusak test lain**

Run: `cd frontend && npx vitest run src/components/PrintSettings.test.jsx src/components/SalesOrderList.test.jsx`
Expected: PASS keduanya.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PrintSettings.jsx frontend/src/components/PrintSettings.test.jsx
git commit -m "fix: preserve untouched nota_layout keys on print settings save"
```

---

### Task 13: Tarif PPN 0% tetap 0% + label tarif pecahan sesuai snapshot

**Bug (audit):**
- `salesDocumentModel.js:121` — `toNumber(order.ppn_rate) || LEGACY_PPN_RATE` membuat `0` → 11%.
- `generateSalesDocumentPDF.js:512,518` — `Math.round(vatRate * 100)` membuat 11,5% tampil "12%".

**Files:**
- Modify: `frontend/src/utils/documents/salesDocumentModel.js` (+ export `resolveVatRate`, `formatVatRate`)
- Modify: `frontend/src/utils/documents/generateSalesDocumentPDF.js` (2 baris label)
- Modify: `frontend/src/utils/documents/__fixtures__/salesDocumentFixtures.js` (+2 fixture)
- Modify: `frontend/src/utils/documents/__fixtures__/salesDocumentGolden.js` (+6 entri)
- Modify: `frontend/src/utils/documents/salesDocumentModel.test.js`, `frontend/src/utils/documents/generateSalesDocumentPDF.test.js`

**Interfaces:**
- `resolveVatRate(rawRate) → number` — `null`/`undefined`/`''` → `LEGACY_PPN_RATE`; angka finite (termasuk `0` dan `0.115`) dipakai apa adanya; selain itu → `LEGACY_PPN_RATE`.
- `formatVatRate(vatRate) → string` — `0` → `'0%'`, `0.115` → `'11,5%'`, `0.11` → `'11%'` (id-ID, maks 2 desimal).
- `computeTotals` memakai `resolveVatRate`; `dpp + vatAmount === productGross` untuk semua tarif (termasuk 0: dpp = productGross, vat = 0).

- [ ] **Step 1: Tulis test model yang GAGAL (RED)**

Tambahkan ke `salesDocumentModel.test.js`:

```js
describe('tarif PPN snapshot', () => {
  it('ppn_rate 0 tetap 0%, bukan fallback 11%', () => {
    expect(resolveVatRate(0)).toBe(0);
    const totals = computeTotals({ total: 500000, ppn_rate: 0, items: [] });
    expect(totals.vatRate).toBe(0);
    expect(totals.vatAmount).toBe(0);
    expect(totals.dpp).toBe(500000);
    expect(totals.dpp + totals.vatAmount).toBe(totals.productGross);
  });
  it('tarif pecahan dipakai apa adanya', () => {
    expect(resolveVatRate(0.115)).toBe(0.115);
    const totals = computeTotals({ total: 1115000, ppn_rate: 0.115, items: [] });
    expect(Math.round(totals.dpp)).toBe(1000000);
    expect(Math.round(totals.vatAmount)).toBe(115000);
  });
  it('fallback 11% hanya untuk kosong/legacy/invalid', () => {
    expect(resolveVatRate(null)).toBe(0.11);
    expect(resolveVatRate(undefined)).toBe(0.11);
    expect(resolveVatRate('')).toBe(0.11);
    expect(resolveVatRate('abc')).toBe(0.11);
    expect(resolveVatRate('0.12')).toBe(0.12);
  });
  it('formatVatRate mengikuti snapshot tanpa pembulatan ke bilangan bulat', () => {
    expect(formatVatRate(0)).toBe('0%');
    expect(formatVatRate(0.11)).toBe('11%');
    expect(formatVatRate(0.115)).toBe('11,5%');
  });
});
```

- [ ] **Step 2: Tambah fixture + golden, lalu test renderer yang GAGAL (RED)**

Fixture baru di `salesDocumentFixtures.js` (pola `order({...})` yang sudah ada; total harus = jumlah line total):

```js
  { id: 'ppn-rate-zero', label: 'PPN 0% eksplisit', settings: BASE_SETTINGS,
    order: order({ order_number: 'HSB-NOTA-2609011', sale_date: '2026-09-20', payment_method: 'Tunai',
      customer_name: 'Klinik Nol Persen', customer_address: 'Jl. Contoh 1, Surabaya', total: 500000,
      ppn_rate: 0, items: [item({ qty: 2, qty_in_unit: 2, unit_price: 250000 })] }) },
  { id: 'ppn-rate-snapshot-115', label: 'PPN 11,5% snapshot', settings: BASE_SETTINGS,
    order: order({ order_number: 'HSB-NOTA-2609012', sale_date: '2026-09-20', payment_method: 'Tunai',
      customer_name: 'Apotek Tarif Pecahan', customer_address: 'Jl. Contoh 2, Surabaya', total: 1115000,
      ppn_rate: 0.115, items: [item({ qty: 1, qty_in_unit: 1, unit_price: 1115000 })] }) },
```

Golden: entri A4/A5/A6 untuk kedua fixture (`pages: 1`) dengan `mustContain` memuat nomor nota + `'PPN 0%'` / `'PPN 11,5%'`, dan `mustNotContain: ['PPN 11%']` untuk fixture 11,5 (dan `['PPN 11%','PPN 12%']` untuk fixture 0). Periksa manual hasil dump sebelum menulis ekspektasi.

Test renderer di `generateSalesDocumentPDF.test.js`:

```js
  it('tarif 0% dan pecahan tampil sesuai snapshot di ketiga ukuran', () => {
    const zero = SALES_DOCUMENT_FIXTURES.find((f) => f.id === 'ppn-rate-zero');
    const frac = SALES_DOCUMENT_FIXTURES.find((f) => f.id === 'ppn-rate-snapshot-115');
    for (const format of ['A4', 'A5', 'A6']) {
      const zeroText = allText(generateSalesDocumentPDF(zero.order, { format, settings: zero.settings }));
      expect(zeroText, `${format} 0%`).toContain('PPN 0%');
      expect(zeroText, `${format} bukan 11%`).not.toContain('PPN 11%');
      const fracText = allText(generateSalesDocumentPDF(frac.order, { format, settings: frac.settings }));
      expect(fracText, `${format} 11,5%`).toContain('PPN 11,5%');
      expect(fracText, `${format} bukan 12%`).not.toContain('PPN 12%');
    }
  });
```

- [ ] **Step 3: Jalankan, pastikan GAGAL**

Run: `cd frontend && npx vitest run src/utils/documents/`
Expected: FAIL pada assertion 0% dan 11,5% (kode lama: 11% dan 12%).

- [ ] **Step 4: Implementasi**

Di `salesDocumentModel.js`:

```js
export function resolveVatRate(rawRate) {
  if (rawRate === null || rawRate === undefined || rawRate === '') return LEGACY_PPN_RATE;
  const parsed = Number(rawRate);
  return Number.isFinite(parsed) ? parsed : LEGACY_PPN_RATE;
}

export function formatVatRate(vatRate) {
  const percent = Number(vatRate) * 100;
  const rounded = Math.round(percent * 100) / 100;
  return `${rounded.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`;
}
```

Ganti `const vatRate = toNumber(order.ppn_rate) || LEGACY_PPN_RATE;` → `const vatRate = resolveVatRate(order.ppn_rate);`.
Di `generateSalesDocumentPDF.js`, import `formatVatRate` dan ganti kedua `Math.round(vm.totals.vatRate * 100)` → `formatVatRate(vm.totals.vatRate)` (baris 512 & 518).

- [ ] **Step 5: Jalankan, pastikan LULUS**

Run: `cd frontend && npx vitest run src/utils/documents/`
Expected: PASS semua (golden lama harus tetap hijau — tarif 11% tidak berubah).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/documents/
git commit -m "fix: keep explicit 0% and fractional ppn rate snapshots in documents"
```

---

### Task 14: Judul per profil — A4 "FAKTUR PENJUALAN / SALES INVOICE", A5/A6 "NOTA PENJUALAN"

**Bug (audit):** `generateSalesDocumentPDF.js:20-21` memakai satu konstanta judul untuk semua profil; header lanjutan juga mewarisi judul yang sama.

**Files:**
- Modify: `frontend/src/utils/documents/salesDocumentTheme.js` (profil: `title`, `subtitle`)
- Modify: `frontend/src/utils/documents/generateSalesDocumentPDF.js` (hapus konstanta; pakai `profile.title`/`profile.subtitle`; header lanjutan pakai `profile.title`)
- Modify: `frontend/src/utils/documents/__fixtures__/salesDocumentGolden.js` (A5/A6 → NOTA PENJUALAN; kontinuasi)
- Modify: `frontend/src/utils/documents/generateSalesDocumentPDF.test.js`

**Interfaces:**
- `DOCUMENT_PROFILES.A4 = { title: 'FAKTUR PENJUALAN', subtitle: 'SALES INVOICE', ... }`
- `DOCUMENT_PROFILES.A5/A6 = { title: 'NOTA PENJUALAN', subtitle: null, ... }`
- Subtitle hanya digambar bila non-null.

- [ ] **Step 1: Tulis test yang GAGAL (RED)**

```js
  it('judul mengikuti profil ukuran', () => {
    const { order, settings } = SALES_DOCUMENT_FIXTURES[0];
    const a4 = allText(generateSalesDocumentPDF(order, { format: 'A4', settings }));
    expect(a4).toContain('FAKTUR PENJUALAN');
    expect(a4).toContain('SALES INVOICE');
    for (const format of ['A5', 'A6']) {
      const text = allText(generateSalesDocumentPDF(order, { format, settings }));
      expect(text, `${format} title`).toContain('NOTA PENJUALAN');
      expect(text, `${format} no invoice title`).not.toContain('FAKTUR PENJUALAN');
      expect(text, `${format} no subtitle`).not.toContain('SALES INVOICE');
    }
  });
```

- [ ] **Step 2: Jalankan, pastikan GAGAL** — `npx vitest run src/utils/documents/generateSalesDocumentPDF.test.js`; A5/A6 masih "FAKTUR PENJUALAN".

- [ ] **Step 3: Implementasi + perbarui golden**

- Tambah `title`/`subtitle` ke ketiga profil di theme; renderer membaca dari profil (termasuk pemanggilan `drawContinuationHeader` → kirim `profile.title`).
- Golden: semua entri A5/A6 `mustContain` ganti `'FAKTUR PENJUALAN'` → `'NOTA PENJUALAN'` (dan hapus `'SALES INVOICE'` dari A5/A6; tambahkan ke `mustNotContain`), kontinuasi many-items A6 → `'NOTA PENJUALAN - Lanjutan'`. Entri A4 tidak berubah.
- Periksa ulang dump halaman sebelum menulis ekspektasi.

- [ ] **Step 4: Jalankan, pastikan LULUS** — `npx vitest run src/utils/documents/`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/documents/
git commit -m "fix: per-profile document titles (A4 invoice, A5/A6 nota)"
```

---

### Task 15: Modul sumber PDF bersama + instalasi `pdfjs-dist`

**Tujuan:** Satu fungsi `buildSalesDocumentPdf` menjadi satu-satunya jalur pembuatan blob untuk preview, unduh, dan cetak (spec §10: "blob yang sedang ditampilkan"). Sekaligus memasang `pdfjs-dist` (lazy) dan memperbaiki helper logo agar tidak menggantung di jsdom.

**Files:**
- Create: `frontend/src/utils/documents/salesDocumentPdfSource.js`
- Create: `frontend/src/utils/documents/salesDocumentPdfSource.test.js`
- Modify: `frontend/src/utils/documents/monochromeLogo.js` (timeout guard)
- Modify: `frontend/src/components/SalesOrderList.jsx` (`handlePrintPDF` ~1700-1725 memakai modul baru; perilaku unduh tetap)
- Modify: `frontend/package.json` + `frontend/package-lock.json` (via `npm install pdfjs-dist`)

**Interfaces:**
- `resolveSalesPdfRoute({ format, type, documentsV2 }) → { engine: 'v2' | 'legacy' }` — `type === 'nota' && (format === 'A4' || documentsV2)` → `'v2'`, selain itu `'legacy'`.
- `salesPdfFilename({ type, orderNumber }) → string` — `TT_<n>.pdf` untuk `terima`, `Nota_<n>.pdf` lainnya.
- `buildSalesDocumentPdf(order, { format = 'A5', type = 'nota', settings = {}, documentsV2 = false }) → Promise<{ doc, blob, engine, filename }>` — `blob` = `doc.output('blob')`.

- [ ] **Step 1: Instal dependensi**

Run: `cd frontend && npm install pdfjs-dist@^6.3.289`
Expected: `package.json` + `package-lock.json` berubah; tidak ada warning kritis. (Repo memakai npm — AGENTS.md; `bun.lock` lama diabaikan.)

- [ ] **Step 2: Tulis test modul yang GAGAL (RED)**

`salesDocumentPdfSource.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { buildSalesDocumentPdf, resolveSalesPdfRoute, salesPdfFilename } from './salesDocumentPdfSource';
import { SALES_DOCUMENT_FIXTURES } from './__fixtures__/salesDocumentFixtures';

describe('resolveSalesPdfRoute', () => {
  it('A4 selalu v2; A5/A6 mengikuti flag; terima/pinjaman selalu legacy', () => {
    expect(resolveSalesPdfRoute({ format: 'A4', type: 'nota', documentsV2: false }).engine).toBe('v2');
    expect(resolveSalesPdfRoute({ format: 'A5', type: 'nota', documentsV2: false }).engine).toBe('legacy');
    expect(resolveSalesPdfRoute({ format: 'A5', type: 'nota', documentsV2: true }).engine).toBe('v2');
    expect(resolveSalesPdfRoute({ format: 'A6', type: 'terima', documentsV2: true }).engine).toBe('legacy');
  });
});

describe('salesPdfFilename', () => {
  it('menamai file per tipe', () => {
    expect(salesPdfFilename({ type: 'terima', orderNumber: 'X' })).toBe('TT_X.pdf');
    expect(salesPdfFilename({ type: 'nota', orderNumber: 'X' })).toBe('Nota_X.pdf');
  });
});

describe('buildSalesDocumentPdf', () => {
  it('menghasilkan blob PDF dari engine yang benar', async () => {
    const { order, settings } = SALES_DOCUMENT_FIXTURES[0];
    const v2 = await buildSalesDocumentPdf(order, { format: 'A4', settings });
    expect(v2.engine).toBe('v2');
    expect(v2.blob.type).toBe('application/pdf');
    expect(v2.blob.size).toBeGreaterThan(0);
    const legacy = await buildSalesDocumentPdf(order, { format: 'A5', settings });
    expect(legacy.engine).toBe('legacy');
    expect(legacy.blob.size).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Jalankan, pastikan GAGAL** — modul belum ada.

- [ ] **Step 4: Implementasi modul + timeout logo + refactor handlePrintPDF**

`salesDocumentPdfSource.js`:

```js
import { getMonochromeLogoDataUrl } from './monochromeLogo';

export function resolveSalesPdfRoute({ format, type, documentsV2 }) {
  return { engine: type === 'nota' && (format === 'A4' || documentsV2) ? 'v2' : 'legacy' };
}

export function salesPdfFilename({ type, orderNumber }) {
  return `${type === 'terima' ? 'TT' : 'Nota'}_${orderNumber}.pdf`;
}

export async function buildSalesDocumentPdf(order, { format = 'A5', type = 'nota', settings = {}, documentsV2 = false } = {}) {
  const { engine } = resolveSalesPdfRoute({ format, type, documentsV2 });
  const filename = salesPdfFilename({ type, orderNumber: order.order_number });
  if (engine === 'v2') {
    const { generateSalesDocumentPDF } = await import('./generateSalesDocumentPDF');
    const logo_data_url = await getMonochromeLogoDataUrl();
    const doc = generateSalesDocumentPDF(order, { format, type, settings: { ...settings, logo_data_url } });
    return { doc, blob: doc.output('blob'), engine, filename };
  }
  const { generateNotaPDF } = await import('../generateNotaPDF');
  const doc = generateNotaPDF(order, { format, type, settings });
  return { doc, blob: doc.output('blob'), engine, filename };
}
```

`monochromeLogo.js`: tambahkan timeout agar promise tidak menggantung bila `onload`/`onerror` tidak pernah terpanggil (jsdom):

```js
export function getMonochromeLogoDataUrl() {
  if (cachedPromise) return cachedPromise;
  cachedPromise = new Promise((resolve) => {
    if (typeof Image === 'undefined' || typeof document === 'undefined') return resolve(null);
    let settled = false;
    const done = (value) => { if (!settled) { settled = true; resolve(value); } };
    const timer = setTimeout(() => done(null), 1500);
    const img = new Image();
    img.onload = () => { clearTimeout(timer); /* ...draw & done(dataUrl)... */ };
    img.onerror = () => { clearTimeout(timer); done(null); };
    img.src = '/logo192.png';
  });
  return cachedPromise;
}
```

`SalesOrderList.jsx` `handlePrintPDF`: ganti isi try dengan:

```js
      const { blob, filename } = await buildSalesDocumentPdf(printOrder, {
        format: printOptions.format,
        type: printOptions.type,
        settings: layoutSettings || {},
        documentsV2,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      await salesAPI.updatePdfStatus(printOrder.id, 'sudah_dicetak');
```

(Hapus `importWithReload` untuk PDF dari jalur ini bila tidak terpakai lagi — cek pemakai lain dulu; `importWithReload` tetap boleh dipakai modul lain.)

- [ ] **Step 5: Jalankan test + build**

Run: `cd frontend && npx vitest run src/utils/documents/ && npm run build`
Expected: PASS; build sukses; `pdfjs-dist` belum masuk bundle utama (belum diimpor siapa pun).

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/utils/documents/salesDocumentPdfSource.js frontend/src/utils/documents/salesDocumentPdfSource.test.js frontend/src/utils/documents/monochromeLogo.js frontend/src/components/SalesOrderList.jsx
git commit -m "feat: single pdf source module for preview/download/print"
```

---

### Task 16: Preview PDF aktual di modal Opsi Cetak (canvas + toolbar + loading/error + responsif)

**Tujuan (spec §10):** Modal Opsi Cetak menampilkan PDF aktual; ganti ukuran → blob baru (debounce); toolbar: ukuran, zoom, fit, navigasi halaman; jumlah halaman selalu terlihat; unduh & cetak memakai blob yang ditampilkan; loading/error; responsif (desktop/tablet/ponsel) dengan target sentuh ≥44px dan akses keyboard.

**Files:**
- Create: `frontend/src/utils/pdfjsSetup.js` (lazy loader + worker; mudah di-mock test)
- Create: `frontend/src/components/common/PdfPreviewPanel.jsx`
- Create: `frontend/src/components/common/PdfPreviewPanel.test.jsx`
- Modify: `frontend/src/components/SalesOrderList.jsx` (modal Opsi Cetak ~6376-6580: sisipkan panel preview, state blob/loading/error, debounce, tombol Unduh + Cetak memakai blob)

**Interfaces:**
- `pdfjsSetup.js`: `export async function getPdfjs() → pdfjsLib` dengan `GlobalWorkerOptions.workerSrc = workerSrc` (impor `pdfjs-dist/build/pdf.worker.min.mjs?url`).
- `PdfPreviewPanel` props:
  - `blob: Blob | null`, `loading: boolean`, `error: string | null`, `onRetry: () => void`
  - `format: 'A4'|'A5'|'A6'`, `onFormatChange: (f) => void`
  - `validation?: { blockers: Array, warnings: Array }` (Task 17 mengisi; fase ini boleh `undefined`)
  - `onDownload: () => void`, `onPrint: () => void`, `actionsDisabled: boolean`
- Panel mengelola state internal `page`, `zoom`, `numPages`, `rendering`.

- [ ] **Step 1: Tulis test komponen yang GAGAL (RED)**

`PdfPreviewPanel.test.jsx` — mock `pdfjsSetup` (jangan merender canvas sungguhan di jsdom):

```jsx
vi.mock('../../utils/pdfjsSetup', () => ({
  getPdfjs: vi.fn(async () => ({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 2,
        getPage: async () => ({
          getViewport: ({ scale }) => ({ width: 600 * scale, height: 850 * scale }),
          render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
        }),
      }),
      destroy: vi.fn(),
    }),
  })),
}));
```

Assertion: loading state tampil saat `loading`; error + tombol "Coba lagi" memanggil `onRetry`; setelah mock resolve, teks `Hal 1 / 2` terlihat; tombol "Halaman berikutnya" → `Hal 2 / 2`; "Perbesar" menaikkan zoom label; tombol ukuran memanggil `onFormatChange('A6')`; tombol Unduh/Cetak disabled saat `loading` atau `actionsDisabled`.

- [ ] **Step 2: Jalankan, pastikan GAGAL** — komponen belum ada.

- [ ] **Step 3: Implementasi**

`pdfjsSetup.js`:

```js
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let pdfjsPromise = null;
export function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = workerSrc;
      return lib;
    });
  }
  return pdfjsPromise;
}
```

`PdfPreviewPanel.jsx`:
- Effect `[blob]`: reset page/zoom; `getPdfjs()` → `getDocument({ data: await blob.arrayBuffer() })` → `numPages`; cleanup: `destroy()` + flag `cancelled` agar tidak setState setelah unmount.
- Effect `[page, zoom, numPages]`: render halaman ke `<canvas>` (devicePixelRatio-aware); simpan `renderTask` dan `cancel()` saat berubah.
- Toolbar (satu baris desktop, wrap di tablet): tombol ukuran (A4/A5/A6, gaya sama dengan modal sekarang), `−` / `+` zoom, "Fit" (hitung skala dari lebar kontainer), `‹` `›` halaman, label `Hal X / Y` (selalu terlihat).
- Area kanvas: latar abu, kanvas di tengah, rasio fisik dipertahankan.
- Loading: spinner + "Menyiapkan PDF…"; Error: pesan + "Coba lagi".
- Slot validasi (render `validation` bila ada — struktur disiapkan untuk Task 17).
- Bar aksi bawah: "Unduh PDF" (sekunder) + "Cetak" (primary) — keduanya `disabled` saat `loading || error || !blob || actionsDisabled`.
- Semua tombol: `minHeight: 44`, `minWidth: 44`, kelas `ui-focus-ring`, `aria-label` yang jelas.
- Ponsel (`isMobile` prop atau `window.matchMedia`): overlay fullscreen; toolbar wrap; bar aksi menempel bawah (`position: sticky; bottom: 0`) dengan padding aman (`env(safe-area-inset-bottom)`).

`SalesOrderList.jsx` modal Opsi Cetak:
- State baru: `previewBlob`, `previewLoading`, `previewError`, `previewToken` (ref).
- Effect `[showPrintModal, printOptions.format, printOptions.type, printOrder]`: debounce 250 ms → `buildSalesDocumentPdf(...)` → simpan `{blob, filename}`; token guard untuk membuang hasil basi; set error pada catch.
- Render `<PdfPreviewPanel ... />` di bawah pemilihan Tipe Dokumen; hapus tombol "Cetak Sekarang" lama, ganti bar aksi panel.
- `onDownload`: anchor + objectURL dari `previewBlob` + `updatePdfStatus('sudah_dicetak')` setelah sukses.
- `onPrint`: iframe tersembunyi (`iframe.src = objectURL`, `onload → contentWindow.print()`), fallback `window.open(objectURL)`; `updatePdfStatus('sudah_dicetak')` setelah print dipicu. Bersihkan objectURL setelah selesai.
- `handlePrintPDF` lama dihapus/diganti; pastikan tidak ada referensi tersisa (grep `handlePrintPDF`).

- [ ] **Step 4: Jalankan test + build**

Run: `cd frontend && npx vitest run src/components/common/PdfPreviewPanel.test.jsx src/components/SalesOrderList.test.jsx && npm run build`
Expected: PASS; build sukses; chunk `pdfjs` terpisah (lazy).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/pdfjsSetup.js frontend/src/components/common/PdfPreviewPanel.jsx frontend/src/components/common/PdfPreviewPanel.test.jsx frontend/src/components/SalesOrderList.jsx
git commit -m "feat: actual pdf preview with toolbar in print options modal"
```

---

### Task 17: Panel validasi sebelum cetak (spec §10)

**Tujuan:** Pemeriksaan sebelum cetak — nomor nota, kelengkapan data A4, jatuh tempo tempo, panjang referensi pengadaan, jumlah item vs ukuran, konsistensi nominal. Peringatan informatif; ketidakkonsistenan nominal dan data wajib A4 memblokir cetak.

**Files:**
- Create: `frontend/src/utils/documents/salesDocumentValidation.js`
- Create: `frontend/src/utils/documents/salesDocumentValidation.test.js`
- Modify: `frontend/src/components/SalesOrderList.jsx` (hitung validasi dari snapshot yang sama, kirim ke panel)
- Modify: `frontend/src/components/common/PdfPreviewPanel.jsx` (render daftar blocker/warning + kunci aksi)
- Modify: `frontend/src/components/common/PdfPreviewPanel.test.jsx` (+2 test)

**Interfaces:**
- `validateSalesDocument({ order = {}, format = 'A5', type = 'nota' }) → { blockers: [{ code, message }], warnings: [{ code, message }] }`
- Blocker: `missing_order_number`, `incomplete_a4_identity` (A4 wajib nama + alamat customer), `inconsistent_totals` (|dpp+vat−productGross|>1 atau |productGross+ongkir+fee−total|>1 atau total tidak finite/≤0; lewati bila `ppn_excluded`).
- Warning: `missing_due_date` (transaksi tempo: `payment_terms` terisi atau `payment_method` memuat "tempo"/"kredit", dan `due_date` kosong), `long_procurement_ref` (ada referensi pengadaan >40 karakter), `item_count_not_ideal` (`items.length > DOCUMENT_PROFILES[format].recommendedItems`).
- Aksi dikunci (`actionsDisabled`) bila `blockers.length > 0` — unduh dan cetak sama-sama diblokir (ruling: dokumen tidak konsisten tidak boleh keluar lewat jalur mana pun).

- [ ] **Step 1: Tulis test modul yang GAGAL (RED)** — satu test per aturan (6+), termasuk: order nomor kosong → blocker; A4 tanpa alamat → blocker; A4 lengkap → tidak ada blocker; total tidak konsisten → blocker; tempo tanpa jatuh tempo → warning; ref 50 karakter → warning; item 20 di A6 (recommended 5) → warning; `ppn_excluded` tidak memicu `inconsistent_totals`.

- [ ] **Step 2: Jalankan, pastikan GAGAL.**

- [ ] **Step 3: Implementasi modul + integrasi panel.**

- [ ] **Step 4: Test panel** — blocker → tombol Unduh/Cetak disabled + pesan tampil; hanya warning → tombol aktif + pesan kuning.

- [ ] **Step 5: Jalankan** `npx vitest run src/utils/documents/ src/components/common/PdfPreviewPanel.test.jsx` → PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/documents/salesDocumentValidation.js frontend/src/utils/documents/salesDocumentValidation.test.js frontend/src/components/SalesOrderList.jsx frontend/src/components/common/PdfPreviewPanel.jsx frontend/src/components/common/PdfPreviewPanel.test.jsx
git commit -m "feat: pre-print validation panel for sales documents"
```

---

### Task 18: Dokumentasi rollout migrasi 022 + rilis v1.67.19-stable

**Files:**
- Create: `docs/superpowers/notes/2026-09-22-migration-022-rollout.md`
- Modify: `CHANGELOG.md`, `SUPERAPP_BRAIN.md`, `README.md`, `frontend/src/components/Login.jsx`, `frontend/src/components/Sidebar.jsx`, `frontend/src/index.js`, `frontend/src/components/Dashboard.jsx`, `ACTION_LOG.md`
- Modify: `docs/superpowers/specs/2026-09-22-habil-official-sales-documents-design.md` (status)

**Isi dokumen rollout (hasil audit — tulis apa adanya, jangan menjalankan SQL):**

| Penulis kolom baru | Lokasi | Dampak bila deploy sebelum migrasi |
|---|---|---|
| `INSERT INTO sales_orders` (46 kolom) | `backend/routes/sales.js:372` | Buat nota gagal: `column "buyer_npwp" ... does not exist` |
| `UPDATE sales_orders` ($25-$44) | `backend/routes/sales.js:1226` | Simpan perubahan nota gagal |
| `INSERT INTO customers` (12 kolom) | `backend/routes/customers.js:82` | Tambah customer gagal |
| `UPDATE customers` (12 kolom) | `backend/routes/customers.js:97` | Edit customer gagal |

Aman tanpa migrasi (hanya baca / kolom lama): GET sales (`s.*`), GET customers (`c.*`), `loans.js:321` (daftar kolom eksplisit lama), `tax.js:144`, semua `UPDATE` lain (kolom lama).

**Prasyarat urutan deploy:** 1) migrasi 022 dieksekusi (izin + backup), 2) backend, 3) frontend. Tidak ada jendela aman untuk backend lebih dulu.

**Verifikasi read-only (untuk Harun, jangan dijalankan agen):**
```bash
cd backend && npm run migrate:schema:list          # tanpa koneksi DB; 022 harus terakhir
node backend/scripts/check-db.js                    # health check read-only
# SQL read-only (manual, bukan oleh agen):
# SELECT column_name FROM information_schema.columns
#  WHERE table_name IN ('sales_orders','customers')
#    AND column_name IN ('buyer_npwp','ppn_rate','government_agency','tax_invoice_number','npwp','work_unit')
#  ORDER BY table_name, column_name;
# SELECT setting_key, (setting_value ? 'npwp') AS has_npwp FROM print_settings
#  WHERE setting_key IN ('nota_layout','documents_renderer_v2');
```

**Rollback:** kolom additive tidak perlu di-drop untuk rollback aplikasi (kode lama mengabaikannya); cukup deploy ulang backend/frontend versi sebelumnya. Jangan drop kolom tanpa backup.

- [ ] **Step 1: Verifikasi penuh (sekali)**

Run: `cd frontend && npm test && npm run build`
Run: `cd backend && npm test`
Run: `node scripts/check-version-consistency.mjs`
Run: `git diff --check`
Expected: semua hijau/bersih. Catat hasil persis.

- [ ] **Step 2: Tulis dokumen rollout** sesuai tabel di atas.

- [ ] **Step 3: CHANGELOG v1.67.19-stable** — perbaikan: preservasi kunci print_settings (npwp/email tidak lagi terhapus), PPN 0% & tarif pecahan sesuai snapshot, judul per ukuran (A4 faktur, A5/A6 nota); fitur: preview PDF aktual di Opsi Cetak (canvas, toolbar, jumlah halaman, blob sama untuk unduh/cetak), panel validasi sebelum cetak; catatan: flag `documents_renderer_v2` masih `false` (A5/A6 renderer lama), migrasi 022 belum dijalankan.

- [ ] **Step 4: Bump versi** di 7 berkas + `RELEASES[0]` Dashboard (`status: "latest"`, entri lama → `"previous"`), lalu `node scripts/check-version-consistency.mjs` → OK.

- [ ] **Step 5: ACTION_LOG + status spec** — Fase 2 selesai di branch, belum di-push; migrasi belum dijalankan; flag false; checklist manual Harun (A4/A5/A6 preview, tarif 0%/pecahan, simpan PrintSettings lalu cek npwp, validasi blocker).

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/notes/2026-09-22-migration-022-rollout.md CHANGELOG.md SUPERAPP_BRAIN.md README.md ACTION_LOG.md frontend/src/components/Login.jsx frontend/src/components/Sidebar.jsx frontend/src/index.js frontend/src/components/Dashboard.jsx docs/superpowers/specs/2026-09-22-habil-official-sales-documents-design.md
git commit -m "release: v1.67.19-stable — print settings fix, ppn snapshots, actual pdf preview"
```

---

## Self-Review

| Kebutuhan pemilik | Task |
|---|---|
| 1. PrintSettings tidak menghapus kunci (npwp/email) + test | Task 12 |
| 2. PPN 0% tetap 0%, fallback hanya kosong/legacy, label pecahan, regression model + A4/A5/A6 | Task 13 |
| 3. Judul per profil + header lanjutan + golden | Task 14 |
| 4. Preview PDF aktual dari snapshot sama + ukuran + halaman + loading/error + validasi + responsif; flag & renderer lama aman | Task 15-17 |
| 5. Audit urutan rollout migrasi 022 + prasyarat deploy + verifikasi read-only | Task 18 |
| Test gagal dulu untuk 3 bug | Task 12-14 Step RED/GREEN |
| Verifikasi akhir (FE test, BE test, build, checker, git diff --check) | Task 18 Step 1 |

**Known limits (dilaporkan, bukan disembunyikan):** verifikasi visual PDF tetap manual oleh Harun; panel "Preview Live" di form (draft HTML) belum diganti PDF — keputusan pemilik; `pdfjs-dist` menambah dependensi runtime (lazy).
