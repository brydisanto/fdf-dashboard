"use client";

import {
  Bar, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmtUsd } from "@/lib/format";
import type { BuybackDay } from "@/lib/data/buyback";

// Daily USDC deployed (bars) against the running total (line). The
// wallet buys in bursts with long quiet stretches, so the cumulative
// line is what makes the shape readable.
export function BuybackChart({ daily }: { daily: BuybackDay[] }) {
  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="t"
            tickFormatter={(v) =>
              new Date(Number(v)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
            }
            minTickGap={36}
            stroke="var(--color-text-muted)"
            tick={{ fill: "var(--color-text)" }}
            tickLine={false}
            axisLine={false}
            fontSize={11}
          />
          <YAxis
            yAxisId="daily"
            width={56}
            tickFormatter={(v) => fmtUsd(Number(v), { compact: true })}
            stroke="var(--color-text-muted)"
            tick={{ fill: "var(--color-text)" }}
            tickLine={false}
            axisLine={false}
            fontSize={11}
          />
          <YAxis
            yAxisId="cum"
            orientation="right"
            width={56}
            tickFormatter={(v) => fmtUsd(Number(v), { compact: true })}
            stroke="var(--color-text-muted)"
            tick={{ fill: "var(--color-text)" }}
            tickLine={false}
            axisLine={false}
            fontSize={11}
          />
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
            cursor={{ fill: "rgba(255,255,255,0.05)" }}
            labelFormatter={(v) =>
              new Date(Number(v)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
            }
            formatter={(v, name) => {
              if (name === "cumulativeUsd") return [fmtUsd(Number(v), { compact: true }), "Deployed to date"];
              if (name === "fundedUsd") return [fmtUsd(Number(v), { compact: true }), "Treasury funding"];
              return [fmtUsd(Number(v), { compact: true }), "Deployed that day"];
            }}
          />
          <Bar yAxisId="daily" dataKey="netUsd" fill="var(--accent)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar yAxisId="daily" dataKey="fundedUsd" fill="var(--color-broadcast)" radius={[3, 3, 0, 0]} isAnimationActive={false} opacity={0.35} />
          <Line
            yAxisId="cum"
            type="monotone"
            dataKey="cumulativeUsd"
            stroke="var(--color-turf)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
