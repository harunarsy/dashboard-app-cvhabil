// Task 25 (spec §10): alur unduh/cetak nota — SEMUA hasil async terikat pada sesi modal
// dan orderId yang memulainya. Race yang dicegah:
// - cetak A selesai setelah operator pindah ke nota B → prompt/PATCH tidak bocor ke B
// - `finally` tidak boleh melepas busy sesi baru (guard sesi, bukan state mentah)
// - PATCH gagal → prompt dipertahankan supaya operator bisa retry tanpa unduh ulang
// - klik ganda "Ya, tandai" → PATCH sekali (ref sinkron, bukan state React yang async)
import { useCallback, useEffect, useRef, useState } from "react";
import { printBlobInIframe } from "../utils/documents/printBlobInIframe";

// Task 22 (spec §10): pesan gagal cetak per error.code dari printBlobInIframe.
export const PRINT_FAILURE_MESSAGES = {
  timeout: "Cetak tidak merespons. Coba lagi atau unduh PDF lalu cetak manual.",
  load_failed: "Gagal memuat dokumen ke jendela cetak. Coba lagi atau unduh PDF.",
  popup_blocked: "Popup diblokir. Pakai tombol Unduh PDF lalu cetak manual.",
  print_failed: "Dialog cetak gagal dibuka. Pakai tombol Unduh PDF lalu cetak manual.",
};
export const PRINT_FAILURE_FALLBACK = "Gagal membuka dialog cetak. Pakai tombol Unduh PDF lalu cetak manual.";

const PRINTED_STATUS = "sudah_dicetak";

export default function useSalesPrintFlow({ updateStatus, refreshOrders, flash } = {}) {
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prompt, setPrompt] = useState(null);

  // Guard sinkron: klik ganda / resolusi basi tidak boleh bergantung pada state React
  // (state di-batch & baru terlihat render berikutnya). State hanya untuk render.
  const sessionRef = useRef(0);
  const busyRef = useRef(false);
  const savingRef = useRef(false);
  const promptRef = useRef(null);

  // Callback parent bisa berganti identitas tiap render — simpan yang terbaru tanpa
  // mengubah identitas API hook (semua callback di bawah stabil).
  const depsRef = useRef({ updateStatus, refreshOrders, flash });
  useEffect(() => {
    depsRef.current = { updateStatus, refreshOrders, flash };
  });

  const writePrompt = useCallback((next) => {
    promptRef.current = next;
    setPrompt(next);
  }, []);

  // Sesi baru (buka ATAU tutup modal): hasil async sesi lama tidak boleh menyentuh state.
  const resetSession = useCallback(() => {
    sessionRef.current += 1;
    busyRef.current = false;
    savingRef.current = false;
    setBusy(false);
    setSaving(false);
    writePrompt(null);
  }, [writePrompt]);

  const openSession = useCallback(() => {
    resetSession();
  }, [resetSession]);

  const closeSession = useCallback(() => {
    resetSession();
  }, [resetSession]);

  // Unduh memakai blob yang sedang ditampilkan — sinkron, tidak menandai status otomatis.
  const download = useCallback(
    ({ blob, filename, orderId } = {}) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename || `Nota_${orderId}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      depsRef.current.flash?.("PDF berhasil diunduh");
      writePrompt({ kind: "download", orderId, session: sessionRef.current });
    },
    [writePrompt],
  );

  // Cetak lewat helper anti-macet — timeout + onerror + fallback popup.
  const print = useCallback(
    async ({ blob, orderId } = {}) => {
      if (!blob || busyRef.current) return;
      const session = sessionRef.current;
      busyRef.current = true;
      setBusy(true);
      try {
        const { method } = await printBlobInIframe(blob);
        if (sessionRef.current !== session) return;
        if (method === "popup") depsRef.current.flash?.("Dialog cetak dibuka di tab baru");
        writePrompt({ kind: "print", orderId, session });
      } catch (error) {
        if (sessionRef.current !== session) return;
        depsRef.current.flash?.(
          PRINT_FAILURE_MESSAGES[error?.code] || PRINT_FAILURE_FALLBACK,
          "error",
        );
      } finally {
        // Hanya lepas busy bila masih sesi yang memulainya — jangan sentuh sesi baru.
        if (sessionRef.current === session) {
          busyRef.current = false;
          setBusy(false);
        }
      }
    },
    [writePrompt],
  );

  // Konfirmasi operator — satu-satunya jalur set 'sudah_dicetak'.
  const confirmStatus = useCallback(
    async (currentOrderId) => {
      if (savingRef.current) return;
      const active = promptRef.current;
      if (!active) return;
      // Prompt milik nota lain / sesi modal sudah berganti → dibuang TANPA PATCH.
      if (active.orderId !== currentOrderId || active.session !== sessionRef.current) {
        writePrompt(null);
        return;
      }
      const session = sessionRef.current;
      savingRef.current = true;
      setSaving(true);
      try {
        await depsRef.current.updateStatus?.(active.orderId, PRINTED_STATUS);
        // Toast hanya untuk sesi yang masih aktif — hasil PATCH sesi basi tidak
        // boleh muncul di konteks modal/nota yang sudah hilang.
        if (sessionRef.current === session) {
          depsRef.current.flash?.("Nota ditandai sudah dicetak");
        }
        depsRef.current.refreshOrders?.();
        // Bersihkan hanya prompt yang sama & sesi yang masih aktif.
        if (sessionRef.current === session && promptRef.current === active) {
          writePrompt(null);
        }
      } catch (e) {
        // Gagal → prompt DIPERTAHANKAN supaya operator bisa retry tanpa unduh ulang.
        if (sessionRef.current === session) {
          depsRef.current.flash?.("Status cetak gagal disimpan", "error");
        }
      } finally {
        if (sessionRef.current === session) {
          savingRef.current = false;
          setSaving(false);
        }
      }
    },
    [writePrompt],
  );

  const dismissStatus = useCallback(() => {
    if (savingRef.current) return;
    writePrompt(null);
  }, [writePrompt]);

  return {
    busy,
    prompt,
    saving,
    openSession,
    closeSession,
    download,
    print,
    confirmStatus,
    dismissStatus,
  };
}
