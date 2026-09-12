"use client";

import {
  Bar, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmtNum, fmtUsd } from "@/lib/format";
import type { NewWalletsDay } from "@/lib/data/new-wallets";

// Two 30-day charts for the New Wallets page.
//
//   JoinsChart:    bars = first-time wallets per UTC day (accent for the
//                  current week), line = cumulative all-time wallet count.
//   ActivityChart: bars = volume traded by the 30-day cohort per day,
//                  line = that volume as a share of all NFL volume.

function fmtDay(t: number) {
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const tooltipStyle = {
  contentStyle: { background: "var(--color-press)", border: "1px solid var(--color-line-strong)", borderRadius: 8, fontSize: 12, color: "var(--color-text)" },
  labelStyle: { color: "var(--color-text)" },
  itemStyle: { color: "var(--color-text)" },
  cursor: { fill: "rgba(255,255,255,0.05)" },
};

const axisProps = {
  stroke: "var(--color-text-muted)",
  tick: { fill: "var(--color-text)" },
  tickLine: false,
  axisLine: false,
  fontSize: 11,
};

export function NewWalletsJoinsChart({ daily }: { daily: NewWalletsDay[] }) {
  const cutoff = daily.length >= 7 ? daily[daily.length - 7].t : 0;
  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="t" tickFormatter={fmtDay} minTickGap={28} {...axisProps} />
          <YAxis yAxisId="joins" width={36} allowDecimals={false} {...axisProps} />
          <YAxis
            yAxisId="cum"
            orientation="right"
            width={48}
            domain={["auto", "auto"]}
            tickFormatter={(v) => fmtNum(Number(v), { compact: true })}
            {...axisProps}
          />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(v) => fmtDay(Number(v))}
            formatter={(v, name) =>
              name === "cumulative"
                ? [fmtNum(Number(v)), "All-time wallets"]
                : [`${v}`, "New wallets"]}
          />
          <Bar yAxisId="joins" dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {daily.map((d) => (
              <Cell key={d.t} fill={d.t >= cutoff ? "var(--accent)" : "var(--color-text-dim)"} />
            ))}
          </Bar>
          <Line
            yAxisId="cum"
            type="monotone"
            dataKey="cumulative"
            stroke="var(--color-broadcast)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// Buys above the axis, sells below, running net as a line. Positive
// net = new wallets are putting more into NFL tokens than they take out.
export function NewWalletsNetFlowChart({ daily }: { daily: NewWalletsDay[] }) {
  const data = daily.map((d) => ({ ...d, sellNeg: -d.cohortSellUsd }));
  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} stackOffset="sign">
          <XAxis dataKey="t" tickFormatter={fmtDay} minTickGap={28} {...axisProps} />
          <YAxis
            yAxisId="usd"
            width={56}
            tickFormatter={(v) => fmtUsd(Number(v), { compact: true })}
            {...axisProps}
          />
          <YAxis
            yAxisId="cum"
            orientation="right"
            width={56}
            tickFormatter={(v) => fmtUsd(Number(v), { compact: true })}
            {...axisProps}
          />
          <ReferenceLine yAxisId="usd" y={0} stroke="var(--color-line-strong)" />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(v) => fmtDay(Number(v))}
            formatter={(v, name) => {
              if (name === "cohortBuyUsd") return [fmtUsd(Number(v), { compact: true }), "Buys"];
              if (name === "sellNeg") return [fmtUsd(-Number(v), { compact: true }), "Sells"];
              if (name === "cohortNetUsd") return [fmtUsd(Number(v), { compact: true }), "Net (day)"];
              return [fmtUsd(Number(v), { compact: true }), "Net (running, 30d)"];
            }}
          />
          <Bar yAxisId="usd" dataKey="cohortBuyUsd" stackId="flow" fill="var(--color-turf)" isAnimationActive={false} />
          <Bar yAxisId="usd" dataKey="sellNeg" stackId="flow" fill="var(--color-penalty)" isAnimationActive={false} />
          <Line yAxisId="usd" dataKey="cohortNetUsd" stroke="transparent" dot={false} isAnimationActive={false} legendType="none" />
          <Line
            yAxisId="cum"
            type="monotone"
            dataKey="cohortNetCumUsd"
            stroke="var(--color-broadcast)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function NewWalletsActivityChart({ daily }: { daily: NewWalletsDay[] }) {
  const data = daily.map((d) => ({
    ...d,
    sharePct: d.marketVolumeUsd > 0 ? (d.cohortVolumeUsd / d.marketVolumeUsd) * 100 : 0,
  }));
  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="t" tickFormatter={fmtDay} minTickGap={28} {...axisProps} />
          <YAxis
            yAxisId="usd"
            width={56}
            tickFormatter={(v) => fmtUsd(Number(v), { compact: true })}
            {...axisProps}
          />
          <YAxis
            yAxisId="pct"
            orientation="right"
            width={40}
            domain={[0, 100]}
            tickFormatter={(v) => `${Math.round(Number(v))}%`}
            {...axisProps}
          />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(v) => fmtDay(Number(v))}
            formatter={(v, name) => {
              if (name === "sharePct") return [`${Number(v).toFixed(1)}%`, "Share of NFL volume"];
              if (name === "activeNew") return [`${v}`, "Active new wallets"];
              return [fmtUsd(Number(v), { compact: true }), "New-wallet volume"];
            }}
          />
          <Bar yAxisId="usd" dataKey="cohortVolumeUsd" fill="var(--color-turf)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Line
            yAxisId="pct"
            type="monotone"
            dataKey="sharePct"
            stroke="var(--color-flag)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line yAxisId="pct" dataKey="activeNew" stroke="transparent" dot={false} isAnimationActive={false} legendType="none" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
