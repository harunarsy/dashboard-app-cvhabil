// HnaHppInput — dual input HNA (exc PPN) + HPP (inc PPN 11%) locked sync (v1.11.9)
// Storage = HNA (SSOT). Edit salah satu → yg lain auto-compute.
// Usage: <HnaHppInput value={hna} onChange={(hna) => setHna(hna)} decimals={2} />

import RupiahInput from './RupiahInput';
import { hppFromHna, hnaFromHpp } from '../../utils/rupiah';

export default function HnaHppInput({ value, onChange, decimals = 2, isDarkMode = false, disabled = false }) {
  const text = 'var(--color-text)';
  const sub = isDarkMode ? 'var(--color-text-subtle)' : 'var(--color-text-muted)';
  const bg = isDarkMode ? 'var(--color-surface-elevated)' : '#FFFFFF';
  const border = isDarkMode ? 'var(--color-border-strong)' : 'var(--color-border)';

  const inputStyle = {
    width: '100%',
    padding: '11px 14px',
    background: bg,
    color: text,
    border: `1px solid ${border}`,
    borderRadius: '12px',
    fontSize: '14px',
    outline: 'none',
    fontFamily: 'inherit',
  };

  const labelStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    color: sub,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight: 600,
    marginBottom: '6px',
  };

  const hppValue = hppFromHna(value || 0);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
      <div>
        <label style={labelStyle} title="HNA = harga modal mentah, sebelum PPN 11%">
          HNA (exc PPN)
          <span style={{ fontSize: '10px', color: sub, fontWeight: 400 }}>ⓘ</span>
        </label>
        <RupiahInput
          value={value}
          onChange={(v) => onChange(v)}
          decimals={decimals}
          style={inputStyle}
          disabled={disabled}
        />
      </div>
      <div>
        <label style={labelStyle} title="HPP = HNA + PPN 11%. Edit di sini = otomatis simpan sebagai HNA exc PPN.">
          HPP (inc PPN 11%)
          <span style={{ fontSize: '10px', color: sub, fontWeight: 400 }}>ⓘ</span>
        </label>
        <RupiahInput
          value={hppValue}
          onChange={(v) => onChange(hnaFromHpp(v))}
          decimals={decimals}
          style={inputStyle}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
