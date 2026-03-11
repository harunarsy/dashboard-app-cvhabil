import React, { useContext, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Sidebar from './components/Sidebar';
import InvoiceList from './components/InvoiceList';
import BugReports from './components/BugReports';
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
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={
        <ProtectedRoute isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen}>
          <Dashboard isDarkMode={isDarkMode} isSidebarOpen={isSidebarOpen} />
        </ProtectedRoute>
      } />
      <Route path="/invoices" element={
        <ProtectedRoute isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen}>
          <InvoiceList isDarkMode={isDarkMode} isSidebarOpen={isSidebarOpen} />
        </ProtectedRoute>
      } />
      <Route path="/bugs" element={
        <ProtectedRoute isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen}>
          <BugReports isDarkMode={isDarkMode} isSidebarOpen={isSidebarOpen} />
        </ProtectedRoute>
      } />
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
        <div className="transition-colors duration-300" style={{ backgroundColor: isDarkMode ? '#000000' : '#FFFFFF' }}>
          <AppRoutes isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
