import React, { useState } from 'react';
import { Home, ShoppingCart, Package, DollarSign, Users, LogOut, Moon, Sun, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Sidebar({ isDarkMode, setIsDarkMode, isSidebarOpen, setIsSidebarOpen }) {
  const [hoveredIcon, setHoveredIcon] = useState(null);
  const navigate = useNavigate();

  const menuItems = [
    { icon: Home, label: 'Dashboard', path: '/dashboard' },
    { icon: ShoppingCart, label: 'Orders', path: '/orders' },
    { icon: Package, label: 'Products', path: '/products' },
    { icon: DollarSign, label: 'Finance', path: '/finance' },
    { icon: Users, label: 'Employees', path: '/employees' },
    { icon: Package, label: 'Invoices', path: '/invoices' },
  ];

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <>
      {/* Full Sidebar - Open State */}
      <div className={`w-64 h-screen fixed left-0 top-0 flex flex-col transition-all duration-300 z-40 ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } ${
        isDarkMode 
          ? 'bg-black border-r border-[#424245]' 
          : 'bg-white border-r border-[#E5E5EA]'
      }`}>
        
        {/* Logo Section */}
        <div className={`px-6 py-8 border-b transition-colors duration-300 flex items-center justify-between ${
          isDarkMode ? 'border-[#424245]' : 'border-[#E5E5EA]'
        }`}>
          <div>
            <h1 className={`text-2xl font-bold tracking-tight mb-1 ${
              isDarkMode ? 'text-white' : 'text-black'
            }`}>
              Dashboard
            </h1>
            <p className={`text-sm font-medium ${
              isDarkMode ? 'text-[#86868B]' : 'text-[#86868B]'
            }`}>
              CV Habil
            </p>
          </div>
          
          {/* Close Button Inside */}
          <button
            onClick={() => setIsSidebarOpen(false)}
            className={`p-2 rounded-lg transition-all duration-150 ${
              isDarkMode
                ? 'hover:bg-[#1C1C1E] text-white'
                : 'hover:bg-[#F5F5F7] text-black'
            }`}
          >
            <ChevronLeft size={20} strokeWidth={2.5} />
          </button>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 overflow-y-auto py-6 px-3">
          <div className="space-y-1">
            {menuItems.map((item, i) => {
              const Icon = item.icon;
              return (
                <button
                  key={i}
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-base transition-all duration-150 ease-in-out ${
                    isDarkMode
                      ? 'text-[#EBEBF0] hover:bg-[#1C1C1E] active:bg-[#2C2C2E] active:opacity-70'
                      : 'text-[#424245] hover:bg-[#F5F5F7] active:bg-[#EFEFEF] active:opacity-70'
                  }`}
                >
                  <Icon size={20} strokeWidth={2} className={isDarkMode ? 'text-[#86868B]' : 'text-[#86868B]'} />
                  <span className="text-left">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Separator */}
        <div className={`mx-3 mb-4 h-px ${isDarkMode ? 'bg-[#424245]' : 'bg-[#E5E5EA]'}`} />

        {/* Dark Mode Toggle */}
        <div className="px-3 pb-4">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all duration-150 ease-in-out ${
              isDarkMode
                ? 'bg-[#1C1C1E] text-[#FFD60A] hover:bg-[#2C2C2E] active:opacity-70'
                : 'bg-[#F5F5F7] text-[#FF9500] hover:bg-[#EFEFEF] active:opacity-70'
            }`}
          >
            {isDarkMode ? (
              <>
                <Sun size={20} strokeWidth={2} />
                <span>Light Mode</span>
              </>
            ) : (
              <>
                <Moon size={20} strokeWidth={2} />
                <span>Dark Mode</span>
              </>
            )}
          </button>
        </div>

        {/* Logout Button */}
        <div className="px-3 pb-6">
          <button 
            onClick={handleLogout}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all duration-150 ease-in-out ${
            isDarkMode
              ? 'bg-[#1C1C1E] text-[#FF3B30] hover:bg-[#2C2C2E] active:opacity-70'
              : 'bg-[#F5F5F7] text-[#FF3B30] hover:bg-[#EFEFEF] active:opacity-70'
          }`}>
            <LogOut size={20} strokeWidth={2} />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Mini Sidebar - Closed State (Icons Only) */}
      <div className={`w-20 h-screen fixed left-0 top-0 flex flex-col transition-all duration-300 z-40 ${
        isSidebarOpen ? '-translate-x-full' : 'translate-x-0'
      } ${
        isDarkMode 
          ? 'bg-black border-r border-[#424245]' 
          : 'bg-white border-r border-[#E5E5EA]'
      }`}>
        
        {/* Open Button at Top */}
        <div className="px-3 py-8">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className={`w-full flex items-center justify-center p-2 rounded-lg transition-all duration-150 ${
              isDarkMode
                ? 'hover:bg-[#1C1C1E] text-white'
                : 'hover:bg-[#F5F5F7] text-black'
            }`}
          >
            <ChevronRight size={24} strokeWidth={2.5} />
          </button>
        </div>

        {/* Mini Menu Icons with Tooltips */}
        <nav className="flex-1 overflow-y-auto py-6 px-0">
          <div className="space-y-3 flex flex-col items-center">
            {menuItems.map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="relative group w-full flex justify-center">
                  <button
                    onClick={() => navigate(item.path)}
                    onMouseEnter={() => setHoveredIcon(i)}
                    onMouseLeave={() => setHoveredIcon(null)}
                    className={`p-3 rounded-lg transition-all duration-150 ease-in-out ${
                      isDarkMode
                        ? 'text-[#EBEBF0] hover:bg-[#1C1C1E] active:bg-[#2C2C2E] active:opacity-70'
                        : 'text-[#424245] hover:bg-[#F5F5F7] active:bg-[#EFEFEF] active:opacity-70'
                    }`}
                  >
                    <Icon size={20} strokeWidth={2} />
                  </button>
                  
                  {/* Tooltip - Fixed Position */}
                  {hoveredIcon === i && (
                    <div className={`fixed left-24 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap z-50 pointer-events-none transition-opacity duration-75 ${
                      isDarkMode
                        ? 'bg-[#2C2C2E] text-white border border-[#424245]'
                        : 'bg-[#F5F5F7] text-black border border-[#E5E5EA]'
                    }`} style={{
                      top: `${120 + i * 52}px`,
                    }}>
                      {item.label}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </nav>

        {/* Mini Dark Mode & Logout with Tooltips */}
        <div className="px-2 pb-6 space-y-3">
          <div className="relative group w-full flex justify-center">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              onMouseEnter={() => setHoveredIcon('theme')}
              onMouseLeave={() => setHoveredIcon(null)}
              className={`p-3 rounded-lg transition-all duration-150 ease-in-out ${
                isDarkMode
                  ? 'bg-[#1C1C1E] text-[#FFD60A] hover:bg-[#2C2C2E]'
                  : 'bg-[#F5F5F7] text-[#FF9500] hover:bg-[#EFEFEF]'
              }`}
            >
              {isDarkMode ? (
                <Sun size={20} strokeWidth={2} />
              ) : (
                <Moon size={20} strokeWidth={2} />
              )}
            </button>
            
            {/* Tooltip */}
            {hoveredIcon === 'theme' && (
              <div className={`fixed left-24 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap z-50 pointer-events-none transition-opacity duration-75 ${
                isDarkMode
                  ? 'bg-[#2C2C2E] text-white border border-[#424245]'
                  : 'bg-[#F5F5F7] text-black border border-[#E5E5EA]'
              }`} style={{
                bottom: `100px`,
              }}>
                {isDarkMode ? 'Light Mode' : 'Dark Mode'}
              </div>
            )}
          </div>

          <div className="relative group w-full flex justify-center">
            <button 
              onClick={handleLogout}
              onMouseEnter={() => setHoveredIcon('logout')}
              onMouseLeave={() => setHoveredIcon(null)}
              className={`p-3 rounded-lg transition-all duration-150 ease-in-out ${
                isDarkMode
                  ? 'bg-[#1C1C1E] text-[#FF3B30] hover:bg-[#2C2C2E]'
                  : 'bg-[#F5F5F7] text-[#FF3B30] hover:bg-[#EFEFEF]'
              }`}
            >
              <LogOut size={20} strokeWidth={2} />
            </button>
            
            {/* Tooltip */}
            {hoveredIcon === 'logout' && (
              <div className={`fixed left-24 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap z-50 pointer-events-none transition-opacity duration-75 ${
                isDarkMode
                  ? 'bg-[#2C2C2E] text-white border border-[#424245]'
                  : 'bg-[#F5F5F7] text-black border border-[#E5E5EA]'
              }`} style={{
                bottom: `40px`,
              }}>
                Logout
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}