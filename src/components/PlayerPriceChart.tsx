"use client";

import { useState } from "react";
import clsx from "clsx";
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmtPrice } from "@/lib/format";
import type { PricePoint, Timeframe } from "@/lib/types";

const TF_ORDER: Timeframe[] = ["1H", "24H", "7D", "30D", "ALL"];

export function PlayerPriceChart({
  series,
  defaultTf = "24H",
}: {
  series: Record<Timeframe, PricePoint[]>;
  defaultTf?: Timeframe;
}) {
  const [tf, setTf] = useState<Timeframe>(defaultTf);
  const data = series[tf] ?? [];
  const first = data[0]?.price ?? 0;
  const last = data[data.length - 1]?.price ?? 0;
  const positive = last >= first;
  const stroke = positive ? "var(--color-gain)" : "var(--color-loss)";

  const fmtTick = (t: number) => {
    const d = new Date(t);
    if (tf === "1H" || tf === "24H") return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-end gap-1">
        {TF_ORDER.map((k) => (
          <button
            key={k}
            onClick={() => setTf(k)}
            className={clsx(
              "rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors",
              tf === k
                ? "bg-[var(--color-brand)]/15 text-[var(--color-brand-soft)]"
                : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]",
            )}
          >
            {k}
          </button>
        ))}
      </div>
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="ppc-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%"  stopColor={stroke} stopOpacity="0.35" />
                <stop offset="100%" stopColor={stroke} stopOpacity="0" />
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
              minTickGap={36}
            />
            <YAxis
              dataKey="price"
              domain={["auto", "auto"]}
              stroke="var(--color-text-muted)"
              tick={{ fill: "var(--color-text)" }}
              tickFormatter={(v) => fmtPrice(v as number)}
              tickLine={false}
              axisLine={false}
              fontSize={11}
              width={68}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border-strong)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
              formatter={(v) => [fmtPrice(Number(v)), "Price"] as [string, string]}
              cursor={{ stroke: "var(--color-border-strong)", strokeDasharray: "3 3" }}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke={stroke}
              strokeWidth={2}
              fill="url(#ppc-area)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
