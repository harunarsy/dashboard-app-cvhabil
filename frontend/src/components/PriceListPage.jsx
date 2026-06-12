import React, { useState, useEffect, useRef, useMemo } from "react";
import { priceListAPI, printSettingsAPI } from "../services/api";
import { hppForBatch, hppFromHna } from "../utils/rupiah";
import { generatePriceListPDF } from "../utils/generatePriceListPDF";
import Breadcrumb from "./common/Breadcrumb";
import SearchBox from "./common/SearchBox";
import Skeleton from "./common/Skeleton";
import ToastNotice from "./common/ToastNotice";
import EmptyState, { EmptyStateIcons } from "./common/EmptyState";
import { UI_MOTION } from "../constants/ui";

const fmtRp = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n || 0);

const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

const todayStr = () => new Date().toISOString().slice(0, 10);

// HPP referensi per pcs (inc PPN): batch pembelian terbaru; fallback HNA master.
const lastHppFor = (row) => {
  if (row.last_hna != null) {
    return hppForBatch({ hna: row.last_hna, tax_type: row.last_tax_type });
  }
  return hppFromHna(parseFloat(row.master_hna) || 0);
};

export default function PriceListPage({ isDarkMode, isMobile }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [toastType, setToastType] = useState("success");
  const toastTimerRef = useRef(null);
  const [settings, setSettings] = useState({});
  // edit state per product: { [id]: { price, effective_date } }
  const [edits, setEdits] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [exporting, setExporting] = useState(false);

  const text = "var(--color-text)";
  const sub = "var(--color-text-muted)";
  const border = "var(--color-border)";

  const flash = (msg, type = "success") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    setToastType(type);
    toastTimerRef.current = setTimeout(
      () => setToast(""),
      type === "error"
        ? UI_MOTION.duration.toastError
        : UI_MOTION.duration.toastSuccess,
    );
  };

  const fetchRows = async () => {
    setLoading(true);
    try {
      const { data } = await priceListAPI.getAll();
      setRows(data || []);
    } catch (e) {
      flash(
        "Gagal memuat daftar harga — cek koneksi lalu muat ulang halaman",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
    printSettingsAPI
      .get()
      .then((r) => setSettings(r.data?.nota_layout || {}))
      .catch(() => {});
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Harga efektif baris: list_price (kalau pernah di-set) → sell_price master.
  const effectivePrice = (r) =>
    r.list_price != null
      ? parseFloat(r.list_price)
      : parseFloat(r.sell_price) || 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name?.toLowerCase().includes(q) ||
        r.code?.toLowerCase().includes(q) ||
        r.category?.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const latestEffectiveDate = useMemo(() => {
    const dates = rows
      .map((r) => r.effective_date)
      .filter(Boolean)
      .sort();
    return dates.length ? dates[dates.length - 1] : null;
  }, [rows]);

  const startEdit = (r) => {
    setEdits((p) => ({
      ...p,
      [r.id]: {
        price: String(Math.round(effectivePrice(r)) || ""),
        effective_date: todayStr(),
      },
    }));
  };

  const cancelEdit = (id) => {
    setEdits((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });
  };

  const saveEdit = async (r) => {
    const edit = edits[r.id];
    if (!edit) return;
    const price = parseFloat(edit.price);
    if (!Number.isFinite(price) || price < 0) {
      flash("Harga harus angka dan tidak boleh minus", "error");
      return;
    }
    setSavingId(r.id);
    try {
      await priceListAPI.setPrice(r.id, {
        price,
        effective_date: edit.effective_date || todayStr(),
      });
      cancelEdit(r.id);
      flash(`Harga ${r.name} disimpan`);
      fetchRows();
    } catch (e) {
      flash(e.response?.data?.error || e.message, "error");
    } finally {
      setSavingId(null);
    }
  };

  const handleExportPDF = () => {
    if (exporting) return;
    setExporting(true);
    try {
      const printable = filtered
        .filter((r) => effectivePrice(r) > 0)
        .map((r) => ({
          code: r.code,
          name: r.name,
          base_unit: r.base_unit || "pcs",
          price: effectivePrice(r),
          pack_unit: r.pack_unit,
          pack_size: parseInt(r.pack_size) || 1,
          pack_price: parseFloat(r.sell_price_pack) || 0,
        }));
      if (!printable.length) {
        flash("Tidak ada produk dengan harga untuk dicetak", "error");
        return;
      }
      const doc = generatePriceListPDF(printable, {
        settings,
        effectiveDate: latestEffectiveDate || todayStr(),
      });
      const tgl = (latestEffectiveDate || todayStr()).slice(0, 10);
      doc.save(`Daftar-Harga-HABIL-${tgl}.pdf`);
      flash("PDF daftar harga dibuat — siap dicetak A4");
    } catch (e) {
      flash("Gagal membuat PDF: " + e.message, "error");
    } finally {
      setExporting(false);
    }
  };

  const inputStyle = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: "8px",
    border: `1px solid ${border}`,
    backgroundColor: "var(--color-surface-elevated)",
    color: text,
    fontSize: "13px",
  };

  return (
    <div className="ui-page ui-motion-page" style={{ color: text }}>
      <Breadcrumb
        title="Daftar Harga"
        isMobile={isMobile}
        isDarkMode={isDarkMode}
      />

      {/* Header */}
      <div
        className="ui-readable-surface"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "12px",
          padding: "18px 20px",
          borderRadius: "18px",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "2rem",
              fontWeight: "700",
              margin: 0,
              color: text,
            }}
          >
            🏷️ Daftar Harga
          </h1>
          <div style={{ margin: "4px 0 0", fontSize: "14px", color: sub }}>
            {loading ? (
              <Skeleton width="200px" height="14px" />
            ) : (
              <>
                {rows.length} produk aktif · harga per{" "}
                <strong>{fmtDate(latestEffectiveDate || new Date())}</strong>
              </>
            )}
          </div>
        </div>
        <button
          onClick={handleExportPDF}
          disabled={exporting}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "10px 18px",
            backgroundColor: "var(--color-primary)",
            color: "#FFF",
            border: "none",
            borderRadius: "10px",
            cursor: exporting ? "wait" : "pointer",
            fontWeight: "700",
            fontSize: "14px",
            opacity: exporting ? 0.7 : 1,
          }}
        >
          🖨️ {exporting ? "Membuat PDF..." : "Cetak A4"}
        </button>
      </div>

      {/* Search */}
      <div
        className="ui-toolbar"
        style={{ display: "flex", gap: "12px", marginBottom: "1.5rem", padding: "14px" }}
      >
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Cari kode, nama produk, atau kategori..."
          ariaLabel="Cari produk di daftar harga"
          style={{ flex: 1, minWidth: isMobile ? "100%" : "300px" }}
          inputStyle={{ borderColor: border, color: text }}
        />
      </div>

      {/* Table */}
      <div
        className="ui-panel"
        style={{ borderRadius: "16px", overflow: "auto" }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "880px" }}>
          <thead>
            <tr>
              {[
                "Kode",
                "Nama Produk",
                "HPP Terakhir (inc PPN)",
                "Harga Jual",
                "Margin",
                "Efektif Sejak",
                "Aksi",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "12px 14px",
                    textAlign: "left",
                    fontSize: "11px",
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: sub,
                    borderBottom: `1px solid ${border}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading &&
              [...Array(6)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} style={{ padding: "12px 14px" }}>
                    <Skeleton width="100%" height="18px" />
                  </td>
                </tr>
              ))}
            {!loading &&
              filtered.map((r) => {
                const hpp = lastHppFor(r);
                const price = effectivePrice(r);
                const margin = price - hpp;
                const edit = edits[r.id];
                const changedRecently =
                  r.prev_price != null &&
                  parseFloat(r.prev_price) !== parseFloat(r.list_price);
                return (
                  <tr
                    key={r.id}
                    style={{ borderBottom: `1px solid ${border}` }}
                  >
                    <td
                      style={{
                        padding: "10px 14px",
                        fontFamily: "monospace",
                        fontSize: "12px",
                        color: sub,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.code || "—"}
                    </td>
                    <td style={{ padding: "10px 14px", color: text }}>
                      <div style={{ fontWeight: "600" }}>{r.name}</div>
                      {r.category && (
                        <div style={{ fontSize: "11px", color: sub }}>
                          {r.category}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "10px 14px", color: sub, whiteSpace: "nowrap" }}>
                      {hpp > 0 ? (
                        <>
                          {fmtRp(hpp)}
                          <span style={{ fontSize: "11px" }}>
                            {" "}
                            / {r.base_unit || "pcs"}
                          </span>
                          {r.last_purchase_at && (
                            <div style={{ fontSize: "10px", color: sub }}>
                              beli terakhir {fmtDate(r.last_purchase_at)}
                            </div>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                      {edit ? (
                        <input
                          type="number"
                          min="0"
                          value={edit.price}
                          autoFocus
                          onChange={(e) =>
                            setEdits((p) => ({
                              ...p,
                              [r.id]: { ...p[r.id], price: e.target.value },
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(r);
                            if (e.key === "Escape") cancelEdit(r.id);
                          }}
                          style={{ ...inputStyle, width: "120px" }}
                        />
                      ) : (
                        <div>
                          <span style={{ fontWeight: "700", color: text }}>
                            {price > 0 ? fmtRp(price) : "—"}
                          </span>
                          {changedRecently && (
                            <div style={{ fontSize: "10px", color: sub }}>
                              sebelumnya {fmtRp(r.prev_price)}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "10px 14px",
                        fontWeight: "600",
                        whiteSpace: "nowrap",
                        color:
                          price > 0 && margin >= 0
                            ? "var(--color-success)"
                            : price > 0
                              ? "var(--color-danger)"
                              : sub,
                      }}
                    >
                      {price > 0 && hpp > 0 ? fmtRp(margin) : "—"}
                    </td>
                    <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                      {edit ? (
                        <input
                          type="date"
                          value={edit.effective_date}
                          onChange={(e) =>
                            setEdits((p) => ({
                              ...p,
                              [r.id]: {
                                ...p[r.id],
                                effective_date: e.target.value,
                              },
                            }))
                          }
                          style={{ ...inputStyle, width: "150px" }}
                        />
                      ) : (
                        <span style={{ color: sub, fontSize: "12px" }}>
                          {r.effective_date
                            ? fmtDate(r.effective_date)
                            : "belum di-set"}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                      {edit ? (
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            onClick={() => saveEdit(r)}
                            disabled={savingId === r.id}
                            style={{
                              padding: "7px 14px",
                              backgroundColor: "var(--color-success)",
                              color: "#FFF",
                              border: "none",
                              borderRadius: "8px",
                              cursor: "pointer",
                              fontWeight: "700",
                              fontSize: "12px",
                            }}
                          >
                            {savingId === r.id ? "..." : "Simpan"}
                          </button>
                          <button
                            onClick={() => cancelEdit(r.id)}
                            style={{
                              padding: "7px 14px",
                              backgroundColor: "transparent",
                              color: sub,
                              border: `1px solid ${border}`,
                              borderRadius: "8px",
                              cursor: "pointer",
                              fontSize: "12px",
                            }}
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(r)}
                          className="ui-motion-button ui-focus-ring"
                          style={{
                            padding: "7px 14px",
                            backgroundColor: "var(--color-primary-soft)",
                            color: "var(--color-primary)",
                            border: "none",
                            borderRadius: "8px",
                            cursor: "pointer",
                            fontWeight: "700",
                            fontSize: "12px",
                          }}
                        >
                          Set Harga
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            {!loading && !filtered.length && (
              <tr>
                <td colSpan={7} style={{ padding: "2rem 1rem" }}>
                  <EmptyState
                    compact
                    icon={EmptyStateIcons.box}
                    title="Tidak ada produk cocok"
                    description="Coba kata kunci lain."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {toast && <ToastNotice message={toast} type={toastType} />}
    </div>
  );
}
