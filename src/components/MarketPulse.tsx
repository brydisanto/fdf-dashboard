"use client";

import { useMemo } from "react";
import {
  Bar, BarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ArrowDownLeft, ArrowUpRight, RefreshCw } from "lucide-react";
import { Card, CardHeader, Delta, Pill } from "./ui";
import { fmtNum, fmtUsd } from "@/lib/format";
import type { FlowRollup } from "@/lib/data";

export function MarketPulse({
  dailyVolume,
  flow,
  totalVolume24h,
  totalTrades24h,
  activePoolsCount,
}: {
  dailyVolume: { t: number; volumeUsd: number }[];
  flow: FlowRollup;
  totalVolume24h: number;
  totalTrades24h: number;
  activePoolsCount: number;
}) {
  const sortedVolume = useMemo(() => dailyVolume.slice().sort((a, b) => a.t - b.t), [dailyVolume]);
  const today = sortedVolume[sortedVolume.length - 1]?.volumeUsd ?? 0;
  const yesterday = sortedVolume[sortedVolume.length - 2]?.volumeUsd ?? 0;
  const dayDelta = yesterday > 0 ? ((today - yesterday) / yesterday) * 100 : 0;

  return (
    <Card padded={false} className="p-5">
      <CardHeader
        title="Market Pulse"
        hint="NFL-only · 24h flow rollup, 30-day volume trend"
        right={<Pill tone="brand">NFL</Pill>}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <FlowTile
          label="Buy"
          icon={<ArrowDownLeft className="h-3.5 w-3.5 text-[var(--color-gain)]" />}
          value={fmtUsd(flow.buyUsd, { compact: true })}
          sub={`${fmtNum(flow.buyCount)} buys · ${fmtNum(flow.uniqueBuyers)} unique buyers`}
          fee={`Gold → players · Fee 3% · ${fmtUsd(flow.buyFeesUsd, { compact: true })}`}
          tone="gain"
        />
        <FlowTile
          label="Sell"
          icon={<ArrowUpRight className="h-3.5 w-3.5 text-[var(--color-loss)]" />}
          value={fmtUsd(flow.sellUsd, { compact: true })}
          sub={`${fmtNum(flow.sellCount)} sells · ${fmtNum(flow.uniqueSellers)} unique sellers`}
          fee={`Players → Gold · Fee 3% · ${fmtUsd(flow.sellFeesUsd, { compact: true })}`}
          tone="loss"
        />
        <FlowTile
          label="Swaps"
          icon={<RefreshCw className="h-3.5 w-3.5 text-[var(--color-brand-soft)]" />}
          value={fmtUsd(flow.swapUsd, { compact: true })}
          sub={`${fmtNum(flow.swapCount)} swaps · ${fmtNum(flow.uniqueSwappers)} unique swappers`}
          fee={`Player ↔ player · Fee 5% · ${fmtUsd(flow.swapFeesUsd, { compact: true })}`}
          tone="brand"
        />
        <FlowTile
          label="Net Gold Flow"
          icon={
            flow.netGoldFlowUsd >= 0 ? (
              <ArrowDownLeft className="h-3.5 w-3.5 text-[var(--color-gain)]" />
            ) : (
              <ArrowUpRight className="h-3.5 w-3.5 text-[var(--color-loss)]" />
            )
          }
          value={fmtUsd(flow.netGoldFlowUsd, { compact: true })}
          sub={`${fmtNum(flow.uniqueWallets24h)} active wallets 24h`}
          fee={`Buys − Sells · Total fees ${fmtUsd(flow.totalFeesUsd, { compact: true })}`}
          tone={flow.netGoldFlowUsd >= 0 ? "gain" : "loss"}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-4">
          <div className="mb-2 flex items-end justify-between">
            <div>
              <div className="text-sm font-semibold">NFL Trading Volume</div>
              <div className="text-[11px] text-[var(--color-text-dim)]">
                Daily, last {sortedVolume.length} days · sum of every NFL pool
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <div className="tabular text-base font-semibold">{fmtUsd(today, { compact: true })}</div>
              <Delta value={dayDelta} className="text-xs" />
            </div>
          </div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sortedVolume} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
                  width={56}
                  tickFormatter={(v) => fmtUsd(Number(v), { compact: true })}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.05)" }}
                  contentStyle={{ background: "var(--color-press)", border: "1px solid var(--color-line-strong)", borderRadius: 8, fontSize: 12, color: "var(--color-text)" }}
                  labelStyle={{ color: "var(--color-text)" }}
                  itemStyle={{ color: "var(--color-text)" }}
                  labelFormatter={(v) => new Date(Number(v)).toLocaleDateString()}
                  formatter={(v) => [fmtUsd(Number(v), { compact: true }), "NFL Volume"] as [string, string]}
                />
                <Bar dataKey="volumeUsd" fill="var(--color-brand)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-4">
          <div className="text-sm font-semibold">24h Flow Mix</div>
          <div className="text-[11px] text-[var(--color-text-dim)]">Diverging bar by trade type</div>
          <div className="mt-3 h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { label: "Buy",  value: flow.buyUsd,    fill: "var(--color-gain)" },
                  { label: "Sell", value: -flow.sellUsd,  fill: "var(--color-loss)" },
                  { label: "Swap", value: flow.swapUsd,   fill: "var(--color-brand-soft)" },
                ]}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <XAxis dataKey="label" stroke="var(--color-text-muted)" tick={{ fill: "var(--color-text)" }} tickLine={false} axisLine={false} fontSize={11} />
                <YAxis stroke="var(--color-text-muted)" tick={{ fill: "var(--color-text)" }} tickLine={false} axisLine={false} fontSize={11} width={56} tickFormatter={(v) => fmtUsd(Number(v), { compact: true })} />
                <ReferenceLine y={0} stroke="var(--color-border-strong)" />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.05)" }}
                  contentStyle={{ background: "var(--color-press)", border: "1px solid var(--color-line-strong)", borderRadius: 8, fontSize: 12, color: "var(--color-text)" }}
                  labelStyle={{ color: "var(--color-text)" }}
                  itemStyle={{ color: "var(--color-text)" }}
                  labelFormatter={(label) => `${label} 24h`}
                  formatter={(v, _name, item) => {
                    const lbl = String((item as { payload?: { label?: string } })?.payload?.label ?? "Volume");
                    return [fmtUsd(Math.abs(Number(v)), { compact: true }), lbl] as [string, string];
                  }}
                />
                <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CtxTile label="Total 24h Volume" value={fmtUsd(totalVolume24h, { compact: true })} />
        <CtxTile label="Total Trades 24h" value={fmtNum(totalTrades24h, { compact: true })} />
        <CtxTile label="Active Pools 24h" value={`${fmtNum(activePoolsCount)} / 72`} />
        <CtxTile label="Active Wallets 24h" value={fmtNum(flow.uniqueWallets24h, { compact: true })} />
      </div>
    </Card>
  );
}

function FlowTile({
  label, icon, value, sub, fee, tone,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  sub: string;
  fee: string;
  tone: "gain" | "loss" | "brand";
}) {
  const ring =
    tone === "gain" ? "ring-1 ring-[var(--color-gain)]/30" :
    tone === "loss" ? "ring-1 ring-[var(--color-loss)]/30" :
    "ring-1 ring-[var(--color-brand)]/30";
  return (
    <div className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3.5 ${ring}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-dim)]">
        {icon}
        {label}
      </div>
      <div className="mt-1 tabular text-lg font-semibold leading-tight">{value}</div>
      <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{sub}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">{fee}</div>
    </div>
  );
}

function CtxTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-dim)]">{label}</div>
      <div className="mt-0.5 tabular text-sm font-semibold">{value}</div>
    </div>
  );
}

function fmtDay(t: number) {
  const d = new Date(t);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
