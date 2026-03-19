import React, { useState, useContext, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, ShoppingCart, Package, DollarSign, Users, ChevronLeft, ChevronRight, Sun, LogOut, Bug, X, Moon, FileText, BarChart3, Briefcase, Printer, Menu } from 'lucide-react';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';

export default function Sidebar({ isDarkMode, setIsDarkMode, isSidebarOpen, setIsSidebarOpen }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [showBugModal, setShowBugModal] = useState(false);
  const [bugType, setBugType] = useState('bug');
  const [bugForm, setBugForm] = useState({ title: '', description: '', steps: '', contact: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Mobile state
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerRef = useRef(null);
  const touchStartXRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Prevent body scroll when modal drawer open (mobile only)
  useEffect(() => {
    if (!isMobile) return;
    if (!mobileOpen) return;
    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
    };
  }, [isMobile, mobileOpen]);

  const userDisplayName = useMemo(() => {
    const u = user || {};
    return (
      u.name ||
      u.full_name ||
      u.username ||
      u.email ||
      u.user ||
      'Admin'
    );
  }, [user]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const role = user?.role || 'admin';

  // Role-based menu: admin gets operations, direktur gets everything
  const menuItems = [
    { icon: Home, label: 'Dashboard', path: '/dashboard', active: true },
    { icon: FileText, label: 'Nota Penjualan', path: '/sales', active: true },
    { icon: Users, label: 'Customer', path: '/customers', active: true },
    { icon: Package, label: 'Invoices', path: '/invoices', active: true },
    { icon: ShoppingCart, label: 'Surat Pesanan', path: '/orders', active: true },
    { icon: Package, label: 'Inventory', path: '/inventory', active: true },
    { icon: ShoppingCart, label: 'Toko Online', path: '/online-store', active: true },
    { icon: Printer, label: 'Pengaturan', path: '/print-settings', active: true },
    ...(role === 'direktur' ? [
      { icon: BarChart3, label: 'Buku Besar', path: '/ledger', active: true },
      { icon: DollarSign, label: 'Finance', path: '/finance', active: false },
      { icon: Briefcase, label: 'Karyawan', path: '/employees', active: false },
    ] : []),
  ];

  const handleSubmitBug = async () => {
    if (!bugForm.title.trim()) { alert('Judul wajib diisi'); return; }
    setSubmitting(true);
    try {
      await api.post('/bugs', {
        title: bugForm.title,
        description: bugForm.description,
        steps: bugType === 'bug' ? bugForm.steps : '',
        contact: bugForm.contact,
        type: bugType,
        reported_at: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).replace(' ', 'T') + '+07:00',
        user_agent: navigator.userAgent,
      });
      setSubmitted(true);
    } catch (e) {
      alert('Gagal mengirim: ' + (e.response?.data?.error || e.message));
    } finally {
      setSubmitting(false);
    }
  };

  const resetModal = () => {
    setShowBugModal(false);
    setSubmitted(false);
    setBugType('bug');
    setBugForm({ title: '', description: '', steps: '', contact: '' });
  };

  const bg = isDarkMode ? '#000' : '#FFF';
  const border = isDarkMode ? '#2C2C2E' : '#E5E5EA';
  const txt = isDarkMode ? '#FFF' : '#000';
  const sub = isDarkMode ? '#86868B' : '#6B7280';
  const appVersion = 'v1.3.29-stable';

  const closeMobileDrawer = () => setMobileOpen(false);

  const handleNavigate = (path, isActive) => {
    if (!isActive) return;
    // Close first to avoid ghost states on slower devices, then navigate.
    if (isMobile) setMobileOpen(false);
    navigate(path);
  };

  // Focus trap + ESC close (accessibility) for modal drawer (mobile only)
  useEffect(() => {
    if (!isMobile || !mobileOpen) return;
    const root = drawerRef.current;
    if (!root) return;

    const prevActive = document.activeElement;
    const focusables = () =>
      Array.from(
        root.querySelectorAll(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));

    // Focus first actionable item (close button if exists, else first menu)
    const first = focusables()[0];
    if (first) first.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeMobileDrawer();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === firstEl || !root.contains(active)) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (active === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (prevActive && prevActive.focus) prevActive.focus();
    };
  }, [isMobile, mobileOpen]);

  const onDrawerTouchStart = (e) => {
    if (!isMobile || !mobileOpen) return;
    touchStartXRef.current = e.touches?.[0]?.clientX ?? null;
  };
  const onDrawerTouchMove = (e) => {
    if (!isMobile || !mobileOpen) return;
    const startX = touchStartXRef.current;
    const x = e.touches?.[0]?.clientX ?? null;
    if (startX == null || x == null) return;
    const deltaX = x - startX;
    if (deltaX < -60) {
      touchStartXRef.current = null;
      closeMobileDrawer();
    }
  };

  return (
    <>
      {/* Mobile Hamburger Button */}
      {isMobile && (
        <button
          onClick={() => setMobileOpen(o => !o)}
          style={{
            position: 'fixed', top: '14px', left: '14px', zIndex: 100,
            background: bg, border: `1px solid ${border}`, borderRadius: '10px',
            width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          }}
          aria-label={mobileOpen ? 'Tutup menu' : 'Buka menu'}
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation-drawer"
        >
          {mobileOpen ? <X size={18} color={txt} /> : <Menu size={18} color={txt} />}
        </button>
      )}

      {/* Mobile Overlay */}
      {isMobile && (
        <div
          onClick={closeMobileDrawer}
          className={[
            'fixed inset-0 z-[90] transition-opacity duration-300',
            'bg-black/50 backdrop-blur-[2px]',
            mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
          ].join(' ')}
          aria-hidden={!mobileOpen}
        />
      )}

      {/* Sidebar Panel */}
      <div
        id="mobile-navigation-drawer"
        ref={drawerRef}
        role={isMobile ? 'dialog' : undefined}
        aria-modal={isMobile ? true : undefined}
        aria-label={isMobile ? 'Navigasi' : undefined}
        onTouchStart={onDrawerTouchStart}
        onTouchMove={onDrawerTouchMove}
        className={isMobile ? [
          'fixed left-0 top-0 z-[100] h-dvh',
          'w-[80vw] max-w-[300px]',
          'rounded-r-2xl',
          'shadow-[12px_0_40px_rgba(0,0,0,0.35)]',
          'transition-transform duration-[280ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'flex flex-col',
        ].join(' ') : undefined}
        style={isMobile ? {
          backgroundColor: bg,
          borderRight: `1px solid ${border}`,
        } : {
          position: 'fixed', left: 0, top: 0, height: '100vh',
          width: isSidebarOpen ? '256px' : '80px',
          backgroundColor: bg, borderRight: `1px solid ${border}`,
          display: 'flex', flexDirection: 'column',
          transition: 'width 0.3s ease-in-out',
          zIndex: 40,
          transform: 'translateX(0)',
        }}
      >
        
        {/* Header */}
        <div
          className={isMobile ? 'px-5 pt-6 pb-4' : undefined}
          style={isMobile ? { borderBottom: `1px solid ${border}` } : { padding: '1.5rem', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: (isSidebarOpen ? 'space-between' : 'center') }}
        >
          {isMobile ? (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <div
                    className="h-11 w-11 rounded-2xl shadow-sm flex items-center justify-center text-white font-black tracking-tight"
                    style={{ background: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)' }}
                    aria-hidden="true"
                  >
                    H
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: sub }}>
                      HABIL SUPERAPP
                    </div>
                    <div
                      className="text-base font-bold leading-tight truncate"
                      style={{ color: txt }}
                      title={userDisplayName}
                    >
                      {userDisplayName}
                    </div>
                  </div>
                </div>
              </div>
              <button
                onClick={closeMobileDrawer}
                className="shrink-0 p-2 rounded-xl"
                style={{ color: txt, backgroundColor: isDarkMode ? '#1C1C1E' : '#F5F5F7' }}
                aria-label="Tutup navigasi"
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            isSidebarOpen && (
              <div>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: '0 0 0.25rem 0', color: txt }}>Dashboard</h1>
                <p style={{ fontSize: '0.875rem', color: sub, margin: 0 }}>HABIL SUPERAPP</p>
              </div>
            )
          )}
          {!isMobile && (
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', display: 'flex', alignItems: 'center', color: txt }}>
              {isSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
            </button>
          )}
        </div>

        {/* Menu */}
        <nav
          style={{ flex: 1, padding: isMobile ? '1rem 0.75rem' : '1rem', overflowY: 'auto' }}
          aria-label="Menu utama"
        >
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = item.active;
            const isCurrent = location.pathname === item.path;
            const showLabel = isMobile || isSidebarOpen;
            return (
              <button
                key={index}
                onClick={() => handleNavigate(item.path, isActive)}
                title={item.label}
                style={{
                  width: '100%',
                  minHeight: '44px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  marginBottom: '0.5rem',
                  borderRadius: '0.75rem',
                  border: 'none',
                  cursor: isActive ? 'pointer' : 'not-allowed',
                  backgroundColor: isCurrent
                    ? '#007AFF'
                    : (isActive ? (isDarkMode ? '#1C1C1E' : '#F5F5F7') : 'transparent'),
                  color: isCurrent
                    ? '#FFF'
                    : (isActive ? txt : (isDarkMode ? '#3A3A3C' : '#D1D5DB')),
                  opacity: isActive ? 1 : 0.5,
                  fontSize: '0.875rem',
                  fontWeight: isCurrent ? '700' : '600',
                  textAlign: 'left',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                }}
              >
                <Icon size={20} style={{ minWidth: '20px' }} />
                {showLabel && (
                  <>
                    <span>{item.label}</span>
                    {!isActive && <span style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>Soon</span>}
                  </>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: isMobile ? '0.75rem 0.75rem 1rem' : '1rem', borderTop: `1px solid ${border}` }}>
          {/* Bug Report button */}
          <button onClick={() => { if (isMobile) closeMobileDrawer(); setShowBugModal(true); }} title="Bug / Saran Fitur"
            style={{ width: '100%', minHeight: '44px', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', marginBottom: '0.5rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer', backgroundColor: isDarkMode ? '#2C1A00' : '#FFF9E6', color: '#FF9500', fontSize: '0.875rem', fontWeight: '700' }}>
            <Bug size={20} style={{ minWidth: '20px' }} />
            {(isMobile || isSidebarOpen) && <span>Bug / Saran Fitur</span>}
          </button>

          <button onClick={() => { setIsDarkMode(!isDarkMode); if (isMobile) closeMobileDrawer(); }} title={isDarkMode ? 'Light Mode' : 'Dark Mode'}
            style={{ width: '100%', minHeight: '44px', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', marginBottom: '0.5rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer', backgroundColor: isDarkMode ? '#1C1C1E' : '#F5F5F7', color: txt, fontSize: '0.875rem', fontWeight: '600' }}>
            {isDarkMode ? <Sun size={20} style={{ minWidth: '20px' }} /> : <Moon size={20} style={{ minWidth: '20px' }} />}
            {(isMobile || isSidebarOpen) && <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>}
          </button>

          <button onClick={() => { if (isMobile) closeMobileDrawer(); handleLogout(); }} title="Logout"
            style={{ width: '100%', minHeight: '44px', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer', backgroundColor: '#FF3B30', color: 'white', fontSize: '0.875rem', fontWeight: '700' }}>
            <LogOut size={20} style={{ minWidth: '20px' }} />
            {(isMobile || isSidebarOpen) && <span>Logout</span>}
          </button>

          {isMobile && (
            <div className="mt-3 px-2">
              <div className="text-[11px] font-semibold" style={{ color: sub, opacity: 0.75 }}>
                Sistem {appVersion}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bug/Fitur Modal */}
      {showBugModal && (
        <div onClick={resetModal} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: isDarkMode ? '#1C1C1E' : '#FFF', borderRadius: '16px', width: '100%', maxWidth: '460px', boxShadow: '0 32px 64px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
            
            {/* Modal Header */}
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: isDarkMode ? '#000' : '#F5F5F7' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: txt }}>
                {submitted ? '🎉 Terima Kasih!' : '📢 Kirim Laporan'}
              </h3>
              <button onClick={resetModal} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color="#86868B" /></button>
            </div>

            {submitted ? (
              /* Success state */
              <div style={{ padding: '36px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
                <p style={{ fontSize: '16px', fontWeight: '700', color: txt, margin: '0 0 8px' }}>Laporan berhasil dikirim!</p>
                <p style={{ fontSize: '14px', color: '#86868B', margin: '0 0 24px', lineHeight: '1.5' }}>
                  {bugType === 'bug'
                    ? 'Bug kamu sudah kami catat dan akan segera ditangani oleh developer.'
                    : 'Saran fitur kamu sudah kami terima dan akan dipertimbangkan untuk update berikutnya.'}
                </p>
                <button onClick={resetModal} style={{ padding: '12px 28px', backgroundColor: '#007AFF', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>
                  OK
                </button>
              </div>
            ) : (
              /* Form */
              <div style={{ padding: '20px 22px' }}>
                {/* Type toggle */}
                <div style={{ display: 'flex', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', borderRadius: '10px', padding: '3px', marginBottom: '16px' }}>
                  {[['bug', '🐛 Laporkan Bug', '#FF3B30'], ['feature', '💡 Saran Fitur', '#007AFF']].map(([key, label, color]) => (
                    <button key={key} onClick={() => setBugType(key)}
                      style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', transition: 'all 0.15s',
                        backgroundColor: bugType === key ? (isDarkMode ? '#1C1C1E' : '#FFF') : 'transparent',
                        color: bugType === key ? color : '#86868B',
                        boxShadow: bugType === key ? '0 1px 4px rgba(0,0,0,0.15)' : 'none' }}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* Form fields */}
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: isDarkMode ? '#EBEBF0' : '#3A3A3C', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                    {bugType === 'bug' ? 'Judul Bug *' : 'Nama Fitur *'}
                  </label>
                  <input value={bugForm.title} onChange={e => setBugForm(p => ({ ...p, title: e.target.value }))}
                    placeholder={bugType === 'bug' ? 'Contoh: Tombol simpan tidak merespon' : 'Contoh: Export ke PDF'}
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${border}`, borderRadius: '10px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: txt, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: isDarkMode ? '#EBEBF0' : '#3A3A3C', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                    {bugType === 'bug' ? 'Deskripsi' : 'Deskripsi Fitur'}
                  </label>
                  <textarea value={bugForm.description} onChange={e => setBugForm(p => ({ ...p, description: e.target.value }))}
                    rows={3}
                    placeholder={bugType === 'bug' ? 'Apa yang terjadi? Apa yang diharapkan?' : 'Jelaskan fitur yang kamu inginkan...'}
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${border}`, borderRadius: '10px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: txt, fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>

                {bugType === 'bug' && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: isDarkMode ? '#EBEBF0' : '#3A3A3C', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                      Langkah Reproduksi
                    </label>
                    <textarea value={bugForm.steps} onChange={e => setBugForm(p => ({ ...p, steps: e.target.value }))}
                      rows={3}
                      placeholder={'1. Buka halaman invoice\n2. Klik tombol ...\n3. Bug muncul'}
                      style={{ width: '100%', padding: '10px 12px', border: `1px solid ${border}`, borderRadius: '10px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: txt, fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                  </div>
                )}

                <div style={{ marginBottom: '18px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: isDarkMode ? '#EBEBF0' : '#3A3A3C', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                    Nama / Kontak (opsional)
                  </label>
                  <input value={bugForm.contact} onChange={e => setBugForm(p => ({ ...p, contact: e.target.value }))}
                    placeholder="Nama atau nomor HP"
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${border}`, borderRadius: '10px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: txt, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={handleSubmitBug} disabled={submitting}
                    style={{ flex: 1, padding: '13px', backgroundColor: bugType === 'bug' ? '#FF3B30' : '#007AFF', color: 'white', border: 'none', borderRadius: '10px', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '14px', opacity: submitting ? 0.6 : 1 }}>
                    {submitting ? 'Mengirim...' : (bugType === 'bug' ? '🐛 Kirim Bug Report' : '💡 Kirim Saran')}
                  </button>
                  <button onClick={resetModal}
                    style={{ flex: 1, padding: '13px', backgroundColor: isDarkMode ? '#2C2C2E' : '#F5F5F7', color: txt, border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
                    Batal
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
