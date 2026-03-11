import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function Dashboard({ isDarkMode, isSidebarOpen }) {
  const data = [
    { name: 'Jan', orders: 400 },
    { name: 'Feb', orders: 300 },
    { name: 'Mar', orders: 200 },
    { name: 'Apr', orders: 278 },
  ];

  const metrics = [
    { label: 'Total Orders', value: '0', icon: '📦', color: '#30B0C0' },
    { label: 'Completed', value: '0', icon: '✓', color: '#34C759' },
    { label: 'Revenue', value: 'Rp 0', icon: '💰', color: '#FF9500' },
    { label: 'Inventory', value: '0', icon: '📊', color: '#FF3B30' },
  ];

  return (
    <div className={`transition-all duration-300 min-h-screen ${
      isDarkMode ? 'bg-black' : 'bg-white'
    }`} style={{
      marginLeft: isSidebarOpen ? '256px' : '80px',
    }}>
      
      {/* Header Section */}
      <div className={`border-b transition-colors duration-300 ${
        isDarkMode ? 'border-[#424245] bg-black' : 'border-[#E5E5EA] bg-white'
      }`}>
        <div className="px-6 py-8">
          <h1 className={`text-4xl font-bold tracking-tight mb-2 transition-colors duration-300 ${
            isDarkMode ? 'text-white' : 'text-black'
          }`}>
            Dashboard
          </h1>
          <p className={`text-base font-medium transition-colors duration-300 ${
            isDarkMode ? 'text-[#86868B]' : 'text-[#86868B]'
          }`}>
            Welcome back! Here's your business overview.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-6 py-8">
        
        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {metrics.map((metric, index) => (
            <div
              key={index}
              className={`p-6 rounded-2xl transition-all duration-150 ease-in-out border ${
                isDarkMode
                  ? 'bg-[#1C1C1E] border-[#424245] hover:border-[#86868B] hover:shadow-lg'
                  : 'bg-[#F5F5F7] border-[#E5E5EA] hover:border-[#D1D1D6] hover:shadow-md'
              } cursor-pointer active:scale-95`}
            >
              {/* Icon */}
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg mb-4" style={{
                backgroundColor: `${metric.color}20`,
              }}>
                <span className="text-2xl">{metric.icon}</span>
              </div>
              
              {/* Content */}
              <p className={`text-sm font-medium mb-2 ${
                isDarkMode ? 'text-[#86868B]' : 'text-[#86868B]'
              }`}>
                {metric.label}
              </p>
              <p className={`text-3xl font-bold tracking-tight ${
                isDarkMode ? 'text-white' : 'text-black'
              }`}>
                {metric.value}
              </p>
              
              {/* Accent Line */}
              <div className="mt-4 h-1 w-8 rounded-full" style={{ backgroundColor: metric.color }} />
            </div>
          ))}
        </div>

        {/* Chart Section */}
        <div className={`p-6 rounded-2xl border transition-colors duration-300 mb-8 ${
          isDarkMode
            ? 'bg-[#1C1C1E] border-[#424245]'
            : 'bg-[#F5F5F7] border-[#E5E5EA]'
        }`}>
          <div className="mb-6">
            <h2 className={`text-xl font-bold tracking-tight ${
              isDarkMode ? 'text-white' : 'text-black'
            }`}>
              Orders Trend
            </h2>
            <p className={`text-sm font-medium mt-1 ${
              isDarkMode ? 'text-[#86868B]' : 'text-[#86868B]'
            }`}>
              Last 4 months performance
            </p>
          </div>
          
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke={isDarkMode ? '#2C2C2E' : '#D1D1D6'}
                opacity={isDarkMode ? 0.5 : 0.3}
              />
              <XAxis 
                dataKey="name" 
                stroke={isDarkMode ? '#86868B' : '#86868B'}
              />
              <YAxis 
                stroke={isDarkMode ? '#86868B' : '#86868B'}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: isDarkMode ? '#1C1C1E' : '#FFFFFF',
                  border: `1px solid ${isDarkMode ? '#424245' : '#E5E5EA'}`,
                  borderRadius: '12px',
                  color: isDarkMode ? '#FFFFFF' : '#000000',
                  boxShadow: isDarkMode 
                    ? '0 4px 16px rgba(0, 0, 0, 0.4)'
                    : '0 4px 16px rgba(0, 0, 0, 0.12)',
                  padding: '12px 16px',
                  fontSize: '14px',
                  fontWeight: '500',
                }}
                cursor={false}
              />
              <Legend 
                wrapperStyle={{
                  color: isDarkMode ? '#86868B' : '#86868B',
                }}
              />
              <Bar dataKey="orders" fill="#30B0C0" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent Orders Table */}
        <div className={`p-6 rounded-2xl border transition-colors duration-300 ${
          isDarkMode
            ? 'bg-[#1C1C1E] border-[#424245]'
            : 'bg-[#F5F5F7] border-[#E5E5EA]'
        }`}>
          <div className="mb-6">
            <h2 className={`text-xl font-bold tracking-tight ${
              isDarkMode ? 'text-white' : 'text-black'
            }`}>
              Recent Orders
            </h2>
            <p className={`text-sm font-medium mt-1 ${
              isDarkMode ? 'text-[#86868B]' : 'text-[#86868B]'
            }`}>
              Latest transactions from your store
            </p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${
                  isDarkMode ? 'border-[#424245]' : 'border-[#E5E5EA]'
                }`}>
                  <th className={`text-left py-4 px-4 font-semibold ${
                    isDarkMode ? 'text-[#EBEBF0]' : 'text-[#424245]'
                  }`}>Order #</th>
                  <th className={`text-left py-4 px-4 font-semibold ${
                    isDarkMode ? 'text-[#EBEBF0]' : 'text-[#424245]'
                  }`}>Customer</th>
                  <th className={`text-left py-4 px-4 font-semibold ${
                    isDarkMode ? 'text-[#EBEBF0]' : 'text-[#424245]'
                  }`}>Amount</th>
                  <th className={`text-left py-4 px-4 font-semibold ${
                    isDarkMode ? 'text-[#EBEBF0]' : 'text-[#424245]'
                  }`}>Status</th>
                  <th className={`text-left py-4 px-4 font-semibold ${
                    isDarkMode ? 'text-[#EBEBF0]' : 'text-[#424245]'
                  }`}>Date</th>
                </tr>
              </thead>
              <tbody>
                <tr className={`border-b ${
                  isDarkMode ? 'border-[#424245]' : 'border-[#E5E5EA]'
                }`}>
                  <td colSpan="5" className={`text-center py-12 font-medium ${
                    isDarkMode ? 'text-[#86868B]' : 'text-[#86868B]'
                  }`}>
                    No orders yet
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}