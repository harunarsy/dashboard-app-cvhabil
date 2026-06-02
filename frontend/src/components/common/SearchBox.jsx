import React from "react";
import { Search, X } from "lucide-react";

export default function SearchBox({
  value,
  onChange,
  placeholder,
  ariaLabel = "Cari",
  style = {},
  inputStyle = {},
}) {
  return (
    <div className="ui-search-box" style={style}>
      <Search size={16} className="ui-search-box__icon" aria-hidden="true" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="ui-search-box__input ui-focus-ring"
        style={inputStyle}
      />
      {value ? (
        <button
          type="button"
          aria-label="Hapus pencarian"
          className="ui-search-box__clear ui-motion-button ui-focus-ring"
          onClick={() => onChange("")}
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}
