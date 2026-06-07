import React, { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { Lock, User, Building2, Sun, Moon } from "lucide-react";
import Tooltip from "./common/Tooltip";
import FieldError from "./common/FieldError";

export default function Login({
  isDarkMode = false,
  setIsDarkMode,
  isVantaMode = false,
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login, loading } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!username || !password) {
      setError("Username dan password wajib diisi.");
      return;
    }

    const result = await login(username, password);
    if (result.success) {
      navigate("/dashboard");
    } else {
      if (
        result.error === "Network Error" ||
        result.error.includes("timeout")
      ) {
        setError("Server belum bisa dihubungi. Cek koneksi lalu coba lagi.");
      } else {
        setError(result.error);
      }
    }
  };

  // ─── Theme tokens (Stripe Modern palette, shared with app) ────────────
  const bg = "var(--color-bg)";
  const card = "var(--color-surface)";
  const cardBorder = "var(--color-border)";
  const inputBg = "var(--color-surface-elevated)";
  const inputBorder = "var(--color-border)";
  const text = "var(--color-text)";
  const sub = "var(--color-text-muted)";
  const subtle = "var(--color-text-subtle)";
  const focusRing = "var(--color-primary)";
  const TooltipButton = ({
    label,
    children,
    className = "",
    style = {},
    ...buttonProps
  }) => (
    <Tooltip text={label} position="top">
      <button
        {...buttonProps}
        aria-label={label}
        className={`ui-motion-button ui-focus-ring ${className}`.trim()}
        style={style}
      >
        {children}
      </button>
    </Tooltip>
  );

  const toggleTheme = () => setIsDarkMode?.((v) => !v);

  return (
    <div
      className="ui-page ui-motion-page min-h-screen flex flex-col justify-center items-center px-4 py-6 sm:py-10 font-sans transition-colors duration-300"
      style={{ backgroundColor: isVantaMode ? "transparent" : bg, color: text }}
    >
      {/* Theme toggle (floating top-right) */}
      <div
        style={{
          position: "fixed",
          top: "20px",
          right: "20px",
          display: "flex",
          gap: "8px",
          zIndex: 50,
        }}
      >
        {setIsDarkMode && (
          <TooltipButton
            onClick={toggleTheme}
            aria-label={
              isDarkMode ? "Aktifkan light mode" : "Aktifkan dark mode"
            }
            label={isDarkMode ? "Aktifkan light mode" : "Aktifkan dark mode"}
            className="ui-mode-toggle ui-action-button"
            data-mode={isDarkMode ? "light" : "dark"}
            style={{
              padding: "0 14px",
              cursor: "pointer",
            }}
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            <span>{isDarkMode ? "Light" : "Dark"}</span>
          </TooltipButton>
        )}
      </div>

      <div className="w-full max-w-md">
        {/* Header section */}
        <div
          className="ui-readable-surface text-center mb-7 rounded-3xl px-5 py-5"
          style={{
            backgroundColor: isVantaMode
              ? "color-mix(in srgb, var(--color-surface) 90%, transparent)"
              : "transparent",
            boxShadow: isVantaMode ? "var(--shadow-card)" : "none",
          }}
        >
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl text-white shadow-lg mb-4"
            style={{ backgroundColor: focusRing }}
          >
            <Building2 size={28} />
          </div>
          <h1
            className="text-3xl font-extrabold tracking-tight"
            style={{ color: text }}
          >
            HABIL SUPERAPP
          </h1>
          <p
            className="ui-over-media-copy mt-3 px-3 py-1 text-xs font-semibold"
            style={{ color: sub }}
          >
            HABIL SUPERAPP v1.21.1-stable — 2026
          </p>
        </div>

        <div
          className="ui-panel ui-dialog-shell ui-motion-modal rounded-2xl p-6 sm:p-8 transition-colors duration-300"
          style={{
            backgroundColor: card,
            border: `1px solid ${cardBorder}`,
            boxShadow: isDarkMode
              ? "0 8px 32px rgba(0,0,0,0.5)"
              : "0 1px 2px rgba(0,0,0,0.04)",
          }}
        >
          <h2
            className="text-xl font-bold mb-2 text-center"
            style={{ color: text }}
          >
            Sign In
          </h2>
          <p className="text-xs font-medium text-center mb-6" style={{ color: sub }}>
            Masuk ke dashboard operasional CV Habil
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <FieldError message={error} visible={!!error} />

            <div>
              <label
                className="block text-[11px] font-bold uppercase tracking-[0.05em] mb-1.5 ml-1"
                style={{ color: sub }}
              >
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User size={18} style={{ color: subtle }} />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={`ui-form-field ui-focus-ring w-full min-h-11 pl-11 pr-4 py-3 text-sm outline-none transition-all rounded-xl ${error && !username ? "ui-form-invalid" : ""}`}
                  style={{
                    backgroundColor: inputBg,
                    border: `1px solid ${inputBorder}`,
                    color: text,
                  }}
                  aria-invalid={!!error && !username}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = focusRing;
                    e.currentTarget.style.boxShadow = `0 0 0 4px ${focusRing}1A`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor =
                      error && !username ? "var(--color-danger)" : inputBorder;
                    e.currentTarget.style.boxShadow = "none";
                  }}
                  placeholder="Masukkan username"
                  disabled={loading}
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label
                className="block text-[11px] font-bold uppercase tracking-[0.05em] mb-1.5 ml-1"
                style={{ color: sub }}
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock size={18} style={{ color: subtle }} />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`ui-form-field ui-focus-ring w-full min-h-11 pl-11 pr-4 py-3 text-sm outline-none transition-all rounded-xl ${error && !password ? "ui-form-invalid" : ""}`}
                  style={{
                    backgroundColor: inputBg,
                    border: `1px solid ${inputBorder}`,
                    color: text,
                  }}
                  aria-invalid={!!error && !password}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = focusRing;
                    e.currentTarget.style.boxShadow = `0 0 0 4px ${focusRing}1A`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor =
                      error && !password ? "var(--color-danger)" : inputBorder;
                    e.currentTarget.style.boxShadow = "none";
                  }}
                  placeholder="Masukkan password"
                  disabled={loading}
                  autoComplete="current-password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary ui-motion-button ui-focus-ring w-full min-h-11 py-3.5 px-4 text-white font-bold text-sm rounded-xl transition-colors shadow-sm focus:outline-none mt-2"
              data-magnetic="true"
              style={{
                backgroundColor: focusRing,
                opacity: loading ? 0.6 : 1,
                cursor: loading ? "wait" : "pointer",
              }}
              onMouseEnter={(e) =>
                !loading && (e.currentTarget.style.backgroundColor = "#0066D6")
              }
              onMouseLeave={(e) =>
                !loading && (e.currentTarget.style.backgroundColor = focusRing)
              }
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>

        <p
          className="ui-over-media-copy mx-auto mt-8 px-3 py-1 text-center text-xs"
          style={{ color: subtle }}
        >
          &copy; 2026 HABIL SUPERAPP. All rights reserved.
        </p>
      </div>
    </div>
  );
}
