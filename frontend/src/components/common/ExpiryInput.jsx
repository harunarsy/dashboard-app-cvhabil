import React, { useEffect, useId, useState } from "react";
import { expiryDate, expiryInputValue } from "../../utils/expiry";

const initialMode = (value, precision) =>
  precision === "month" ? "month" : value ? "day" : "month";

export default function ExpiryInput({ value, precision, onChange, style, className, ...props }) {
  const id = useId();
  const [mode, setMode] = useState(() => initialMode(value, precision));
  useEffect(() => {
    if (value) setMode(initialMode(value, precision));
  }, [value, precision]);

  const changeMode = (event) => {
    const nextMode = event.target.value;
    setMode(nextMode);
    if (!value) return;
    if (nextMode === "month") {
      onChange(expiryInputValue(value, precision).slice(0, 7), "month");
    } else {
      const date = expiryDate(value, precision);
      onChange(date ? expiryInputValue(value) : null, date ? "day" : null);
    }
  };

  const inputStyle = {
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    background: "var(--color-surface)",
    color: "var(--color-text)",
    padding: "8px",
    minHeight: "44px",
    ...style,
    minWidth: 0,
    width: "100%",
    boxSizing: "border-box",
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", minWidth: 0 }}>
      <select
        aria-label="Presisi ED"
        value={mode}
        onChange={changeMode}
        disabled={props.disabled || props.readOnly}
        className="ui-focus-ring"
        style={{ ...inputStyle, width: "auto", flex: "1 1 120px" }}
      >
        <option value="month">Bulan/tahun</option>
        <option value="day">Tanggal lengkap</option>
      </select>
      <input
        {...props}
        id={props.id || id}
        aria-label={props["aria-label"] || "ED"}
        className={className || "ui-focus-ring"}
        type={mode === "month" ? "month" : "date"}
        value={expiryInputValue(value, mode)}
        onChange={(event) => onChange(event.target.value || null, event.target.value ? mode : null)}
        style={{ ...inputStyle, flex: "2 1 140px" }}
      />
    </div>
  );
}
