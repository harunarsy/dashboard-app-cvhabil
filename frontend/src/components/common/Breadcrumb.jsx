import React from 'react';
import { ChevronRight, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Breadcrumb({ title, isMobile, isDarkMode }) {
  const navigate = useNavigate();
  const text = isDarkMode ? '#FFF' : '#000';
  const sub = '#86868B';

  if (isMobile) {
    return (
      <button 
        onClick={() => navigate(-1)} 
        style={{ 
          display: 'flex', alignItems: 'center', gap: '4px', 
          color: text, fontSize: '14px', fontWeight: '600', 
          background: 'none', border: 'none', cursor: 'pointer', 
          padding: 0, marginBottom: '16px' 
        }}
      >
        <ArrowLeft size={16} /> Kembali
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '500', color: sub, marginBottom: '12px' }}>
      <span 
        onClick={() => navigate('/dashboard')} 
        style={{ cursor: 'pointer', transition: 'color 0.2s' }} 
        onMouseEnter={e => e.target.style.color = text} 
        onMouseLeave={e => e.target.style.color = sub}
      >
        Dashboard
      </span>
      <ChevronRight size={14} />
      <span style={{ color: text, fontWeight: '600' }}>{title}</span>
    </div>
  );
}
