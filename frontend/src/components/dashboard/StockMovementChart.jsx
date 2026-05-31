import React, { useLayoutEffect, useRef, useState } from 'react';
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';

export default function StockMovementChart({ data, isDarkMode, border, sub, formatQty }) {
  const hostRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const node = hostRef.current;
    if (!node) return undefined;

    const measure = () => {
      const rect = node.getBoundingClientRect();
      setSize(prev => {
        const next = { width: Math.round(rect.width), height: Math.round(rect.height) };
        return prev.width === next.width && prev.height === next.height ? prev : next;
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);

    return () => ro.disconnect();
  }, []);

  if (!size.width || !size.height) {
    return <div ref={hostRef} style={{ width: '100%', height: '100%' }} aria-hidden="true" />;
  }

  return (
    <div ref={hostRef} style={{ width: '100%', height: '100%' }}>
      <LineChart width={size.width} height={size.height} data={data} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? 'var(--color-surface-raised)' : 'var(--color-border)'} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: sub, fontSize: 10 }}
          axisLine={{ stroke: isDarkMode ? 'var(--color-surface-raised)' : 'var(--color-border)' }}
          tickLine={false}
          interval={4}
        />
        <YAxis
          tick={{ fill: sub, fontSize: 10 }}
          axisLine={{ stroke: isDarkMode ? 'var(--color-surface-raised)' : 'var(--color-border)' }}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          formatter={(value, name) => [formatQty(value), name === 'inQty' ? 'Masuk' : 'Keluar']}
          contentStyle={{
            backgroundColor: isDarkMode ? 'var(--color-surface-elevated)' : '#FFF',
            border: `1px solid ${border}`,
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          }}
        />
        <Line
          type="monotone"
          dataKey="inQty"
          name="Masuk"
          stroke="var(--color-success)"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="outQty"
          name="Keluar"
          stroke="var(--color-danger)"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </div>
  );
}
