# Habil Official Sales Documents — Fase 3: Validasi Nominal, Ketahanan PrintSettings, Status Cetak Eksplisit, Error Canvas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menutup empat celah yang tersisa: (1) validasi total yang benar-benar membandingkan jumlah item + ongkir + fee terhadap `order.total` dan tetap menolak total invalid saat `ppn_excluded`; (2) PrintSettings tidak boleh menyimpan form kosong saat GET gagal/tidak lengkap; (3) status `sudah_dicetak` hanya berubah lewat keputusan operator yang eksplisit, plus iframe cetak anti-macet; (4) error render canvas yang terlihat + bisa di-retry.

**Architecture:** Semua perubahan lokal di modul yang sudah ada + satu helper baru (`printBlobInIframe.js`) agar alur cetak bisa diuji tanpa browser. Tidak ada perubahan backend/migrasi/DB.

**Spec:** `docs/superpowers/specs/2026-09-22-habil-official-sales-documents-design.md` (§10-§12)
**Plan sebelumnya:** `...-phase2.md`

## Global Constraints

- **JANGAN push/deploy/migrasi/SQL.** Harun yang smoke test.
- Flag `documents_renderer_v2` tetap `false`; renderer lama + `terima`/`pinjaman` tidak disentuh.
- TDD wajib untuk Task 20, 21, 23 (dan helper Task 22): tunjukkan RED → GREEN.
- `sudah_dicetak` tidak lagi di-set otomatis oleh unduh/cetak — hanya lewat konfirmasi operator di panel. Nilai status tetap `'sudah_dicetak'` (tidak ada status baru).
- Versi tetap **v1.67.19-stable** (belum pernah di-push; perbaikan fase 3 dilipat ke entri yang sama — ruling).
- Commit lokal per task di `feat/official-sales-documents`; jangan sentuh file dirty lain.

---

### Task 20: Validasi total berbasis item (bukan identitas aljabar)

**Bug (audit):** `salesDocumentValidation.js:48-64` memakai identitas struktural (`dpp+vat−productGross`, `productGross+ongkir+fee−grandTotal`) yang selalu ~0 karena seluruh operand diturunkan dari `order.total`; dan seluruh blok dilewati saat `ppn_excluded`, sehingga total 0/negatif/NaN lolos.

**Files:** `frontend/src/utils/documents/salesDocumentValidation.js`, `salesDocumentValidation.test.js`

**Semantik qty (samakan dengan model):** `qty = qty_in_unit ?? qty` (model baris 83/178), `lineTotal = qty × unit_price`.

- [ ] **Step 1: Tes GAGAL (RED)** — tambah ke `salesDocumentValidation.test.js`:

```js
describe('validasi total berbasis item', () => {
  const base = { order_number: 'X', customer_name: 'A', customer_address: 'Jl', ppn_rate: 0.11 };
  it('memblokir saat total tidak cocok dengan jumlah item + ongkir + fee', () => {
    const r = validateSalesDocument({ order: { ...base, total: 600000, ongkir: 0,
      items: [{ qty: 2, unit_price: 250000 }] } });
    expect(r.blockers.map((b) => b.code)).toContain('inconsistent_totals');
  });
  it('lolos saat cocok (termasuk qty_in_unit dan fee pass_on)', () => {
    const r = validateSalesDocument({ order: { ...base, total: 500000, ongkir: 20000,
      payment_fee: 5000, payment_fee_mode: 'pass_on',
      items: [{ qty: 10, qty_in_unit: 2, unit_price: 237500 }] } });
    expect(r.blockers).toEqual([]);
  });
  it('menolak total 0 / negatif / bukan angka meski ppn_excluded aktif', () => {
    for (const total of [0, -5, 'abc']) {
      const r = validateSalesDocument({ order: { ...base, ppn_excluded: true, total,
        items: [{ qty: 1, unit_price: 1000 }] } });
      expect(r.blockers.map((b) => b.code), `total=${total}`).toContain('inconsistent_totals');
    }
  });
  it('ppn_excluded dengan total valid dan item cocok tidak diblokir', () => {
    const r = validateSalesDocument({ order: { ...base, ppn_excluded: true, total: 1000,
      items: [{ qty: 1, unit_price: 1000 }] } });
    expect(r.blockers).toEqual([]);
  });
  it('tanpa item: lewati cek item-vs-total (tidak bisa diverifikasi)', () => {
    const r = validateSalesDocument({ order: { ...base, total: 1000, items: [] } });
    expect(r.blockers).toEqual([]);
  });
});
```

Perbarui tes lama yang mem-pin "ppn_excluded + total 0 lolos" (sekitar baris 110) menjadi ekspektasi baru: **blocker**.

- [ ] **Step 2: RED** — `npx vitest run src/utils/documents/salesDocumentValidation.test.js`; mismatch + ppn_excluded invalid harus GAGAL.

- [ ] **Step 3: Implementasi**

```js
const itemLineTotal = (item) => {
  const hasQtyInUnit = item?.qty_in_unit !== undefined && item?.qty_in_unit !== null;
  const qty = Number(hasQtyInUnit ? item.qty_in_unit : item.qty);
  const unitPrice = Number(item?.unit_price);
  if (!Number.isFinite(qty) || !Number.isFinite(unitPrice)) return 0;
  return qty * unitPrice;
};
```

Ganti blok `if (!totals.ppnExcluded) {...}` menjadi (berlaku untuk ppn_excluded juga):

```js
  const totals = computeTotals(safeOrder);
  const grandTotalRaw = Number(safeOrder.total);
  const grandTotalValid = Number.isFinite(grandTotalRaw) && grandTotalRaw > 0;
  const items = Array.isArray(safeOrder.items) ? safeOrder.items : [];
  const itemsSum = items.reduce((acc, item) => acc + itemLineTotal(item), 0);
  const expectedTotal = itemsSum + totals.shippingCharge + totals.paymentFee;
  const itemsTotalConsistent =
    items.length === 0 || Math.abs(expectedTotal - grandTotalRaw) <= TOTALS_TOLERANCE;
  if (!grandTotalValid) {
    blockers.push({ code: 'inconsistent_totals',
      message: 'Total transaksi tidak valid (nol, negatif, atau bukan angka).' });
  } else if (!itemsTotalConsistent) {
    blockers.push({ code: 'inconsistent_totals',
      message: 'Total tidak cocok dengan jumlah item + ongkir + biaya. Periksa nilai transaksi.' });
  }
```

Pindahkan deklarasi `items` yang lama (baris 85) agar tidak dobel (dipakai juga oleh warning item count).

- [ ] **Step 4: GREEN** — file yang sama hijau, lalu `npx vitest run src/utils/documents/`.

- [ ] **Step 5: Commit** — `fix: validate document totals against item sum, not algebraic identity`

---

### Task 21: PrintSettings — jangan tampilkan/ simpan form kosong saat GET gagal

**Bug (audit):** bila `printSettingsAPI.get()` reject atau `nota_layout` tidak ada, form terisi kosong, `rawLayoutRef` null, dan Simpan tetap aktif → satu klik menimpa seluruh pengaturan dengan 8 field kosong.

**Files:** `frontend/src/components/PrintSettings.jsx`, `PrintSettings.test.jsx`

- [ ] **Step 1: Tes GAGAL (RED)** — tambah ke `PrintSettings.test.jsx`:

```jsx
  it('GET gagal: tampilkan error + retry, Simpan nonaktif, tidak pernah memanggil update', async () => {
    printSettingsAPI.get.mockRejectedValueOnce(new Error('network'));
    render(<PrintSettings />);
    expect(await screen.findByText(/gagal memuat pengaturan/i)).toBeTruthy();
    const save = screen.getByRole('button', { name: /simpan perubahan/i });
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(printSettingsAPI.update).not.toHaveBeenCalled();
  });

  it('respons tanpa nota_layout diperlakukan sama (tidak boleh menimpa)', async () => {
    printSettingsAPI.get.mockResolvedValueOnce({ data: {} });
    render(<PrintSettings />);
    expect(await screen.findByText(/gagal memuat pengaturan/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /simpan perubahan/i }).disabled).toBe(true);
  });

  it('retry setelah gagal memuatkan form dan mengaktifkan Simpan', async () => {
    printSettingsAPI.get.mockRejectedValueOnce(new Error('network'));
    render(<PrintSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /coba lagi/i }));
    const address = await screen.findByDisplayValue('Jl. Lama No. 1');
    fireEvent.change(address, { target: { value: 'Jl. Baru' } });
    const save = screen.getByRole('button', { name: /simpan perubahan/i });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(printSettingsAPI.update).toHaveBeenCalledTimes(1));
    const payload = printSettingsAPI.update.mock.calls[0][0];
    expect(payload.nota_layout.npwp).toBe('93.813.949.0-609.000');
    expect(payload.nota_layout.email).toBe('ops@habil.example');
    expect(payload.nota_layout.future_key).toBe('jangan-hilang');
    expect(payload.nota_layout.address).toBe('Jl. Baru');
  });
```

(Sesuaikan nama tombol dengan label nyata; jangan melonggarkan assertion.)

- [ ] **Step 2: RED.**

- [ ] **Step 3: Implementasi** — tambah state `loadError`; di `fetchSettings`: set error + `rawLayoutRef.current = null` bila get reject ATAU `!printData?.nota_layout`; clear error saat sukses. Guard di `handleSave`: `if (loadError || !rawLayoutRef.current) return;`. Tombol Simpan `disabled={saving || !!loadError}`. UI error: pesan + tombol "Coba lagi" memanggil `fetchSettings`.

- [ ] **Step 4: GREEN** — `npx vitest run src/components/PrintSettings.test.jsx`.

- [ ] **Step 5: Commit** — `fix: block print settings save until layout loads successfully`

---

### Task 22: Status cetak eksplisit + iframe anti-macet

**Bug (audit):** `SalesOrderList.jsx:1774` menandai `sudah_dicetak` otomatis setelah unduh; `:1825` menandai setelah `print()` dipanggil (dialog dibuka). Tidak ada timeout/onerror: bila iframe tak pernah `onload`, `previewBusy` terkunci selamanya dan blob URL tidak dibersihkan (cleanup hanya di dalam `onload`).

**Files:**
- Create: `frontend/src/utils/documents/printBlobInIframe.js` + `printBlobInIframe.test.js`
- Modify: `frontend/src/components/SalesOrderList.jsx` (handler ~1759-1834 + state + props panel)
- Modify: `frontend/src/components/common/PdfPreviewPanel.jsx` (+props prompt) + `PdfPreviewPanel.test.jsx`

**Interfaces:**
- `printBlobInIframe(blob, { timeoutMs = 10000 }) → Promise<{ method: 'iframe' | 'popup' }>` — menolak dengan `error.code` ∈ `'timeout' | 'load_failed' | 'popup_blocked' | 'print_failed'`. Wajib: iframe dihapus + `URL.revokeObjectURL` saat reject; saat resolve revoke tertunda 60 dtk; `onerror` ditangani.
- Panel props baru: `statusPrompt` (`null | { kind: 'download' | 'print' }`), `onStatusConfirm`, `onStatusDismiss`.

- [ ] **Step 1: Tes GAGAL helper** — `printBlobInIframe.test.js` (jsdom, `vi.useFakeTimers`, mock `URL.createObjectURL/revokeObjectURL`, spy `window.open`):
  - `onload` + `print()` sukses → resolve `{ method: 'iframe' }`; iframe ada di DOM; revoke **belum** terjadi.
  - `print()` throw tapi `window.open` mengembalikan objek → resolve `{ method: 'popup' }`.
  - `print()` throw dan `window.open` null → reject `popup_blocked`; iframe dihapus; revoke terjadi.
  - `onerror` → reject `load_failed`; iframe dihapus; revoke terjadi.
  - tidak ada event + majukan timer `timeoutMs` → reject `timeout`; iframe dihapus; revoke terjadi.
  - resolve → majukan 60 dtk → revoke terjadi.

- [ ] **Step 2: RED → implementasi helper → GREEN.**

- [ ] **Step 3: Panel prompt + tes** — strip konfirmasi: "PDF diunduh. Tandai nota sebagai sudah dicetak?" / "Dialog cetak selesai. Tandai nota sebagai sudah dicetak?" + tombol `Ya, tandai` / `Tidak`. Tes: prompt null → tidak tampil; prompt download → teks + `onStatusConfirm`/`onStatusDismiss` terpanggil.

- [ ] **Step 4: Wiring SalesOrderList** — state `statusPrompt`; `handlePreviewDownload` tidak lagi memanggil `updatePdfStatus` (hanya unduh + set prompt); `handlePreviewPrint` async: `setPreviewBusy(true)` → `await printBlobInIframe(...)` → set prompt; catch → `flash` pesan sesuai `error.code`; `finally` `setPreviewBusy(false)` (sinkron, tidak bergantung `onload`). `handleStatusConfirm` → `updatePdfStatus(printOrder.id, 'sudah_dicetak')` + `fetchOrders()` + clear; `handleStatusDismiss` → clear. Kirim props ke panel. Grep sisa referensi lama (`markPrinted`, `cleanup`) — pastikan tidak ada.

- [ ] **Step 5: GREEN** — `npx vitest run src/utils/documents/printBlobInIframe.test.js src/components/common/PdfPreviewPanel.test.jsx src/components/SalesOrderList.test.jsx` + `npm run build`.

- [ ] **Step 6: Commit** — `feat: explicit print-status decision with resilient iframe print flow`

---

### Task 23: Error render canvas + retry di PdfPreviewPanel

**Bug (audit):** kegagalan `pdfPage.render` hanya di-`console.error` → kanvas kosong tanpa penjelasan (`PdfPreviewPanel.jsx:198-205`).

**Files:** `PdfPreviewPanel.jsx`, `PdfPreviewPanel.test.jsx`

- [ ] **Step 1: Tes GAGAL (RED)** — mock `getPdfjs` dengan `render` yang reject sekali, lalu resolve pada percobaan berikutnya:
  - render reject → teks error (mis. "Gagal merender halaman") + tombol "Coba lagi" tampil; kanvas tidak menggantung.
  - klik "Coba lagi" → render dipanggil lagi (assert call count bertambah) dan setelah resolve error hilang.

- [ ] **Step 2: RED → implementasi** — state `renderError`; catch non-cancel → `setRenderError(pesan)` + `setRendering(false)`; effect render ikut bergantung pada `renderKey`; tombol retry: `setRenderError(null); setRenderKey(k => k+1)`; overlay error di area kanvas (tidak mengunci aksi unduh/cetak — aksi bergantung pada blob, bukan kanvas).

- [ ] **Step 3: GREEN** — `npx vitest run src/components/common/PdfPreviewPanel.test.jsx`.

- [ ] **Step 4: Commit** — `fix: surface canvas render failures with retry in pdf preview`

---

### Task 24: Lipat CHANGELOG + ACTION_LOG fase 3, verifikasi penuh

**Files:** `CHANGELOG.md` (entri v1.67.19 yang sama — belum pernah di-push), `ACTION_LOG.md`

- [ ] **Step 1: Verifikasi penuh (sekali)** — `cd frontend && npm test`, `npm run build`, `cd backend && npm test`, `node scripts/check-version-consistency.mjs`, `git diff --check`. Catat hasil persis.
- [ ] **Step 2: Update CHANGELOG v1.67.19** — tambah butir fase 3 (validasi nominal item-based, PrintSettings anti-timpa, status cetak lewat konfirmasi operator, iframe timeout/cleanup, error canvas retry).
- [ ] **Step 3: Update ACTION_LOG** — status fase 3, checklist manual tambahan (validasi mismatch memblokir, prompt status muncul, error canvas retry), tetap: belum di-push, migrasi belum jalan, flag false.
- [ ] **Step 4: Commit** — `docs: fold phase 3 fixes into v1.67.19 release notes`

---

## Self-Review

| Permintaan pemilik | Task |
|---|---|
| 1. Validasi item-based + tolak total invalid saat ppn_excluded + tes gagal dulu | Task 20 |
| 2. PrintSettings GET gagal → error/retry + Simpan nonaktif + tes | Task 21 |
| 3. Status cetak eksplisit + iframe timeout/cleanup + tes gagal/batal | Task 22 |
| 4. Error canvas + retry | Task 23 |
| Verifikasi terarah, FE penuh, build, checker, diff --check | Task 24 + mandor |
