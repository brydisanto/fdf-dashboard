"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Filter } from "lucide-react";
import { PLAYERS_BY_ID } from "@/lib/data/players";
import { fmtNum, fmtPrice, fmtTimeAgo, fmtUsd } from "@/lib/format";
import type { Trade, TradeFlow } from "@/lib/types";
import { PlayerAvatar } from "./PlayerAvatar";
import { WalletBadge } from "./WalletBadge";
import type { WalletSnapshot } from "@/lib/data";

const PRESETS = [
  { label: "All",   min: 0 },
  { label: "≥$10",  min: 10 },
  { label: "≥$100", min: 100 },
  { label: "≥$1K",  min: 1000 },
  { label: "≥$10K", min: 10000 },
];

type FlowFilter = TradeFlow | "all" | "swap";
const FLOW_FILTERS: { label: string; key: FlowFilter }[] = [
  { label: "All",      key: "all" },
  { label: "Buy",      key: "buy" },
  { label: "Sell",     key: "sell" },
  { label: "Swap In",  key: "swap-in" },
  { label: "Swap Out", key: "swap-out" },
  { label: "Swaps",    key: "swap" },
];

export function RecentTrades({
  trades,
  wallets,
  showPlayer = true,
  compact = false,
  showFilter = true,
}: {
  trades: Trade[];
  wallets?: Record<string, WalletSnapshot>;
  showPlayer?: boolean;
  compact?: boolean;
  showFilter?: boolean;
}) {
  const [minUsd, setMinUsd] = useState(0);
  const [flowFilter, setFlowFilter] = useState<FlowFilter>("all");

  const filtered = useMemo(() => {
    let list = trades;
    if (minUsd > 0) list = list.filter((t) => t.totalUsd >= minUsd);
    if (flowFilter === "swap") {
      list = list.filter((t) => t.flow === "swap-in" || t.flow === "swap-out");
    } else if (flowFilter !== "all") {
      list = list.filter((t) => t.flow === flowFilter);
    }
    return list;
  }, [trades, minUsd, flowFilter]);

  return (
    <div>
      {showFilter ? (
        <div
          className="flex flex-wrap items-center gap-3 border-b border-[var(--color-line)] px-5 py-4"
          style={{ background: "color-mix(in oklab, var(--color-press) 60%, transparent)" }}
        >
          <Filter className="h-3.5 w-3.5 text-[var(--color-text-dim)]" />
          <SegLabel>FLOW</SegLabel>
          <Seg
            options={FLOW_FILTERS.map((f) => f.label)}
            value={FLOW_FILTERS.find((f) => f.key === flowFilter)?.label ?? "All"}
            onChange={(label) => {
              const f = FLOW_FILTERS.find((x) => x.label === label);
              if (f) setFlowFilter(f.key);
            }}
          />
          <span className="mx-2 text-[var(--color-line-strong)]">·</span>
          <SegLabel>MIN TOTAL</SegLabel>
          <Seg
            options={PRESETS.map((p) => p.label)}
            value={PRESETS.find((p) => p.min === minUsd)?.label ?? "All"}
            onChange={(label) => {
              const p = PRESETS.find((x) => x.label === label);
              if (p) setMinUsd(p.min);
            }}
          />
          <span
            className="ml-auto"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10.5px",
              fontWeight: 600,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--color-text-dim)",
            }}
          >
            {filtered.length} / {trades.length}
          </span>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className={clsx("w-full text-[13px]", compact ? "min-w-[560px]" : "min-w-[820px]")}>
          <thead style={{ background: "color-mix(in oklab, var(--color-press) 50%, transparent)" }}>
            <tr className="border-b border-[var(--color-line)]">
              <Th align="center">Flow</Th>
              {showPlayer ? <Th>Player</Th> : null}
              <Th align="center">Price</Th>
              <Th align="center">Amount</Th>
              <Th align="center">Total</Th>
              <Th align="center">Wallet</Th>
              <Th align="center" className="pr-5">Time</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const player = PLAYERS_BY_ID.get(t.playerId);
              const snap = wallets?.[t.wallet.toLowerCase()];
              return (
                <tr
                  key={t.id}
                  className="transition-colors duration-[180ms] ease-out hover:bg-[color-mix(in_oklab,var(--color-press)_50%,transparent)]"
                  style={{
                    borderBottom: "1px solid var(--color-line)",
                  }}
                >
                  <CenterCell>
                    <FlowBadge flow={t.flow} />
                  </CenterCell>
                  {showPlayer && player ? (
                    <Cell>
                      <Link href={`/player/${t.playerId}`} className="flex items-center gap-2 hover:text-[var(--accent-soft)]">
                        <PlayerAvatar player={player} size="xs" />
                        <span className="truncate font-medium">
                          {player.firstName[0]}. {player.lastName}
                        </span>
                      </Link>
                    </Cell>
                  ) : null}
                  <NumCell>{fmtPrice(t.priceUsd)}</NumCell>
                  <NumCell>{fmtNum(t.amount, { digits: 2 })}</NumCell>
                  <NumCell className="font-semibold">{fmtUsd(t.totalUsd, { compact: true })}</NumCell>
                  <CenterCell>
                    {snap && snap.totalValueUsd > 0 ? (
                      <WalletBadge
                        address={snap.address}
                        tier={snap.tier}
                        totalValueUsd={snap.totalValueUsd}
                        nflValueUsd={snap.nflValueUsd}
                        isNew={snap.isNew}
                      />
                    ) : (
                      <Link
                        href={`/wallet/${t.wallet}`}
                        title={snap ? "Router or zero-balance wallet" : "Wallet"}
                        className="inline-flex items-center gap-1 hover:text-[var(--color-text)]"
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "11px",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        {t.wallet.slice(0, 6)}…{t.wallet.slice(-4)}
                      </Link>
                    )}
                  </CenterCell>
                  <td
                    className="text-center pr-5"
                    style={{
                      padding: "var(--row-pad-y) 12px",
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {fmtTimeAgo(t.timestamp)}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={showPlayer ? 7 : 6}
                  className="px-5 py-12 text-center text-sm text-[var(--color-text-muted)]"
                >
                  No trades match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Flow badge with typographic glyph (no lucide icon).
function FlowBadge({ flow }: { flow: TradeFlow }) {
  const map: Record<TradeFlow, { glyph: string; label: string; cls: string; title: string }> = {
    "buy":      { glyph: "↘", label: "BUY",      cls: "border-[color-mix(in_oklab,var(--color-turf)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-turf)_12%,transparent)] text-[var(--color-turf)]",          title: "Buy · Gold/USDC → player share (3% fee)" },
    "sell":     { glyph: "↗", label: "SELL",     cls: "border-[color-mix(in_oklab,var(--color-penalty)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-penalty)_12%,transparent)] text-[var(--color-penalty)]", title: "Sell · player share → Gold/USDC (3% fee)" },
    "swap-in":  { glyph: "↻", label: "SWAP IN",  cls: "border-[var(--accent-line)] bg-[var(--accent-tint)] text-[var(--accent-soft)]",                                                                              title: "Swap In · received this player in a player ↔ player swap (5% fee)" },
    "swap-out": { glyph: "↺", label: "SWAP OUT", cls: "border-[color-mix(in_oklab,var(--color-broadcast)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-broadcast)_10%,transparent)] text-[var(--color-broadcast)]", title: "Swap Out · gave up this player in a player ↔ player swap (5% fee)" },
  };
  const m = map[flow];
  return (
    <span
      title={m.title}
      className={clsx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[var(--r-4)] border px-2 py-1",
        m.cls,
      )}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "10.5px",
        fontWeight: 700,
        letterSpacing: "0.14em",
      }}
    >
      <span aria-hidden>{m.glyph}</span>
      {m.label}
    </span>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-3" style={{ padding: "var(--row-pad-y) 12px" }}>
      {children}
    </td>
  );
}

function CenterCell({ children }: { children: React.ReactNode }) {
  // Wraps the child in a flex centering box so pills (FlowBadge,
  // WalletBadge) sit dead-center in the column.
  return (
    <td className="px-3" style={{ padding: "var(--row-pad-y) 12px" }}>
      <div className="flex items-center justify-center">{children}</div>
    </td>
  );
}

function NumCell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td
      className={clsx("text-center", className)}
      style={{
        padding: "var(--row-pad-y) 12px",
        fontFamily: "var(--font-mono)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {children}
    </td>
  );
}

function Th({
  children,
  align = "left",
  className,
}: {
  children: React.ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
}) {
  return (
    <th
      className={clsx("px-3 py-3", className)}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "10px",
        fontWeight: 600,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--color-text-dim)",
        textAlign: align,
      }}
    >
      {children}
    </th>
  );
}

function SegLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "10px",
        fontWeight: 600,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--color-text-dim)",
      }}
    >
      {children}
    </span>
  );
}

function Seg({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      className="inline-flex items-center rounded-[var(--r-8)] border border-[var(--color-line)] bg-[var(--color-press)] p-[3px]"
      style={{ height: 38 }}
    >
      {options.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={clsx(
              "inline-flex h-[30px] items-center justify-center rounded-[5px] px-3 transition-colors",
              active
                ? "bg-[var(--color-bench)] text-[var(--accent-soft)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
            )}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.12em",
              boxShadow: active ? "inset 0 0 0 1px var(--accent-line)" : undefined,
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
