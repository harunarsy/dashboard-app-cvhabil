// RupiahInput — dual-mode input (focus=editable plain, blur=formatted display)
// Usage:
//   <RupiahInput value={hna} onChange={(v) => setHna(v)} decimals={2} />
// On blur → calls onChange with parsed number (e.g. 288288.25)
// On focus → displays editable plain number with koma decimal (e.g. "288288,25")

import { useState, useEffect } from 'react';
import { formatRupiah, parseRupiah } from '../../utils/rupiah';

export default function RupiahInput({ value, onChange, decimals = 2, style, placeholder = '0', ...rest }) {
  const [focused, setFocused] = useState(false);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    if (!focused) {
      const n = parseFloat(value);
      setEditValue(isNaN(n) || n === 0 ? '' : String(n).replace('.', ','));
    }
  }, [value, focused]);

  const display = focused
    ? editValue
    : (parseFloat(value) > 0 ? formatRupiah(value, decimals) : '');

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      placeholder={focused ? '288288,25' : placeholder}
      value={display}
      style={style}
      onFocus={(e) => {
        setFocused(true);
        const n = parseFloat(value);
        setEditValue(isNaN(n) || n === 0 ? '' : String(n).replace('.', ','));
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
