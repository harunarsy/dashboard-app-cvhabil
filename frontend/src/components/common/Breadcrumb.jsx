import React from 'react';
import { ChevronRight, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { UI_MOTION, uiTransition } from '../../constants/ui';

// v1.35.0: + count badge (mis "100 nota tercatat") + rightSlot (tombol aksi sejajar breadcrumb).
export default function Breadcrumb({ title, count, rightSlot, isMobile, isDarkMode }) {
  const navigate = useNavigate();
  const text = isDarkMode ? '#FFF' : '#000';
  const sub = 'var(--color-text-subtle)';

  const countBadge = count != null && count !== '' && (
    <span
      style={{
        padding: '2px 10px',
        borderRadius: '999px',
        backgroundColor: 'var(--color-surface-elevated)',
        border: '1px solid var(--color-border)',
        fontSize: '11px',
        fontWeight: 600,
        color: sub,
        whiteSpace: 'nowrap',
      }}
    >
      {count}
    </span>
  );

  if (isMobile) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          marginBottom: '12px',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={() => navigate(-1)}
          className="ui-motion-button ui-focus-ring"
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            color: text, fontSize: '14px', fontWeight: '600',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          }}
        >
          <ArrowLeft size={16} /> Kembali
        </button>
        {countBadge}
        {rightSlot}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: rightSlot ? 'space-between' : 'flex-start',
        gap: '10px',
        marginBottom: '12px',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '13px', fontWeight: '500', color: sub }}>
        <span
          onClick={() => navigate('/dashboard')}
          className="ui-focus-ring"
          style={{ cursor: 'pointer', transition: uiTransition('color', UI_MOTION.duration.base) }}
          onMouseEnter={e => (e.target.style.color = text)}
          onMouseLeave={e => (e.target.style.color = sub)}
        >
          Dashboard
        </span>
        <ChevronRight size={14} />
        <span style={{ color: text, fontWeight: '700', fontSize: '15px' }}>{title}</span>
        {countBadge}
      </div>
      {rightSlot}
    </div>
  );
}
