"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { NewWalletsDay } from "@/lib/data/new-wallets";

// 30-day bar chart of first-time NFL wallets per UTC day. The last
// 7 days are painted in the accent color so the "this week" stat
// strip above maps visually onto the bars.

function fmtDay(t: number) {
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function NewWalletsChart({ daily }: { daily: NewWalletsDay[] }) {
  const cutoff = daily.length >= 7 ? daily[daily.length - 7].t : 0;
  return (
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="t"
            tickFormatter={fmtDay}
            stroke="var(--color-text-muted)"
            tick={{ fill: "var(--color-text)" }}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            minTickGap={28}
          />
          <YAxis
            stroke="var(--color-text-muted)"
            tick={{ fill: "var(--color-text)" }}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            width={36}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.05)" }}
            contentStyle={{ background: "var(--color-press)", border: "1px solid var(--color-line-strong)", borderRadius: 8, fontSize: 12, color: "var(--color-text)" }}
            labelStyle={{ color: "var(--color-text)" }}
            itemStyle={{ color: "var(--color-text)" }}
            labelFormatter={(v) => fmtDay(Number(v))}
            formatter={(v) => [`${v}`, "New wallets"] as [string, string]}
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {daily.map((d) => (
              <Cell key={d.t} fill={d.t >= cutoff ? "var(--accent)" : "var(--color-text-dim)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
