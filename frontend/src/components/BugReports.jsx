import React, { useState, useEffect } from 'react';
import { Bug, Lightbulb, CheckCircle, Clock, AlertCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../services/api';
import Skeleton from './common/Skeleton';

const STATUS = {
  open:        { label: 'Open',        color: '#FF3B30', bg: '#FF3B3015', icon: AlertCircle,  emoji: '🔴' },
  in_progress: { label: 'In Progress', color: '#FF9500', bg: '#FF950015', icon: Clock,         emoji: '🟡' },
  resolved:    { label: 'Resolved',    color: '#34C759', bg: '#34C75915', icon: CheckCircle,   emoji: '🟢' },
};

const TYPE = {
  bug:     { label: 'Bug',   color: '#FF3B30', bg: '#FF3B3015', icon: Bug },
  feature: { label: 'Fitur', color: '#007AFF', bg: '#007AFF15', icon: Lightbulb },
};

function BugCard({ bug, isDark, onStatusChange }) {
  const [showSteps, setShowSteps] = useState(false);
  const border = isDark ? '#2C2C2E' : '#F0F0F0';
  const txt = isDark ? '#FFF' : '#000';
  const sub = '#86868B';
  const typeInfo = TYPE[bug.type] || TYPE.bug;
  const TypeIcon = typeInfo.icon;

  const nextStatuses = Object.keys(STATUS).filter(s => s !== bug.status);

  return (
    <div style={{ backgroundColor: isDark ? '#1C1C1E' : '#FFF', borderRadius: '12px', padding: '16px 18px', border: `1px solid ${border}`, marginBottom: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '9px', backgroundColor: typeInfo.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
          <TypeIcon size={16} color={typeInfo.color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '14px', fontWeight: '700', color: txt }}>{bug.title}</span>
            <span style={{ fontSize: '11px', backgroundColor: typeInfo.bg, color: typeInfo.color, padding: '2px 8px', borderRadius: '20px', fontWeight: '700' }}>{typeInfo.label}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', color: sub }}>
              {new Date(bug.reported_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
            {bug.contact && (
              <span style={{ fontSize: '12px', backgroundColor: isDark ? '#2C2C2E' : '#F5F5F7', padding: '2px 8px', borderRadius: '6px', color: sub }}>
                👤 {bug.contact}
              </span>
            )}
          </div>
          <p style={{ margin: '0 0 8px', fontSize: '13px', color: isDark ? '#EBEBF5' : '#3A3A3C', lineHeight: '1.5' }}>{bug.description}</p>
          {bug.steps && (
            <div style={{ marginBottom: '10px' }}>
              <button onClick={() => setShowSteps(!showSteps)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#007AFF', fontSize: '12px', fontWeight: '600', padding: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                {showSteps ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                Langkah Reproduksi
              </button>
              {showSteps && (
                <pre style={{ margin: '6px 0 0', padding: '10px 14px', backgroundColor: isDark ? '#2C2C2E' : '#F5F5F7', borderRadius: '8px', fontSize: '12px', color: txt, whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{bug.steps}</pre>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {nextStatuses.map(s => {
              const cfg = STATUS[s];
              return (
                <button key={s} onClick={() => onStatusChange(bug.id, s)}
                  style={{ padding: '5px 12px', backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}30`, borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' }}>
                  → {cfg.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusSection({ statusKey, bugs, isDark, onStatusChange, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const cfg = STATUS[statusKey];
  const Icon = cfg.icon;
  const count = bugs.length;
  const border = isDark ? '#2C2C2E' : '#E5E5EA';

  return (
    <div style={{ marginBottom: '16px', border: `1.5px solid ${count > 0 ? cfg.color + '40' : border}`, borderRadius: '14px', overflow: 'hidden' }}>
      <button onClick={() => setOpen(!open)}
        style={{ width: '100%', padding: '14px 18px', backgroundColor: count > 0 ? cfg.bg : (isDark ? '#1C1C1E' : '#FAFAFA'), border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: isDark ? '#2C2C2E' : '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} color={cfg.color} />
        </div>
        <span style={{ fontSize: '15px', fontWeight: '700', color: cfg.color, flex: 1 }}>{cfg.label}</span>
        <span style={{ fontSize: '13px', fontWeight: '700', backgroundColor: count > 0 ? cfg.color : (isDark ? '#3A3A3C' : '#E5E5EA'), color: count > 0 ? '#FFF' : '#86868B', padding: '2px 10px', borderRadius: '20px', minWidth: '28px', textAlign: 'center' }}>{count}</span>
        {open ? <ChevronUp size={16} color="#86868B" /> : <ChevronDown size={16} color="#86868B" />}
      </button>
      {open && (
        <div style={{ padding: count > 0 ? '12px 14px 4px' : '0', backgroundColor: isDark ? '#111' : '#FAFAFA' }}>
          {count === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#86868B', fontSize: '13px' }}>
              {cfg.emoji} Tidak ada item di sini
            </div>
          ) : (
            bugs.map(bug => <BugCard key={bug.id} bug={bug} isDark={isDark} onStatusChange={onStatusChange} />)
          )}
        </div>
      )}
    </div>
  );
}

export default function BugReports({ isDarkMode, isSidebarOpen }) {
  const [bugs, setBugs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');

  const fetchBugs = async () => {
    setLoading(true);
    try { const r = await api.get('/bugs'); setBugs(r.data); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchBugs(); }, []);

  const updateStatus = async (id, status) => {
    await api.patch(`/bugs/${id}`, { status });
    setBugs(prev => prev.map(b => b.id === id ? { ...b, status } : b));
  };

  const filtered = filterType === 'all' ? bugs : bugs.filter(b => b.type === filterType);
  const grouped = {
    open:        filtered.filter(b => b.status === 'open'),
    in_progress: filtered.filter(b => b.status === 'in_progress'),
    resolved:    filtered.filter(b => b.status === 'resolved'),
  };

  const bg = isDarkMode ? '#000' : '#F5F5F7';
  const txt = isDarkMode ? '#FFF' : '#000';
  const cardBg = isDarkMode ? '#1C1C1E' : '#FFF';

  return (
    <div style={{ padding: '2rem', marginLeft: isSidebarOpen ? '256px' : '80px', backgroundColor: bg, minHeight: '100vh', transition: 'margin-left 0.3s' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '26px', fontWeight: '700', color: txt, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Bug size={26} color="#FF9500" /> Bug & Fitur
          </h1>
          <p style={{ margin: '4px 0 0', color: '#86868B', fontSize: '14px' }}>Laporan dari pengguna — {bugs.length} total</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ display: 'flex', backgroundColor: isDarkMode ? '#1C1C1E' : '#FFF', borderRadius: '10px', padding: '3px', border: `1px solid ${isDarkMode ? '#2C2C2E' : '#E5E5EA'}` }}>
            {[['all', '🗂 Semua'], ['bug', '🐛 Bug'], ['feature', '💡 Fitur']].map(([key, label]) => (
              <button key={key} onClick={() => setFilterType(key)}
                style={{ padding: '6px 12px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', transition: 'all 0.15s',
                  backgroundColor: filterType === key ? (isDarkMode ? '#3A3A3C' : '#F5F5F7') : 'transparent',
                  color: filterType === key ? txt : '#86868B',
                }}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={fetchBugs}
            style={{ padding: '9px 14px', backgroundColor: cardBg, border: `1px solid ${isDarkMode ? '#2C2C2E' : '#E5E5EA'}`, borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: txt, fontSize: '13px', fontWeight: '600' }}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '1.5rem' }}>
        {Object.entries(STATUS).map(([key, cfg]) => {
          const Icon = cfg.icon;
          const count = filtered.filter(b => b.status === key).length;
          return (
            <div key={key} style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: isDarkMode ? 'none' : '0 1px 4px rgba(0,0,0,0.06)' }}>
              <Icon size={20} color={cfg.color} />
              <div>
                <div style={{ fontSize: '22px', fontWeight: '700', color: cfg.color, lineHeight: 1 }}>{count}</div>
                <div style={{ fontSize: '11px', color: '#86868B', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{cfg.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ backgroundColor: cardBg, borderRadius: '12px', padding: '20px', border: `1px solid ${isDarkMode ? '#2C2C2E' : '#E5E5EA'}` }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <Skeleton width="36px" height="36px" borderRadius="9px" />
                <div style={{ flex: 1 }}>
                  <Skeleton width="150px" height="18px" style={{ marginBottom: '8px' }} />
                  <Skeleton width="100%" height="14px" style={{ marginBottom: '6px' }} />
                  <Skeleton width="80%" height="14px" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <StatusSection statusKey="open" bugs={grouped.open} isDark={isDarkMode} onStatusChange={updateStatus} defaultOpen={true} />
          <StatusSection statusKey="in_progress" bugs={grouped.in_progress} isDark={isDarkMode} onStatusChange={updateStatus} defaultOpen={true} />
          <StatusSection statusKey="resolved" bugs={grouped.resolved} isDark={isDarkMode} onStatusChange={updateStatus} defaultOpen={false} />
        </>
      )}
    </div>
  );
}