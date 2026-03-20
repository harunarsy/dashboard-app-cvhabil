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
import './App.css';

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return isMobile;
}

function ProtectedRoute({ children, isDarkMode, setIsDarkMode, isSidebarOpen, setIsSidebarOpen, isMobile }) {
  const { token } = useContext(AuthContext);
  if (!token) return <Navigate to="/login" />;
  return (
    <div className="flex">
      <Sidebar isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />
      <div className="flex-1" style={{ marginLeft: isMobile ? 0 : (isSidebarOpen ? '256px' : '80px'), transition: 'margin-left 0.3s ease-in-out' }}>{children}</div>
    </div>
  );
}

function PageTitleWrapper({ title, children }) {
  useDocumentTitle(title);
  return children;
}

function AppRoutes({ isDarkMode, setIsDarkMode, isSidebarOpen, setIsSidebarOpen, isMobile }) {
  const { token } = useContext(AuthContext);
  const wrap = (Component, title) => (
    <ProtectedRoute isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} isMobile={isMobile}>
      <PageTitleWrapper title={title}>
        <Component isDarkMode={isDarkMode} isSidebarOpen={isSidebarOpen} isMobile={isMobile} />
      </PageTitleWrapper>
    </ProtectedRoute>
  );
  return (
    <Routes>
      <Route path="/login" element={<PageTitleWrapper title="Login"><Login /></PageTitleWrapper>} />
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
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const isMobile = useIsMobile();
  return (
    <AuthProvider>
      <Router>
        <div className={`transition-colors duration-300 ${isDarkMode ? 'dark' : ''}`} style={{ backgroundColor: isDarkMode ? '#000000' : '#FFFFFF' }}>
          <AppRoutes isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} isMobile={isMobile} />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
