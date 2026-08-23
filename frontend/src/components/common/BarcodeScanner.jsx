import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, X } from 'lucide-react';
import { importWithReload } from '../../utils/importWithReload';

export default function BarcodeScanner({ onScan, onClose, isDarkMode }) {
  const elemIdRef = useRef(`barcode-scanner-${Math.random().toString(36).slice(2)}`);
  const scannerRef = useRef(null);
  const startedRef = useRef(false);
  const handledRef = useRef(false);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  const text = isDarkMode ? '#FFF' : '#000';
  const sub = '#AEAEB2';
  const panel = isDarkMode ? 'var(--color-surface-elevated)' : '#FFFFFF';
  const border = isDarkMode ? 'var(--color-surface-raised)' : 'var(--color-border)';

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      if (startedRef.current) await scanner.stop();
    } catch (e) {
      // Camera may already be stopped by browser close/permission state.
      console.warn('[BarcodeScanner] stop failed:', e);
    }
    try { await scanner.clear(); } catch (e) {
      console.warn('[BarcodeScanner] clear failed:', e);
    }
    startedRef.current = false;
    scannerRef.current = null;
  }, []);

  const beep = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.12);
    } catch (e) {
      console.warn('[BarcodeScanner] beep failed:', e);
    }
  };

  useEffect(() => {
    let cancelled = false;
    handledRef.current = false;
    setError('');

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Browser ini belum mendukung akses kamera. Gunakan Chrome/Safari terbaru lewat HTTPS.');
      return undefined;
    }

    const startScanner = async () => {
      try {
        const { Html5Qrcode } = await importWithReload(() => import('html5-qrcode'));
        if (cancelled) return;
        const scanner = new Html5Qrcode(elemIdRef.current);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 180 }, aspectRatio: 1.777 },
          async (decodedText) => {
            if (handledRef.current) return;
            handledRef.current = true;
            const code = String(decodedText || '').trim();
            if (!code) {
              handledRef.current = false;
              return;
            }
            beep();
            await stopScanner();
            if (!cancelled) {
              onScan(code);
              onClose();
            }
          },
          () => {}
        );
        if (!cancelled) startedRef.current = true;
      } catch (err) {
        if (cancelled) return;
        console.error('Kamera tidak bisa diakses:', err);
        const msg = String(err?.message || err || '').toLowerCase();
        if (msg.includes('permission') || msg.includes('notallowed')) {
          setError('Izin kamera ditolak. Aktifkan permission kamera di browser, lalu coba lagi.');
        } else if (msg.includes('notfound') || msg.includes('overconstrained')) {
          setError('Kamera tidak ditemukan. Pastikan device punya kamera aktif.');
        } else {
          setError('Kamera tidak bisa diakses. Cek permission browser dan pastikan halaman dibuka via HTTPS.');
        }
      }
    };
    startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [onClose, onScan, retryKey, stopScanner]);

  const retry = async () => {
    await stopScanner();
    setRetryKey(k => k + 1);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10200, background: 'rgba(0,0,0,0.96)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#FFF' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Camera size={20} />
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>Scan Barcode / QR</h3>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--color-border)' }}>Arahkan kamera ke kode produk</p>
          </div>
        </div>
        <button
          type="button"
          onClick={async () => { await stopScanner(); onClose(); }}
          aria-label="Tutup scanner"
          className="ui-motion-button ui-focus-ring"
          style={{ width: '44px', height: '44px', border: 'none', borderRadius: '12px', background: 'rgba(255,255,255,0.12)', color: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={22} />
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
        {error ? (
          <div style={{ width: '100%', maxWidth: '420px', background: panel, color: text, border: `1px solid ${border}`, borderRadius: '18px', padding: '22px', textAlign: 'center' }}>
            <Camera size={38} style={{ color: 'var(--color-warning)', marginBottom: '12px' }} />
            <p style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: '700', lineHeight: 1.5 }}>{error}</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={retry} className="ui-motion-button ui-focus-ring" style={{ flex: 1, minHeight: '44px', border: 'none', borderRadius: '12px', background: 'var(--color-action)', color: '#FFF', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <RefreshCw size={16} /> Coba Lagi
              </button>
              <button type="button" onClick={onClose} className="ui-motion-button ui-focus-ring" style={{ flex: 1, minHeight: '44px', border: `1px solid ${border}`, borderRadius: '12px', background: panel, color: text, fontWeight: '800', cursor: 'pointer' }}>
                Tutup
              </button>
            </div>
          </div>
        ) : (
          <div style={{ width: '100%', maxWidth: '720px' }}>
            <div id={elemIdRef.current} style={{ width: '100%', overflow: 'hidden', borderRadius: '18px' }} />
            <p style={{ margin: '14px 0 0', textAlign: 'center', color: sub, fontSize: '12px', fontWeight: '600' }}>
              Scan otomatis berhenti setelah kode terbaca.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
