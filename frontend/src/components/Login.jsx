import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { Lock, User, AlertCircle, Building2, Sun, Moon, Sparkles } from 'lucide-react';

export default function Login({ isDarkMode = false, setIsDarkMode, isGlassMode = false, setIsGlassMode, isVantaMode = false }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showGlassWarning, setShowGlassWarning] = useState(false);
  const [glassClicked, setGlassClicked] = useState(false);
  const { login, loading } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Username and password are required');
      return;
    }

    const result = await login(username, password);
    if (result.success) {
      navigate('/dashboard');
    } else {
      if (result.error === 'Network Error' || result.error.includes('timeout')) {
        setError('Cannot connect to the server. Please check your connection.');
      } else {
        setError(result.error);
      }
    }
  };

  // ─── Theme tokens (Apple HIG colors, mirror seluruh app) ─────────────────
  const bg = isDarkMode ? '#000000' : '#F5F5F7';
  const card = isDarkMode ? '#1C1C1E' : '#FFFFFF';
  const cardBorder = isDarkMode ? '#2C2C2E' : '#F0F0F2';
  const inputBg = isDarkMode ? '#2C2C2E' : '#F5F5F7';
  const inputBorder = isDarkMode ? '#3A3A3C' : '#E5E5EA';
  const text = isDarkMode ? '#FFFFFF' : '#1D1D1F';
  const sub = isDarkMode ? '#8E8E93' : '#6E6E73';
  const subtle = isDarkMode ? '#48484A' : '#86868B';
  const focusRing = '#007AFF';

  const toggleTheme = () => setIsDarkMode?.((v) => !v);

  const toggleGlass = () => {
    if (!setIsGlassMode) return;
    setGlassClicked(true);
    setTimeout(() => setGlassClicked(false), 200);
    // First-time enable → tampil warning sekali aja
    const warned = localStorage.getItem('habil_glass_warned') === '1';
    if (!isGlassMode && !warned) {
      setShowGlassWarning(true);
      return; // tunggu user confirm dulu
    }
    setIsGlassMode((v) => !v);
  };

  const confirmGlassWarning = () => {
    try { localStorage.setItem('habil_glass_warned', '1'); } catch {}
    setShowGlassWarning(false);
    setIsGlassMode?.(true);
  };

  // Detect low memory device (Chrome/Edge expose; undefined di Safari/Firefox)
  const lowMemory = typeof navigator !== 'undefined' && navigator.deviceMemory && navigator.deviceMemory < 4;

  return (
    <div
      className="min-h-screen flex flex-col justify-center items-center p-4 font-sans transition-colors duration-300"
      style={{ backgroundColor: isVantaMode ? 'transparent' : bg, color: text }}
    >
      {/* Theme toggles (floating top-right) — Glass + Dark Mode (Vanta selalu ON, no toggle) */}
      <div style={{ position: 'fixed', top: '20px', right: '20px', display: 'flex', gap: '8px', zIndex: 50 }}>
        {setIsGlassMode && (
          <button
            onClick={toggleGlass}
            aria-label={isGlassMode ? 'Matikan Liquid Glass mode' : 'Aktifkan Liquid Glass mode (Beta)'}
            aria-pressed={isGlassMode}
            title={isGlassMode ? 'Liquid Glass aktif' : 'Liquid Glass (Beta)'}
            className={`glass-toggle-btn ${isGlassMode ? 'glass-target glass-target--ultra' : ''}`}
            style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: isGlassMode ? 'transparent' : card,
              border: `1px solid ${isGlassMode ? 'rgba(0, 122, 255, 0.4)' : cardBorder}`,
              color: isGlassMode ? '#007AFF' : text,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isGlassMode
                ? '0 4px 16px rgba(0, 122, 255, 0.25)'
                : (isDarkMode ? '0 4px 12px rgba(0,0,0,0.4)' : '0 4px 12px rgba(0,0,0,0.06)'),
              transform: glassClicked ? 'scale(0.88)' : (isGlassMode ? 'scale(1.08)' : 'scale(1)'),
              transition: 'transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1), background-color 250ms ease, box-shadow 250ms ease, border-color 250ms ease',
            }}
          >
            <Sparkles size={18} fill={isGlassMode ? '#007AFF' : 'none'} />
          </button>
        )}
        {setIsDarkMode && (
          <button
            onClick={toggleTheme}
            aria-label={isDarkMode ? 'Aktifkan light mode' : 'Aktifkan dark mode'}
            title={isDarkMode ? 'Light mode' : 'Dark mode'}
            style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: card, border: `1px solid ${cardBorder}`,
              color: text, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isDarkMode ? '0 4px 12px rgba(0,0,0,0.4)' : '0 4px 12px rgba(0,0,0,0.06)',
              transition: 'all 0.2s ease',
            }}
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        )}
      </div>

      {/* First-time Glass warning modal */}
      {showGlassWarning && (
        <div
          onClick={() => setShowGlassWarning(false)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: '1rem', backdropFilter: 'blur(4px)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-target glass-target--clear"
            style={{
              background: card, color: text, borderRadius: '20px', padding: '28px',
              width: '100%', maxWidth: '420px', textAlign: 'center',
              boxShadow: '0 32px 64px rgba(0,0,0,0.35)', border: `1px solid ${cardBorder}`,
            }}
          >
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px', color: '#FFF',
            }}>
              <Sparkles size={26} fill="#FFF" />
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: '700', color: text }}>
              🪟 Liquid Glass (Beta)
            </h3>
            <p style={{ margin: '0 0 8px', fontSize: '14px', color: sub, lineHeight: 1.5 }}>
              Efek visual experimental Apple-style. Kalau device kerasa lemot,
              tinggal toggle OFF lagi kapan saja.
            </p>
            {lowMemory && (
              <p style={{
                margin: '0 0 20px', padding: '8px 12px',
                background: isDarkMode ? '#3A2E0F' : '#FFF8F0', color: '#FF9F0A',
                borderRadius: '8px', fontSize: '12px', fontWeight: '600',
              }}>
                ⚠️ Device kamu &lt;4GB RAM — mungkin agak lemot
              </p>
            )}
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={() => setShowGlassWarning(false)}
                style={{
                  flex: 1, padding: '12px', background: inputBg, color: text,
                  border: `1px solid ${inputBorder}`, borderRadius: '10px',
                  cursor: 'pointer', fontSize: '14px', fontWeight: '600',
                }}
              >Batal</button>
              <button
                onClick={confirmGlassWarning}
                style={{
                  flex: 1, padding: '12px',
                  background: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)',
                  color: '#FFF', border: 'none', borderRadius: '10px',
                  cursor: 'pointer', fontSize: '14px', fontWeight: '700',
                }}
              >Ok, lanjut</button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-md">

        {/* Header section */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl text-white shadow-lg mb-4"
            style={{ backgroundColor: focusRing }}
          >
            <Building2 size={32} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: text }}>HABIL SUPERAPP</h1>
          <p className="mt-8 text-xs font-medium" style={{ color: sub }}>HABIL SUPERAPP v1.10.0-stable — 2026</p>
        </div>

        <div
          className="glass-target glass-target--clear rounded-3xl p-8 transition-colors duration-300"
          style={{
            backgroundColor: card,
            border: `1px solid ${cardBorder}`,
            boxShadow: isDarkMode ? '0 8px 32px rgba(0,0,0,0.5)' : '0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          <h2 className="text-xl font-semibold mb-6 text-center" style={{ color: text }}>Sign In</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div
                role="alert"
                className="flex items-start gap-3 p-4 rounded-xl text-sm"
                style={{
                  backgroundColor: isDarkMode ? '#3A1F1F' : '#FFF5F5',
                  border: `1px solid ${isDarkMode ? '#5A2828' : '#FFE5E5'}`,
                  color: '#FF453A',
                }}
              >
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1.5 ml-1" style={{ color: sub }}>Username</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User size={18} style={{ color: subtle }} />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 text-sm outline-none transition-all rounded-xl"
                  style={{
                    backgroundColor: inputBg,
                    border: `1px solid ${inputBorder}`,
                    color: text,
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = focusRing; e.currentTarget.style.boxShadow = `0 0 0 4px ${focusRing}1A`; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = inputBorder; e.currentTarget.style.boxShadow = 'none'; }}
                  placeholder="Masukkan username"
                  disabled={loading}
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5 ml-1" style={{ color: sub }}>Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock size={18} style={{ color: subtle }} />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 text-sm outline-none transition-all rounded-xl"
                  style={{
                    backgroundColor: inputBg,
                    border: `1px solid ${inputBorder}`,
                    color: text,
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = focusRing; e.currentTarget.style.boxShadow = `0 0 0 4px ${focusRing}1A`; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = inputBorder; e.currentTarget.style.boxShadow = 'none'; }}
                  placeholder="Masukkan password"
                  disabled={loading}
                  autoComplete="current-password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 text-white font-medium text-sm rounded-xl transition-colors shadow-sm focus:outline-none mt-2"
              style={{
                backgroundColor: focusRing,
                opacity: loading ? 0.6 : 1,
                cursor: loading ? 'wait' : 'pointer',
              }}
              onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = '#0066D6')}
              onMouseLeave={(e) => !loading && (e.currentTarget.style.backgroundColor = focusRing)}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

        </div>

        <p className="text-center text-xs mt-8" style={{ color: subtle }}>
          &copy; 2026 HABIL SUPERAPP. All rights reserved.
        </p>
      </div>
    </div>
  );
}
