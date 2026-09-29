import React, { useEffect, useId, useState } from "react";
import { expiryDate, expiryInputValue } from "../../utils/expiry";

const MONTH_OPTIONS = [
  ["01", "Jan"],
  ["02", "Feb"],
  ["03", "Mar"],
  ["04", "Apr"],
  ["05", "Mei"],
  ["06", "Jun"],
  ["07", "Jul"],
  ["08", "Agu"],
  ["09", "Sep"],
  ["10", "Okt"],
  ["11", "Nov"],
  ["12", "Des"],
];

// v1.67.23: nilai bentuk YYYY-MM SELALU dibuka mode bulan walau metadata presisi
// hilang (mis. data lama/draft), supaya tanggal tidak pernah ter-render kosong.
const initialMode = (value, precision) => {
  if (precision === "month") return "month";
  if (/^\d{4}-\d{2}$/.test(String(value ?? "").trim())) return "month";
  return value ? "day" : "month";
};

const monthYearOf = (value) => {
  const match = String(value ?? "").trim().match(/^(\d{4})-(\d{2})/);
  return match ? { year: match[1], month: match[2] } : { year: "", month: "" };
};

const yearChoices = (selected) => {
  const now = new Date().getFullYear();
  const years = [];
  for (let year = now - 3; year <= now + 12; year += 1) years.push(String(year));
  if (selected && !years.includes(selected)) years.unshift(selected);
  return years;
};

export default function ExpiryInput({ value, precision, onChange, style, className, ...props }) {
  const id = useId();
  const [mode, setMode] = useState(() => initialMode(value, precision));
  // Tahun yang sudah dipilih tapi bulannya belum (biar pilihan tidak mental balik).
  const [pendingYear, setPendingYear] = useState("");

  useEffect(() => {
    if (value) setMode(initialMode(value, precision));
  }, [value, precision]);

  const disabled = Boolean(props.disabled || props.readOnly);

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

  const { year, month } = monthYearOf(value);
  const activeYear = year || pendingYear;
  const selectMonth = (nextMonth) => {
    if (!nextMonth) {
      onChange(null, null);
      return;
    }
    onChange(`${activeYear || new Date().getFullYear()}-${nextMonth}`, "month");
  };
  const selectYear = (nextYear) => {
    setPendingYear(nextYear);
    if (nextYear && month) onChange(`${nextYear}-${month}`, "month");
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", minWidth: 0 }}>
      <select
        aria-label="Presisi ED"
        value={mode}
        onChange={changeMode}
        disabled={disabled}
        className="ui-focus-ring"
        style={{ ...inputStyle, width: "auto", flex: "1 1 120px" }}
      >
        <option value="month">Bulan/tahun</option>
        <option value="day">Tanggal lengkap</option>
      </select>
      {mode === "month" ? (
        <>
          <select
            aria-label="Bulan ED"
            value={month}
            onChange={(event) => selectMonth(event.target.value)}
            disabled={disabled}
            className="ui-focus-ring"
            style={{ ...inputStyle, width: "auto", flex: "1 1 96px" }}
          >
            <option value="">Bulan</option>
            {MONTH_OPTIONS.map(([optionValue, label]) => (
              <option key={optionValue} value={optionValue}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="Tahun ED"
            value={activeYear}
            onChange={(event) => selectYear(event.target.value)}
            disabled={disabled}
            className="ui-focus-ring"
            style={{ ...inputStyle, width: "auto", flex: "1 1 96px" }}
          >
            <option value="">Tahun</option>
            {yearChoices(activeYear).map((optionYear) => (
              <option key={optionYear} value={optionYear}>
                {optionYear}
              </option>
            ))}
          </select>
        </>
      ) : (
        <input
          {...props}
          id={props.id || id}
          aria-label={props["aria-label"] || "ED"}
          className={className || "ui-focus-ring"}
          type="date"
          value={expiryInputValue(value, "day")}
          onChange={(event) => onChange(event.target.value || null, event.target.value ? "day" : null)}
          style={{ ...inputStyle, flex: "2 1 140px" }}
        />
      )}
    </div>
  );
}
