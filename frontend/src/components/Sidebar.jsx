import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, ShoppingCart, Package, DollarSign, Users, ChevronLeft, ChevronRight, Sun, LogOut } from 'lucide-react';

export default function Sidebar({ isDarkMode, setIsDarkMode, isSidebarOpen, setIsSidebarOpen }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const menuItems = [
    { icon: Home, label: 'Dashboard', path: '/dashboard', active: true },
    { icon: ShoppingCart, label: 'Orders', path: '/orders', active: false },
    { icon: Package, label: 'Products', path: '/products', active: false },
    { icon: DollarSign, label: 'Finance', path: '/finance', active: false },
    { icon: Users, label: 'Employees', path: '/employees', active: false },
    { icon: Package, label: 'Invoices', path: '/invoices', active: true },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        height: '100vh',
        width: isSidebarOpen ? '256px' : '80px',
        backgroundColor: isDarkMode ? '#000000' : '#FFFFFF',
        borderRight: isDarkMode ? '1px solid #424245' : '1px solid #E5E5EA',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.3s ease-in-out',
        zIndex: 40,
      }}
    >
      {/* Header */}
      <div style={{
        padding: '1.5rem',
        borderBottom: isDarkMode ? '1px solid #424245' : '1px solid #E5E5EA',
        display: 'flex',
        alignItems: 'center',
        justifyContent: isSidebarOpen ? 'space-between' : 'center'
      }}>
        {isSidebarOpen && (
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: '0 0 0.25rem 0', color: isDarkMode ? '#FFF' : '#000' }}>
              Dashboard
            </h1>
            <p style={{ fontSize: '0.875rem', color: isDarkMode ? '#86868B' : '#6B7280', margin: 0 }}>
              CV Habil
            </p>
          </div>
        )}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isDarkMode ? '#FFF' : '#000'
          }}
        >
          {isSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
      </div>

      {/* Menu Items */}
      <nav style={{ flex: 1, padding: '1rem', overflowY: 'auto' }}>
        {menuItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = item.active;
          const isDisabled = !item.active;

          return (
            <button
              key={index}
              onClick={() => isActive && navigate(item.path)}
              title={item.label}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                marginBottom: '0.5rem',
                borderRadius: '0.5rem',
                border: 'none',
                cursor: isActive ? 'pointer' : 'not-allowed',
                backgroundColor: isActive 
                  ? (isDarkMode ? '#1C1C1E' : '#f9fafb')
                  : 'transparent',
                color: isActive
                  ? (isDarkMode ? '#FFF' : '#000')
                  : (isDarkMode ? '#6B7280' : '#D1D5DB'),
                opacity: isDisabled ? 0.5 : 1,
                transition: 'all 0.2s ease-in-out',
                fontSize: '0.875rem',
                fontWeight: '500',
                textAlign: 'left',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
              onMouseEnter={(e) => {
                if (isActive) {
                  e.target.style.backgroundColor = isDarkMode ? '#2C2C2E' : '#E5E7EB';
                }
              }}
              onMouseLeave={(e) => {
                if (isActive) {
                  e.target.style.backgroundColor = isDarkMode ? '#1C1C1E' : '#f9fafb';
                }
              }}
            >
              <Icon size={20} style={{ minWidth: '20px' }} />
              {isSidebarOpen && (
                <>
                  <span>{item.label}</span>
                  {isDisabled && <span style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>Soon</span>}
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{
        padding: '1rem',
        borderTop: isDarkMode ? '1px solid #424245' : '1px solid #E5E5EA'
      }}>
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          title={isDarkMode ? 'Light Mode' : 'Dark Mode'}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
            marginBottom: '0.5rem',
            borderRadius: '0.5rem',
            border: 'none',
            cursor: 'pointer',
            backgroundColor: isDarkMode ? '#1C1C1E' : '#f9fafb',
            color: isDarkMode ? '#FFF' : '#000',
            transition: 'all 0.2s',
            fontSize: '0.875rem',
            fontWeight: '500'
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = isDarkMode ? '#2C2C2E' : '#E5E7EB';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = isDarkMode ? '#1C1C1E' : '#f9fafb';
          }}
        >
          <Sun size={20} style={{ minWidth: '20px' }} />
          {isSidebarOpen && <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>

        <button
          onClick={handleLogout}
          title="Logout"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
            borderRadius: '0.5rem',
            border: 'none',
            cursor: 'pointer',
            backgroundColor: '#ef4444',
            color: 'white',
            transition: 'all 0.2s',
            fontSize: '0.875rem',
            fontWeight: '500'
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#dc2626';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = '#ef4444';
          }}
        >
          <LogOut size={20} style={{ minWidth: '20px' }} />
          {isSidebarOpen && <span>Logout</span>}
        </button>
      </div>
    </div>
  );
}