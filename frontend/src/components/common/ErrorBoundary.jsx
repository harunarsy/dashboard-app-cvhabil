// v1.51.0: jaring pengaman supaya app TIDAK pernah blank-putih total.
// - ChunkLoadError (sering muncul sesudah deploy baru saat tab/cache masih versi lama):
//   auto-reload SEKALI ambil bundle terbaru (guard sessionStorage anti-loop).
// - Error render lain: tampilkan layar ramah + tombol muat ulang (bukan layar putih).
import React from "react";

const CHUNK_RE =
  /Loading chunk|Loading CSS chunk|dynamically imported module|Importing a module script failed|Failed to fetch dynamically imported/i;
const RELOAD_KEY = "habil_chunk_reloaded";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error) {
    const msg = String(error?.message || error || "");
    const isChunk = error?.name === "ChunkLoadError" || CHUNK_RE.test(msg);
    if (isChunk) {
      try {
        if (!sessionStorage.getItem(RELOAD_KEY)) {
          sessionStorage.setItem(RELOAD_KEY, "1");
          window.location.reload();
          return;
        }
      } catch {
        window.location.reload();
        return;
      }
    }
    // best-effort logging (jangan ganggu user)
    try {
      console.error("[ErrorBoundary]", error);
    } catch {}
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const msg = String(this.state.error?.message || "");
    const isChunk =
      this.state.error?.name === "ChunkLoadError" || CHUNK_RE.test(msg);
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
          background: "var(--color-bg, #fff)",
          color: "var(--color-text, #111)",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔄</div>
          <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800 }}>
            {isChunk ? "Ada versi baru" : "Terjadi gangguan"}
          </h2>
          <p
            style={{
              margin: "0 0 18px",
              fontSize: 14,
              color: "var(--color-text-muted, #666)",
              lineHeight: 1.5,
            }}
          >
            {isChunk
              ? "Aplikasi baru saja diperbarui. Muat ulang untuk memuat versi terbaru."
              : "Maaf, halaman gagal dimuat. Coba muat ulang — kalau masih bermasalah, kabari developer."}
          </p>
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.removeItem(RELOAD_KEY);
              } catch {}
              window.location.reload();
            }}
            style={{
              padding: "11px 22px",
              backgroundColor: "var(--color-action, #007AFF)",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            Muat Ulang
          </button>
        </div>
      </div>
    );
  }
}
