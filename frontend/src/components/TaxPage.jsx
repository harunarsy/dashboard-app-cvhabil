import React, { useState, useEffect, useContext, useRef, useCallback } from "react";
import { taxAPI } from "../services/api";
import { AuthContext } from "../context/AuthContext";
import Breadcrumb from "./common/Breadcrumb";
import ToastNotice from "./common/ToastNotice";
import Skeleton from "./common/Skeleton";
import { UI_MOTION, uiTransition } from "../constants/ui";

// Pajak (v1.57.0) — rekap PPN keluaran vs masukan + penandaan per nota.
// Akses: direktur + konsultan pajak (role 'pajak'). Sistem TIDAK memutuskan
// klasifikasi — manusia yang menandai, tercatat siapa & kapan.

const fmtRp = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n || 0);
const fmtDate = (d) =>
  d
    ? new Date(String(d).split("T")[0] + "T00:00:00").toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "-";
const currentMonth = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
};

export default function TaxPage({ isDarkMode, isMobile, isVantaMode }) {
  const { user } = useContext(AuthContext);
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState(null);
  const [notas, setNotas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [toast, setToast] = useState("");
  const [toastType, setToastType] = useState("success");
  const toastTimerRef = useRef(null);

  const text = "var(--color-text)";
  const sub = "var(--color-text-muted)";
  const border = "var(--color-border)";
  const cardBg = "var(--color-surface)";

  const flash = useCallback((msg, type = "success") => {
    setToast(msg);
    setToastType(type);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, n] = await Promise.all([taxAPI.getSummary(month), taxAPI.getNotas(month)]);
      setSummary(s.data);
      setNotas(n.data);
    } catch (e) {
      flash("Gagal memuat: " + (e.response?.data?.error || e.message), "error");
    } finally {
      setLoading(false);
    }
  }, [month, flash]);
  useEffect(() => {
    load();
    return () => toastTimerRef.current && clearTimeout(toastTimerRef.current);
  }, [load]);

  const togglePpn = async (nota) => {
    const next = !nota.ppn_excluded;
    setSavingId(nota.id);
    try {
      await taxAPI.setPpn(nota.id, next);
      flash(
        next
          ? `${nota.order_number} DIKECUALIKAN dari PPN keluaran`
          : `${nota.order_number} masuk PPN keluaran`,
      );
      await load();
    } catch (e) {
      flash("Gagal menyimpan: " + (e.response?.data?.error || e.message), "error");
    } finally {
      setSavingId(null);
    }
  };

  const handleExport = async () => {
    try {
      const { data } = await taxAPI.exportCsv(month);
      const url = URL.createObjectURL(new Blob([data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `rekap-ppn-${month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      flash("CSV rekap PPN diunduh");
    } catch (e) {
      flash("Gagal export: " + (e.response?.data?.error || e.message), "error");
    }
  };

  const kpi = (label, value, color, note) => (
    <div
      className="ui-motion-card"
      style={{
        backgroundColor: cardBg,
        border: `1px solid ${border}`,
        borderRadius: "12px",
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: "10.5px",
          fontWeight: 700,
          color: sub,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </div>
      {loading ? (
        <Skeleton width="110px" height="24px" marginTop="6px" />
      ) : (
        <div style={{ fontSize: "1.15rem", fontWeight: 800, color, marginTop: "4px" }}>
          {value}
        </div>
      )}
      {note && !loading && (
        <div style={{ fontSize: "10.5px", color: sub, marginTop: "3px" }}>{note}</div>
      )}
    </div>
  );

  return (
    <div
      className="ui-page ui-motion-page"
      style={{
        padding: isMobile ? "1rem" : "2rem",
        paddingTop: isMobile ? "4rem" : "2rem",
        backgroundColor: isVantaMode ? "transparent" : "var(--color-bg)",
        minHeight: "100vh",
        color: text,
        transition: uiTransition("margin-left", UI_MOTION.duration.page, UI_MOTION.easing.standard),
      }}
    >
      <Breadcrumb title="Pajak" isMobile={isMobile} isDarkMode={isDarkMode} />

      {/* Header */}
      <div
        className="ui-toolbar"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexWrap: "wrap",
          marginBottom: "0.875rem",
          padding: "10px",
          backgroundColor: cardBg,
          border: `1px solid ${border}`,
          borderRadius: "12px",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: "15px" }}>🧾 Rekap PPN</div>
        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            padding: "2px 7px",
            borderRadius: "999px",
            backgroundColor: "var(--color-primary-soft)",
            color: "var(--color-primary)",
          }}
        >
          {user?.role === "pajak" ? "Akses Konsultan Pajak" : "Direktur"}
        </span>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          aria-label="Masa pajak"
          style={{
            padding: "6px 10px",
            borderRadius: "9px",
            border: `1px solid ${border}`,
            backgroundColor: "var(--color-surface-elevated)",
            color: text,
            fontSize: "13px",
          }}
        />
        <div style={{ flex: 1 }} />
        <button
          onClick={handleExport}
          className="ui-motion-button ui-focus-ring"
          style={{
            padding: "7px 14px",
            borderRadius: "9px",
            border: "none",
            backgroundColor: "var(--color-primary)",
            color: "#FFF",
            fontWeight: 700,
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          ⬇ Export CSV
        </button>
      </div>

      {/* KPI */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
          gap: "10px",
          marginBottom: "0.875rem",
        }}
      >
        {kpi(
          "PPN Keluaran",
          fmtRp(summary?.keluaran?.ppn),
          "var(--color-warning)",
          summary
            ? `${summary.keluaran.nota_count - summary.keluaran.excluded_count} nota · DPP ${fmtRp(summary.keluaran.dpp)}`
            : "",
        )}
        {kpi(
          "Pajak Masukan",
          fmtRp(summary?.masukan?.ppn),
          "var(--color-success)",
          summary ? `${summary.masukan.invoice_count} faktur ber-PPN` : "",
        )}
        {kpi(
          "Perkiraan Kurang Bayar",
          fmtRp(summary?.kurang_bayar),
          (summary?.kurang_bayar || 0) > 0 ? "var(--color-danger)" : "var(--color-success)",
          "keluaran − masukan",
        )}
        {kpi(
          "Omzet Barang Sumber-Nota",
          fmtRp(summary?.nota_sourced?.gross),
          "var(--color-primary)",
          summary
            ? `PPN-nya beban penuh ±${fmtRp(summary.nota_sourced.ppn_beban)} (tanpa kredit masukan)`
            : "",
        )}
      </div>

      {summary?.keluaran?.excluded_count > 0 && (
        <div
          style={{
            marginBottom: "0.875rem",
            padding: "8px 12px",
            borderRadius: "10px",
            border: "1px solid var(--color-warning)",
            backgroundColor: "var(--color-warning-soft)",
            color: "var(--color-warning)",
            fontSize: "12px",
            fontWeight: 600,
          }}
        >
          ⚠️ {summary.keluaran.excluded_count} nota dikecualikan dari PPN keluaran (
          {fmtRp(summary.keluaran.excluded_gross)}) — pastikan klasifikasi ini keputusan
          konsultan pajak.
        </div>
      )}

      {/* Tabel nota */}
      <div
        className="ui-panel"
        style={{
          borderRadius: "12px",
          overflow: "auto",
          backgroundColor: cardBg,
          border: `1px solid ${border}`,
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", minWidth: isMobile ? "680px" : undefined }}>
          <thead>
            <tr>
              {["No Nota", "Tanggal", "Customer", "Porsi Produk", "DPP", "PPN", "PPN Keluaran?", "Ditandai"].map(
                (h) => (
                  <th
                    key={h}
                    style={{
                      padding: "9px 10px",
                      textAlign: "left",
                      fontSize: "10.5px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      color: sub,
                      borderBottom: `1px solid ${border}`,
                      backgroundColor: "var(--color-surface-elevated)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} style={{ padding: "12px" }}>
                  <Skeleton width="100%" height="18px" />
                </td>
              </tr>
            )}
            {!loading &&
              notas.map((n) => (
                <tr key={n.id}>
                  <td style={{ padding: "8px 10px", borderBottom: `1px solid ${border}`, fontWeight: 700, whiteSpace: "nowrap" }}>
                    {n.order_number}
                    {n.has_nota_sourced_item && (
                      <span
                        title="Ada item bersumber pembelian nota (tanpa kredit pajak masukan)"
                        style={{ marginLeft: "6px", fontSize: "9.5px", fontWeight: 800, color: "var(--color-primary)" }}
                      >
                        SUMBER-NOTA
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "8px 10px", borderBottom: `1px solid ${border}`, whiteSpace: "nowrap", color: sub }}>
                    {fmtDate(n.sale_date)}
                  </td>
                  <td style={{ padding: "8px 10px", borderBottom: `1px solid ${border}` }}>{n.customer_name}</td>
                  <td style={{ padding: "8px 10px", borderBottom: `1px solid ${border}`, textAlign: "right", whiteSpace: "nowrap" }}>
                    {fmtRp(n.product_portion)}
                  </td>
                  <td style={{ padding: "8px 10px", borderBottom: `1px solid ${border}`, textAlign: "right", whiteSpace: "nowrap", color: sub }}>
                    {n.ppn_excluded ? "—" : fmtRp(n.dpp)}
                  </td>
                  <td style={{ padding: "8px 10px", borderBottom: `1px solid ${border}`, textAlign: "right", whiteSpace: "nowrap", fontWeight: 700 }}>
                    {n.ppn_excluded ? "—" : fmtRp(n.ppn)}
                  </td>
                  <td style={{ padding: "8px 10px", borderBottom: `1px solid ${border}` }}>
                    <button
                      onClick={() => togglePpn(n)}
                      disabled={savingId === n.id}
                      className="ui-focus-ring"
                      title={
                        n.ppn_excluded
                          ? "Dikecualikan — klik untuk masukkan kembali ke PPN keluaran"
                          : "Masuk PPN keluaran — klik untuk mengecualikan"
                      }
                      style={{
                        padding: "4px 10px",
                        borderRadius: "999px",
                        border: "none",
                        fontWeight: 800,
                        fontSize: "11px",
                        cursor: "pointer",
                        backgroundColor: n.ppn_excluded
                          ? "var(--color-danger-soft)"
                          : "var(--color-success-soft)",
                        color: n.ppn_excluded ? "var(--color-danger)" : "var(--color-success)",
                        opacity: savingId === n.id ? 0.5 : 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {n.ppn_excluded ? "✕ Dikecualikan" : "✓ Masuk"}
                    </button>
                  </td>
                  <td style={{ padding: "8px 10px", borderBottom: `1px solid ${border}`, fontSize: "11px", color: sub, whiteSpace: "nowrap" }}>
                    {n.ppn_marked_by
                      ? `${n.ppn_marked_by} · ${fmtDate(n.ppn_marked_at)}`
                      : "default"}
                  </td>
                </tr>
              ))}
            {!loading && !notas.length && (
              <tr>
                <td colSpan={8} style={{ padding: "1.5rem", textAlign: "center", color: sub }}>
                  Tidak ada nota final di masa pajak ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: "11px", color: sub, marginTop: "10px", lineHeight: 1.5 }}>
        DPP & PPN dihitung dari porsi produk (total − ongkir − fee pass-on) dengan tarif{" "}
        {Math.round((summary?.rate || 0.11) * 100)}% inklusif. Angka ini alat bantu kertas
        kerja — pelaporan resmi tetap mengikuti keputusan konsultan pajak.
      </p>

      <ToastNotice message={toast} type={toastType} isMobile={isMobile} />
    </div>
  );
}
