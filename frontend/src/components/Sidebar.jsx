import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, ShoppingCart, Package, DollarSign, Users, ChevronLeft, ChevronRight, Sun, LogOut, Bug, Lightbulb, X, CheckCircle } from 'lucide-react';
import api from '../services/api';

export default function Sidebar({ isDarkMode, setIsDarkMode, isSidebarOpen, setIsSidebarOpen }) {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [type, setType] = useState('bug'); // 'bug' | 'feature'
  const [bugForm, setBugForm] = useState({ title: '', description: '', steps: '', contact: '' });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleLogout = () => { localStorage.removeItem('token'); navigate('/login'); };

  const handleSubmit = async () => {
    if (!bugForm.title.trim() || !bugForm.description.trim()) {
      alert('Judul dan deskripsi wajib diisi'); return;
    }
    setSubmitting(true);
    try {
      await api.post('/bugs', {
        type,
        title: bugForm.title,
        description: bugForm.description,
        steps: bugForm.steps,
        contact: bugForm.contact,
        reported_at: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).replace(' ', 'T') + '+07:00',
        user_agent: navigator.userAgent,
      });
    } catch (e) {
      const bugs = JSON.parse(localStorage.getItem('bug_reports') || '[]');
      bugs.push({ type, ...bugForm, reported_at: new Date().toISOString() });
      localStorage.setItem('bug_reports', JSON.stringify(bugs));
    }
    setSubmitting(false);
    setSubmitted(true);
  };

  const resetModal = () => {
    setShowModal(false); setSubmitted(false);
    setBugForm({ title: '', description: '', steps: '', contact: '' });
    setType('bug');
  };

  const isBug = type === 'bug';
  const accent = isBug ? '#FF9500' : '#007AFF';
  const accentBg = isBug ? '#FF950015' : '#007AFF15';
  const isDark = isDarkMode;
  const border = isDark ? '#424245' : '#E5E5EA';

  const inputStyle = {
    width: '100%', padding: '10px 12px',
    border: `1.5px solid ${isDark ? '#3A3A3C' : '#D1D1D6'}`,
    borderRadius: '10px', backgroundColor: isDark ? '#2C2C2E' : '#F5F5F7',
    color: isDark ? '#FFF' : '#000', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
  };

  const btnBase = (active) => ({
    width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
    padding: '0.75rem 1rem', marginBottom: '0.5rem', borderRadius: '0.5rem',
    border: 'none', cursor: active ? 'pointer' : 'not-allowed',
    backgroundColor: active ? (isDark ? '#1C1C1E' : '#f9fafb') : 'transparent',
    color: active ? (isDark ? '#FFF' : '#000') : (isDark ? '#6B7280' : '#D1D5DB'),
    opacity: active ? 1 : 0.5, fontSize: '0.875rem', fontWeight: '500', textAlign: 'left',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  });

  const menuItems = [
    { icon: Home, label: 'Dashboard', path: '/dashboard', active: true },
    { icon: ShoppingCart, label: 'Orders', path: '/orders', active: false },
    { icon: Package, label: 'Products', path: '/products', active: false },
    { icon: DollarSign, label: 'Finance', path: '/finance', active: false },
    { icon: Users, label: 'Employees', path: '/employees', active: false },
    { icon: Package, label: 'Invoices', path: '/invoices', active: true },
  ];

  return (
    <>
      <div style={{ position: 'fixed', left: 0, top: 0, height: '100vh', width: isSidebarOpen ? '256px' : '80px', backgroundColor: isDark ? '#000000' : '#FFFFFF', borderRight: `1px solid ${border}`, display: 'flex', flexDirection: 'column', transition: 'width 0.3s ease-in-out', zIndex: 40 }}>
        <div style={{ padding: '1.5rem', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: isSidebarOpen ? 'space-between' : 'center' }}>
          {isSidebarOpen && (
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: '0 0 0.25rem 0', color: isDark ? '#FFF' : '#000' }}>Dashboard</h1>
              <p style={{ fontSize: '0.875rem', color: isDark ? '#86868B' : '#6B7280', margin: 0 }}>CV Habil</p>
            </div>
          )}
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isDark ? '#FFF' : '#000' }}>
            {isSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
          </button>
        </div>

        <nav style={{ flex: 1, padding: '1rem', overflowY: 'auto' }}>
          {menuItems.map((item, i) => {
            const Icon = item.icon;
            return (
              <button key={i} onClick={() => item.active && navigate(item.path)} title={item.label} style={btnBase(item.active)}
                onMouseEnter={e => { if (item.active) e.currentTarget.style.backgroundColor = isDark ? '#2C2C2E' : '#E5E7EB'; }}
                onMouseLeave={e => { if (item.active) e.currentTarget.style.backgroundColor = isDark ? '#1C1C1E' : '#f9fafb'; }}
              >
                <Icon size={20} style={{ minWidth: '20px' }} />
                {isSidebarOpen && <><span>{item.label}</span>{!item.active && <span style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>Soon</span>}</>}
              </button>
            );
          })}
        </nav>

        <div style={{ padding: '1rem', borderTop: `1px solid ${border}` }}>
          <button onClick={() => setShowModal(true)} title="Feedback"
            style={{ ...btnBase(true), backgroundColor: isDark ? '#1C1C1E' : '#FFF8F0', color: '#FF9500', marginBottom: '0.5rem' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = isDark ? '#2C2C2E' : '#FFE5C0'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = isDark ? '#1C1C1E' : '#FFF8F0'}
          >
            <Bug size={20} style={{ minWidth: '20px' }} />
            {isSidebarOpen && <span>Bug / Saran Fitur</span>}
          </button>
          <button onClick={() => setIsDarkMode(!isDarkMode)} title={isDark ? 'Light Mode' : 'Dark Mode'}
            style={{ ...btnBase(true), marginBottom: '0.5rem' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = isDark ? '#2C2C2E' : '#E5E7EB'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = isDark ? '#1C1C1E' : '#f9fafb'}
          >
            <Sun size={20} style={{ minWidth: '20px' }} />
            {isSidebarOpen && <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>}
          </button>
          <button onClick={handleLogout} title="Logout"
            style={{ ...btnBase(true), backgroundColor: '#ef4444', color: 'white', marginBottom: 0 }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#dc2626'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#ef4444'}
          >
            <LogOut size={20} style={{ minWidth: '20px' }} />
            {isSidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ backgroundColor: isDark ? '#1C1C1E' : '#FFF', borderRadius: '20px', padding: '28px', maxWidth: '480px', width: '90%', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
            {!submitted ? (
              <>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                      {isBug ? <Bug size={22} color={accent} /> : <Lightbulb size={22} color={accent} />}
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700', color: isDark ? '#FFF' : '#000' }}>
                        {isBug ? 'Laporkan Bug' : 'Saran Fitur'}
                      </h3>
                      <p style={{ margin: 0, fontSize: '13px', color: '#86868B' }}>
                        {isBug ? 'Bantu kami perbaiki masalah' : 'Ide kamu sangat berarti bagi kami'}
                      </p>
                    </div>
                  </div>
                  <button onClick={resetModal} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color="#86868B" /></button>
                </div>

                {/* Type toggle */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', padding: '4px', backgroundColor: isDark ? '#2C2C2E' : '#F5F5F7', borderRadius: '12px' }}>
                  {[
                    { key: 'bug', icon: Bug, label: '🐛 Laporkan Bug', color: '#FF9500' },
                    { key: 'feature', icon: Lightbulb, label: '💡 Saran Fitur', color: '#007AFF' },
                  ].map(opt => (
                    <button key={opt.key} onClick={() => setType(opt.key)}
                      style={{ flex: 1, padding: '9px', border: 'none', borderRadius: '9px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', transition: 'all 0.2s',
                        backgroundColor: type === opt.key ? (isDark ? '#3A3A3C' : '#FFF') : 'transparent',
                        color: type === opt.key ? opt.color : '#86868B',
                        boxShadow: type === opt.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                      }}>
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Form */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#86868B', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                      {isBug ? 'Judul Bug' : 'Judul Fitur'} <span style={{ color: '#FF3B30' }}>*</span>
                    </label>
                    <input style={inputStyle}
                      placeholder={isBug ? 'Contoh: Tanggal berubah saat disimpan' : 'Contoh: Export ke PDF'}
                      value={bugForm.title} onChange={e => setBugForm(p => ({ ...p, title: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#86868B', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                      {isBug ? 'Deskripsi Bug' : 'Deskripsi Fitur'} <span style={{ color: '#FF3B30' }}>*</span>
                    </label>
                    <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '80px', fontFamily: 'inherit' }}
                      placeholder={isBug ? 'Apa yang terjadi vs yang seharusnya terjadi...' : 'Jelaskan fitur yang kamu inginkan dan manfaatnya...'}
                      value={bugForm.description} onChange={e => setBugForm(p => ({ ...p, description: e.target.value }))} />
                  </div>
                  {isBug && (
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: '600', color: '#86868B', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>Langkah Reproduksi</label>
                      <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '65px', fontFamily: 'inherit' }}
                        placeholder={`1. Buka halaman Invoice
2. Klik Add Invoice
3. ...`}
                        value={bugForm.steps} onChange={e => setBugForm(p => ({ ...p, steps: e.target.value }))} />
                    </div>
                  )}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#86868B', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>Nama / Kontak (opsional)</label>
                    <input style={inputStyle} placeholder="Nama kamu atau no. HP"
                      value={bugForm.contact} onChange={e => setBugForm(p => ({ ...p, contact: e.target.value }))} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button onClick={resetModal} style={{ flex: 1, padding: '12px', backgroundColor: 'transparent', border: `1px solid ${isDark ? '#3A3A3C' : '#D1D1D6'}`, borderRadius: '10px', cursor: 'pointer', fontSize: '14px', color: isDark ? '#FFF' : '#000' }}>Batal</button>
                  <button onClick={handleSubmit} disabled={submitting}
                    style={{ flex: 2, padding: '12px', backgroundColor: accent, color: 'white', border: 'none', borderRadius: '10px', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '700', opacity: submitting ? 0.7 : 1, transition: 'background 0.2s' }}>
                    {submitting ? 'Mengirim...' : isBug ? '🐛 Kirim Laporan' : '💡 Kirim Saran'}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ width: '72px', height: '72px', borderRadius: '50%', backgroundColor: '#34C75920', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <CheckCircle size={40} color="#34C759" />
                </div>
                <h3 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: '700', color: isDark ? '#FFF' : '#000' }}>Terima Kasih!</h3>
                <p style={{ margin: '0 0 4px', fontSize: '15px', color: isDark ? '#EBEBF5' : '#3A3A3C' }}>
                  {isBug ? 'Laporan bug kamu sudah kami terima.' : 'Saran fitur kamu sudah kami catat.'}
                </p>
                <p style={{ margin: '0 0 28px', fontSize: '13px', color: '#86868B' }}>Akan segera kami tindak lanjuti. 🙏</p>
                <button onClick={resetModal} style={{ padding: '12px 40px', backgroundColor: '#34C759', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700' }}>OK</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}