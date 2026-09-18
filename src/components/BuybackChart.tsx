"use client";

import { useMemo, useState } from "react";
import {
  Bar, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmtUsd } from "@/lib/format";
import type { BuybackDay } from "@/lib/data/buyback";

// Daily USDC deployed and treasury funding (bars) against the running
// total deployed (line). The wallet buys in bursts with long quiet
// stretches, so the cumulative line is what makes the shape readable.

type Range = "ALL" | "30D" | "7D";
const RANGES: Range[] = ["ALL", "30D", "7D"];
const RANGE_DAYS: Record<Exclude<Range, "ALL">, number> = { "30D": 30, "7D": 7 };
const DAY_MS = 24 * 60 * 60 * 1000;

export function BuybackChart({ daily }: { daily: BuybackDay[] }) {
  const [range, setRange] = useState<Range>("ALL");

  const data = useMemo(() => {
    if (range === "ALL" || daily.length === 0) return daily;
    // Anchor on the series' own last day rather than the clock, so the
    // window is deterministic and matches the data the server built.
    const lastDay = daily[daily.length - 1].t;
    const start = lastDay - (RANGE_DAYS[range] - 1) * DAY_MS;
    const slice = daily.filter((d) => d.t >= start);
    // Re-base the running total to the window, otherwise a 7-day view
    // shows a line pinned near $320K that barely moves.
    const offset = slice.length ? slice[0].cumulativeUsd - slice[0].netUsd : 0;
    return slice.map((d) => ({ ...d, cumulativeUsd: d.cumulativeUsd - offset }));
  }, [daily, range]);

  const deployedInRange = data.reduce((a, d) => a + d.netUsd, 0);
  const cumulativeLabel = range === "ALL" ? "Deployed to date" : `Deployed in last ${range}`;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex rounded-[var(--r-8)] border border-[var(--color-line)] p-[2px]"
          style={{ background: "var(--color-stadium)" }}
          role="group"
          aria-label="Chart range"
        >
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={
                range === r
                  ? "rounded-[6px] px-2.5 py-1 text-[var(--color-text)] transition-colors"
                  : "rounded-[6px] px-2.5 py-1 text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-text-muted)]"
              }
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "0.14em",
                background: range === r ? "var(--color-bench)" : "transparent",
              }}
            >
              {r}
            </button>
          ))}
        </div>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--color-text-dim)",
          }}
        >
          {fmtUsd(deployedInRange, { compact: true })} deployed
          {range === "ALL" ? " all time" : ` · last ${range}`}
        </span>
      </div>

      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="t"
              tickFormatter={(v) =>
                new Date(Number(v)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
              }
              minTickGap={range === "7D" ? 8 : 36}
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
                if (name === "cumulativeUsd") return [fmtUsd(Number(v), { compact: true }), cumulativeLabel];
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
    </div>
  );
}
