import React, { useContext, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Sidebar from './components/Sidebar';
import InvoiceList from './components/InvoiceList';
import BugReports from './components/BugReports';
import SalesOrderList from './components/SalesOrderList';
import CustomerList from './components/CustomerList';
import InventoryDashboard from './components/InventoryDashboard';
import PurchaseOrderList from './components/PurchaseOrderList';
import OnlineStoreDashboard from './components/OnlineStoreDashboard';
import LedgerPage from './components/LedgerPage';
import PrintSettings from './components/PrintSettings';
import { AuthContext, AuthProvider } from './context/AuthContext';
import { useDocumentTitle } from './hooks/useDocumentTitle';
import useGlassMode from './hooks/useGlassMode';
import useVantaBackground from './hooks/useVantaBackground';
import './App.css';
import './styles/liquid-glass.css';

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return isMobile;
}

function ProtectedRoute({ children, isDarkMode, setIsDarkMode, isGlassMode, isVantaMode, isSidebarOpen, setIsSidebarOpen, isMobile }) {
  const { token } = useContext(AuthContext);
  if (!token) return <Navigate to="/login" />;
  return (
    <div className="flex">
      <Sidebar isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} isGlassMode={isGlassMode} isVantaMode={isVantaMode} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />
      <div className="flex-1" style={{ marginLeft: isMobile ? 0 : (isSidebarOpen ? '284px' : '108px'), transition: 'margin-left 0.3s ease-in-out' }}>{children}</div>
    </div>
  );
}

function PageTitleWrapper({ title, children }) {
  useDocumentTitle(title);
  return children;
}

function AppRoutes({ isDarkMode, setIsDarkMode, isGlassMode, setIsGlassMode, isVantaMode, isSidebarOpen, setIsSidebarOpen, isMobile }) {
  const { token } = useContext(AuthContext);
  const wrap = (Component, title) => (
    <ProtectedRoute isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} isGlassMode={isGlassMode} isVantaMode={isVantaMode} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} isMobile={isMobile}>
      <PageTitleWrapper title={title}>
        <Component isDarkMode={isDarkMode} isGlassMode={isGlassMode} isVantaMode={isVantaMode} isSidebarOpen={isSidebarOpen} isMobile={isMobile} />
      </PageTitleWrapper>
    </ProtectedRoute>
  );
  return (
    <Routes>
      <Route path="/login" element={<PageTitleWrapper title="Login"><Login isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} isGlassMode={isGlassMode} setIsGlassMode={setIsGlassMode} isVantaMode={isVantaMode} /></PageTitleWrapper>} />
      <Route path="/dashboard" element={wrap(Dashboard, 'Dashboard')} />
      <Route path="/invoices" element={wrap(InvoiceList, 'Nota Penjualan')} />
      <Route path="/sales" element={wrap(SalesOrderList, 'Nota Penjualan')} />
      <Route path="/customers" element={wrap(CustomerList, 'Customers')} />
      <Route path="/inventory" element={wrap(InventoryDashboard, 'Inventory')} />
      <Route path="/orders" element={wrap(PurchaseOrderList, 'Surat Pesanan')} />
      <Route path="/online-store" element={wrap(OnlineStoreDashboard, 'Toko Online')} />
      <Route path="/ledger" element={wrap(LedgerPage, 'Buku Besar')} />
      <Route path="/print-settings" element={wrap(PrintSettings, 'Settings')} />
      <Route path="/bugs" element={wrap(BugReports, 'Bug Reports')} />
      <Route path="/" element={<Navigate to={token ? "/dashboard" : "/login"} />} />
    </Routes>
  );
}

function App() {
  // Init dark mode dari localStorage (persist antar sesi, juga aktif di Login page sebelum auth)
  const [isDarkMode, setIsDarkModeState] = useState(() => {
    try { return localStorage.getItem('habil_dark_mode') === '1'; } catch { return false; }
  });
  const setIsDarkMode = (val) => {
    const next = typeof val === 'function' ? val(isDarkMode) : val;
    setIsDarkModeState(next);
    try { localStorage.setItem('habil_dark_mode', next ? '1' : '0'); } catch {}
  };
  // Liquid Glass overlay theme — toggle dari Login page, persist localStorage
  const [isGlassMode, setIsGlassMode] = useGlassMode();
  // Vanta.js animated background (v1.8.6) — theme-aware FOG effect, always ON
  // Auto-disable only via: ?vanta=off URL / prefers-reduced-motion / deviceMemory<4. No UI toggle.
  const [vantaRef, isVantaMode] = useVantaBackground(isDarkMode);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const isMobile = useIsMobile();

  // Sync `dark` class ke body supaya CSS selector `body.dark.liquid-glass-active` matches
  useEffect(() => {
    try {
      if (isDarkMode) document.body.classList.add('dark');
      else document.body.classList.remove('dark');
    } catch {}
  }, [isDarkMode]);

  return (
    <AuthProvider>
      <Router>
        {/* Vanta canvas behind everything — pointer-events: none di CSS */}
        <div ref={vantaRef} id="vanta-bg" />
        <div className={`app-content transition-colors duration-300 ${isDarkMode ? 'dark' : ''}`} style={{ backgroundColor: isVantaMode ? 'transparent' : (isDarkMode ? '#000000' : '#FFFFFF') }}>
          <AppRoutes isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} isGlassMode={isGlassMode} setIsGlassMode={setIsGlassMode} isVantaMode={isVantaMode} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} isMobile={isMobile} />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
