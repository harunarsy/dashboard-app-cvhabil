import React, { useContext, useState } from 'react';
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
import './App.css';

function ProtectedRoute({ children, isDarkMode, setIsDarkMode, isSidebarOpen, setIsSidebarOpen }) {
  const { token } = useContext(AuthContext);
  if (!token) return <Navigate to="/login" />;
  return (
    <div className="flex">
      <Sidebar isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />
      <div className="flex-1">{children}</div>
    </div>
  );
}

function AppRoutes({ isDarkMode, setIsDarkMode, isSidebarOpen, setIsSidebarOpen }) {
  const { token } = useContext(AuthContext);
  const wrap = (Component) => (
    <ProtectedRoute isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen}>
      <Component isDarkMode={isDarkMode} isSidebarOpen={isSidebarOpen} />
    </ProtectedRoute>
  );
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={wrap(Dashboard)} />
      <Route path="/invoices" element={wrap(InvoiceList)} />
      <Route path="/sales" element={wrap(SalesOrderList)} />
      <Route path="/customers" element={wrap(CustomerList)} />
      <Route path="/inventory" element={wrap(InventoryDashboard)} />
      <Route path="/orders" element={wrap(PurchaseOrderList)} />
      <Route path="/online-store" element={wrap(OnlineStoreDashboard)} />
      <Route path="/ledger" element={wrap(LedgerPage)} />
      <Route path="/print-settings" element={wrap(PrintSettings)} />
      <Route path="/bugs" element={wrap(BugReports)} />
      <Route path="/" element={<Navigate to={token ? "/dashboard" : "/login"} />} />
    </Routes>
  );
}

function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  return (
    <AuthProvider>
      <Router>
        <div className={`transition-colors duration-300 ${isDarkMode ? 'dark' : ''}`} style={{ backgroundColor: isDarkMode ? '#000000' : '#FFFFFF' }}>
          <AppRoutes isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
