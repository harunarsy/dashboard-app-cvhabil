import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { printBlobInIframe } from './printBlobInIframe';

const MOCK_URL = 'blob:mock-url';

const makeBlob = () => new Blob(['%PDF-1.4 dummy'], { type: 'application/pdf' });

const lastIframe = () => document.body.querySelector('iframe');

const stubContentWindow = (iframe, overrides = {}) => {
  const win = { focus: vi.fn(), print: vi.fn(), ...overrides };
  Object.defineProperty(iframe, 'contentWindow', { value: win, configurable: true });
  return win;
};

const loadIframe = () => {
  const iframe = lastIframe();
  iframe.dispatchEvent(new Event('load'));
  return iframe;
};

describe('printBlobInIframe', () => {
  let originalCreateObjectURL;
  let originalRevokeObjectURL;

  beforeEach(() => {
    vi.useFakeTimers();
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => MOCK_URL);
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    if (originalCreateObjectURL) URL.createObjectURL = originalCreateObjectURL;
    else delete URL.createObjectURL;
    if (originalRevokeObjectURL) URL.revokeObjectURL = originalRevokeObjectURL;
    else delete URL.revokeObjectURL;
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('onload + print() sukses → resolve { method: "iframe" }, iframe tetap di DOM, revoke belum jalan', async () => {
    const promise = printBlobInIframe(makeBlob());
    const iframe = lastIframe();
    expect(iframe).toBeTruthy();
    const win = stubContentWindow(iframe);

    loadIframe();

    await expect(promise).resolves.toEqual({ method: 'iframe' });
    expect(win.focus).toHaveBeenCalledTimes(1);
    expect(win.print).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector('iframe')).toBe(iframe);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('print() throw tapi window.open mengembalikan objek → resolve { method: "popup" }', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({ closed: false });
    const promise = printBlobInIframe(makeBlob());
    const iframe = lastIframe();
    stubContentWindow(iframe, {
      print: vi.fn(() => {
        throw new Error('print tidak didukung');
      }),
    });

    loadIframe();

    await expect(promise).resolves.toEqual({ method: 'popup' });
    expect(openSpy).toHaveBeenCalledWith(MOCK_URL, '_blank');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('print() throw dan window.open null → reject popup_blocked, iframe dihapus + revoke', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const promise = printBlobInIframe(makeBlob());
    const iframe = lastIframe();
    stubContentWindow(iframe, {
      print: vi.fn(() => {
        throw new Error('print tidak didukung');
      }),
    });

    loadIframe();

    await expect(promise).rejects.toMatchObject({ code: 'popup_blocked' });
    expect(document.body.querySelector('iframe')).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(MOCK_URL);
  });

  it('fallback window.open melempar → reject print_failed, iframe dihapus + revoke', async () => {
    vi.spyOn(window, 'open').mockImplementation(() => {
      throw new Error('window.open melempar');
    });
    const promise = printBlobInIframe(makeBlob());
    const iframe = lastIframe();
    stubContentWindow(iframe, {
      print: vi.fn(() => {
        throw new Error('print tidak didukung');
      }),
    });

    loadIframe();

    await expect(promise).rejects.toMatchObject({ code: 'print_failed' });
    expect(document.body.querySelector('iframe')).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(MOCK_URL);
  });

  it('onerror → reject load_failed, iframe dihapus + revoke', async () => {
    const promise = printBlobInIframe(makeBlob());
    const iframe = lastIframe();

    iframe.dispatchEvent(new Event('error'));

    await expect(promise).rejects.toMatchObject({ code: 'load_failed' });
    expect(document.body.querySelector('iframe')).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(MOCK_URL);
  });

  it('tanpa event sampai timeoutMs → reject timeout, iframe dihapus + revoke', async () => {
    const promise = printBlobInIframe(makeBlob(), { timeoutMs: 10000 });
    const assertion = expect(promise).rejects.toMatchObject({ code: 'timeout' });
    expect(lastIframe()).toBeTruthy();

    vi.advanceTimersByTime(10000);

    await assertion;
    expect(document.body.querySelector('iframe')).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(MOCK_URL);
  });

  it('resolve → revoke & iframe dibersihkan setelah 60 detik (tertunda)', async () => {
    const promise = printBlobInIframe(makeBlob());
    const iframe = lastIframe();
    stubContentWindow(iframe);

    loadIframe();

    await expect(promise).resolves.toEqual({ method: 'iframe' });
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60000);

    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(MOCK_URL);
    expect(document.body.querySelector('iframe')).toBeNull();
  });
});
