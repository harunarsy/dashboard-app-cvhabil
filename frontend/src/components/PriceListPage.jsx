import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { priceListAPI, printSettingsAPI } from "../services/api";
import { usePriceList, useFeeProfiles } from "../hooks/useMasterData";
import { qk } from "../lib/queryClient";
import { hppForBatch, hppFromHna } from "../utils/rupiah";
import Breadcrumb from "./common/Breadcrumb";
import SearchBox from "./common/SearchBox";
import Skeleton from "./common/Skeleton";
import Pagination from "./common/Pagination";
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

const fmtRpShort = (n) => {
  const v = Math.round(n || 0);
  if (Math.abs(v) >= 1000000) return `Rp${(v / 1000000).toFixed(1).replace(".", ",")}jt`;
  if (Math.abs(v) >= 1000) return `Rp${Math.round(v / 1000)}rb`;
  return `Rp${v}`;
};

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
// v1.55.0: sadar ppn_rate per-batch (11%/12%) — jangan pukul rata 11%.
const lastHppFor = (row) => {
  if (row.last_hna != null) {
    return hppForBatch({ hna: row.last_hna, tax_type: row.last_tax_type, ppn_rate: row.last_ppn_rate });
  }
  return hppFromHna(parseFloat(row.master_hna) || 0);
};

// v1.55.0: deteksi JUAL RUGI per saluran — harga efektif (net setelah fee marketplace)
// ≤ HPP referensi. Offline pakai sell_price (satu sumber dgn inventory); marketplace
// hanya dicek kalau harganya memang di-set.
const lossChannelsFor = (row, feeRateFor) => {
  const hpp = lastHppFor(row);
  if (!(hpp > 0)) return [];
  const out = [];
  CHANNELS.forEach((ch) => {
    const price =
      ch.key === "offline"
        ? parseFloat(row.sell_price) || 0
        : row[ch.field] != null
          ? parseFloat(row[ch.field])
          : 0;
    if (price > 0 && price * (1 - (feeRateFor[ch.platform] || 0)) <= hpp) out.push(ch);
  });
  return out;
};

// Tiga saluran jual — field mengikuti respons GET /api/price-list
const CHANNELS = [
  { key: "offline", label: "Offline", icon: "🏪", field: "list_price", dateField: "effective_date", platform: "offline", category: "default" },
  { key: "shopee", label: "Shopee", icon: "🟠", field: "shopee_price", dateField: "shopee_date", platform: "shopee", category: "default" },
  { key: "tokopedia_tiktok", label: "TikTok/Tokped", icon: "🟢", field: "tokopedia_price", dateField: "tokopedia_date", platform: "tokopedia_tiktok", category: "default" },
];
const CHANNEL_LABEL = Object.fromEntries(CHANNELS.map((c) => [c.key, `${c.icon} ${c.label}`]));

const TARGET_MODES = [
  { key: "healthy", label: "Laba Sehat" },
  { key: "thin", label: "Laba Tipis" },
  { key: "promo_safe", label: "Aman Promo" },
  { key: "bep", label: "BEP" },
];

// ─── Drawer Saran Harga (pricing engine per marketplace) ───────────────────
function SuggestDrawer({ row, hpp, feeProfiles, isMobile, initialKey, onClose, onApply }) {
  const [profileKey, setProfileKey] = useState(initialKey || "shopee|default");
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

  const priceRow = (label, raw, rounded, highlight) => {
    const price = rounded != null ? rounded : raw;
    const disabled = price == null;

    return (
      <button
        type="button"
        onClick={() => {
          if (!disabled) onApply(price, platform);
        }}
        className="ui-motion-button ui-focus-ring"
        title={price != null ? `Klik untuk pakai ${fmtRp(price)} sebagai harga jual` : undefined}
        disabled={disabled}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "9px 12px",
          borderRadius: "10px",
          backgroundColor: highlight ? "var(--color-primary-soft)" : "transparent",
          border: highlight ? "1px solid var(--color-primary)" : `1px solid ${border}`,
          width: "100%",
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.6 : 1,
          textAlign: "left",
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
          {price != null ? fmtRp(price) : "—"}
        </div>
      </button>
    );
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 90 }}
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
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: sub, lineHeight: 1, padding: "4px" }}
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
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-primary)", fontSize: "12px", fontWeight: 700, textAlign: "left", padding: 0 }}
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

        {err && <div style={{ fontSize: "12px", color: "var(--color-danger)", fontWeight: 600 }}>{err}</div>}

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
                  backgroundColor:
                    w.includes("RUGI") || w.includes("NEGATIF")
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
                onClick={() => onApply(result.harga_rekomendasi_psikologis, platform)}
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
  const dirtyCount = Object.keys(drafts).length;

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
    <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
      <input
        type="number"
        min="0"
        step="0.01"
        value={valOf(p, field)}
        onChange={(e) => setVal(p.id, field, e.target.value)}
        style={{
          width: "100%",
          minWidth: field === "fixed_order_fee" ? "92px" : "76px",
          minHeight: "40px",
          padding: "8px 10px",
          borderRadius: "10px",
          border: `1px solid ${border}`,
          backgroundColor: "var(--color-surface-elevated)",
          color: text,
          fontSize: "13px",
          fontWeight: 650,
        }}
      />
      <span style={{ fontSize: "11px", color: sub, whiteSpace: "nowrap" }}>{suffix}</span>
    </div>
  );

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.48)",
          backdropFilter: "blur(2px)",
          zIndex: 90,
        }}
      />
      <div
        className="ui-panel ui-dialog-shell ui-motion-modal"
        role="dialog"
        aria-label="Biaya admin marketplace"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: isMobile ? "calc(100vw - 24px)" : "min(960px, calc(100vw - 48px))",
          maxHeight: "calc(100dvh - 32px)",
          overflow: "hidden",
          zIndex: 100,
          backgroundColor: "var(--color-surface)",
          border: `1px solid ${border}`,
          borderRadius: "18px",
          boxShadow: "var(--shadow-floating)",
          padding: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "16px",
            padding: isMobile ? "16px" : "18px 22px",
            borderBottom: `1px solid ${border}`,
            backgroundColor: "var(--color-surface)",
          }}
        >
          <div>
            <div style={{ fontSize: "18px", fontWeight: 850, color: text }}>⚙️ Biaya Admin Marketplace</div>
            <div style={{ fontSize: "12px", color: sub, marginTop: "4px", lineHeight: 1.5 }}>
              Fee efektif dipakai untuk semua saran harga. Edit angka, lalu simpan per metode.
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="ui-motion-button ui-focus-ring"
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "12px",
              border: `1px solid ${border}`,
              backgroundColor: "var(--color-surface-elevated)",
              cursor: "pointer",
              fontSize: "20px",
              color: sub,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
        <div
          style={{
            padding: isMobile ? "14px" : "18px 22px",
            overflowY: "auto",
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
            gap: "12px",
            backgroundColor: "var(--color-bg-subtle)",
          }}
        >
          {feeProfiles.map((p) => {
            const dirty = Boolean(drafts[p.id]);
            return (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  padding: "14px",
                  borderRadius: "14px",
                  border: `1px solid ${dirty ? "var(--color-primary)" : border}`,
                  backgroundColor: "var(--color-surface)",
                  boxShadow: dirty ? "0 0 0 3px var(--color-primary-soft)" : "none",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: 800, color: text, lineHeight: 1.25 }}>
                      {p.label || `${p.platform} · ${p.category_key}`}
                    </div>
                    <div style={{ fontSize: "11px", color: sub, marginTop: "3px" }}>
                      sumber: {p.source}
                      {p.updated_at ? ` · diubah ${fmtDate(p.updated_at)}` : ""}
                    </div>
                  </div>
                  {dirty && (
                    <span
                      style={{
                        padding: "3px 8px",
                        borderRadius: "999px",
                        fontSize: "10px",
                        fontWeight: 800,
                        color: "var(--color-primary)",
                        backgroundColor: "var(--color-primary-soft)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Belum disimpan
                    </span>
                  )}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, minmax(0, 1fr))",
                    gap: "10px",
                  }}
                >
                  {[
                    ["safe_effective_fee_rate", "Fee efektif", "%"],
                    ["admin_rate", "Admin", "%"],
                    ["service_rate", "Layanan", "%"],
                    ["fixed_order_fee", "Fee tetap", "Rp/order"],
                  ].map(([field, label, suffix]) => (
                    <label key={field} style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: "10px",
                          color: sub,
                          marginBottom: "4px",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          fontWeight: 800,
                        }}
                      >
                        {label}
                      </div>
                      {cellInput(p, field, suffix)}
                    </label>
                  ))}
                </div>

                <button
                  onClick={() => save(p)}
                  disabled={!dirty || savingId === p.id}
                  className="ui-motion-button ui-focus-ring"
                  style={{
                    minHeight: "42px",
                    padding: "9px 14px",
                    backgroundColor: dirty ? "var(--color-primary)" : "var(--color-bg-subtle)",
                    color: dirty ? "#FFF" : sub,
                    border: dirty ? "1px solid var(--color-primary)" : `1px solid ${border}`,
                    borderRadius: "10px",
                    cursor: dirty ? "pointer" : "default",
                    fontWeight: 800,
                    fontSize: "13px",
                    alignSelf: "stretch",
                  }}
                >
                  {savingId === p.id ? "Menyimpan..." : "Simpan profil ini"}
                </button>
              </div>
            );
          })}
        </div>
        <div
          style={{
            padding: isMobile ? "12px 16px" : "14px 22px",
            borderTop: `1px solid ${border}`,
            backgroundColor: "var(--color-surface)",
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "12px", color: sub }}>
            {dirtyCount ? `${dirtyCount} profil belum disimpan` : "Semua perubahan tersimpan per profil."}
          </span>
          <button
            onClick={onClose}
            className="ui-motion-button ui-focus-ring"
            style={{
              minHeight: "40px",
              padding: "9px 16px",
              borderRadius: "10px",
              border: `1px solid ${border}`,
              backgroundColor: "var(--color-surface-elevated)",
              color: text,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Tutup
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Modal riwayat harga per produk ─────────────────────────────────────────
function HistoryModal({ row, isMobile, onClose }) {
  const [entries, setEntries] = useState(null);
  const text = "var(--color-text)";
  const sub = "var(--color-text-muted)";
  const border = "var(--color-border)";

  useEffect(() => {
    priceListAPI
      .getHistory(row.id)
      .then((r) => setEntries(r.data || []))
      .catch(() => setEntries([]));
  }, [row.id]);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 90 }} />
      <div
        className="ui-panel ui-dialog-shell ui-motion-modal"
        role="dialog"
        aria-label={`Riwayat harga ${row.name}`}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: isMobile ? "94vw" : "480px",
          maxHeight: "80vh",
          overflowY: "auto",
          zIndex: 100,
          backgroundColor: "var(--color-surface)",
          border: `1px solid ${border}`,
          borderRadius: "16px",
          boxShadow: "var(--shadow-floating)",
          padding: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
          <div style={{ fontSize: "15px", fontWeight: 800, color: text }}>🕘 Riwayat Harga</div>
          <button onClick={onClose} aria-label="Tutup riwayat" style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: sub }}>
            ×
          </button>
        </div>
        <div style={{ fontSize: "12px", color: sub, marginBottom: "12px" }}>{row.name}</div>
        {entries === null && <Skeleton width="100%" height="60px" />}
        {entries !== null && !entries.length && (
          <div style={{ fontSize: "13px", color: sub, padding: "12px 0" }}>Belum ada riwayat — set harga pertama lewat kolom saluran.</div>
        )}
        {entries !== null &&
          entries.map((e) => (
            <div
              key={e.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "9px 0",
                borderBottom: `1px solid ${border}`,
                gap: "8px",
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "999px",
                  backgroundColor: "var(--color-bg-subtle)",
                  color: sub,
                  whiteSpace: "nowrap",
                }}
              >
                {CHANNEL_LABEL[e.channel] || e.channel}
              </span>
              <span style={{ fontSize: "12px", color: sub, flex: 1 }}>berlaku {fmtDate(e.effective_date)}</span>
              <strong style={{ fontSize: "13px", color: text }}>{fmtRp(e.price)}</strong>
            </div>
          ))}
      </div>
    </>
  );
}

export default function PriceListPage({ isDarkMode, isMobile, isVantaMode }) {
  // v1.46.0: TanStack Query — rows & fee profiles di-cache (kunjungan ulang instan).
  const queryClient = useQueryClient();
  const { data: rows = [], isLoading: loading } = usePriceList();
  const { data: feeProfiles = [], refetch: fetchFees } = useFeeProfiles();
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [toastType, setToastType] = useState("success");
  const toastTimerRef = useRef(null);
  const [settings, setSettings] = useState({});
  // nilai input per produk per saluran: { [id]: { offline: "1000", shopee: "", ... } }
  const [vals, setVals] = useState({});
  const [savingKey, setSavingKey] = useState(null); // `${id}|${channel}`
  const [exporting, setExporting] = useState(false);
  const [suggestFor, setSuggestFor] = useState(null); // { row, channelKey }
  const [historyFor, setHistoryFor] = useState(null);
  const [showFees, setShowFees] = useState(false);
  const [onlyUnset, setOnlyUnset] = useState(false);
  // v1.55.0: filter produk jual rugi (harga efektif ≤ HPP)
  const [onlyLoss, setOnlyLoss] = useState(false);

  const text = "var(--color-text)";
  const sub = "var(--color-text-muted)";
  const border = "var(--color-border)";

  const flash = (msg, type = "success") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    setToastType(type);
    toastTimerRef.current = setTimeout(
      () => setToast(""),
      type === "error" ? UI_MOTION.duration.toastError : UI_MOTION.duration.toastSuccess,
    );
  };

  const seedVals = (data) => {
    const m = {};
    (data || []).forEach((r) => {
      m[r.id] = {};
      CHANNELS.forEach((c) => {
        const v = r[c.field];
        m[r.id][c.key] = v != null ? String(Math.round(parseFloat(v))) : "";
      });
    });
    setVals(m);
  };

  // Seed buffer input `vals` SEKALI saat data harga pertama termuat. Tidak re-seed
  // pada refetch latar (biar tidak menimpa ketikan harga yang sedang berlangsung) —
  // update lokal sudah ditangani optimistic di saveChannel.
  const seededRef = useRef(false);
  useEffect(() => {
    if (rows.length && !seededRef.current) {
      seedVals(rows);
      seededRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  useEffect(() => {
    // rows & feeProfiles auto-fetch via hooks TanStack Query.
    printSettingsAPI
      .get()
      .then((r) => setSettings(r.data?.nota_layout || {}))
      .catch(() => {});
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // fee efektif per platform (kategori default) — buat hint "bersih ≈"
  const feeRateFor = useMemo(() => {
    const m = { offline: 0 };
    ["shopee", "tokopedia_tiktok"].forEach((pf) => {
      const p = feeProfiles.find((x) => x.platform === pf && x.category_key === "default");
      m[pf] = p ? parseFloat(p.safe_effective_fee_rate) || 0 : 0;
    });
    return m;
  }, [feeProfiles]);

  // Harga offline efektif (buat PDF & stats): entri offline → sell_price master.
  const effectivePrice = (r) =>
    r.list_price != null ? parseFloat(r.list_price) : parseFloat(r.sell_price) || 0;

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
    // v1.52.3: "belum di-set" = belum ada harga inventory (sell_price), karena
    // offline kini SATU sumber dgn sell_price (bukan override price_list lagi).
    if (onlyUnset) out = out.filter((r) => !(parseFloat(r.sell_price) > 0));
    if (onlyLoss) out = out.filter((r) => lossChannelsFor(r, feeRateFor).length > 0);
    return out;
  }, [rows, search, onlyUnset, onlyLoss, feeRateFor]);

  // v1.50.0: pagination (default 20) — slice flat dulu, baru di-group per kategori.
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  useEffect(() => {
    setCurrentPage(1);
  }, [search, onlyUnset, onlyLoss, pageSize]);
  const pagedFiltered = useMemo(
    () =>
      pageSize === -1
        ? filtered
        : filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage, pageSize],
  );

  const grouped = useMemo(() => {
    const map = new Map();
    pagedFiltered.forEach((r) => {
      const cat = r.category || "Lain-lain";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(r);
    });
    return Array.from(map.entries());
  }, [pagedFiltered]);

  const stats = useMemo(() => {
    const setCount = rows.filter((r) => parseFloat(r.sell_price) > 0).length;
    const lossCount = rows.filter((r) => lossChannelsFor(r, feeRateFor).length > 0).length;
    return { set: setCount, unset: rows.length - setCount, loss: lossCount };
  }, [rows, feeRateFor]);

  const latestEffectiveDate = useMemo(() => {
    const dates = rows.map((r) => r.effective_date).filter(Boolean).sort();
    return dates.length ? dates[dates.length - 1] : null;
  }, [rows]);

  // ── simpan harga satu saluran (Enter / apply saran) ──
  const saveChannel = async (r, channelKey, rawValue) => {
    const price = parseFloat(rawValue);
    if (!Number.isFinite(price) || price < 0) {
      flash("Harga harus angka dan tidak boleh minus", "error");
      return;
    }
    const ch = CHANNELS.find((c) => c.key === channelKey);
    const key = `${r.id}|${channelKey}`;
    setSavingKey(key);
    try {
      await priceListAPI.setPrice(r.id, { price, channel: channelKey });
      // v1.52.3: offline = harga inventory (sell_price), SATU sumber. Edit offline
      // menulis ke sell_price → kosongkan input agar kembali tampil "ikut inventory"
      // dengan harga baru (tidak bikin override terpisah).
      if (channelKey === "offline") {
        queryClient.setQueryData(qk.priceList, (prev = []) =>
          (prev || []).map((x) =>
            x.id === r.id ? { ...x, sell_price: price, list_price: null } : x,
          ),
        );
        setVals((prev) => ({ ...prev, [r.id]: { ...prev[r.id], offline: "" } }));
        flash(`🏪 Offline · ${r.name} → ${fmtRp(price)} (tersinkron ke Inventory)`);
        return;
      }
      // optimistic: patch cache TanStack tanpa refetch penuh (cepat), efektif hari ini.
      queryClient.setQueryData(qk.priceList, (prev = []) =>
        (prev || []).map((x) =>
          x.id === r.id ? { ...x, [ch.field]: price, [ch.dateField]: todayStr() } : x,
        ),
      );
      setVals((prev) => ({
        ...prev,
        [r.id]: { ...prev[r.id], [channelKey]: String(Math.round(price)) },
      }));
      flash(`${ch.icon} ${ch.label} · ${r.name} → ${fmtRp(price)} (berlaku hari ini)`);
    } catch (e) {
      flash(e.response?.data?.error || e.message, "error");
    } finally {
      setSavingKey(null);
    }
  };

  // v1.56.4: pilihan format cetak — tanpa HPP (customer) / dengan HPP (internal)
  const [showPrintChoice, setShowPrintChoice] = useState(false);
  const handleExportPDF = async (includeHpp = false) => {
    if (exporting) return;
    setExporting(true);
    setShowPrintChoice(false);
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
          hpp: includeHpp ? lastHppFor(r) : 0,
        }));
      if (!printable.length) {
        flash("Tidak ada produk dengan harga untuk dicetak", "error");
        return;
      }
      const { generatePriceListPDF } = await import("../utils/generatePriceListPDF");
      const doc = generatePriceListPDF(printable, {
        settings,
        effectiveDate: latestEffectiveDate || todayStr(),
        includeHpp,
      });
      doc.save(
        `Daftar-Harga-HABIL${includeHpp ? "-INTERNAL-HPP" : ""}-${(latestEffectiveDate || todayStr()).slice(0, 10)}.pdf`,
      );
      flash(
        includeHpp
          ? "PDF INTERNAL (dengan HPP) dibuat — jangan diberikan ke customer"
          : "PDF daftar harga dibuat — siap dicetak A4",
      );
    } catch (e) {
      flash("Gagal membuat PDF: " + e.message, "error");
    } finally {
      setExporting(false);
    }
  };

  const pillStyle = (bg, fg) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "3px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 700,
    backgroundColor: bg,
    color: fg,
    border: "none",
    cursor: "pointer",
  });

  // ── sel harga satu saluran: input + ✨ + hint margin/bersih + tanggal ──
  const priceCell = (r, ch) => {
    const hpp = lastHppFor(r);
    const cur = r[ch.field] != null ? parseFloat(r[ch.field]) : null;
    // v1.34.0: sel kosong tampilkan harga inventory (sell_price) sebagai referensi
    // (ghost). Set harga tetap independen di price_list_entries — TIDAK nulis balik
    // ke inventory; effectivePrice() yang fallback ke sell_price untuk PDF/stats.
    const inheritPrice = parseFloat(r.sell_price) || 0;
    const inheriting = cur == null && inheritPrice > 0;
    const val = vals[r.id]?.[ch.key] ?? "";
    const dirty = val !== (cur != null ? String(Math.round(cur)) : "");
    const key = `${r.id}|${ch.key}`;
    const saving = savingKey === key;
    const rate = feeRateFor[ch.platform] || 0;
    const priceNum = parseFloat(val) || 0;
    const net = priceNum > 0 ? priceNum * (1 - rate) : 0;
    const margin = priceNum > 0 && hpp > 0 ? net - hpp : null;

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          minWidth: isMobile ? 0 : "172px",
          width: "100%",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: hpp > 0 ? "minmax(0, 1fr) 32px" : "minmax(0, 1fr)", gap: "5px", alignItems: "center" }}>
          <input
            type="number"
            min="0"
            value={val}
            placeholder={
              inheriting ? Math.round(inheritPrice).toLocaleString("id-ID") : "—"
            }
            disabled={saving}
            aria-label={`Harga ${ch.label} ${r.name}`}
            onChange={(e) =>
              setVals((p) => ({ ...p, [r.id]: { ...p[r.id], [ch.key]: e.target.value } }))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && dirty) saveChannel(r, ch.key, val);
              if (e.key === "Escape")
                setVals((p) => ({
                  ...p,
                  [r.id]: { ...p[r.id], [ch.key]: cur != null ? String(Math.round(cur)) : "" },
                }));
            }}
            style={{
              width: "100%",
              minHeight: "34px",
              padding: "6px 9px",
              borderRadius: "8px",
              border: `1.5px solid ${dirty ? "var(--color-primary)" : margin != null && margin <= 0 ? "var(--color-danger)" : border}`,
              backgroundColor: "var(--color-surface-elevated)",
              color: text,
              fontSize: "13px",
              fontWeight: 750,
              opacity: saving ? 0.5 : 1,
              fontVariantNumeric: "tabular-nums",
            }}
          />
          {hpp > 0 && (
            <button
              onClick={() => setSuggestFor({ row: r, channel: ch })}
              title={`Saran harga ${ch.label}`}
              aria-label={`Saran harga ${ch.label} untuk ${r.name}`}
              className="ui-motion-button"
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                border: `1px solid ${dirty ? "var(--color-primary)" : "transparent"}`,
                backgroundColor: "var(--color-primary-soft)",
                color: "var(--color-primary)",
                cursor: "pointer",
                fontSize: "13px",
                lineHeight: 1,
              }}
            >
              ✨
            </button>
          )}
        </div>
        <div style={{ fontSize: "11px", color: sub, lineHeight: 1.35, minHeight: "16px" }}>
          {dirty ? (
            <span style={{ color: "var(--color-primary)", fontWeight: 800 }}>
              {saving ? "Menyimpan..." : "Enter = simpan ↵"}
            </span>
          ) : margin != null ? (
            <span style={{ color: margin >= 0 ? "var(--color-success)" : "var(--color-danger)", fontWeight: 700 }}>
              {rate > 0 ? `bersih ${fmtRpShort(net)} · ` : ""}
              {margin >= 0 ? "+" : ""}
              {fmtRpShort(margin)}
            </span>
          ) : cur != null && r[ch.dateField] ? (
            <span>sejak {fmtDate(r[ch.dateField])}</span>
          ) : inheriting ? (
            <span
              style={{
                color: hpp > 0 && inheritPrice * (1 - rate) <= hpp ? "var(--color-danger)" : sub,
                fontWeight: hpp > 0 && inheritPrice * (1 - rate) <= hpp ? 800 : 600,
              }}
            >
              ↩ ikut inventory · Rp {fmtRpShort(inheritPrice)}
              {hpp > 0 && inheritPrice * (1 - rate) <= hpp ? " · ⚠ rugi" : ""}
            </span>
          ) : (
            <span> </span>
          )}
          {!dirty && margin != null && r[ch.dateField] && (
            <span> · {fmtDate(r[ch.dateField])}</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className="ui-page ui-motion-page"
      style={{
        color: text,
        backgroundColor: isVantaMode ? "transparent" : "var(--color-bg)",
      }}
    >
      <Breadcrumb title="Daftar Harga" isMobile={isMobile} isDarkMode={isDarkMode} />

      {/* Header — gaya kartu seperti Nota Penjualan */}
      <div
        className="ui-panel ui-motion-card"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.875rem",
          flexWrap: "wrap",
          gap: "10px",
          padding: isMobile ? "12px" : "12px 16px",
          borderRadius: "14px",
          backgroundColor: "var(--color-surface)",
          border: `1px solid ${border}`,
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div>
          <h1 style={{ fontSize: isMobile ? "1.1rem" : "1.3rem", fontWeight: "700", margin: 0, color: text }}>
            🏷️ Daftar Harga
          </h1>
          <div style={{ margin: "6px 0 0", display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
            {loading ? (
              <Skeleton width="220px" height="20px" />
            ) : (
              <>
                <span style={{ fontSize: "13px", color: sub }}>{rows.length} produk</span>
                <span
                  style={pillStyle(
                    "color-mix(in srgb, var(--color-success) 14%, transparent)",
                    "var(--color-success)",
                  )}
                >
                  ✓ {stats.set} sudah di-set
                </span>
                {stats.unset > 0 && (
                  <button
                    onClick={() => setOnlyUnset((v) => !v)}
                    style={{
                      ...pillStyle(
                        onlyUnset
                          ? "var(--color-primary)"
                          : "color-mix(in srgb, var(--color-warning, #f59e0b) 16%, transparent)",
                        onlyUnset ? "#FFF" : "var(--color-warning, #b45309)",
                      ),
                    }}
                  >
                    ⏳ {stats.unset} belum di-set{onlyUnset ? " ✕" : ""}
                  </button>
                )}
                {stats.loss > 0 && (
                  <button
                    onClick={() => setOnlyLoss((v) => !v)}
                    title="Harga jual (bersih setelah fee) ≤ HPP pembelian terakhir — klik untuk filter"
                    style={{
                      ...pillStyle(
                        onlyLoss
                          ? "var(--color-danger)"
                          : "color-mix(in srgb, var(--color-danger) 14%, transparent)",
                        onlyLoss ? "#FFF" : "var(--color-danger)",
                      ),
                    }}
                  >
                    ⚠️ {stats.loss} jual rugi{onlyLoss ? " ✕" : ""}
                  </button>
                )}
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
                  AI based
                </span>
              </>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={() => setShowFees(true)}
            className="ui-motion-button ui-focus-ring"
            style={{
              minHeight: "36px",
              padding: "7px 12px",
              backgroundColor: "var(--color-surface-elevated)",
              color: text,
              border: `1px solid ${border}`,
              borderRadius: "9px",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "13px",
            }}
          >
            ⚙️ Biaya Admin
          </button>
          <button
            onClick={() => setShowPrintChoice(true)}
            disabled={exporting}
            className="btn-primary ui-motion-button ui-focus-ring"
            data-magnetic="true"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              minHeight: "36px",
              padding: "7px 14px",
              backgroundColor: "var(--color-primary)",
              color: "#FFF",
              border: "none",
              borderRadius: "9px",
              cursor: exporting ? "wait" : "pointer",
              fontWeight: "700",
              fontSize: "13px",
              opacity: exporting ? 0.7 : 1,
              boxShadow: "var(--shadow-card)",
            }}
          >
            🖨️ {exporting ? "Membuat PDF..." : "Cetak A4"}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div
        className="ui-toolbar"
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "minmax(280px, 1fr) auto",
          gap: "10px",
          marginBottom: "0.875rem",
          padding: "10px",
          alignItems: "center",
          backgroundColor: "var(--color-surface)",
          border: `1px solid ${border}`,
          borderRadius: "12px",
        }}
      >
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Cari kode, nama produk, atau kategori..."
          ariaLabel="Cari produk di daftar harga"
          style={{ width: "100%" }}
          inputStyle={{ borderColor: border, color: text }}
        />
        <span
          style={{
            fontSize: "11.5px",
            color: sub,
            backgroundColor: "var(--color-bg-subtle)",
            border: `1px solid ${border}`,
            borderRadius: "999px",
            padding: "6px 10px",
            whiteSpace: isMobile ? "normal" : "nowrap",
          }}
        >
          Ketik harga → <strong>Enter</strong> = simpan (berlaku hari ini)
        </span>
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
                  return (
                    <div key={r.id} className="ui-panel" style={{ borderRadius: "14px", padding: "14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "14px", color: text, display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                            {r.name}
                            {lossChannelsFor(r, feeRateFor).length > 0 && (
                              <span
                                style={{
                                  fontSize: "9.5px",
                                  fontWeight: 800,
                                  padding: "2px 7px",
                                  borderRadius: "999px",
                                  backgroundColor: "var(--color-danger)",
                                  color: "#FFF",
                                }}
                              >
                                ⚠ RUGI
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--color-primary)", fontFamily: "monospace", margin: "2px 0 4px" }}>
                            {r.code}
                          </div>
                          <div style={{ fontSize: "11px", color: sub }}>
                            HPP {hpp > 0 ? <strong style={{ color: text }}>{fmtRp(hpp)}</strong> : <em>belum ada pembelian</em>}
                          </div>
                        </div>
                        <button
                          onClick={() => setHistoryFor(r)}
                          aria-label={`Riwayat harga ${r.name}`}
                          style={{
                            alignSelf: "flex-start",
                            padding: "6px 10px",
                            borderRadius: "8px",
                            border: `1px solid ${border}`,
                            backgroundColor: "transparent",
                            color: sub,
                            cursor: "pointer",
                            fontSize: "12px",
                          }}
                        >
                          🕘
                        </button>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" }}>
                        {CHANNELS.map((ch) => (
                          <div key={ch.key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontSize: "11px", fontWeight: 700, color: sub, width: "92px", flexShrink: 0 }}>
                              {ch.icon} {ch.label}
                            </span>
                            {priceCell(r, ch)}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          {!loading && !filtered.length && (
            <EmptyState compact icon={EmptyStateIcons.box} title="Tidak ada produk cocok" description="Coba kata kunci lain." />
          )}
        </div>
      ) : (
        /* ── DESKTOP: tabel grouped + sticky header ── */
        <div
          className="ui-panel"
          style={{
            borderRadius: "14px",
            overflow: "auto",
            maxHeight: "calc(100dvh - 230px)",
            backgroundColor: "var(--color-surface)",
            border: `1px solid ${border}`,
            boxShadow: "var(--shadow-card)",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: "13px", minWidth: "1240px" }}>
            <colgroup>
              <col style={{ width: "29%" }} />
              <col style={{ width: "17%" }} />
              <col style={{ width: "17%" }} />
              <col style={{ width: "17%" }} />
              <col style={{ width: "17%" }} />
              <col style={{ width: "3%" }} />
            </colgroup>
            <thead style={{ position: "sticky", top: 0, zIndex: 5 }}>
              <tr>
                {["Produk", "HPP Terakhir", "🏪 Offline", "🟠 Shopee", "🟢 TikTok/Tokped", ""].map((h, i) => (
                  <th
                    key={i}
                    style={{
                      padding: "9px 12px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: "700",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      color: sub,
                      borderBottom: `1px solid ${border}`,
                      whiteSpace: "nowrap",
                      backgroundColor: "var(--color-surface-elevated)",
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
                          padding: "9px 14px",
                          fontSize: "11px",
                          fontWeight: 800,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: "var(--color-primary)",
                          backgroundColor: "var(--color-primary-soft)",
                          borderBottom: `1px solid ${border}`,
                          borderTop: `1px solid ${border}`,
                        }}
                      >
                        {cat} <span style={{ color: sub, fontWeight: 600 }}>({items.length} produk)</span>
                      </td>
                    </tr>
                    {items.map((r) => {
                      const hpp = lastHppFor(r);
                      return (
                        <tr key={r.id} className="ui-row">
                          <td style={{ padding: "9px 12px", color: text, minWidth: "240px", borderBottom: `1px solid ${border}`, verticalAlign: "middle" }}>
                            <div style={{ fontWeight: "750", lineHeight: 1.35, display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                              {r.name}
                              {lossChannelsFor(r, feeRateFor).length > 0 && (
                                <span
                                  title={`Jual rugi di: ${lossChannelsFor(r, feeRateFor).map((c) => c.label).join(", ")} (harga bersih ≤ HPP ${fmtRp(lastHppFor(r))})`}
                                  style={{
                                    fontSize: "9.5px",
                                    fontWeight: 800,
                                    padding: "2px 7px",
                                    borderRadius: "999px",
                                    backgroundColor: "var(--color-danger)",
                                    color: "#FFF",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  ⚠ RUGI {lossChannelsFor(r, feeRateFor).map((c) => c.icon).join("")}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--color-primary)", fontFamily: "monospace", marginTop: "3px" }}>{r.code || "tanpa kode"}</div>
                          </td>
                          <td style={{ padding: "9px 12px", color: sub, whiteSpace: "nowrap", borderBottom: `1px solid ${border}`, verticalAlign: "middle" }}>
                            {hpp > 0 ? (
                              <>
                                <span style={{ color: text, fontWeight: 600 }}>{fmtRp(hpp)}</span>
                                <div style={{ fontSize: "10px", color: sub }}>
                                  /{r.base_unit || "pcs"}
                                  {r.last_purchase_at ? ` · beli ${fmtDate(r.last_purchase_at)}` : ""}
                                </div>
                              </>
                            ) : (
                              <em style={{ fontSize: "12px" }}>belum ada pembelian</em>
                            )}
                          </td>
                          {CHANNELS.map((ch) => (
                            <td key={ch.key} style={{ padding: "8px 8px", borderBottom: `1px solid ${border}`, verticalAlign: "middle" }}>
                              {priceCell(r, ch)}
                            </td>
                          ))}
                          <td style={{ padding: "8px 10px", borderBottom: `1px solid ${border}`, verticalAlign: "middle" }}>
                            <button
                              onClick={() => setHistoryFor(r)}
                              title="Riwayat harga"
                              aria-label={`Riwayat harga ${r.name}`}
                              className="ui-motion-button"
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "10px",
                                border: `1px solid ${border}`,
                                backgroundColor: "var(--color-surface-elevated)",
                                color: sub,
                                cursor: "pointer",
                                fontSize: "13px",
                                lineHeight: 1,
                              }}
                            >
                              🕘
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              {!loading && !filtered.length && (
                <tr>
                  <td colSpan={6} style={{ padding: "2rem 1rem" }}>
                    <EmptyState compact icon={EmptyStateIcons.box} title="Tidak ada produk cocok" description="Coba kata kunci lain." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && (
        <Pagination
          total={filtered.length}
          page={currentPage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          isMobile={isMobile}
        />
      )}

      {suggestFor && (
        <SuggestDrawer
          row={suggestFor.row}
          hpp={lastHppFor(suggestFor.row)}
          feeProfiles={feeProfiles}
          isMobile={isMobile}
          initialKey={`${suggestFor.channel.platform}|${suggestFor.channel.category}`}
          onClose={() => setSuggestFor(null)}
          onApply={(price) => {
            // simpan langsung ke saluran tempat tombol ✨ diklik
            saveChannel(suggestFor.row, suggestFor.channel.key, String(price));
            setSuggestFor(null);
          }}
        />
      )}

      {historyFor && <HistoryModal row={historyFor} isMobile={isMobile} onClose={() => setHistoryFor(null)} />}

      {showFees && (
        <FeeProfilesModal
          feeProfiles={feeProfiles}
          isMobile={isMobile}
          onClose={() => setShowFees(false)}
          onSaved={fetchFees}
          flash={flash}
        />
      )}

      {/* v1.56.4: popup pilih format cetak — tanpa HPP (customer) / dengan HPP (internal) */}
      {showPrintChoice && (
        <div
          onClick={() => setShowPrintChoice(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="ui-motion-modal"
            style={{
              backgroundColor: "var(--color-surface)",
              border: `1px solid ${border}`,
              borderRadius: "14px",
              padding: "1.25rem",
              width: "100%",
              maxWidth: "400px",
              color: text,
            }}
          >
            <h3 style={{ margin: "0 0 4px", fontSize: "15px" }}>🖨️ Cetak Daftar Harga A4</h3>
            <p style={{ margin: "0 0 14px", fontSize: "12px", color: sub }}>
              Pilih format — versi customer tidak memuat HPP.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <button
                onClick={() => handleExportPDF(false)}
                className="ui-motion-button ui-focus-ring"
                style={{
                  padding: "12px",
                  borderRadius: "10px",
                  border: "none",
                  backgroundColor: "var(--color-primary)",
                  color: "#FFF",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                🏪 Tanpa HPP — untuk customer
                <div style={{ fontSize: "11px", fontWeight: 500, opacity: 0.85, marginTop: "2px" }}>
                  Kode, nama, harga eceran & karton
                </div>
              </button>
              <button
                onClick={() => handleExportPDF(true)}
                className="ui-motion-button ui-focus-ring"
                style={{
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid var(--color-danger)",
                  backgroundColor: "var(--color-danger-soft)",
                  color: "var(--color-danger)",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                🔒 Dengan HPP — internal
                <div style={{ fontSize: "11px", fontWeight: 500, opacity: 0.85, marginTop: "2px" }}>
                  + kolom HPP & watermark peringatan. Jangan disebar ke customer.
                </div>
              </button>
              <button
                onClick={() => setShowPrintChoice(false)}
                className="ui-motion-button"
                style={{
                  padding: "9px",
                  borderRadius: "10px",
                  border: `1px solid ${border}`,
                  backgroundColor: "var(--color-surface-elevated)",
                  color: text,
                  fontWeight: 600,
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <ToastNotice message={toast} type={toastType} />}
    </div>
  );
}
