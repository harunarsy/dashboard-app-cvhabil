import React from 'react';
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function StockMovementChart({ data, isDarkMode, border, sub, formatQty }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#2C2C2E' : '#E5E5EA'} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: sub, fontSize: 10 }}
          axisLine={{ stroke: isDarkMode ? '#2C2C2E' : '#E5E5EA' }}
          tickLine={false}
          interval={4}
        />
        <YAxis
          tick={{ fill: sub, fontSize: 10 }}
          axisLine={{ stroke: isDarkMode ? '#2C2C2E' : '#E5E5EA' }}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          formatter={(value, name) => [formatQty(value), name === 'inQty' ? 'Masuk' : 'Keluar']}
          contentStyle={{
            backgroundColor: isDarkMode ? '#1C1C1E' : '#FFF',
            border: `1px solid ${border}`,
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          }}
        />
        <Line
          type="monotone"
          dataKey="inQty"
          name="Masuk"
          stroke="#34C759"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="outQty"
          name="Keluar"
          stroke="#FF3B30"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
