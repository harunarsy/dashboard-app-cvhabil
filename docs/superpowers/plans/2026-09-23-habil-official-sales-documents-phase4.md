# Habil Official Sales Documents — Fase 4: Ikat Aksi Cetak ke Sesi+Nota, Retry PATCH, Canvas Null

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menutup tiga celah tersisa: (1) setiap aksi unduh/cetak dan prompt konfirmasi terikat ke ID nota + sesi modal — hasil async sesi lama tidak boleh memunculkan prompt di nota baru, mengubah busy sesi baru, atau mengirim PATCH untuk nota yang salah; (2) PATCH status yang gagal mempertahankan konfirmasi agar bisa di-retry tanpa unduh/cetak ulang, plus guard klik ganda; (3) `canvas.getContext('2d') === null` menampilkan kegagalan preview + retry, sementara unduh/cetak blob valid tetap tersedia.

**Architecture:** Logika sesi/async dipindah dari `SalesOrderList.jsx` ke hook baru `useSalesPrintFlow` (pola `frontend/src/hooks/*` yang sudah ada) agar bisa diuji langsung dengan `renderHook` — termasuk skenario promise cetak tertunda A→B. Panel menerima `statusSaving` untuk mencegah klik ganda dan menampilkan kegagalan canvas.

**Spec:** `docs/superpowers/specs/2026-09-22-habil-official-sales-documents-design.md` (§10-§12)

## Global Constraints

- **JANGAN push/deploy/migrasi/SQL. JANGAN smoke test browser** — pemilik yang mengecek.
- Flag `documents_renderer_v2` tetap `false`; renderer lama tidak disentuh.
- `sudah_dicetak` tetap satu-satunya nilai status; satu-satunya jalur PATCH adalah konfirmasi operator (kini terikat `orderId` + `session`).
- Versi tetap **v1.67.19-stable** (belum di-push) — perbaikan fase 4 dilipat ke entri CHANGELOG yang sama.
- TDD wajib: tunjukkan RED → GREEN untuk hook dan panel.
- Commit lokal per task; jangan sentuh file dirty lain.

---

### Task 25: Hook `useSalesPrintFlow` — sesi + orderId binding, retry PATCH, anti klik ganda

**Bug (audit):** `handlePreviewPrint` menunggu `printBlobInIframe`, lalu `setStatusPrompt({kind:'print'})` tanpa guard — bila modal ditutup/nota lain dibuka saat menunggu, prompt muncul di konteks baru dan `handleStatusConfirm` mem-PATCH `printOrder` yang sedang aktif (nota salah). `finally { setPreviewBusy(false) }` juga bisa melepas busy sesi baru. `handleStatusConfirm` menghapus prompt SEBELUM `await` (gagal = konfirmasi hilang) dan tidak punya guard klik ganda.

**Files:**
- Create: `frontend/src/hooks/useSalesPrintFlow.js`
- Create: `frontend/src/hooks/useSalesPrintFlow.test.js`
- Modify: `frontend/src/components/SalesOrderList.jsx` (hapus `previewBusy`/`statusPrompt` state + tiga handler; pakai hook; `openPrintOptions` → `openSession()`; jalur tutup modal → `closeSession()`; props panel)
- Modify: `frontend/src/components/common/PdfPreviewPanel.jsx` (+prop `statusSaving`, tombol "Ya, tandai" disabled saat saving)
- Modify: `frontend/src/components/common/PdfPreviewPanel.test.jsx` (+1 tes statusSaving)

**Interfaces:**
- `useSalesPrintFlow({ updateStatus, refreshOrders, flash }) → { busy, prompt, saving, openSession, closeSession, download, print, confirmStatus, dismissStatus }`
- `prompt` = `null | { kind: 'download' | 'print', orderId, session }`.
- `openSession()` / `closeSession()` menaikkan `sessionRef` + mereset `busy/prompt/saving`; hasil async hanya boleh menyentuh state bila `sessionRef.current === session` yang dimulai.
- `download({ blob, filename, orderId })` sinkron-ish (anchor + objectURL), set prompt terikat.
- `print({ blob, orderId })` async: `busy` true; `await printBlobInIframe(blob)`; guard sesi sebelum set prompt/flash; `finally` guard sesi sebelum `busy=false`.
- `confirmStatus(currentOrderId)`: guard `savingRef`; prompt harus ada, `prompt.orderId === currentOrderId`, dan sesi masih aktif — selain itu prompt dibuang TANPA PATCH. PATCH sukses → `refreshOrders()` + prompt dibersihkan; PATCH gagal → prompt DIPERTAHANKAN + flash error (bisa retry).
- `dismissStatus()`: diabaikan saat `saving`.
- `PRINT_FAILURE_MESSAGES` pindah dari SalesOrderList ke modul hook.

- [ ] **Step 1: Tes hook GAGAL (RED)** — `useSalesPrintFlow.test.js` (`renderHook` dari `@testing-library/react`, `vi.mock('../utils/documents/printBlobInIframe')`, stub `URL.createObjectURL/revokeObjectURL`):

```js
// deferred helper
const deferred = () => { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };

it('A/B race: cetak A selesai setelah buka B — tanpa prompt/PATCH untuk B', async () => {
  const printDeferred = deferred();
  printBlobInIframe.mockReturnValue(printDeferred.promise);
  const { result } = renderHook(() => useSalesPrintFlow(deps));
  act(() => result.current.openSession());          // A
  act(() => { result.current.print({ blob: BLOB, orderId: 'A' }); });
  act(() => result.current.closeSession());
  act(() => result.current.openSession());          // B
  await act(async () => { printDeferred.resolve({ method: 'iframe' }); await Promise.resolve(); });
  expect(result.current.prompt).toBeNull();          // tidak ada prompt di sesi B
  expect(result.current.busy).toBe(false);           // busy sesi B tidak tersentuh
  await act(async () => { await result.current.confirmStatus('B'); });
  expect(updateStatus).not.toHaveBeenCalled();
});

it('PATCH gagal: prompt dipertahankan untuk retry, sukses kedua membersihkan', async () => {
  updateStatus.mockRejectedValueOnce(new Error('500')).mockResolvedValueOnce({});
  const { result } = renderHook(() => useSalesPrintFlow(deps));
  act(() => result.current.openSession());
  await act(async () => { await result.current.download({ blob: BLOB, filename: 'Nota_A.pdf', orderId: 'A' }); });
  expect(result.current.prompt).toMatchObject({ kind: 'download', orderId: 'A' });
  await act(async () => { await result.current.confirmStatus('A'); });
  expect(updateStatus).toHaveBeenCalledTimes(1);
  expect(result.current.prompt).not.toBeNull();      // gagal → tetap ada
  await act(async () => { await result.current.confirmStatus('A'); });
  expect(updateStatus).toHaveBeenCalledTimes(2);     // retry tanpa unduh ulang
  expect(result.current.prompt).toBeNull();
  expect(refreshOrders).toHaveBeenCalled();
});

it('klik ganda Ya: PATCH hanya sekali selama in-flight', async () => {
  const patchDeferred = deferred();
  updateStatus.mockReturnValue(patchDeferred.promise);
  /* openSession + download → prompt */
  act(() => { result.current.confirmStatus('A'); });
  act(() => { result.current.confirmStatus('A'); });
  expect(updateStatus).toHaveBeenCalledTimes(1);
  await act(async () => { patchDeferred.resolve({}); await Promise.resolve(); });
});

it('prompt sesi lama untuk nota lain: confirmStatus("B") membuang prompt tanpa PATCH', async () => {
  /* prompt terikat orderId 'A'; panggil confirmStatus('B') */
  expect(updateStatus).not.toHaveBeenCalled();
  expect(result.current.prompt).toBeNull();
});
```

- [ ] **Step 2: RED** — `npx vitest run src/hooks/useSalesPrintFlow.test.js`; modul belum ada / guard belum ada.

- [ ] **Step 3: Implementasi hook** sesuai Interfaces di atas (ref `sessionRef`, `busyRef`, `savingRef` untuk guard sinkron; state untuk render).

- [ ] **Step 4: Wiring SalesOrderList** — hapus state `previewBusy`/`statusPrompt` + `handlePreviewDownload`/`handlePreviewPrint`/`handleStatusConfirm`/`handleStatusDismiss`/`PRINT_FAILURE_MESSAGES`; pakai hook:
  - `const printFlow = useSalesPrintFlow({ updateStatus: (id, s) => salesAPI.updatePdfStatus(id, s), refreshOrders: fetchOrders, flash });`
  - `openPrintOptions`: `printFlow.openSession()` + reset lama.
  - Jalur tutup modal (`setShowPrintModal(false)` di tombol close ~6532 dan di effect ~607): `printFlow.closeSession()`.
  - Panel: `statusPrompt={printFlow.prompt}`, `statusSaving={printFlow.saving}`, `onStatusConfirm={() => printFlow.confirmStatus(printOrder?.id)}`, `onStatusDismiss={printFlow.dismissStatus}`, `actionsDisabled={... || printFlow.busy}`; handler unduh/cetak memanggil `printFlow.download({...})` / `printFlow.print({...})` dengan `orderId: printOrder.id` + blob/filename dari state preview.
  - Grep: `previewBusy`, `statusPrompt`, `handlePreview`, `PRINT_FAILURE_MESSAGES` tidak boleh tersisa.

- [ ] **Step 5: Panel `statusSaving`** — tombol "Ya, tandai" `disabled={statusSaving}`; tes panel: statusSaving true → tombol disabled + `onStatusConfirm` tidak terpanggil saat diklik.

- [ ] **Step 6: GREEN** — `npx vitest run src/hooks/useSalesPrintFlow.test.js src/components/common/PdfPreviewPanel.test.jsx src/components/SalesOrderList.test.jsx && npm run build`.

- [ ] **Step 7: Commit** — `fix: bind print actions and status confirm to order and modal session`

---

### Task 26: Canvas 2D tidak tersedia → kegagalan preview + retry (unduh/cetak tetap aktif)

**Bug (audit):** saat `canvas.getContext('2d')` null, panel hanya `setRendering(false)` dan return — kanvas kosong tanpa penjelasan.

**Files:** `frontend/src/components/common/PdfPreviewPanel.jsx`, `PdfPreviewPanel.test.jsx`

- [ ] **Step 1: Tes GAGAL (RED)**

```js
it('canvas 2D tidak tersedia: tampilkan kegagalan + Coba lagi, unduh/cetak tetap aktif', async () => {
  getContextSpy.mockReturnValue(null);           // override stub file-wide
  render(<PdfPreviewPanel {...propsWithBlob} onDownload={fn} onPrint={fn} />);
  expect(await screen.findByText(/canvas 2D tidak tersedia/i)).toBeTruthy();
  expect(screen.getByRole('button', { name: /coba lagi/i })).toBeTruthy();
  expect(screen.getByRole('button', { name: /unduh pdf/i }).disabled).toBe(false);
  expect(screen.getByRole('button', { name: /^cetak$/i }).disabled).toBe(false);
});
```

- [ ] **Step 2: RED → implementasi** — di cabang `if (!ctx)`: `setRenderError('Pratinjau tidak bisa dirender — canvas 2D tidak tersedia. Unduh & Cetak tetap bisa dipakai.')` + `setRendering(false)`. Overlay error + tombol retry yang sudah ada dipakai ulang (retry tetap boleh dicoba). Aksi tidak terpengaruh (`blocked` tidak memuat `renderError`).

- [ ] **Step 3: GREEN** — `npx vitest run src/components/common/PdfPreviewPanel.test.jsx`.

- [ ] **Step 4: Commit** — `fix: surface missing-2d-context as retryable preview failure`

---

### Task 27: Lipat CHANGELOG + ACTION_LOG fase 4, verifikasi penuh

**Files:** `CHANGELOG.md`, `ACTION_LOG.md`

- [ ] **Step 1: Verifikasi penuh (sekali)** — `cd frontend && npm test`, `npm run build`, `cd backend && npm test`, `node scripts/check-version-consistency.mjs`, `git diff --check`. Catat hasil persis. **Jangan smoke test browser.**
- [ ] **Step 2: CHANGELOG** — tambah butir fase 4 ke entri v1.67.19 yang sama (tanpa ubah versi/tanggal).
- [ ] **Step 3: ACTION_LOG** — status fase 4 + checklist manual baru (buka A → cetak → tutup → buka B → selesaikan cetak A: tidak boleh ada prompt/PATCH untuk B; PATCH gagal → konfirmasi tetap → retry; klik ganda Ya → satu PATCH; canvas null → error + retry). Tetap: belum di-push, migrasi belum jalan, flag false.
- [ ] **Step 4: Commit** — `docs: fold phase 4 fixes into v1.67.19 release notes`

---

## Self-Review

| Permintaan pemilik | Task |
|---|---|
| Aksi cetak/unduh + prompt terikat ID nota & sesi modal | Task 25 |
| Hasil async sesi lama: tanpa prompt di nota baru, tanpa ubah busy sesi baru, tanpa PATCH nota salah | Task 25 (guard sesi di print/download/finally + confirmStatus orderId) |
| PATCH gagal → konfirmasi dipertahankan + retry; cegah klik ganda | Task 25 (prompt dipertahankan + `savingRef` + tombol disabled) |
| Canvas 2D null → kegagalan preview + retry; unduh/cetak tetap aktif | Task 26 |
| Tes promise tertunda A→B, PATCH gagal+retry, getContext null | Task 25/26 |
| Tes FE, build, checker, diff check; tanpa smoke test | Task 27 + mandor |
