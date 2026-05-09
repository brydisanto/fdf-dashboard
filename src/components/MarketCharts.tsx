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

const tooltipStyle = {
  background: "var(--color-press)",
  border: "1px solid var(--color-line-strong)",
  borderRadius: 8,
  fontSize: 12,
  fontFamily: "var(--font-mono)",
};
const tickStyle = {
  fill: "var(--color-text-dim)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
};

export function MarketCapChart({ data }: { data: PricePoint[] }) {
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="mcGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%"  stopColor="var(--accent)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="t"
            tickFormatter={fmtTick}
            stroke="var(--color-line-strong)"
            tick={tickStyle}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
          />
          <YAxis
            dataKey="price"
            domain={["auto", "auto"]}
            stroke="var(--color-line-strong)"
            tick={tickStyle}
            tickFormatter={(v) => fmtUsd(v, { compact: true })}
            tickLine={false}
            axisLine={false}
            width={64}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
            formatter={(v) => [fmtUsd(Number(v), { compact: true }), "Market Cap"] as [string, string]}
            cursor={{ stroke: "var(--color-line-strong)", strokeDasharray: "2 4" }}
          />
          <Area
            type="monotone"
            dataKey="price"
            stroke="var(--accent)"
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
            stroke="var(--color-line-strong)"
            tick={tickStyle}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            dataKey="volume"
            stroke="var(--color-line-strong)"
            tick={tickStyle}
            tickFormatter={(v) => fmtUsd(v, { compact: true })}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip
            cursor={{ fill: "color-mix(in oklab, var(--color-text) 4%, transparent)" }}
            contentStyle={tooltipStyle}
            labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
            formatter={(v) => [fmtUsd(Number(v), { compact: true }), "Volume"] as [string, string]}
          />
          <Bar
            dataKey="volume"
            fill="var(--accent)"
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
