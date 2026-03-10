import React, { useContext, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Sidebar from './components/Sidebar';
import { AuthContext, AuthProvider } from './context/AuthContext';
import './App.css';

function ProtectedRoute({ children, isDarkMode, setIsDarkMode }) {
  const { token } = useContext(AuthContext);
  
  if (!token) {
    return <Navigate to="/login" />;
  }

  return (
    <div className="flex">
      <Sidebar isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}

function AppRoutes({ isDarkMode, setIsDarkMode }) {
  const { token } = useContext(AuthContext);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route 
        path="/dashboard" 
        element={
          <ProtectedRoute isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode}>
            <Dashboard isDarkMode={isDarkMode} />
          </ProtectedRoute>
        } 
      />
      <Route path="/" element={<Navigate to={token ? "/dashboard" : "/login"} />} />
    </Routes>
  );
}

function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  return (
    <AuthProvider>
      <Router>
        <div className="transition-colors duration-300" style={{
          backgroundColor: isDarkMode ? '#000000' : '#FFFFFF',
        }}>
          <AppRoutes isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;