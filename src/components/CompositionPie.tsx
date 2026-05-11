"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { fmtUsd } from "@/lib/format";

export interface CompositionSlice {
  key: "nfl" | "soccer" | "fun";
  label: string;
  value: number;
  color: string;
}

export function CompositionPie({
  slices,
  total,
  size = 200,
}: {
  slices: CompositionSlice[];
  total: number;
  size?: number;
}) {
  // Filter out zero-value slices so the chart doesn't render empty segments.
  const data = slices.filter((s) => s.value > 0);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={2}
            stroke="var(--color-bg)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {data.map((s) => (
              <Cell key={s.key} fill={s.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "var(--color-press)",
              border: "1px solid var(--color-line-strong)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--color-text)",
            }}
            labelStyle={{ color: "var(--color-text)" }}
            itemStyle={{ color: "var(--color-text)" }}
            formatter={(v: unknown, _name: unknown, item: unknown) => {
              const lbl =
                typeof (item as { name?: string })?.name === "string"
                  ? String((item as { name: string }).name)
                  : "Value";
              const usd = fmtUsd(Number(v), { compact: true });
              const pct = total > 0 ? ((Number(v) / total) * 100).toFixed(1) : "0";
              return [`${usd} · ${pct}%`, lbl] as [string, string];
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Center label */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-dim)]">Total</div>
        <div className="tabular text-lg font-bold leading-tight">{fmtUsd(total, { compact: true })}</div>
      </div>
    </div>
  );
}
