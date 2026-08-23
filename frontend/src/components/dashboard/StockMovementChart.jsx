import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";

function ChartTooltip({ active, payload, label, isDarkMode, formatQty }) {
  if (!active || !payload?.length) return null;
  const panelBg = isDarkMode
    ? "var(--color-surface-elevated)"
    : "var(--color-surface)";
  const border = isDarkMode
    ? "var(--color-surface-raised)"
    : "var(--color-border)";
  const text = isDarkMode ? "#FFF" : "var(--color-text)";
  const sub = "var(--color-text-subtle)";

  return (
    <div
      className="relative rounded-2xl border px-3 py-2 shadow-lg"
      style={{
        backgroundColor: panelBg,
        borderColor: border,
        boxShadow: isDarkMode
          ? "0 16px 32px rgba(0,0,0,0.32)"
          : "0 10px 24px rgba(15,23,42,0.12)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <div
        className="absolute -top-1.5 left-5 h-3 w-3 rotate-45 border-l border-t"
        style={{
          backgroundColor: panelBg,
          borderColor: border,
        }}
      />
      <p className="text-[11px] font-semibold mb-2" style={{ color: sub }}>
        {label}
      </p>
      <div className="flex flex-col gap-1.5">
        {payload.map((entry) => {
          const color = entry.dataKey === "inQty" ? "var(--color-success)" : "var(--color-danger)";
          return (
            <div key={entry.dataKey} className="flex items-center justify-between gap-4 text-[12px]">
              <span className="inline-flex items-center gap-2" style={{ color: text }}>
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                {entry.name}
              </span>
              <span style={{ color }}>
                {formatQty(entry.value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function StockMovementChart({
  data,
  isDarkMode,
  border,
  sub,
  formatQty,
}) {
  const hostRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const node = hostRef.current;
    if (!node) return undefined;

    const measure = () => {
      const rect = node.getBoundingClientRect();
      setSize((prev) => {
        const next = {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
        return prev.width === next.width && prev.height === next.height
          ? prev
          : next;
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);

    return () => ro.disconnect();
  }, []);

  const axisStroke = isDarkMode
    ? "var(--color-surface-raised)"
    : "var(--color-border)";
  const tooltipContent = useMemo(
    () => (props) => (
      <ChartTooltip {...props} isDarkMode={isDarkMode} formatQty={formatQty} />
    ),
    [isDarkMode, formatQty],
  );

  if (!size.width || !size.height) {
    return <div ref={hostRef} style={{ width: "100%", height: "100%" }} aria-hidden="true" />;
  }

  return (
    <div ref={hostRef} style={{ width: "100%", height: "100%" }}>
      <LineChart
        width={size.width}
        height={size.height}
        data={data}
        margin={{ top: 10, right: 10, left: -12, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={axisStroke}
          vertical={false}
        />
        <XAxis
          dataKey="label"
          tick={{ fill: sub, fontSize: 10 }}
          axisLine={{ stroke: axisStroke }}
          tickLine={false}
          interval={4}
        />
        <YAxis
          tick={{ fill: sub, fontSize: 10 }}
          axisLine={{ stroke: axisStroke }}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          content={tooltipContent}
          cursor={{ stroke: "var(--color-action)", strokeWidth: 1, strokeDasharray: "4 4" }}
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
