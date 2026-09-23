// Task 22 (spec §10): cetak blob di iframe tersembunyi dengan jaminan anti-macet.
// Kontrak: selalu settle (resolve/reject) — timeout + onerror ditangani, iframe dihapus dan
// blob URL di-revoke saat reject; saat resolve revoke ditunda 60 dtk agar browser sempat
// mencetak. print() yang melempar jatuh ke popup (window.open dipanggil sinkron di dalam
// onload supaya masih dalam user gesture) → { method: 'popup' } atau reject 'popup_blocked'.
const DEFAULT_TIMEOUT_MS = 10000;
const REVOKE_DELAY_MS = 60000;

const printError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

export function printBlobInIframe(blob, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId = null;
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';

    const clearTimer = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const removeIframe = () => {
      try {
        iframe.remove();
      } catch (e) {
        /* remove best-effort */
      }
    };

    const finish = (method) => {
      if (settled) return;
      settled = true;
      clearTimer();
      window.setTimeout(() => {
        removeIframe();
        URL.revokeObjectURL(url);
      }, REVOKE_DELAY_MS);
      resolve({ method });
    };

    const fail = (code, message) => {
      if (settled) return;
      settled = true;
      clearTimer();
      removeIframe();
      URL.revokeObjectURL(url);
      reject(printError(code, message));
    };

    iframe.onload = () => {
      let printed = false;
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        printed = true;
      } catch (e) {
        printed = false;
      }
      if (printed) {
        finish('iframe');
        return;
      }
      try {
        const popup = window.open(url, '_blank');
        if (popup) {
          finish('popup');
        } else {
          fail('popup_blocked', 'Popup diblokir browser');
        }
      } catch (e) {
        fail('print_failed', 'Gagal membuka dialog cetak');
      }
    };
    iframe.onerror = () => fail('load_failed', 'Gagal memuat dokumen ke jendela cetak');
    timeoutId = window.setTimeout(
      () => fail('timeout', `Cetak tidak merespons dalam ${timeoutMs} ms`),
      timeoutMs,
    );
    iframe.src = url;
    document.body.appendChild(iframe);
  });
}
