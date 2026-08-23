import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Package } from "lucide-react";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";
import { inventoryAPI } from "../../services/api";

const BASE_UNITS = ["pcs", "box", "botol", "sachet", "kg", "liter", "dus"];

function slugCode(name) {
  return (name || "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 20);
}

function uniqueCode(base, existingProducts) {
  const codes = new Set(
    (existingProducts || []).map((p) => (p.code || "").toUpperCase())
  );
  if (!base) return base;
  if (!codes.has(base)) return base;
  let i = 2;
  while (codes.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isSimilar(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return false; // exact match handled separately
  if (na.includes(nb) || nb.includes(na)) return true;
  const wordsA = new Set(na.split(" ").filter((w) => w.length >= 4));
  const wordsB = nb.split(" ").filter((w) => w.length >= 4);
  const shared = wordsB.filter((w) => wordsA.has(w));
  return shared.length >= 2;
}

export default function NewProductModal({
  isOpen,
  initialName,
  existingProducts,
  onClose,
  onCreated,
  isDarkMode,
}) {
  const bg = isDarkMode ? "var(--color-surface-elevated)" : "#FFF";
  const text = isDarkMode ? "#FFF" : "#000";
  const sub = "var(--color-text-subtle)";
  const inputBg = isDarkMode ? "var(--color-surface-raised)" : "var(--color-bg)";
  const border = isDarkMode ? "1px solid #333" : "1px solid #DDD";

  const [name, setName] = useState(initialName || "");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [baseUnit, setBaseUnit] = useState("pcs");
  const [hasPack, setHasPack] = useState(false);
  const [packUnit, setPackUnit] = useState("karton");
  const [packSize, setPackSize] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    setName(initialName || "");
    setCode(uniqueCode(slugCode(initialName), existingProducts));
    setCodeTouched(false);
    setBaseUnit("pcs");
    setHasPack(false);
    setPackUnit("karton");
    setPackSize("");
    setCategory("");
    setError("");
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialName]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const handleNameChange = (v) => {
    setName(v);
    if (!codeTouched) {
      setCode(uniqueCode(slugCode(v), existingProducts));
    }
  };

  const similar = useMemo(() => {
    if (!name.trim()) return [];
    return (existingProducts || [])
      .filter((p) => isSimilar(name, p.name))
      .slice(0, 3);
  }, [name, existingProducts]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name.trim()) return setError("Nama produk wajib diisi");
    if (!code.trim()) return setError("KODE produk wajib diisi");
    const dup = (existingProducts || []).some(
      (p) => (p.name || "").trim().toLowerCase() === name.trim().toLowerCase()
    );
    if (dup) return setError("Nama ini sudah dipakai produk lain");
    const size = Number(packSize);
    if (hasPack && (!size || size < 2)) {
      return setError("Isi per karton minimal 2");
    }

    setError("");
    setSaving(true);
    try {
      const res = await inventoryAPI.createProduct({
        name: name.trim(),
        code: code.trim(),
        base_unit: baseUnit,
        unit: baseUnit,
        pack_unit: hasPack ? packUnit.trim() || "karton" : null,
        pack_size: hasPack ? size : 1,
        category: category.trim(),
        hna: 0,
        sell_price: 0,
        min_stock: 5,
      });
      onCreated(res.data);
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "8px",
    border,
    backgroundColor: inputBg,
    color: text,
    fontSize: "14px",
    boxSizing: "border-box",
  };
  const labelStyle = {
    display: "block",
    fontSize: "12px",
    fontWeight: "600",
    color: sub,
    marginBottom: "6px",
  };

  const modal = (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
        padding: "16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ui-motion-modal ui-modal-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-product-modal-title"
        style={{
          backgroundColor: bg,
          borderRadius: "16px",
          width: "100%",
          maxWidth: "440px",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 32px 64px rgba(0,0,0,0.35)",
          padding: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              backgroundColor: "var(--color-selection, rgba(59,130,246,0.15))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Package size={20} color="var(--color-action, #3B82F6)" />
          </div>
          <h3
            id="new-product-modal-title"
            style={{ margin: 0, fontSize: "17px", fontWeight: "700", color: text }}
          >
            Produk Baru
          </h3>
        </div>

        <div style={{ marginBottom: "14px" }}>
          <label style={labelStyle}>Nama Produk</label>
          <input
            style={inputStyle}
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            autoFocus
          />
          {similar.length > 0 && (
            <div
              style={{
                marginTop: "8px",
                padding: "10px",
                borderRadius: "8px",
                backgroundColor: "var(--color-warning-soft, rgba(245,158,11,0.12))",
                fontSize: "12px",
              }}
            >
              <div style={{ color: sub, marginBottom: "6px" }}>
                Mirip dengan produk yang sudah ada — pastikan bukan barang yang sama.
              </div>
              {similar.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "4px 0",
                  }}
                >
                  <span style={{ color: text }}>{p.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      onCreated({ ...p, _reusedExisting: true });
                      onClose();
                    }}
                    style={{
                      border: "none",
                      background: "var(--color-action, #3B82F6)",
                      color: "#FFF",
                      borderRadius: "6px",
                      padding: "4px 8px",
                      fontSize: "11px",
                      cursor: "pointer",
                    }}
                  >
                    Pakai ini
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: "14px" }}>
          <label style={labelStyle}>Kode</label>
          <input
            style={inputStyle}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setCodeTouched(true);
            }}
          />
        </div>

        <div style={{ marginBottom: "14px" }}>
          <label style={labelStyle}>Satuan Dasar</label>
          <select
            style={inputStyle}
            value={baseUnit}
            onChange={(e) => setBaseUnit(e.target.value)}
          >
            {BASE_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <div style={{ fontSize: "11px", color: sub, marginTop: "4px" }}>
            satuan terkecil yang dihitung stok
          </div>
        </div>

        <div style={{ marginBottom: "14px" }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "13px",
              color: text,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={hasPack}
              onChange={(e) => setHasPack(e.target.checked)}
            />
            Dijual per karton/dus juga
          </label>
        </div>

        {hasPack && (
          <div style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Satuan Karton</label>
              <input
                style={inputStyle}
                value={packUnit}
                onChange={(e) => setPackUnit(e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Isi per Karton</label>
              <input
                type="number"
                min="2"
                style={inputStyle}
                value={packSize}
                onChange={(e) => setPackSize(e.target.value)}
              />
            </div>
          </div>
        )}

        <div style={{ marginBottom: "14px" }}>
          <label style={labelStyle}>Kategori (opsional)</label>
          <input
            style={inputStyle}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </div>

        {error && (
          <div
            style={{
              marginBottom: "14px",
              padding: "10px 12px",
              borderRadius: "8px",
              backgroundColor: "var(--color-danger-soft-strong)",
              color: "var(--color-danger)",
              fontSize: "13px",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: "12px" }}>
          <button
            type="button"
            onClick={onClose}
            className="ui-motion-button ui-focus-ring"
            style={{
              flex: 1,
              padding: "12px",
              backgroundColor: inputBg,
              color: text,
              border: "none",
              borderRadius: "10px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "600",
            }}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="ui-motion-button ui-focus-ring"
            style={{
              flex: 1,
              padding: "12px",
              backgroundColor: "var(--color-action, #3B82F6)",
              color: "#FFF",
              border: "none",
              borderRadius: "10px",
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.7 : 1,
              fontSize: "14px",
              fontWeight: "700",
            }}
          >
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined"
    ? modal
    : createPortal(modal, document.body);
}
