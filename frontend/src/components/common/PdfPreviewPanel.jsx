import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Minus,
  Plus,
  Printer,
  RefreshCw,
} from 'lucide-react';
import { getPdfjs } from '../../utils/pdfjsSetup';
import { UI_MOTION, uiTransition } from '../../constants/ui';

// Task 16 (spec §10): preview PDF aktual di modal Opsi Cetak.
// Panel ini menerima blob dari buildSalesDocumentPdf (sumber tunggal) dan merender
// halaman ke <canvas> via pdf.js. pdf.js hanya dimuat lewat getPdfjs() (lazy chunk).
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_EPSILON = 0.001;

const iconButtonStyle = (disabled = false) => ({
  minWidth: 44,
  minHeight: 44,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '0 10px',
  borderRadius: 12,
  border: '1px solid var(--color-border)',
  backgroundColor: 'transparent',
  color: 'var(--color-text)',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.45 : 1,
  transition: uiTransition('all', UI_MOTION.duration.fast),
});

const formatButtonStyle = (active) => ({
  flex: '1 1 56px',
  minWidth: 44,
  minHeight: 44,
  padding: '6px 8px',
  borderRadius: 12,
  border: `2px solid ${active ? 'var(--color-action)' : 'var(--color-border)'}`,
  backgroundColor: active ? 'var(--color-selection-subtle)' : 'transparent',
  color: active ? 'var(--color-action)' : 'var(--color-text)',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
  transition: uiTransition('all', UI_MOTION.duration.base),
});

const actionButtonStyle = (variant, disabled) => ({
  flex: 1,
  minHeight: 44,
  minWidth: 44,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '0 16px',
  borderRadius: 14,
  border: variant === 'primary' ? 'none' : '1px solid var(--color-border)',
  backgroundColor:
    variant === 'primary' ? 'var(--color-action)' : 'var(--color-surface-raised)',
  color: variant === 'primary' ? '#FFF' : 'var(--color-text)',
  fontWeight: 700,
  fontSize: 15,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.55 : 1,
  transition: uiTransition('all', UI_MOTION.duration.fast),
});

const listItemStyle = (tone) => ({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  fontSize: 12,
  lineHeight: 1.45,
  color: tone === 'blocker' ? 'var(--color-danger)' : 'var(--color-warning)',
});

const listHeadingStyle = (tone) => ({
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.02em',
  textTransform: 'uppercase',
  color: tone === 'blocker' ? 'var(--color-danger)' : 'var(--color-warning)',
});

export default function PdfPreviewPanel({
  blob = null,
  loading = false,
  error = null,
  onRetry,
  format = 'A5',
  onFormatChange,
  validation,
  onDownload,
  onPrint,
  actionsDisabled = false,
  isMobile = false,
  statusPrompt = null,
  statusSaving = false,
  onStatusConfirm,
  onStatusDismiss,
}) {
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rendering, setRendering] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [renderError, setRenderError] = useState(null);
  const [renderKey, setRenderKey] = useState(0);

  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const docRef = useRef(null);
  const baseSizeRef = useRef(null);

  // 1) Muat dokumen pdf.js setiap kali blob berganti (blob = sumber tunggal dari Task 15).
  useEffect(() => {
    setPage(1);
    setZoom(1);
    setNumPages(0);
    setLoadError(null);
    setRenderError(null);
    docRef.current = null;
    baseSizeRef.current = null;
    if (!blob) return undefined;

    let cancelled = false;
    let loadingTask = null;
    (async () => {
      try {
        const pdfjs = await getPdfjs();
        const data = new Uint8Array(await blob.arrayBuffer());
        loadingTask = pdfjs.getDocument({ data });
        const doc = await loadingTask.promise;
        if (cancelled) return;
        docRef.current = doc;
        setNumPages(doc.numPages || 1);
      } catch (e) {
        if (cancelled) return;
        console.error('PDF preview load failed:', e);
        setLoadError(e?.message || 'Gagal memuat pratinjau PDF');
      }
    })();

    return () => {
      cancelled = true;
      docRef.current = null;
      try {
        loadingTask?.destroy?.();
      } catch (e) {
        /* destroy best-effort */
      }
    };
  }, [blob, reloadKey]);

  // 2) Render halaman aktif ke canvas (devicePixelRatio-aware, render task dibatalkan saat berubah).
  useEffect(() => {
    const doc = docRef.current;
    if (!doc || !numPages) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let cancelled = false;
    let renderTask = null;
    setRenderError(null);
    setRendering(true);
    (async () => {
      try {
        const pdfPage = await doc.getPage(page);
        if (cancelled) return;
        const viewport = pdfPage.getViewport({ scale: zoom });
        baseSizeRef.current = { width: viewport.width / zoom, height: viewport.height / zoom };
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        let ctx = null;
        try {
          ctx = canvas.getContext('2d');
        } catch (e) {
          ctx = null;
        }
        canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
        canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        // Environment tanpa canvas 2D: kegagalan preview yang eksplisit + bisa di-retry.
        // Unduh/Cetak tetap aktif karena keduanya memakai blob, bukan kanvas.
        if (!ctx) {
          if (!cancelled) {
            setRenderError(
              'Pratinjau tidak bisa dirender — canvas 2D tidak tersedia. Unduh & Cetak tetap bisa dipakai.',
            );
            setRendering(false);
          }
          return;
        }
        renderTask = pdfPage.render({
          canvasContext: ctx,
          canvas,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        await renderTask.promise;
        if (!cancelled) setRendering(false);
      } catch (e) {
        if (cancelled || e?.name === 'RenderingCancelledException') return;
        console.error('PDF page render failed:', e);
        setRenderError(e?.message || 'Gagal merender halaman');
        setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
      try {
        renderTask?.cancel?.();
      } catch (e) {
        /* cancel best-effort */
      }
    };
  }, [page, zoom, numPages, blob, renderKey]);

  const zoomIn = useCallback(() => {
    setZoom((z) => ZOOM_STEPS.find((s) => s > z + ZOOM_EPSILON) ?? Math.min(MAX_ZOOM, z * 1.25));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom(
      (z) =>
        [...ZOOM_STEPS].reverse().find((s) => s < z - ZOOM_EPSILON) ??
        Math.max(MIN_ZOOM, z / 1.25),
    );
  }, []);

  const fitToWidth = useCallback(() => {
    const stage = stageRef.current;
    const base = baseSizeRef.current;
    if (!stage || !base?.width) return;
    const available = stage.clientWidth - 32;
    if (available <= 0) return;
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, available / base.width)));
  }, []);

  const shownError = error || loadError;
  const blockers = validation?.blockers || [];
  const warnings = validation?.warnings || [];
  // Hanya error PEMBUATAN blob (prop `error`) yang memblokir aksi. Kegagalan pdf.js
  // (mis. browser lama) tidak memblokir: blob tetap PDF valid → Unduh/Cetak jalan terus.
  // Blocker validasi (spec §10) selalu mengunci unduh DAN cetak — di sini juga, supaya
  // panel tidak bisa meloloskan dokumen tidak konsisten walau parent lalai mengunci.
  const blocked = loading || !!error || !blob || actionsDisabled || blockers.length > 0;
  const zoomPct = Math.round(zoom * 100);
  const totalPages = numPages || 0;
  const pageLabel = totalPages ? `Hal ${page} / ${totalPages}` : 'Hal – / –';

  return (
    <div
      className="pdf-preview-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: isMobile ? 1 : undefined,
        minHeight: isMobile ? 0 : undefined,
        backgroundColor: 'var(--color-surface)',
        borderRadius: isMobile ? 0 : 16,
        border: isMobile ? 'none' : '1px solid var(--color-border)',
        padding: isMobile ? '8px 12px 0' : 12,
      }}
    >
      {/* Toolbar: ukuran · zoom · fit · navigasi halaman. Wrap di tablet, target sentuh ≥44px. */}
      <div
        role="toolbar"
        aria-label="Kontrol pratinjau PDF"
        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, rowGap: 8 }}
      >
        <div style={{ display: 'flex', flex: '1 1 200px', gap: 6 }}>
          {['A4', 'A5', 'A6'].map((f) => (
            <button
              key={f}
              type="button"
              className="ui-focus-ring"
              aria-label={`Ukuran ${f}`}
              aria-pressed={format === f}
              onClick={() => onFormatChange?.(f)}
              style={formatButtonStyle(format === f)}
            >
              {f}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            className="ui-focus-ring"
            aria-label="Perkecil"
            onClick={zoomOut}
            disabled={zoom <= MIN_ZOOM}
            style={iconButtonStyle(zoom <= MIN_ZOOM)}
          >
            <Minus size={18} />
          </button>
          <span
            aria-label="Tingkat zoom"
            style={{
              minWidth: 48,
              textAlign: 'center',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--color-text)',
            }}
          >
            {zoomPct}%
          </span>
          <button
            type="button"
            className="ui-focus-ring"
            aria-label="Perbesar"
            onClick={zoomIn}
            disabled={zoom >= MAX_ZOOM}
            style={iconButtonStyle(zoom >= MAX_ZOOM)}
          >
            <Plus size={18} />
          </button>
          <button
            type="button"
            className="ui-focus-ring"
            aria-label="Sesuaikan lebar"
            onClick={fitToWidth}
            style={{ ...iconButtonStyle(false), fontSize: 13, fontWeight: 700 }}
          >
            Fit
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <button
            type="button"
            className="ui-focus-ring"
            aria-label="Halaman sebelumnya"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={iconButtonStyle(page <= 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <span
            aria-live="polite"
            style={{
              minWidth: 84,
              textAlign: 'center',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--color-text)',
              whiteSpace: 'nowrap',
            }}
          >
            {pageLabel}
          </span>
          <button
            type="button"
            className="ui-focus-ring"
            aria-label="Halaman berikutnya"
            onClick={() => setPage((p) => Math.min(totalPages || 1, p + 1))}
            disabled={!totalPages || page >= totalPages}
            style={iconButtonStyle(!totalPages || page >= totalPages)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {blockers.length > 0 && (
        <div
          role="alert"
          style={{
            marginTop: 10,
            padding: '10px 12px',
            borderRadius: 12,
            backgroundColor: 'var(--color-danger-soft, rgba(220,38,38,0.08))',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={listHeadingStyle('blocker')}>Dokumen belum bisa dicetak</div>
          {blockers.map((b, i) => (
            <div key={b?.code || i} style={listItemStyle('blocker')}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{b?.message || String(b)}</span>
            </div>
          ))}
        </div>
      )}
      {warnings.length > 0 && (
        <div
          style={{
            marginTop: 10,
            padding: '10px 12px',
            borderRadius: 12,
            backgroundColor: 'var(--color-warning-soft, rgba(217,119,6,0.08))',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={listHeadingStyle('warning')}>Peringatan</div>
          {warnings.map((w, i) => (
            <div key={w?.code || i} style={listItemStyle('warning')}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{w?.message || String(w)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Panggung kanvas — rasio fisik PDF dipertahankan, kanvas di tengah. */}
      <div
        ref={stageRef}
        aria-busy={loading || rendering}
        style={{
          position: 'relative',
          marginTop: 10,
          flex: isMobile ? 1 : undefined,
          minHeight: isMobile ? 220 : 280,
          maxHeight: isMobile ? 'none' : 420,
          overflow: 'auto',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: 16,
          borderRadius: 12,
          border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-bg)',
        }}
      >
        {blob && (
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="Pratinjau dokumen PDF"
            style={{
              display: 'block',
              backgroundColor: '#FFF',
              borderRadius: 4,
              boxShadow: '0 2px 12px rgba(0,0,0,0.16)',
            }}
          />
        )}

        {loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              backgroundColor: 'var(--color-bg)',
              color: 'var(--color-text-muted)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <Loader2
              size={26}
              style={{ animation: 'smart-assistant-spin 900ms linear infinite' }}
            />
            <span>Menyiapkan PDF…</span>
          </div>
        )}

        {!loading && shownError && (
          <div
            role="alert"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: 16,
              textAlign: 'center',
              backgroundColor: 'var(--color-bg)',
              color: 'var(--color-danger)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <AlertTriangle size={26} />
            <span>{shownError}</span>
            {!error && (
              <span style={{ fontWeight: 500, fontSize: 11, opacity: 0.85 }}>
                Pratinjau gagal dimuat, tapi Unduh &amp; Cetak tetap bisa dipakai.
              </span>
            )}
            <button
              type="button"
              className="ui-focus-ring"
              onClick={() => {
                if (error) {
                  onRetry?.();
                  return;
                }
                setLoadError(null);
                setReloadKey((k) => k + 1);
              }}
              style={{ ...iconButtonStyle(false), borderColor: 'var(--color-danger)' }}
            >
              <RefreshCw size={16} />
              <span>Coba lagi</span>
            </button>
          </div>
        )}

        {/* Kegagalan render halaman (non-cancel): jelaskan + tawarkan retry.
            Tidak ikut mengunci Unduh/Cetak — keduanya memakai blob, bukan kanvas. */}
        {!loading && !shownError && renderError && (
          <div
            role="alert"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: 16,
              textAlign: 'center',
              backgroundColor: 'var(--color-bg)',
              color: 'var(--color-danger)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <AlertTriangle size={26} />
            <span>{renderError}</span>
            <span style={{ fontWeight: 500, fontSize: 11, opacity: 0.85 }}>
              Pratinjau gagal dirender, tapi Unduh &amp; Cetak tetap bisa dipakai.
            </span>
            <button
              type="button"
              className="ui-focus-ring"
              onClick={() => {
                setRenderError(null);
                setRenderKey((k) => k + 1);
              }}
              style={{ ...iconButtonStyle(false), borderColor: 'var(--color-danger)' }}
            >
              <RefreshCw size={16} />
              <span>Coba lagi</span>
            </button>
          </div>
        )}

        {!loading && !shownError && !blob && (
          <div
            style={{
              margin: 'auto',
              color: 'var(--color-text-muted)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Pratinjau belum tersedia
          </div>
        )}

        {!loading && !shownError && blob && rendering && (
          <div
            style={{
              position: 'absolute',
              bottom: 10,
              right: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 999,
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            <Loader2 size={12} style={{ animation: 'smart-assistant-spin 900ms linear infinite' }} />
            <span>Merender…</span>
          </div>
        )}
      </div>

      {/* Task 22 (spec §10): status cetak eksplisit — operator yang memutuskan, bukan auto. */}
      {statusPrompt && (
        <div
          role="group"
          aria-label="Konfirmasi status cetak"
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-selection-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            aria-live="polite"
            style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.45, color: 'var(--color-text)' }}
          >
            {statusSaving
              ? 'Menyimpan status cetak…'
              : statusPrompt.kind === 'download'
                ? 'PDF diunduh. Tandai nota sebagai sudah dicetak?'
                : 'Dialog cetak selesai. Tandai nota sebagai sudah dicetak?'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="ui-focus-ring"
              onClick={onStatusConfirm}
              disabled={statusSaving}
              style={actionButtonStyle('primary', statusSaving)}
            >
              Ya, tandai
            </button>
            <button
              type="button"
              className="ui-focus-ring"
              onClick={onStatusDismiss}
              disabled={statusSaving}
              style={actionButtonStyle('secondary', statusSaving)}
            >
              Tidak
            </button>
          </div>
        </div>
      )}

      {/* Bar aksi: unduh & cetak memakai blob yang sedang ditampilkan. */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          marginTop: 12,
          paddingBottom: isMobile ? 'calc(12px + env(safe-area-inset-bottom, 0px))' : 0,
          position: isMobile ? 'sticky' : 'static',
          bottom: isMobile ? 0 : undefined,
          backgroundColor: isMobile ? 'var(--color-surface)' : 'transparent',
          borderTop: isMobile ? '1px solid var(--color-border)' : 'none',
          paddingTop: isMobile ? 12 : 0,
        }}
      >
        <button
          type="button"
          className="ui-focus-ring"
          aria-label="Unduh PDF"
          onClick={onDownload}
          disabled={blocked}
          style={actionButtonStyle('secondary', blocked)}
        >
          <Download size={18} />
          <span>Unduh PDF</span>
        </button>
        <button
          type="button"
          className="ui-focus-ring"
          aria-label="Cetak"
          onClick={onPrint}
          disabled={blocked}
          style={actionButtonStyle('primary', blocked)}
        >
          <Printer size={18} />
          <span>Cetak</span>
        </button>
      </div>
    </div>
  );
}
