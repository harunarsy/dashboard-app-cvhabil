import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { Lock, User, AlertCircle, Building2, Sun, Moon } from 'lucide-react';

export default function Login({ isDarkMode = false, setIsDarkMode }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
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

  return (
    <div
      className="min-h-screen flex flex-col justify-center items-center p-4 font-sans transition-colors duration-300"
      style={{ backgroundColor: bg, color: text }}
    >
      {/* Theme toggle (floating top-right) */}
      {setIsDarkMode && (
        <button
          onClick={toggleTheme}
          aria-label={isDarkMode ? 'Aktifkan light mode' : 'Aktifkan dark mode'}
          title={isDarkMode ? 'Light mode' : 'Dark mode'}
          style={{
            position: 'fixed', top: '20px', right: '20px',
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
          <p className="mt-8 text-xs font-medium" style={{ color: sub }}>HABIL SUPERAPP v1.4.1-stable — 2026</p>
        </div>

        <div
          className="rounded-3xl p-8 transition-colors duration-300"
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
