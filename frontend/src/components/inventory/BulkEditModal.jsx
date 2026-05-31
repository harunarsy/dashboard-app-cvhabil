// BulkEditModal — edit massal Kode + Kategori untuk N produk terpilih (v1.11.13)
// Backend updateProduct butuh full body, jadi kita spread dari product object existing.

import React, { useState, useMemo, useEffect } from "react";
import { X, AlertCircle, CheckCircle2 } from "lucide-react";
import { inventoryAPI } from "../../services/api";
import { UI_MOTION } from "../../constants/ui";

export default function BulkEditModal({
  products,
  allProducts,
  allCategories,
  onClose,
  onSaved,
  isDarkMode,
}) {
  const [mode, setMode] = useState("both"); // 'code' | 'category' | 'both'
  const [rows, setRows] = useState(() =>
    products.map((p) => ({
      id: p.id,
      name: p.name,
      codeOld: p.code || "",
      codeNew: p.code || "",
      categoryOld: p.category || "",
      categoryNew: p.category || "",
      _full: p, // simpan full object utk spread saat save
    })),
  );
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState(null); // { success: [], failed: [] }

  const bg = isDarkMode ? "var(--color-surface-elevated)" : "#FFF";
  const text = isDarkMode ? "#FFF" : "var(--color-surface-elevated)";
  const sub = "var(--color-text-subtle)";
  const border = isDarkMode
    ? "var(--color-surface-raised)"
    : "var(--color-border)";
  const surface = isDarkMode
    ? "var(--color-surface-raised)"
    : "var(--color-bg)";
  const cellBg = isDarkMode ? "#0A0A0A" : "#FAFAFA";

  // Validate: kode duplicate check (terhadap allProducts, exclude self)
  const duplicates = useMemo(() => {
    if (mode === "category") return [];
    const allCodes = new Map(); // code → product id
    allProducts.forEach((p) => {
      const myRow = rows.find((r) => r.id === p.id);
      const code = myRow ? myRow.codeNew.trim() : (p.code || "").trim();
      if (!code) return;
      if (allCodes.has(code) && allCodes.get(code) !== p.id) {
        allCodes.set(code, "DUPE");
      } else {
        allCodes.set(code, p.id);
      }
    });
    return rows
      .filter(
        (r) => r.codeNew.trim() && allCodes.get(r.codeNew.trim()) === "DUPE",
      )
      .map((r) => r.id);
  }, [rows, allProducts, mode]);

  const updateRow = (id, field, value) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
  };

  const handleSave = async () => {
    if (duplicates.length > 0) return;
    setSaving(true);
    setProgress({ done: 0, total: rows.length });
    const success = [],
      failed = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const changedCode = mode !== "category" && r.codeNew !== r.codeOld;
      const changedCat = mode !== "code" && r.categoryNew !== r.categoryOld;
      if (!changedCode && !changedCat) {
        // skip — gak ada perubahan
        setProgress({ done: i + 1, total: rows.length });
        continue;
      }
      try {
        const full = r._full;
        await inventoryAPI.updateProduct(r.id, {
          code:
            mode !== "category" ? r.codeNew.trim() || null : full.code || null,
          name: full.name,
          unit: full.unit,
          base_unit: full.base_unit || full.unit,
          pack_unit: full.pack_unit,
          pack_size: full.pack_size,
          hna: full.hna || 0,
          sell_price: full.sell_price || 0,
          sell_price_pack: full.sell_price_pack || 0,
          category:
            mode !== "code" ? r.categoryNew.trim() : full.category || "",
          min_stock: full.min_stock || 5,
        });
        success.push(r.id);
      } catch (e) {
        failed.push({
          id: r.id,
          name: r.name,
          error: e.response?.data?.error || e.message,
        });
      }
      setProgress({ done: i + 1, total: rows.length });
    }
    setSaving(false);
    setResults({ success, failed });
    if (failed.length === 0) {
      onSaved?.(success.length);
      setTimeout(onClose, UI_MOTION.duration.settle);
    } else {
      onSaved?.(success.length); // refresh utk yg sukses
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const cellStyle = {
    padding: "8px 10px",
    fontSize: "12px",
    verticalAlign: "middle",
  };
  const inputStyle = {
    width: "100%",
    padding: "6px 10px",
    border: `1px solid ${border}`,
    borderRadius: "8px",
    background: bg,
    color: text,
    fontSize: "12px",
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  return (
    <div
      onClick={(e) => !saving && e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10100,
        padding: "1rem",
      }}
    >
      <div
        className="ui-motion-modal ui-modal-shell"
        style={{
          background: bg,
          color: text,
          borderRadius: "20px",
          width: "100%",
          maxWidth: "760px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 32px 64px rgba(0,0,0,0.35)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 22px",
            borderBottom: `1px solid ${border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "700" }}>
              Edit {rows.length} Produk
            </h3>
            <p style={{ margin: "2px 0 0", fontSize: "12px", color: sub }}>
              Update Kode &/atau Kategori. Storage backend tetap.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            aria-label="Tutup modal edit massal"
            className="ui-motion-button ui-focus-ring"
            style={{
              background: "transparent",
              border: "none",
              cursor: saving ? "wait" : "pointer",
              padding: "4px",
              opacity: saving ? 0.5 : 1,
            }}
          >
            <X size={20} color={sub} />
          </button>
        </div>

        {/* Mode selector */}
        <div
          style={{
            padding: "14px 22px 8px",
            borderBottom: `1px solid ${border}`,
          }}
        >
          <div
            style={{
              display: "inline-flex",
              background: surface,
              borderRadius: "8px",
              padding: "3px",
            }}
          >
            {[
              { key: "code", label: "Kode saja" },
              { key: "category", label: "Kategori saja" },
              { key: "both", label: "Kode + Kategori" },
            ].map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => !saving && setMode(opt.key)}
                disabled={saving}
                style={{
                  padding: "6px 14px",
                  fontSize: "12px",
                  fontWeight: "600",
                  border: "none",
                  borderRadius: "6px",
                  cursor: saving ? "wait" : "pointer",
                  background:
                    mode === opt.key ? "var(--color-primary)" : "transparent",
                  color: mode === opt.key ? "#FFF" : sub,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Warning duplicate */}
        {duplicates.length > 0 && (
          <div
            style={{
              margin: "10px 22px 0",
              padding: "10px 14px",
              background: "var(--color-danger-soft)",
              border:
                "1px solid color-mix(in srgb, var(--color-danger) 24%, transparent)",
              borderRadius: "10px",
              color: "var(--color-danger)",
              fontSize: "12px",
              fontWeight: "600",
              display: "flex",
              gap: "8px",
              alignItems: "center",
            }}
          >
            <AlertCircle size={14} />{" "}
            <span>
              {duplicates.length} kode duplikat (warna merah di tabel). Fix dulu
              sebelum simpan.
            </span>
          </div>
        )}

        {/* Table */}
        <div style={{ flex: 1, overflow: "auto", padding: "14px 22px" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "12px",
            }}
          >
            <thead>
              <tr style={{ background: cellBg }}>
                <th
                  style={{
                    ...cellStyle,
                    textAlign: "left",
                    fontWeight: "700",
                    color: sub,
                    borderBottom: `1px solid ${border}`,
                  }}
                >
                  Nama Produk
                </th>
                {mode !== "category" && (
                  <th
                    style={{
                      ...cellStyle,
                      textAlign: "left",
                      fontWeight: "700",
                      color: sub,
                      borderBottom: `1px solid ${border}`,
                      width: "34%",
                    }}
                  >
                    Kode
                  </th>
                )}
                {mode !== "code" && (
                  <th
                    style={{
                      ...cellStyle,
                      textAlign: "left",
                      fontWeight: "700",
                      color: sub,
                      borderBottom: `1px solid ${border}`,
                      width: "34%",
                    }}
                  >
                    Kategori
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const result = results?.failed.find((f) => f.id === r.id);
                const isDupe = duplicates.includes(r.id);
                const isSuccess = results?.success.includes(r.id);
                return (
                  <tr
                    key={r.id}
                    style={{ borderBottom: `1px solid ${border}` }}
                  >
                    <td
                      style={{ ...cellStyle, color: text, fontWeight: "500" }}
                    >
                      {r.name}
                      {isSuccess && (
                        <CheckCircle2
                          size={12}
                          color="var(--color-success)"
                          style={{ marginLeft: "6px", verticalAlign: "middle" }}
                        />
                      )}
                      {result && (
                        <span
                          style={{
                            display: "block",
                            fontSize: "10px",
                            color: "var(--color-danger)",
                            marginTop: "2px",
                          }}
                        >
                          ⚠ {result.error}
                        </span>
                      )}
                    </td>
                    {mode !== "category" && (
                      <td style={cellStyle}>
                        <input
                          type="text"
                          value={r.codeNew}
                          onChange={(e) =>
                            updateRow(r.id, "codeNew", e.target.value)
                          }
                          disabled={saving}
                          placeholder={r.codeOld || "(kosong)"}
                          style={{
                            ...inputStyle,
                            borderColor: isDupe
                              ? "var(--color-danger)"
                              : border,
                            background: isDupe
                              ? "var(--color-danger-soft)"
                              : bg,
                          }}
                        />
                        {r.codeOld && r.codeOld !== r.codeNew && (
                          <p
                            style={{
                              margin: "2px 0 0",
                              fontSize: "10px",
                              color: sub,
                            }}
                          >
                            lama:{" "}
                            <span style={{ fontFamily: "monospace" }}>
                              {r.codeOld}
                            </span>
                          </p>
                        )}
                      </td>
                    )}
                    {mode !== "code" && (
                      <td style={cellStyle}>
                        <input
                          type="text"
                          value={r.categoryNew}
                          onChange={(e) =>
                            updateRow(r.id, "categoryNew", e.target.value)
                          }
                          disabled={saving}
                          placeholder={r.categoryOld || "(kosong)"}
                          list="bulk-category-list"
                          style={inputStyle}
                        />
                        {r.categoryOld && r.categoryOld !== r.categoryNew && (
                          <p
                            style={{
                              margin: "2px 0 0",
                              fontSize: "10px",
                              color: sub,
                            }}
                          >
                            lama: {r.categoryOld}
                          </p>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <datalist id="bulk-category-list">
            {allCategories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 22px",
            borderTop: `1px solid ${border}`,
            display: "flex",
            gap: "10px",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {saving ? (
            <div style={{ fontSize: "12px", color: sub, fontWeight: "600" }}>
              Menyimpan {progress.done}/{progress.total}...
            </div>
          ) : results ? (
            <div style={{ fontSize: "12px", fontWeight: "600" }}>
              <span style={{ color: "var(--color-success)" }}>
                ✓ {results.success.length} berhasil
              </span>
              {results.failed.length > 0 && (
                <span
                  style={{ color: "var(--color-danger)", marginLeft: "8px" }}
                >
                  · {results.failed.length} gagal
                </span>
              )}
            </div>
          ) : (
            <div style={{ fontSize: "12px", color: sub }}>
              {rows.length} produk siap di-edit
            </div>
          )}
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={onClose}
              disabled={saving}
              style={{
                padding: "10px 18px",
                background: surface,
                color: text,
                border: `1px solid ${border}`,
                borderRadius: "10px",
                fontWeight: "600",
                fontSize: "13px",
                cursor: saving ? "wait" : "pointer",
              }}
            >
              Tutup
            </button>
            {!results && (
              <button
                onClick={handleSave}
                disabled={saving || duplicates.length > 0}
                style={{
                  padding: "10px 22px",
                  background:
                    duplicates.length > 0 ? "#999" : "var(--color-primary)",
                  color: "#FFF",
                  border: "none",
                  borderRadius: "10px",
                  fontWeight: "600",
                  fontSize: "13px",
                  cursor:
                    saving || duplicates.length > 0 ? "not-allowed" : "pointer",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "Menyimpan..." : "Simpan Semua"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
