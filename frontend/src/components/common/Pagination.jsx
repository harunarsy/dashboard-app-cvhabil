// v1.50.0: kontrol pagination reusable (select jumlah/hal + prev/next + ringkasan).
// pageSize -1 = "Semua". Pakai CSS var → otomatis light/dark.
import React from "react";

export default function Pagination({
  total = 0,
  page = 1,
  pageSize = 20,
  onPageChange,
  onPageSizeChange,
  options = [10, 20, 50],
  allowAll = true,
  isMobile = false,
}) {
  if (!total) return null;
  const showAll = pageSize === -1;
  const eff = showAll ? Math.max(1, total) : pageSize;
  const totalPages = Math.max(1, Math.ceil(total / eff));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = showAll ? 1 : (safePage - 1) * pageSize + 1;
  const end = showAll ? total : Math.min(safePage * pageSize, total);

  const sub = "var(--color-text-muted)";
  const border = "var(--color-border)";
  const selectStyle = {
    padding: "6px 8px",
    border: `1px solid ${border}`,
    borderRadius: "8px",
    backgroundColor: "var(--color-surface-elevated)",
    color: "var(--color-text)",
    fontSize: "13px",
    cursor: "pointer",
  };
  const navBtn = (disabled) => ({
    minWidth: "34px",
    minHeight: "34px",
    padding: "6px 10px",
    border: `1px solid ${border}`,
    borderRadius: "8px",
    backgroundColor: "var(--color-surface-elevated)",
    color: disabled ? "var(--color-text-subtle)" : "var(--color-text)",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: "13px",
    fontWeight: 600,
    opacity: disabled ? 0.5 : 1,
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        flexWrap: "wrap",
        marginTop: "14px",
        fontSize: "13px",
        color: sub,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span>Tampilkan</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
          className="ui-focus-ring"
          style={selectStyle}
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
          {allowAll && <option value={-1}>Semua</option>}
        </select>
        {!isMobile && <span>per halaman</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {start}–{end} dari {total}
        </span>
        {!showAll && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <button
              type="button"
              className="ui-motion-button ui-focus-ring"
              onClick={() => onPageChange?.(safePage - 1)}
              disabled={safePage <= 1}
              style={navBtn(safePage <= 1)}
              aria-label="Halaman sebelumnya"
            >
              ‹
            </button>
            <span style={{ fontVariantNumeric: "tabular-nums", minWidth: "64px", textAlign: "center" }}>
              Hal {safePage}/{totalPages}
            </span>
            <button
              type="button"
              className="ui-motion-button ui-focus-ring"
              onClick={() => onPageChange?.(safePage + 1)}
              disabled={safePage >= totalPages}
              style={navBtn(safePage >= totalPages)}
              aria-label="Halaman berikutnya"
            >
              ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
