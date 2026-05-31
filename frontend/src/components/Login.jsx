import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { Lock, User, AlertCircle, Building2, Sun, Moon, Sparkles } from 'lucide-react';
import { UI_MOTION, uiTransition } from '../constants/ui';

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

  // ─── Theme tokens (Stripe Modern palette, shared with app) ────────────
  const bg = 'var(--color-bg)';
  const card = 'var(--color-surface)';
  const cardBorder = 'var(--color-border)';
  const inputBg = 'var(--color-surface-elevated)';
  const inputBorder = 'var(--color-border)';
  const text = 'var(--color-text)';
  const sub = 'var(--color-text-muted)';
  const subtle = 'var(--color-text-subtle)';
  const focusRing = 'var(--color-primary)';

  const toggleTheme = () => setIsDarkMode?.((v) => !v);

  const toggleGlass = () => {
    if (!setIsGlassMode) return;
    setGlassClicked(true);
    setTimeout(() => setGlassClicked(false), UI_MOTION.duration.press);
    // First-time enable → tampil warning sekali aja
    const warned = localStorage.getItem('habil_glass_warned') === '1';
    if (!isGlassMode && !warned) {
      setShowGlassWarning(true);
      return; // tunggu user confirm dulu
    }
    setIsGlassMode((v) => !v);
  };

  const confirmGlassWarning = () => {
    try { localStorage.setItem('habil_glass_warned', '1'); } catch (e) {
      console.warn('[Login] glass warning persist failed:', e);
    }
    setShowGlassWarning(false);
    setIsGlassMode?.(true);
  };

  // Detect low memory device (Chrome/Edge expose; undefined di Safari/Firefox)
  const lowMemory = typeof navigator !== 'undefined' && navigator.deviceMemory && navigator.deviceMemory < 4;

  return (
    <div
      className="ui-motion-page min-h-screen flex flex-col justify-center items-center p-4 font-sans transition-colors duration-300"
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
            className={`ui-motion-button ui-focus-ring glass-toggle-btn ${isGlassMode ? 'glass-target glass-target--ultra' : ''}`}
            style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: isGlassMode ? 'transparent' : card,
              border: `1px solid ${isGlassMode ? 'var(--color-primary-border)' : cardBorder}`,
              color: isGlassMode ? 'var(--color-primary)' : text,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isGlassMode
                ? '0 4px 16px color-mix(in srgb, var(--color-primary) 28%, transparent)'
                : (isDarkMode ? '0 4px 12px rgba(0,0,0,0.4)' : '0 4px 12px rgba(0,0,0,0.06)'),
              transform: glassClicked ? 'scale(0.88)' : (isGlassMode ? 'scale(1.08)' : 'scale(1)'),
              transition: [
                uiTransition('transform', UI_MOTION.duration.press, UI_MOTION.easing.press),
                uiTransition('background-color', UI_MOTION.duration.base),
                uiTransition('box-shadow', UI_MOTION.duration.base),
                uiTransition('border-color', UI_MOTION.duration.base),
              ].join(', '),
            }}
          >
            <Sparkles size={18} fill={isGlassMode ? 'var(--color-primary)' : 'none'} />
          </button>
        )}
        {setIsDarkMode && (
          <button
            onClick={toggleTheme}
            aria-label={isDarkMode ? 'Aktifkan light mode' : 'Aktifkan dark mode'}
            title={isDarkMode ? 'Light mode' : 'Dark mode'}
            className="ui-motion-button ui-focus-ring"
            style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: card, border: `1px solid ${cardBorder}`,
              color: text, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isDarkMode ? '0 4px 12px rgba(0,0,0,0.4)' : '0 4px 12px rgba(0,0,0,0.06)',
              transition: uiTransition('all', UI_MOTION.duration.base),
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
            className="ui-motion-modal glass-target glass-target--clear"
            style={{
              background: card, color: text, borderRadius: '20px', padding: '28px',
              width: '100%', maxWidth: '420px', textAlign: 'center',
              boxShadow: '0 32px 64px rgba(0,0,0,0.35)', border: `1px solid ${cardBorder}`,
            }}
          >
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)',
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
                background: 'var(--color-warning-soft)', color: 'var(--color-warning)',
                borderRadius: '8px', fontSize: '12px', fontWeight: '600',
              }}>
                ⚠️ Device kamu &lt;4GB RAM — mungkin agak lemot
              </p>
            )}
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={() => setShowGlassWarning(false)}
                className="ui-motion-button ui-focus-ring"
                style={{
                  flex: 1, padding: '12px', background: inputBg, color: text,
                  border: `1px solid ${inputBorder}`, borderRadius: '10px',
                  cursor: 'pointer', fontSize: '14px', fontWeight: '600',
                }}
              >Batal</button>
              <button
                onClick={confirmGlassWarning}
                className="ui-motion-button ui-focus-ring"
                style={{
                  flex: 1, padding: '12px',
                  background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)',
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
          <p className="mt-8 text-xs font-medium" style={{ color: sub }}>HABIL SUPERAPP v1.13.0-stable — 2026</p>
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
                  backgroundColor: 'var(--color-danger-soft)',
                  border: '1px solid color-mix(in srgb, var(--color-danger) 28%, transparent)',
                  color: 'var(--color-danger)',
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
                  className="ui-focus-ring w-full pl-11 pr-4 py-3 text-sm outline-none transition-all rounded-xl"
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
                  className="ui-focus-ring w-full pl-11 pr-4 py-3 text-sm outline-none transition-all rounded-xl"
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
              className="ui-motion-button ui-focus-ring w-full py-3.5 px-4 text-white font-medium text-sm rounded-xl transition-colors shadow-sm focus:outline-none mt-2"
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
