// RupiahInput — dual-mode input (focus=editable plain, blur=formatted display)
// Usage:
//   <RupiahInput value={hna} onChange={(v) => setHna(v)} decimals={2} />
// On blur → calls onChange with parsed number (e.g. 288288.25)
// On focus → displays editable plain number with koma decimal (e.g. "288288,25")

import { useState, useEffect } from "react";
import { formatRupiah, parseRupiah } from "../../utils/rupiah";

export default function RupiahInput({
  value,
  onChange,
  decimals = 2,
  style,
  placeholder = "0",
  className = "",
  ...rest
}) {
  const [focused, setFocused] = useState(false);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    if (!focused) {
      const n = parseFloat(value);
      setEditValue(isNaN(n) || n === 0 ? "" : String(n).replace(".", ","));
    }
  }, [value, focused]);

  // v1.10.1: coerce ke number sebelum format. Nilai dari DB bisa string "76000.00";
  // formatRupiah→parseRupiah salah anggap titik = pemisah ribuan → "7.600.000,00".
  const display = focused
    ? editValue
    : parseFloat(value) > 0
      ? formatRupiah(parseFloat(value), decimals)
      : "";
  const resolvedStyle = {
    ...style,
    ...(rest.disabled
      ? {
          backgroundColor: "var(--color-bg-subtle)",
          cursor: "not-allowed",
          color: "var(--color-text-subtle)",
        }
      : null),
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      className={`ui-form-field ui-focus-ring ${className}`.trim()}
      placeholder={focused ? "288288,25" : placeholder}
      value={display}
      style={resolvedStyle}
      onFocus={(e) => {
        setFocused(true);
        const n = parseFloat(value);
        setEditValue(isNaN(n) || n === 0 ? "" : String(n).replace(".", ","));
        if (rest.onFocus) rest.onFocus(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        const parsed = parseRupiah(editValue);
        if (parsed !== parseFloat(value)) onChange(parsed);
        if (rest.onBlur) rest.onBlur(e);
      }}
      onChange={(e) => {
        const v = e.target.value;
        if (/^[0-9.,\s]*$/.test(v)) setEditValue(v);
      }}
    />
  );
}
