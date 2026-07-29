import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  FileDown,
  Barcode,
  LayoutGrid,
  Settings2,
  AlertCircle,
} from "lucide-react";
import { printSettingsAPI } from "../../services/api";
import { UI_SIZE } from "../../constants/ui";
import Icons from "../common/Icon";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";
import { importWithReload } from "../../utils/importWithReload";

export default function PrintBarcodeModal({
  products,
  isDarkMode,
  onClose,
  onGenerated,
}) {
  const [rows, setRows] = useState([]);
  const [layout, setLayout] = useState("21");
  const [customRows, setCustomRows] = useState(7);
  const [customCols, setCustomCols] = useState(3);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const bg = isDarkMode ? "var(--color-surface-elevated)" : "#FFF";
  const border = isDarkMode
    ? "var(--color-surface-raised)"
    : "var(--color-border)";
  const text = isDarkMode ? "#FFF" : "#000";
  const sub = "var(--color-text-subtle)";
  const surface = isDarkMode
    ? "var(--color-surface-raised)"
    : "var(--color-bg)";
  useBodyScrollLock(true);
  useEffect(() => {
    setRows(
      (products || []).map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code || "",
        qty: 1,
      })),
    );
  }, [products]);
  const missingCodeCount = useMemo(
    () => rows.filter((r) => !String(r.code || "").trim()).length,
    [rows],
  );
  const printableRows = useMemo(
    () => rows.filter((r) => String(r.code || "").trim()),
    [rows],
  );
  const updateRow = (id, field, value) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
  };
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !generating) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [generating, onClose]);
  const handleGenerate = async () => {
    setError("");
    if (printableRows.length === 0) {
      setError("Tidak ada produk berkode untuk dicetak");
      return;
    }
    const invalidQty = printableRows.find((r) => {
      const qty = parseInt(r.qty, 10) || 0;
      return qty < 1 || qty > 100;
    });
    if (invalidQty) {
      setError(`Qty stiker untuk "${invalidQty.name}" harus 1-100`);
      return;
    }
    setGenerating(true);
    try {
      let settings = {};
      try {
        const { data } = await printSettingsAPI.get();
        settings = data?.nota_layout || data || {};
      } catch (err) {
        console.warn(
          "Print settings tidak tersedia, pakai default layout barcode.",
          err,
        );
      }
      const { generateBarcodePDF } =
        await importWithReload(() => import("../../utils/generateBarcodePDF"));
      const { doc, skippedCount } = await generateBarcodePDF(rows, {
        layout,
        customLayout: { rows: customRows, cols: customCols },
        companyName: settings.company_name || settings.shop_name,
      });
      doc.save(`Barcode_Stiker_${new Date().toISOString().slice(0, 10)}.pdf`);
      onGenerated?.({
        skippedCount,
        total: rows.length,
        printed: printableRows.length,
      });
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setGenerating(false);
    }
  };
  const modal = (
    <div
      onClick={(e) => e.target === e.currentTarget && !generating && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10150,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      {" "}
      <div
        className="ui-motion-modal ui-modal-shell"
        style={{
          background: bg,
          color: text,
          borderRadius: "20px",
          width: "100%",
          maxWidth: "920px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 32px 64px rgba(0,0,0,0.35)",
          overflow: "hidden",
        }}
      >
        {" "}
        <div
          style={{
            padding: "18px 22px",
            borderBottom: `1px solid ${border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
          }}
        >
          {" "}
          <div>
            {" "}
            <h3
              style={{
                margin: 0,
                fontSize: "18px",
                fontWeight: "800",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              {" "}
              <Barcode size={18} color="var(--color-primary)" /> Cetak Stiker
              Barcode{" "}
            </h3>{" "}
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: sub }}>
              {" "}
              {rows.length} produk dipilih · {missingCodeCount} tanpa kode akan
              dilewati{" "}
            </p>{" "}
          </div>{" "}
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            aria-label="Tutup modal print barcode"
            className="ui-motion-button ui-focus-ring"
            style={{
              width: "40px",
              height: "40px",
              border: "none",
              borderRadius: "12px",
              background: surface,
              color: text,
              cursor: generating ? "wait" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {" "}
            <Icons.X size={UI_SIZE.icon.lg} />{" "}
          </button>{" "}
        </div>{" "}
        <div
          style={{
            padding: "16px 22px",
            borderBottom: `1px solid ${border}`,
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr",
            gap: "12px",
          }}
        >
          {" "}
          <div style={{ display: "grid", gap: "10px" }}>
            {" "}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "12px",
                fontWeight: "800",
                color: sub,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {" "}
              <LayoutGrid size={14} /> Layout{" "}
            </div>{" "}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {" "}
              {[
                ["21", "21 per A4 (3×7)"],
                ["33", "33 per A4 (3×11)"],
                ["custom", "Custom"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setLayout(key)}
                  className="ui-motion-button ui-focus-ring"
                  style={{
                    minHeight: "38px",
                    padding: "0 14px",
                    borderRadius: "12px",
                    border: `1px solid ${layout === key ? "var(--color-primary)" : border}`,
                    background:
                      layout === key ? "var(--color-primary)" : surface,
                    color: layout === key ? "#FFF" : text,
                    fontWeight: "800",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  {" "}
                  {label}{" "}
                </button>
              ))}{" "}
            </div>{" "}
            {layout === "custom" && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                  maxWidth: "320px",
                }}
              >
                {" "}
                <div>
                  {" "}
                  <label
                    style={{
                      display: "block",
                      fontSize: "11px",
                      fontWeight: "700",
                      color: sub,
                      textTransform: "uppercase",
                      marginBottom: "6px",
                    }}
                  >
                    Kolom
                  </label>{" "}
                  <input
                    type="number"
                    min="1"
                    max="6"
                    value={customCols}
                    onChange={(e) =>
                      setCustomCols(parseInt(e.target.value, 10) || 3)
                    }
                    style={inputStyle(border, bg, text)}
                  />{" "}
                </div>{" "}
                <div>
                  {" "}
                  <label
                    style={{
                      display: "block",
                      fontSize: "11px",
                      fontWeight: "700",
                      color: sub,
                      textTransform: "uppercase",
                      marginBottom: "6px",
                    }}
                  >
                    Baris
                  </label>{" "}
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={customRows}
                    onChange={(e) =>
                      setCustomRows(parseInt(e.target.value, 10) || 7)
                    }
                    style={inputStyle(border, bg, text)}
                  />{" "}
                </div>{" "}
              </div>
            )}{" "}
          </div>{" "}
          <div style={{ display: "grid", gap: "10px" }}>
            {" "}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "12px",
                fontWeight: "800",
                color: sub,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {" "}
              <Settings2 size={14} /> Keterangan{" "}
            </div>{" "}
            <div
              style={{
                padding: "12px 14px",
                border: `1px solid ${border}`,
                borderRadius: "14px",
                background: surface,
                display: "flex",
                gap: "10px",
                alignItems: "flex-start",
              }}
            >
              {" "}
              <AlertCircle
                size={16}
                color="var(--color-warning)"
                style={{ flexShrink: 0, marginTop: "1px" }}
              />{" "}
              <p
                style={{
                  margin: 0,
                  fontSize: "12px",
                  color: sub,
                  lineHeight: 1.5,
                }}
              >
                {" "}
                Qty stiker maksimum 100 per produk. Produk tanpa kode otomatis
                dilewati saat generate PDF.{" "}
              </p>{" "}
            </div>{" "}
            {missingCodeCount > 0 && (
              <div
                style={{
                  padding: "12px 14px",
                  border:
                    "1px solid color-mix(in srgb, var(--color-danger) 24%, transparent)",
                  borderRadius: "14px",
                  background: "var(--color-danger-soft)",
                  color: "var(--color-danger)",
                  fontSize: "12px",
                  fontWeight: "700",
                }}
              >
                {" "}
                {missingCodeCount} produk tidak punya kode dan akan
                dilewati.{" "}
              </div>
            )}{" "}
          </div>{" "}
        </div>{" "}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 22px" }}>
          {" "}
          <div
            style={{
              border: `1px solid ${border}`,
              borderRadius: "16px",
              overflow: "hidden",
            }}
          >
            {" "}
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "13px",
              }}
            >
              {" "}
              <thead>
                {" "}
                <tr style={{ background: surface }}>
                  {" "}
                  <th style={thStyle}>Nama Produk</th>{" "}
                  <th style={thStyle}>Kode</th>{" "}
                  <th
                    style={{ ...thStyle, width: "140px", textAlign: "center" }}
                  >
                    Qty Stiker
                  </th>{" "}
                </tr>{" "}
              </thead>{" "}
              <tbody>
                {" "}
                {rows.map((row) => {
                  const hasCode = Boolean(String(row.code || "").trim());
                  return (
                    <tr
                      key={row.id}
                      style={{
                        borderTop: `1px solid ${border}`,
                        opacity: hasCode ? 1 : 0.55,
                      }}
                    >
                      {" "}
                      <td
                        style={{ ...tdStyle, fontWeight: "700", color: text }}
                      >
                        {row.name}
                      </td>{" "}
                      <td
                        style={{
                          ...tdStyle,
                          fontFamily: "monospace",
                          color: hasCode ? text : "var(--color-danger)",
                        }}
                      >
                        {hasCode ? row.code : "(tanpa kode)"}
                      </td>{" "}
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        {" "}
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={row.qty}
                          onChange={(e) =>
                            updateRow(row.id, "qty", e.target.value)
                          }
                          style={{
                            ...inputStyle(border, bg, text),
                            textAlign: "center",
                            maxWidth: "96px",
                            margin: "0 auto",
                          }}
                        />{" "}
                      </td>{" "}
                    </tr>
                  );
                })}{" "}
              </tbody>{" "}
            </table>{" "}
          </div>{" "}
        </div>{" "}
        <div
          style={{
            padding: "14px 22px",
            borderTop: `1px solid ${border}`,
            display: "flex",
            alignItems: "center",
            gap: "12px",
            justifyContent: "space-between",
          }}
        >
          {" "}
          <div style={{ flex: 1 }}>
            {" "}
            {error ? (
              <p
                style={{
                  margin: 0,
                  color: "var(--color-danger)",
                  fontSize: "13px",
                  fontWeight: "700",
                }}
              >
                {error}
              </p>
            ) : (
              <p style={{ margin: 0, color: sub, fontSize: "12px" }}>
                {" "}
                Total stiker:{" "}
                <strong style={{ color: text }}>
                  {printableRows.reduce(
                    (s, r) =>
                      s + Math.max(1, Math.min(100, parseInt(r.qty, 10) || 1)),
                    0,
                  )}
                </strong>{" "}
                {missingCodeCount > 0
                  ? ` · ${missingCodeCount} produk dilewati`
                  : ""}{" "}
              </p>
            )}{" "}
          </div>{" "}
          <div style={{ display: "flex", gap: "10px" }}>
            {" "}
            <button
              onClick={onClose}
              disabled={generating}
              className="ui-motion-button ui-focus-ring"
              style={secondaryBtn(surface, text, border)}
            >
              Batal
            </button>{" "}
            <button
              onClick={handleGenerate}
              disabled={generating || printableRows.length === 0}
              className="ui-motion-button ui-focus-ring"
              style={{
                minWidth: "160px",
                padding: "12px 16px",
                background:
                  printableRows.length === 0
                    ? "var(--color-text-subtle)"
                    : "var(--color-primary)",
                color: "#FFF",
                border: "none",
                borderRadius: "12px",
                fontWeight: "800",
                fontSize: "13px",
                cursor:
                  generating || printableRows.length === 0
                    ? "not-allowed"
                    : "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {" "}
              <FileDown size={16} />{" "}
              {generating ? "Generating..." : "Generate PDF"}{" "}
            </button>{" "}
          </div>{" "}
        </div>{" "}
      </div>{" "}
    </div>
  );
  return typeof document === "undefined"
    ? modal
    : createPortal(modal, document.body);
}
const inputStyle = (border, bg, text) => ({
  width: "100%",
  minHeight: "38px",
  padding: "8px 10px",
  border: `1px solid ${border}`,
  borderRadius: "10px",
  background: bg,
  color: text,
  fontSize: "14px",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
});
const thStyle = {
  padding: "12px 14px",
  textAlign: "left",
  fontSize: "11px",
  fontWeight: "800",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--color-text-subtle)",
};
const tdStyle = { padding: "12px 14px", verticalAlign: "middle" };
const secondaryBtn = (surface, text, border) => ({
  minHeight: "44px",
  padding: "0 16px",
  background: surface,
  color: text,
  border: `1px solid ${border}`,
  borderRadius: "12px",
  fontWeight: "800",
  fontSize: "13px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
});
