"use client";

import {
  Bar, BarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmtUsd } from "@/lib/format";
import type { WalletFlowSummary } from "@/lib/data";

export function WalletFlowChart({
  flow,
  soccerColor = "var(--color-text-muted)",
}: {
  flow: WalletFlowSummary;
  soccerColor?: string;
}) {
  // For each day: NFL net (positive above zero, negative below) and
  // Soccer net side-by-side. Lets you see at a glance whether the
  // wallet rotated between sports, was net-buying both, or net-selling
  // both.
  const data = flow.daily.map((d) => ({
    t: d.t,
    nflNet: d.nflInUsd - d.nflOutUsd,
    soccerNet: d.otherInUsd - d.otherOutUsd,
  }));

  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={8}>
          <XAxis
            dataKey="t"
            tickFormatter={fmtDay}
            stroke="var(--color-text-muted)"
            tick={{ fill: "var(--color-text)" }}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            minTickGap={20}
          />
          <YAxis
            stroke="var(--color-text-muted)"
            tick={{ fill: "var(--color-text)" }}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            width={60}
            tickFormatter={(v) => fmtUsd(Number(v), { compact: true })}
          />
          <ReferenceLine y={0} stroke="var(--color-border-strong)" />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.05)" }}
            contentStyle={{ background: "var(--color-press)", border: "1px solid var(--color-line-strong)", borderRadius: 8, fontSize: 12, color: "var(--color-text)" }}
            labelStyle={{ color: "var(--color-text)" }}
            itemStyle={{ color: "var(--color-text)" }}
            labelFormatter={(v) => new Date(Number(v)).toLocaleDateString("en-US", { timeZone: "UTC" })}
            formatter={(v: unknown, name: unknown) => {
              const n = Number(v);
              const lbl = name === "nflNet" ? "NFL net" : "Soccer net";
              const display = `${n >= 0 ? "+" : ""}${fmtUsd(n, { compact: true })}`;
              return [display, lbl] as [string, string];
            }}
          />
          <Bar dataKey="nflNet"    fill="var(--color-brand)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="soccerNet" fill={soccerColor}        radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function fmtDay(t: number) {
  // Daily buckets in getWalletFlow are aligned to midnight UTC. Format
  // labels in UTC too so a bucket like "May 11 00:00 UTC" doesn't display
  // as "May 10" in western timezones — that mislabeling made today's
  // bucket look like it was missing from the chart.
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
