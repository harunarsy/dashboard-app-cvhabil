import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmModal({ isOpen, onClose, onConfirm, title, message, isDarkMode }) {
  if (!isOpen) return null;
  const bg = isDarkMode ? 'var(--color-surface-elevated)' : '#FFF';
  const text = isDarkMode ? '#FFF' : '#000';
  const sub = 'var(--color-text-subtle)';

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}>
      <div onClick={e => e.stopPropagation()} className="glass-target glass-target--clear ui-motion-modal" style={{ backgroundColor: bg, borderRadius: '16px', width: '100%', maxWidth: '360px', overflow: 'hidden', boxShadow: '0 32px 64px rgba(0,0,0,0.35)', padding: '24px', textAlign: 'center' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'var(--color-danger-soft-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <AlertTriangle size={26} color="var(--color-danger)" />
        </div>
        <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: '700', color: text }}>{title}</h3>
        <p style={{ margin: '0 0 24px', fontSize: '14px', color: sub, lineHeight: '1.4' }}>{message}</p>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={onClose} className="ui-motion-button ui-focus-ring" style={{ flex: 1, padding: '12px', backgroundColor: isDarkMode ? 'var(--color-surface-raised)' : 'var(--color-bg)', color: text, border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Batal</button>
          <button onClick={() => { onConfirm(); onClose(); }} className="ui-motion-button ui-focus-ring" style={{ flex: 1, padding: '12px', backgroundColor: 'var(--color-danger)', color: '#FFF', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '700' }}>Hapus</button>
        </div>
      </div>
    </div>
  );
}
