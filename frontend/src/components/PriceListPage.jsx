import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { priceListAPI, printSettingsAPI } from "../services/api";
import { hppForBatch, hppFromHna } from "../utils/rupiah";
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

const TARGET_MODES = [
  { key: "healthy", label: "Laba Sehat" },
  { key: "thin", label: "Laba Tipis" },
  { key: "promo_safe", label: "Aman Promo" },
  { key: "bep", label: "BEP" },
];

// ─── Drawer Saran Harga (pricing engine per marketplace) ───────────────────
function SuggestDrawer({ row, hpp, feeProfiles, isMobile, onClose, onApply }) {
  const [profileKey, setProfileKey] = useState("shopee|food_beverage");
  const [mode, setMode] = useState("healthy");
  const [qtyBundle, setQtyBundle] = useState("1");
  const [packingFee, setPackingFee] = useState("0");
  const [showPromo, setShowPromo] = useState(false);
  const [promoRates, setPromoRates] = useState({ seller: "", affiliate: "", campaign: "" });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const timerRef = useRef(null);

  const text = "var(--color-text)";
  const sub = "var(--color-text-muted)";
  const border = "var(--color-border)";

  const [platform, categoryKey] = profileKey.split("|");

  const compute = useCallback(() => {
    setBusy(true);
    setErr("");
    const toRate = (v) => {
      const n = parseFloat(v);
      return Number.isFinite(n) && n > 0 ? n / 100 : 0;
    };
    priceListAPI
      .recommend({
        product_name: row.name,
        hpp_per_unit: hpp,
        qty_bundle: parseInt(qtyBundle) || 1,
        packing_fee: parseFloat(packingFee) || 0,
        platform,
        category_key: categoryKey,
        target_profit_mode: mode,
        seller_discount_rate: toRate(promoRates.seller),
        affiliate_rate: toRate(promoRates.affiliate),
        campaign_rate: toRate(promoRates.campaign),
      })
      .then((r) => setResult(r.data))
      .catch((e) => setErr(e.response?.data?.error || e.message))
      .finally(() => setBusy(false));
  }, [row, hpp, qtyBundle, packingFee, platform, categoryKey, mode, promoRates]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(compute, 350);
    return () => clearTimeout(timerRef.current);
  }, [compute]);

  const fieldStyle = {
    width: "100%",
    padding: "9px 10px",
    borderRadius: "8px",
    border: `1px solid ${border}`,
    backgroundColor: "var(--color-surface-elevated)",
    color: text,
    fontSize: "13px",
  };
  const labelStyle = {
    display: "block",
    fontSize: "11px",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: sub,
    marginBottom: "6px",
  };

  const priceRow = (label, raw, rounded, highlight) => (
    <div
      key={label}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "9px 12px",
        borderRadius: "10px",
        backgroundColor: highlight ? "var(--color-primary-soft)" : "transparent",
        border: highlight ? "1px solid var(--color-primary)" : `1px solid ${border}`,
      }}
    >
      <div>
        <div style={{ fontSize: "12px", fontWeight: highlight ? 700 : 600, color: highlight ? "var(--color-primary)" : text }}>
          {label}
        </div>
        {raw != null && rounded != null && raw !== rounded && (
          <div style={{ fontSize: "10px", color: sub }}>hitungan: {fmtRp(raw)}</div>
        )}
      </div>
      <div style={{ fontSize: "14px", fontWeight: 700, color: highlight ? "var(--color-primary)" : text }}>
        {rounded != null ? fmtRp(rounded) : "—"}
      </div>
    </div>
  );

  return (
    <>
      {/* overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.35)",
          zIndex: 90,
        }}
      />
      <aside
        className="ui-panel ui-motion-modal"
        role="dialog"
        aria-label={`Saran harga ${row.name}`}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: isMobile ? "100%" : "400px",
          zIndex: 100,
          backgroundColor: "var(--color-surface)",
          borderLeft: `1px solid ${border}`,
          boxShadow: "var(--shadow-floating)",
          overflowY: "auto",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 800, color: text }}>✨ Saran Harga</div>
            <div style={{ fontSize: "12px", color: sub, marginTop: "2px" }}>{row.name}</div>
            <div style={{ fontSize: "11px", color: sub }}>
              HPP {fmtRp(hpp)} / {row.base_unit || "pcs"}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup saran harga"
            className="ui-motion-button"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "20px",
              color: sub,
              lineHeight: 1,
              padding: "4px",
            }}
          >
            ×
          </button>
        </div>

        <div>
          <label style={labelStyle}>Jual di mana?</label>
          <select value={profileKey} onChange={(e) => setProfileKey(e.target.value)} style={fieldStyle}>
            {feeProfiles.map((p) => (
              <option key={p.id} value={`${p.platform}|${p.category_key}`}>
                {p.label || `${p.platform} · ${p.category_key}`}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div>
            <label style={labelStyle}>Isi per bundle</label>
            <input type="number" min="1" value={qtyBundle} onChange={(e) => setQtyBundle(e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Biaya packing (Rp)</label>
            <input type="number" min="0" value={packingFee} onChange={(e) => setPackingFee(e.target.value)} style={fieldStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Target laba</label>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {TARGET_MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className="ui-motion-button"
                style={{
                  padding: "7px 12px",
                  borderRadius: "999px",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                  border: mode === m.key ? "1px solid var(--color-primary)" : `1px solid ${border}`,
                  backgroundColor: mode === m.key ? "var(--color-primary-soft)" : "transparent",
                  color: mode === m.key ? "var(--color-primary)" : sub,
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setShowPromo((v) => !v)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-primary)",
            fontSize: "12px",
            fontWeight: 700,
            textAlign: "left",
            padding: 0,
          }}
        >
          {showPromo ? "▾" : "▸"} Biaya promo tambahan (diskon toko / affiliate / campaign)
        </button>
        {showPromo && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
            {[
              ["seller", "Diskon toko %"],
              ["affiliate", "Affiliate %"],
              ["campaign", "Campaign %"],
            ].map(([k, label]) => (
              <div key={k}>
                <label style={{ ...labelStyle, textTransform: "none", letterSpacing: 0 }}>{label}</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={promoRates[k]}
                  placeholder="0"
                  onChange={(e) => setPromoRates((p) => ({ ...p, [k]: e.target.value }))}
                  style={fieldStyle}
                />
              </div>
            ))}
          </div>
        )}

        {err && (
          <div style={{ fontSize: "12px", color: "var(--color-danger)", fontWeight: 600 }}>{err}</div>
        )}

        {result && (
          <>
            <div style={{ fontSize: "11px", color: sub }}>
              Potongan {result.fee_profile_label || platform}: {result.total_variable_fee_rate}%
              {result.fixed_order_fee > 0 ? ` + ${fmtRp(result.fixed_order_fee)}/order` : ""}
              {result.fee_source ? ` · sumber: ${result.fee_source}` : ""}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", opacity: busy ? 0.5 : 1 }}>
              {priceRow("BEP (modal balik)", result.harga_bep, result.pembulatan_psikologis?.bep, mode === "bep")}
              {priceRow("Laba tipis (+5%)", result.harga_laba_tipis, result.pembulatan_psikologis?.laba_tipis, mode === "thin")}
              {priceRow("Laba sehat (+15%)", result.harga_laba_sehat, result.pembulatan_psikologis?.laba_sehat, mode === "healthy")}
              {priceRow("Aman saat promo", result.harga_aman_promo, result.pembulatan_psikologis?.aman_promo, mode === "promo_safe")}
            </div>

            {result.estimasi && (
              <div
                style={{
                  padding: "12px",
                  borderRadius: "10px",
                  backgroundColor: "var(--color-bg-subtle)",
                  fontSize: "12px",
                  color: sub,
                  lineHeight: 1.7,
                }}
              >
                Pada harga <strong style={{ color: text }}>{fmtRp(result.harga_rekomendasi_psikologis)}</strong>:
                <br />
                Diterima bersih <strong style={{ color: text }}>{fmtRp(result.estimasi.estimasi_penghasilan_bersih)}</strong>
                {" · "}laba{" "}
                <strong style={{ color: result.estimasi.estimasi_laba >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                  {fmtRp(result.estimasi.estimasi_laba)} ({result.estimasi.margin_laba}%)
                </strong>
              </div>
            )}

            {result.warnings?.map((w, i) => (
              <div
                key={i}
                style={{
                  padding: "10px 12px",
                  borderRadius: "10px",
                  fontSize: "12px",
                  fontWeight: 600,
                  backgroundColor: w.includes("RUGI") || w.includes("NEGATIF")
                    ? "color-mix(in srgb, var(--color-danger) 12%, transparent)"
                    : "color-mix(in srgb, var(--color-warning, #f59e0b) 14%, transparent)",
                  color: w.includes("RUGI") || w.includes("NEGATIF") ? "var(--color-danger)" : text,
                }}
              >
                ⚠️ {w}
              </div>
            ))}

            {result.harga_rekomendasi_psikologis != null && (
              <button
                onClick={() => onApply(result.harga_rekomendasi_psikologis)}
                className="btn-primary ui-motion-button"
                style={{
                  padding: "12px",
                  backgroundColor: "var(--color-primary)",
                  color: "#FFF",
                  border: "none",
                  borderRadius: "10px",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: "13px",
                }}
              >
                Pakai {fmtRp(result.harga_rekomendasi_psikologis)} sebagai harga jual
              </button>
            )}
          </>
        )}
      </aside>
    </>
  );
}

// ─── Modal Biaya Admin marketplace (fee profiles, editable) ────────────────
function FeeProfilesModal({ feeProfiles, isMobile, onClose, onSaved, flash }) {
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const text = "var(--color-text)";
  const sub = "var(--color-text-muted)";
  const border = "var(--color-border)";

  const valOf = (p, field) => {
    const d = drafts[p.id];
    if (d && d[field] !== undefined) return d[field];
    if (field === "fixed_order_fee") return String(Math.round(parseFloat(p[field]) || 0));
    return String(+((parseFloat(p[field]) || 0) * 100).toFixed(3));
  };

  const setVal = (id, field, v) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: v } }));

  const save = async (p) => {
    const d = drafts[p.id];
    if (!d) return;
    const body = {};
    if (d.safe_effective_fee_rate !== undefined) body.safe_effective_fee_rate = parseFloat(d.safe_effective_fee_rate) / 100;
    if (d.admin_rate !== undefined) body.admin_rate = parseFloat(d.admin_rate) / 100;
    if (d.service_rate !== undefined) body.service_rate = parseFloat(d.service_rate) / 100;
    if (d.fixed_order_fee !== undefined) body.fixed_order_fee = parseFloat(d.fixed_order_fee);
    setSavingId(p.id);
    try {
      await priceListAPI.updateFeeProfile(p.id, body);
      setDrafts((prev) => {
        const n = { ...prev };
        delete n[p.id];
        return n;
      });
      flash(`Fee ${p.label || p.platform} disimpan`);
      onSaved();
    } catch (e) {
      flash(e.response?.data?.error || e.message, "error");
    } finally {
      setSavingId(null);
    }
  };

  const cellInput = (p, field, suffix) => (
    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <input
        type="number"
        min="0"
        step="0.01"
        value={valOf(p, field)}
        onChange={(e) => setVal(p.id, field, e.target.value)}
        style={{
          width: field === "fixed_order_fee" ? "84px" : "64px",
          padding: "6px 8px",
          borderRadius: "8px",
          border: `1px solid ${border}`,
          backgroundColor: "var(--color-surface-elevated)",
          color: text,
          fontSize: "12px",
        }}
      />
      <span style={{ fontSize: "11px", color: sub }}>{suffix}</span>
    </div>
  );

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 90 }} />
      <div
        className="ui-panel ui-dialog-shell ui-motion-modal"
        role="dialog"
        aria-label="Biaya admin marketplace"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: isMobile ? "94vw" : "720px",
          maxHeight: "84vh",
          overflowY: "auto",
          zIndex: 100,
          backgroundColor: "var(--color-surface)",
          border: `1px solid ${border}`,
          borderRadius: "16px",
          boxShadow: "var(--shadow-floating)",
          padding: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <div style={{ fontSize: "15px", fontWeight: 800, color: text }}>⚙️ Biaya Admin Marketplace</div>
          <button onClick={onClose} aria-label="Tutup" style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: sub }}>
            ×
          </button>
        </div>
        <div style={{ fontSize: "12px", color: sub, marginBottom: "14px", lineHeight: 1.6 }}>
          Fee marketplace bisa berubah — update di sini, semua saran harga langsung ikut.
          <strong> Fee efektif</strong> = total potongan nyata per order (sudah termasuk fee tetap); dipakai sebagai dasar saran harga.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {feeProfiles.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "10px",
                padding: "10px 12px",
                borderRadius: "12px",
                border: `1px solid ${border}`,
              }}
            >
              <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: text }}>{p.label || `${p.platform} · ${p.category_key}`}</div>
                <div style={{ fontSize: "10px", color: sub }}>
                  sumber: {p.source}
                  {p.updated_at ? ` · diubah ${fmtDate(p.updated_at)}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: "10px", color: sub, marginBottom: "2px" }}>Fee efektif</div>
                  {cellInput(p, "safe_effective_fee_rate", "%")}
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: sub, marginBottom: "2px" }}>Admin</div>
                  {cellInput(p, "admin_rate", "%")}
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: sub, marginBottom: "2px" }}>Layanan</div>
                  {cellInput(p, "service_rate", "%")}
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: sub, marginBottom: "2px" }}>Fee tetap</div>
                  {cellInput(p, "fixed_order_fee", "Rp/order")}
                </div>
                <button
                  onClick={() => save(p)}
                  disabled={!drafts[p.id] || savingId === p.id}
                  className="ui-motion-button"
                  style={{
                    padding: "7px 14px",
                    backgroundColor: drafts[p.id] ? "var(--color-primary)" : "var(--color-bg-subtle)",
                    color: drafts[p.id] ? "#FFF" : sub,
                    border: "none",
                    borderRadius: "8px",
                    cursor: drafts[p.id] ? "pointer" : "default",
                    fontWeight: 700,
                    fontSize: "12px",
                    alignSelf: "flex-end",
                  }}
                >
                  {savingId === p.id ? "..." : "Simpan"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

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
  const [suggestFor, setSuggestFor] = useState(null);
  const [feeProfiles, setFeeProfiles] = useState([]);
  const [showFees, setShowFees] = useState(false);
  const [onlyUnset, setOnlyUnset] = useState(false);

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

  const fetchFees = () =>
    priceListAPI
      .getFeeProfiles()
      .then((r) => setFeeProfiles(r.data || []))
      .catch(() => {});

  useEffect(() => {
    fetchRows();
    fetchFees();
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
    let out = rows;
    if (q) {
      out = out.filter(
        (r) =>
          r.name?.toLowerCase().includes(q) ||
          r.code?.toLowerCase().includes(q) ||
          r.category?.toLowerCase().includes(q),
      );
    }
    if (onlyUnset) out = out.filter((r) => r.list_price == null);
    return out;
  }, [rows, search, onlyUnset]);

  // Grouping per kategori — backend sudah sort kategori lalu nama.
  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((r) => {
      const cat = r.category || "Lain-lain";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(r);
    });
    return Array.from(map.entries());
  }, [filtered]);

  const stats = useMemo(() => {
    const setCount = rows.filter((r) => r.list_price != null).length;
    return { set: setCount, unset: rows.length - setCount };
  }, [rows]);

  const latestEffectiveDate = useMemo(() => {
    const dates = rows
      .map((r) => r.effective_date)
      .filter(Boolean)
      .sort();
    return dates.length ? dates[dates.length - 1] : null;
  }, [rows]);

  const startEdit = (r, presetPrice) => {
    setEdits((p) => ({
      ...p,
      [r.id]: {
        price: String(
          presetPrice != null ? presetPrice : Math.round(effectivePrice(r)) || "",
        ),
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

  const handleExportPDF = async () => {
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
      // dynamic import: jsPDF tidak ikut bundle awal halaman
      const { generatePriceListPDF } = await import("../utils/generatePriceListPDF");
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

  const actionBtn = (label, onClick, variant = "soft", disabled = false) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className="ui-motion-button ui-focus-ring"
      style={{
        padding: "7px 12px",
        backgroundColor:
          variant === "primary"
            ? "var(--color-success)"
            : variant === "ghost"
              ? "transparent"
              : "var(--color-primary-soft)",
        color:
          variant === "primary"
            ? "#FFF"
            : variant === "ghost"
              ? sub
              : "var(--color-primary)",
        border: variant === "ghost" ? `1px solid ${border}` : "none",
        borderRadius: "8px",
        cursor: disabled ? "wait" : "pointer",
        fontWeight: 700,
        fontSize: "12px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );

  // ── render satu baris produk (desktop table row / mobile card) ──
  const renderEditFields = (r) => (
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
      <input
        type="number"
        min="0"
        value={edits[r.id].price}
        autoFocus
        onChange={(e) =>
          setEdits((p) => ({ ...p, [r.id]: { ...p[r.id], price: e.target.value } }))
        }
        onKeyDown={(e) => {
          if (e.key === "Enter") saveEdit(r);
          if (e.key === "Escape") cancelEdit(r.id);
        }}
        style={{ ...inputStyle, width: "110px" }}
        aria-label={`Harga baru ${r.name}`}
      />
      <input
        type="date"
        value={edits[r.id].effective_date}
        onChange={(e) =>
          setEdits((p) => ({
            ...p,
            [r.id]: { ...p[r.id], effective_date: e.target.value },
          }))
        }
        style={{ ...inputStyle, width: "140px" }}
        aria-label={`Tanggal berlaku ${r.name}`}
      />
      {actionBtn(savingId === r.id ? "..." : "Simpan", () => saveEdit(r), "primary", savingId === r.id)}
      {actionBtn("Batal", () => cancelEdit(r.id), "ghost")}
    </div>
  );

  const marginBadge = (price, hpp) => {
    if (!(price > 0) || !(hpp > 0)) return null;
    const margin = price - hpp;
    const marginPct = price > 0 ? ((margin / price) * 100).toFixed(1) : 0;
    const ok = margin >= 0;
    return (
      <span
        style={{
          display: "inline-block",
          padding: "2px 8px",
          borderRadius: "999px",
          fontSize: "11px",
          fontWeight: 700,
          color: ok ? "var(--color-success)" : "var(--color-danger)",
          backgroundColor: ok
            ? "color-mix(in srgb, var(--color-success) 12%, transparent)"
            : "color-mix(in srgb, var(--color-danger) 12%, transparent)",
        }}
      >
        {ok ? "+" : ""}
        {fmtRp(margin)} · {marginPct}%
      </span>
    );
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
          marginBottom: "1.25rem",
          flexWrap: "wrap",
          gap: "12px",
          padding: "18px 20px",
          borderRadius: "18px",
        }}
      >
        <div>
          <h1 style={{ fontSize: isMobile ? "1.5rem" : "2rem", fontWeight: "700", margin: 0, color: text }}>
            🏷️ Daftar Harga
          </h1>
          <div style={{ margin: "4px 0 0", fontSize: "13px", color: sub }}>
            {loading ? (
              <Skeleton width="200px" height="14px" />
            ) : (
              <>
                {rows.length} produk · <strong style={{ color: "var(--color-success)" }}>{stats.set} sudah di-set</strong>
                {stats.unset > 0 && (
                  <>
                    {" · "}
                    <button
                      onClick={() => setOnlyUnset((v) => !v)}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: 700,
                        color: onlyUnset ? "var(--color-primary)" : sub,
                        textDecoration: "underline",
                      }}
                    >
                      {stats.unset} belum di-set{onlyUnset ? " ✕" : ""}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            onClick={() => setShowFees(true)}
            className="ui-motion-button ui-focus-ring"
            style={{
              padding: "10px 14px",
              backgroundColor: "transparent",
              color: sub,
              border: `1px solid ${border}`,
              borderRadius: "10px",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "13px",
            }}
          >
            ⚙️ Biaya Admin
          </button>
          <button
            onClick={handleExportPDF}
            disabled={exporting}
            className="ui-motion-button ui-focus-ring"
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
              fontSize: "13px",
              opacity: exporting ? 0.7 : 1,
            }}
          >
            🖨️ {exporting ? "Membuat PDF..." : "Cetak A4"}
          </button>
        </div>
      </div>

      {/* Search */}
      <div
        className="ui-toolbar"
        style={{ display: "flex", gap: "12px", marginBottom: "1.25rem", padding: "14px" }}
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

      {/* ── MOBILE: kartu per produk ── */}
      {isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {loading &&
            [...Array(5)].map((_, i) => (
              <div key={i} className="ui-panel" style={{ borderRadius: "14px", padding: "14px" }}>
                <Skeleton width="100%" height="48px" />
              </div>
            ))}
          {!loading &&
            grouped.map(([cat, items]) => (
              <React.Fragment key={cat}>
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--color-primary)",
                    padding: "6px 4px 0",
                  }}
                >
                  {cat} <span style={{ color: sub, fontWeight: 600 }}>({items.length})</span>
                </div>
                {items.map((r) => {
                  const hpp = lastHppFor(r);
                  const price = effectivePrice(r);
                  return (
                    <div key={r.id} className="ui-panel" style={{ borderRadius: "14px", padding: "14px" }}>
                      <div style={{ fontWeight: 700, fontSize: "14px", color: text }}>{r.name}</div>
                      <div style={{ fontSize: "11px", color: sub, fontFamily: "monospace", margin: "2px 0 8px" }}>
                        {r.code}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "6px", fontSize: "12px", color: sub }}>
                        <span>
                          HPP{" "}
                          {hpp > 0 ? (
                            <strong style={{ color: text }}>{fmtRp(hpp)}</strong>
                          ) : (
                            <em>belum ada pembelian</em>
                          )}
                        </span>
                        <span>
                          Jual{" "}
                          <strong style={{ color: text }}>{price > 0 ? fmtRp(price) : "belum di-set"}</strong>
                        </span>
                      </div>
                      <div style={{ margin: "8px 0" }}>{marginBadge(price, hpp)}</div>
                      {edits[r.id] ? (
                        renderEditFields(r)
                      ) : (
                        <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                          {actionBtn("Set Harga", () => startEdit(r))}
                          {hpp > 0 && actionBtn("✨ Saran", () => setSuggestFor(r), "ghost")}
                        </div>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          {!loading && !filtered.length && (
            <EmptyState
              compact
              icon={EmptyStateIcons.box}
              title="Tidak ada produk cocok"
              description="Coba kata kunci lain."
            />
          )}
        </div>
      ) : (
        /* ── DESKTOP: tabel grouped + sticky header ── */
        <div className="ui-panel" style={{ borderRadius: "16px", overflow: "auto", maxHeight: "calc(100vh - 290px)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "880px" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 5, backgroundColor: "var(--color-surface)" }}>
              <tr>
                {["Produk", "HPP Terakhir (inc PPN)", "Harga Jual", "Margin", "Efektif Sejak", "Aksi"].map((h) => (
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
                      backgroundColor: "var(--color-surface)",
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
                    <td colSpan={6} style={{ padding: "12px 14px" }}>
                      <Skeleton width="100%" height="18px" />
                    </td>
                  </tr>
                ))}
              {!loading &&
                grouped.map(([cat, items]) => (
                  <React.Fragment key={cat}>
                    <tr>
                      <td
                        colSpan={6}
                        style={{
                          padding: "10px 14px",
                          fontSize: "11px",
                          fontWeight: 800,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: "var(--color-primary)",
                          backgroundColor: "var(--color-bg-subtle)",
                          borderBottom: `1px solid ${border}`,
                        }}
                      >
                        {cat} <span style={{ color: sub, fontWeight: 600 }}>({items.length} produk)</span>
                      </td>
                    </tr>
                    {items.map((r) => {
                      const hpp = lastHppFor(r);
                      const price = effectivePrice(r);
                      const edit = edits[r.id];
                      const changedRecently =
                        r.prev_price != null &&
                        parseFloat(r.prev_price) !== parseFloat(r.list_price);
                      return (
                        <tr key={r.id} style={{ borderBottom: `1px solid ${border}` }}>
                          <td style={{ padding: "10px 14px", color: text }}>
                            <div style={{ fontWeight: "600" }}>{r.name}</div>
                            <div style={{ fontSize: "11px", color: sub, fontFamily: "monospace" }}>
                              {r.code}
                            </div>
                          </td>
                          <td style={{ padding: "10px 14px", color: sub, whiteSpace: "nowrap" }}>
                            {hpp > 0 ? (
                              <>
                                <span style={{ color: text }}>{fmtRp(hpp)}</span>
                                <span style={{ fontSize: "11px" }}> / {r.base_unit || "pcs"}</span>
                                {r.last_purchase_at && (
                                  <div style={{ fontSize: "10px", color: sub }}>
                                    beli terakhir {fmtDate(r.last_purchase_at)}
                                  </div>
                                )}
                              </>
                            ) : (
                              <em style={{ fontSize: "12px" }}>belum ada pembelian</em>
                            )}
                          </td>
                          <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }} colSpan={edit ? 3 : 1}>
                            {edit ? (
                              renderEditFields(r)
                            ) : (
                              <div>
                                <span style={{ fontWeight: "700", color: price > 0 ? text : sub }}>
                                  {price > 0 ? fmtRp(price) : "belum di-set"}
                                </span>
                                {changedRecently && (
                                  <div style={{ fontSize: "10px", color: sub }}>
                                    sebelumnya {fmtRp(r.prev_price)}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          {!edit && (
                            <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                              {marginBadge(price, hpp) || <span style={{ color: sub }}>—</span>}
                            </td>
                          )}
                          {!edit && (
                            <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                              <span style={{ color: sub, fontSize: "12px" }}>
                                {r.effective_date ? fmtDate(r.effective_date) : "—"}
                              </span>
                            </td>
                          )}
                          <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                            {!edit && (
                              <div style={{ display: "flex", gap: "6px" }}>
                                {actionBtn("Set Harga", () => startEdit(r))}
                                {hpp > 0 && actionBtn("✨ Saran", () => setSuggestFor(r), "ghost")}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              {!loading && !filtered.length && (
                <tr>
                  <td colSpan={6} style={{ padding: "2rem 1rem" }}>
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
      )}

      {suggestFor && (
        <SuggestDrawer
          row={suggestFor}
          hpp={lastHppFor(suggestFor)}
          feeProfiles={feeProfiles.length ? feeProfiles : []}
          isMobile={isMobile}
          onClose={() => setSuggestFor(null)}
          onApply={(price) => {
            startEdit(suggestFor, price);
            setSuggestFor(null);
            flash("Saran harga dimasukkan — tinggal klik Simpan");
          }}
        />
      )}

      {showFees && (
        <FeeProfilesModal
          feeProfiles={feeProfiles}
          isMobile={isMobile}
          onClose={() => setShowFees(false)}
          onSaved={fetchFees}
          flash={flash}
        />
      )}

      {toast && <ToastNotice message={toast} type={toastType} />}
    </div>
  );
}
