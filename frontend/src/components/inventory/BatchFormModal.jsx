import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { inventoryAPI } from "../../services/api";
import { parseRupiah } from "../../utils/rupiah";
import HnaHppInput from "../common/HnaHppInput";
import Icons from "../common/Icon";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";
import FieldError from "../common/FieldError";

// Modal untuk add (qty initial via stockIn) atau edit metadata batch.
// Mode 'add' → POST stock-in (membuat batch baru + mutation). Mode 'edit' → PUT batch (metadata only).
export default function BatchFormModal({
  mode,
  batch,
  productId,
  productName,
  onClose,
  onSaved,
  isDarkMode,
}) {
  const isEdit = mode === "edit";
  const [form, setForm] = useState({
    batch_no: "",
    expired_date: "",
    qty: 1,
    hna: 0,
    notes: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useBodyScrollLock(true);

  useEffect(() => {
    if (isEdit && batch) {
      setForm({
        batch_no: batch.batch_no || "",
        expired_date: batch.expired_date
          ? batch.expired_date.split("T")[0]
          : "",
        qty: batch.qty_current || 0,
        hna: parseFloat(batch.hna) || 0,
        notes: batch.notes || "",
      });
    }
  }, [isEdit, batch]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const bg = isDarkMode ? "var(--color-surface-elevated)" : "#FFF";
  const border = isDarkMode
    ? "var(--color-surface-raised)"
    : "var(--color-border)";
  const text = isDarkMode ? "#FFF" : "#000";
  const sub = "var(--color-text-subtle)";
  const inputBg = isDarkMode
    ? "var(--color-surface-raised)"
    : "var(--color-bg)";

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    border: `1px solid ${border}`,
    borderRadius: "10px",
    backgroundColor: inputBg,
    color: text,
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  };
  const labelStyle = {
    display: "block",
    fontSize: "11px",
    fontWeight: "700",
    color: sub,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "6px",
  };

  const handleSave = async () => {
    setError("");
    if (isEdit) {
      setSaving(true);
      try {
        await inventoryAPI.updateBatch(batch.id, {
          batch_no: form.batch_no || null,
          expired_date: form.expired_date || null,
          hna: parseRupiah(form.hna),
          notes: form.notes || null,
        });
        onSaved?.();
        onClose();
      } catch (e) {
        setError(e.response?.data?.error || e.message);
      } finally {
        setSaving(false);
      }
    } else {
      // Add new batch via stock-in (qty + creates mutation)
      const qty = parseInt(form.qty);
      if (!qty || qty <= 0) {
        setError("Qty harus lebih dari 0");
        return;
      }
      setSaving(true);
      try {
        await inventoryAPI.stockIn({
          product_id: productId,
          batch_no: form.batch_no || null,
          expired_date: form.expired_date || null,
          qty,
          hna: parseRupiah(form.hna),
          source_type: "manual",
          notes:
            form.notes || `Batch baru: ${form.batch_no || "(no batch no)"}`,
        });
        onSaved?.();
        onClose();
      } catch (e) {
        setError(e.response?.data?.error || e.message);
      } finally {
        setSaving(false);
      }
    }
  };

  const modal = (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10050,
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
          maxWidth: "480px",
          padding: "24px",
          boxShadow: "0 32px 64px rgba(0,0,0,0.35)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "4px",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "700" }}>
            {isEdit ? "Edit Batch" : "Batch Baru"}
          </h3>
          <button
            onClick={onClose}
            aria-label="Tutup"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: sub,
              padding: "4px",
            }}
          >
            <Icons.X size={20} />
          </button>
        </div>
        {productName && (
          <p style={{ margin: "0 0 16px", fontSize: "13px", color: sub }}>
            {productName}
          </p>
        )}

        <FieldError message={error} visible={!!error} />

        <div style={{ display: "grid", gap: "14px" }}>
          <div>
            <label style={labelStyle}>No. Batch</label>
            <input
              type="text"
              value={form.batch_no}
              onChange={(e) => setForm({ ...form, batch_no: e.target.value })}
              placeholder="contoh: B2603-01"
              className="ui-form-field ui-focus-ring"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Tanggal Expired</label>
            <input
              type="date"
              value={form.expired_date}
              onChange={(e) =>
                setForm({ ...form, expired_date: e.target.value })
              }
              className="ui-form-field ui-focus-ring"
              style={inputStyle}
            />
          </div>
          {!isEdit && (
            <div>
              <label style={labelStyle}>Qty Awal *</label>
              <input
                type="number"
                min="1"
                value={form.qty}
                onChange={(e) => setForm({ ...form, qty: e.target.value })}
                className="ui-form-field ui-focus-ring"
                style={inputStyle}
              />
            </div>
          )}
          <HnaHppInput
            value={form.hna}
            onChange={(v) => setForm({ ...form, hna: v })}
            decimals={2}
            isDarkMode={isDarkMode}
          />
          <div>
            <label style={labelStyle}>Catatan</label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="opsional"
              className="ui-form-field ui-focus-ring"
              style={inputStyle}
            />
          </div>
          {isEdit && (
            <p
              style={{
                margin: 0,
                fontSize: "11px",
                color: sub,
                lineHeight: 1.5,
              }}
            >
              Qty tidak bisa di-edit di sini untuk preserve audit trail. Pakai
              tombol <strong>Adjust</strong> di list batch.
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1,
              padding: "12px",
              background: "var(--color-primary)",
              color: "#FFF",
              border: "none",
              borderRadius: "12px",
              fontWeight: "600",
              fontSize: "14px",
              cursor: saving ? "wait" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              flex: 1,
              padding: "12px",
              background: inputBg,
              color: text,
              border: `1px solid ${border}`,
              borderRadius: "12px",
              fontWeight: "600",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  );
  return typeof document === "undefined"
    ? modal
    : createPortal(modal, document.body);
}
