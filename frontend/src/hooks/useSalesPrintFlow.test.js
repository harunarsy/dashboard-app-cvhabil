// Task 25: kontrak hook alur cetak nota — hasil async terikat SESI modal + orderId.
// Empat race yang dikonfirmasi audit:
// 1) cetak A selesai setelah operator pindah ke nota B (prompt/PATCH tidak boleh bocor)
// 2) PATCH gagal → prompt dipertahankan untuk retry tanpa unduh ulang
// 3) klik ganda "Ya, tandai" → PATCH sekali
// 4) prompt milik nota lain → confirmStatus membuang prompt TANPA PATCH
import { renderHook, act } from '@testing-library/react';

vi.mock('../utils/documents/printBlobInIframe', () => ({
  printBlobInIframe: vi.fn(),
}));

import useSalesPrintFlow from './useSalesPrintFlow';
import { printBlobInIframe } from '../utils/documents/printBlobInIframe';

const BLOB = new Blob(['%PDF-1.4 dummy'], { type: 'application/pdf' });

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

let updateStatus;
let refreshOrders;
let flash;

const renderFlow = () =>
  renderHook(() => useSalesPrintFlow({ updateStatus, refreshOrders, flash }));

beforeEach(() => {
  updateStatus = vi.fn();
  refreshOrders = vi.fn();
  flash = vi.fn();
  URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(() => {});
});

describe('useSalesPrintFlow', () => {
  test('A/B race: cetak A selesai setelah buka B — tanpa prompt/PATCH untuk B', async () => {
    const printDeferred = deferred();
    printBlobInIframe.mockReturnValue(printDeferred.promise);
    const { result } = renderFlow();

    act(() => result.current.openSession()); // sesi A
    act(() => {
      result.current.print({ blob: BLOB, orderId: 'A' });
    });
    expect(result.current.busy).toBe(true);

    act(() => result.current.closeSession());
    act(() => result.current.openSession()); // sesi B

    await act(async () => {
      printDeferred.resolve({ method: 'iframe' });
      await Promise.resolve();
    });

    expect(result.current.prompt).toBeNull(); // tidak ada prompt di sesi B
    expect(result.current.busy).toBe(false); // busy sesi B tidak tersentuh

    await act(async () => {
      await result.current.confirmStatus('B');
    });
    expect(updateStatus).not.toHaveBeenCalled();
  });

  test('PATCH gagal: prompt dipertahankan untuk retry, sukses kedua membersihkan', async () => {
    updateStatus.mockRejectedValueOnce(new Error('500')).mockResolvedValueOnce({});
    const { result } = renderFlow();

    act(() => result.current.openSession());
    act(() => {
      result.current.download({ blob: BLOB, filename: 'Nota_A.pdf', orderId: 'A' });
    });
    expect(result.current.prompt).toMatchObject({ kind: 'download', orderId: 'A' });

    await act(async () => {
      await result.current.confirmStatus('A');
    });
    expect(updateStatus).toHaveBeenCalledTimes(1);
    expect(updateStatus).toHaveBeenCalledWith('A', 'sudah_dicetak');
    expect(result.current.prompt).not.toBeNull(); // gagal → prompt tetap ada
    expect(flash).toHaveBeenCalledWith('Status cetak gagal disimpan', 'error');

    await act(async () => {
      await result.current.confirmStatus('A'); // retry tanpa unduh ulang
    });
    expect(updateStatus).toHaveBeenCalledTimes(2);
    expect(result.current.prompt).toBeNull();
    expect(refreshOrders).toHaveBeenCalled();
  });

  test('klik ganda Ya: PATCH hanya sekali selama in-flight', async () => {
    const patchDeferred = deferred();
    updateStatus.mockReturnValue(patchDeferred.promise);
    const { result } = renderFlow();

    act(() => result.current.openSession());
    act(() => {
      result.current.download({ blob: BLOB, filename: 'Nota_A.pdf', orderId: 'A' });
    });

    act(() => {
      result.current.confirmStatus('A');
    });
    act(() => {
      result.current.confirmStatus('A');
    });
    expect(updateStatus).toHaveBeenCalledTimes(1);
    expect(result.current.saving).toBe(true);

    await act(async () => {
      patchDeferred.resolve({});
      await Promise.resolve();
    });
    expect(result.current.saving).toBe(false);
    expect(result.current.prompt).toBeNull();
  });

  test('prompt sesi lama untuk nota lain: confirmStatus("B") membuang prompt tanpa PATCH', async () => {
    const { result } = renderFlow();

    act(() => result.current.openSession());
    act(() => {
      result.current.download({ blob: BLOB, filename: 'Nota_A.pdf', orderId: 'A' });
    });
    expect(result.current.prompt).toMatchObject({ orderId: 'A' });

    await act(async () => {
      await result.current.confirmStatus('B');
    });
    expect(updateStatus).not.toHaveBeenCalled();
    expect(result.current.prompt).toBeNull();
  });

  test('dismissStatus diabaikan selama PATCH in-flight', async () => {
    const patchDeferred = deferred();
    updateStatus.mockReturnValue(patchDeferred.promise);
    const { result } = renderFlow();

    act(() => result.current.openSession());
    act(() => {
      result.current.download({ blob: BLOB, filename: 'Nota_A.pdf', orderId: 'A' });
    });
    act(() => {
      result.current.confirmStatus('A');
    });
    act(() => {
      result.current.dismissStatus();
    });
    expect(result.current.prompt).not.toBeNull(); // saving → dismiss tidak boleh lolos

    await act(async () => {
      patchDeferred.resolve({});
      await Promise.resolve();
    });
    expect(result.current.prompt).toBeNull();
  });

  test('PATCH sukses tidak menghapus prompt baru yang muncul selama in-flight', async () => {
    const patchDeferred = deferred();
    updateStatus.mockReturnValue(patchDeferred.promise);
    const { result } = renderFlow();

    act(() => result.current.openSession());
    act(() => {
      result.current.download({ blob: BLOB, filename: 'Nota_A.pdf', orderId: 'A' });
    });
    act(() => {
      result.current.confirmStatus('A');
    });
    // Unduh lagi saat PATCH masih in-flight → prompt BARU (sesi & nota sama).
    act(() => {
      result.current.download({ blob: BLOB, filename: 'Nota_A_lagi.pdf', orderId: 'A' });
    });

    await act(async () => {
      patchDeferred.resolve({});
      await Promise.resolve();
    });
    expect(result.current.saving).toBe(false);
    expect(result.current.prompt).not.toBeNull(); // prompt baru tidak boleh ikut dibersihkan
  });
});
