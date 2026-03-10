import React from 'react';
import { Home, ShoppingCart, Package, DollarSign, Users, LogOut, Moon, Sun } from 'lucide-react';

export default function Sidebar({ isDarkMode, setIsDarkMode }) {
  const menuItems = [
    { icon: Home, label: 'Dashboard' },
    { icon: ShoppingCart, label: 'Orders' },
    { icon: Package, label: 'Products' },
    { icon: DollarSign, label: 'Finance' },
    { icon: Users, label: 'Employees' },
  ];

  return (
    <div className={`w-64 h-screen fixed left-0 top-0 flex flex-col transition-colors duration-300 ${
      isDarkMode 
        ? 'bg-black border-r border-[#424245]' 
        : 'bg-white border-r border-[#E5E5EA]'
    }`}>
      
      {/* Logo Section - Apple Style */}
      <div className={`px-6 py-8 border-b transition-colors duration-300 ${
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
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 overflow-y-auto py-6 px-3">
        <div className="space-y-1">
          {menuItems.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={i}
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
        <button className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all duration-150 ease-in-out ${
          isDarkMode
            ? 'bg-[#1C1C1E] text-[#FF3B30] hover:bg-[#2C2C2E] active:opacity-70'
            : 'bg-[#F5F5F7] text-[#FF3B30] hover:bg-[#EFEFEF] active:opacity-70'
        }`}>
          <LogOut size={20} strokeWidth={2} />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}