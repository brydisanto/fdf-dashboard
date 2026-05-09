"use client";

import {
  Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmtUsd } from "@/lib/format";
import type { PricePoint } from "@/lib/types";

const fmtTick = (t: number) => {
  const d = new Date(t);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export function MarketCapChart({ data }: { data: PricePoint[] }) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="mcGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%"  stopColor="var(--color-brand)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="t"
            tickFormatter={fmtTick}
            stroke="var(--color-text-muted)"
            tick={{ fill: "var(--color-text)" }}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            minTickGap={32}
          />
          <YAxis
            dataKey="price"
            domain={["auto", "auto"]}
            stroke="var(--color-text-muted)"
            tick={{ fill: "var(--color-text)" }}
            tickFormatter={(v) => fmtUsd(v, { compact: true })}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            width={64}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-border-strong)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
            formatter={(v) => [fmtUsd(Number(v), { compact: true }), "Market Cap"] as [string, string]}
            cursor={{ stroke: "var(--color-border-strong)", strokeDasharray: "3 3" }}
          />
          <Area
            type="monotone"
            dataKey="price"
            stroke="var(--color-brand)"
            strokeWidth={2}
            fill="url(#mcGrad)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function VolumeChart({ data }: { data: PricePoint[] }) {
  return (
    <div className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="t"
            tickFormatter={(t) => new Date(t).toLocaleTimeString("en-US", { hour: "numeric" })}
            stroke="var(--color-text-muted)"
            tick={{ fill: "var(--color-text)" }}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            minTickGap={24}
          />
          <YAxis
            dataKey="volume"
            stroke="var(--color-text-muted)"
            tick={{ fill: "var(--color-text)" }}
            tickFormatter={(v) => fmtUsd(v, { compact: true })}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            width={56}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.05)" }}
            contentStyle={{
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-border-strong)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
            formatter={(v) => [fmtUsd(Number(v), { compact: true }), "Volume"] as [string, string]}
          />
          <Bar
            dataKey="volume"
            fill="var(--color-brand)"
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
