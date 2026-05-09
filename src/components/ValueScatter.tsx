"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  Cell,
} from "recharts";
import { deltaTone } from "@/lib/value-tone";
import type { ValueRow } from "./ValueTable";
import type { Position } from "@/lib/types";

// Spectrum-style scatter: X = posRankDelta (industry − market),
// Y = industry rank. Points left of 0 are undervalued (industry
// ranks them higher than market), points right of 0 are overvalued.
// Color follows the same magnitude ramp as the table cells.
//
// Y is inverted so rank 1 sits at the TOP — matches how rankings
// are read intuitively (#1 = best).

export function ValueScatter({
  rows,
  pos,
}: {
  rows: ValueRow[];
  pos: Position | "ALL";
}) {
  const router = useRouter();

  const data = useMemo(() => {
    return rows
      .filter((r) =>
        r.posRankDelta != null &&
        r.industryAvgRank != null &&
        r.marketPosRank > 0 &&
        (pos === "ALL" || r.position === pos),
      )
      .map((r) => ({
        id: r.id,
        name: `${r.firstName} ${r.lastName}`,
        position: r.position,
        x: r.posRankDelta!,
        y: r.industryAvgRank!,
        delta: r.posRankDelta!,
        marketPosRank: r.marketPosRank,
        industryAvgRank: r.industryAvgRank!,
        verdict: r.verdict,
      }));
  }, [rows, pos]);

  // X-domain: symmetric around 0, padded ±2 from the most extreme Δ
  // (clamped to [-15, +15] so a single outlier doesn't dwarf the
  // rest of the cloud).
  const maxAbs = useMemo(() => {
    if (data.length === 0) return 5;
    const m = data.reduce((acc, d) => Math.max(acc, Math.abs(d.x)), 0);
    return Math.max(3, Math.min(15, Math.ceil(m) + 1));
  }, [data]);

  // Y-domain: 1..max industry rank seen (rank 1 at top via reversed).
  const yMax = useMemo(() => {
    if (data.length === 0) return 30;
    return Math.ceil(Math.max(...data.map((d) => d.y)) + 1);
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-[var(--color-text-muted)]">
        No matched players for this position.
      </div>
    );
  }

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 16, right: 24, bottom: 36, left: 24 }}>
          <CartesianGrid stroke="var(--color-line)" strokeDasharray="2 4" />

          {/* Soft band tinting under/over halves */}
          <ReferenceArea
            x1={-maxAbs}
            x2={0}
            fill="var(--color-turf)"
            fillOpacity={0.04}
          />
          <ReferenceArea
            x1={0}
            x2={maxAbs}
            fill="var(--color-penalty)"
            fillOpacity={0.04}
          />

          <XAxis
            type="number"
            dataKey="x"
            domain={[-maxAbs, maxAbs]}
            ticks={tickArray(maxAbs)}
            stroke="var(--color-line-strong)"
            tick={{
              fill: "var(--color-text-muted)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
            }}
            tickLine={false}
            label={{
              value: "← UNDERVALUED        Δ        OVERVALUED →",
              position: "insideBottom",
              offset: -16,
              fill: "var(--color-text-dim)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.18em",
            }}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={[1, yMax]}
            reversed
            stroke="var(--color-line-strong)"
            tick={{
              fill: "var(--color-text-muted)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
            }}
            tickLine={false}
            label={{
              value: "INDUSTRY RANK",
              angle: -90,
              position: "insideLeft",
              offset: 8,
              fill: "var(--color-text-dim)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.18em",
            }}
          />
          <ZAxis range={[80, 80]} />

          {/* Center vertical = fair boundary */}
          <ReferenceLine
            x={0}
            stroke="var(--color-line-strong)"
            strokeDasharray="3 3"
          />
          {/* Fair band shading (|Δ| ≤ 1) */}
          <ReferenceArea
            x1={-1}
            x2={1}
            fill="var(--color-text-muted)"
            fillOpacity={0.06}
          />

          <Tooltip
            cursor={{ stroke: "var(--color-line-strong)", strokeDasharray: "3 3" }}
            contentStyle={{
              background: "var(--color-press)",
              border: "1px solid var(--color-line-strong)",
              borderRadius: 8,
              fontSize: 12,
              fontFamily: "var(--font-mono)",
            }}
            content={<ScatterTooltip />}
          />

          <Scatter
            data={data}
            isAnimationActive={false}
            onClick={(p: { payload?: { id?: string } }) => {
              const id = p?.payload?.id;
              if (id) router.push(`/player/${id}`);
            }}
            cursor="pointer"
          >
            {data.map((d) => {
              const { fg } = deltaTone(d.delta);
              return (
                <Cell
                  key={d.id}
                  fill={fg}
                  stroke="var(--color-stadium)"
                  strokeWidth={1.5}
                />
              );
            })}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function tickArray(maxAbs: number): number[] {
  const step = maxAbs <= 5 ? 1 : maxAbs <= 10 ? 2 : 3;
  const out: number[] = [];
  for (let v = -maxAbs; v <= maxAbs; v += step) out.push(v);
  if (!out.includes(0)) out.push(0);
  out.sort((a, b) => a - b);
  return out;
}

function ScatterTooltip(props: {
  active?: boolean;
  payload?: Array<{ payload: ScatterPoint }>;
}) {
  const p = props.payload?.[0]?.payload;
  if (!props.active || !p) return null;
  const { fg, tier } = deltaTone(p.delta);
  const verdictLabel =
    tier === "fair"        ? "FAIR"
    : tier === "under-mild" ? "MILDLY UNDERVALUED"
    : tier === "under-mod"  ? "UNDERVALUED"
    : tier === "under-sev"  ? "STRONGLY UNDERVALUED"
    : tier === "over-mild"  ? "MILDLY OVERVALUED"
    : tier === "over-mod"   ? "OVERVALUED"
    : tier === "over-sev"   ? "STRONGLY OVERVALUED"
    : "";
  const sign = p.delta > 0 ? "+" : "";
  const dDisplay = Number.isInteger(p.delta) ? `${p.delta}` : p.delta.toFixed(1);
  return (
    <div
      style={{
        background: "var(--color-press)",
        border: "1px solid var(--color-line-strong)",
        borderRadius: 8,
        padding: "10px 12px",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        minWidth: 220,
      }}
    >
      <div className="text-[var(--color-text)]" style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
        {p.name} <span style={{ color: "var(--color-text-dim)" }}>· {p.position}</span>
      </div>
      <div style={{ color: fg, fontWeight: 700, letterSpacing: "0.1em" }}>
        {verdictLabel} {sign}{dDisplay}
      </div>
      <div style={{ color: "var(--color-text-muted)", marginTop: 4 }}>
        FDF rank {p.position}{p.marketPosRank} · Industry {p.position}
        {Number.isInteger(p.industryAvgRank) ? p.industryAvgRank : p.industryAvgRank.toFixed(1)}
      </div>
    </div>
  );
}

interface ScatterPoint {
  id: string;
  name: string;
  position: string;
  delta: number;
  marketPosRank: number;
  industryAvgRank: number;
}
