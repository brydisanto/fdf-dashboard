"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowDownLeft, ArrowUpRight, Filter, RefreshCw, Repeat } from "lucide-react";
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
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wider text-[var(--color-text-dim)]">
          <Filter className="h-3 w-3" />
          <span>Flow</span>
          {FLOW_FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => setFlowFilter(f.key)}
              className={clsx(
                "rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider transition-colors",
                flowFilter === f.key
                  ? "border-[var(--color-brand)] bg-[var(--color-brand)]/10 text-[var(--color-brand-soft)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
              )}
            >
              {f.label}
            </button>
          ))}
          <span className="mx-2 text-[var(--color-text-dim)]">·</span>
          <span>Min total</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => setMinUsd(p.min)}
              className={clsx(
                "rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider transition-colors",
                minUsd === p.min
                  ? "border-[var(--color-brand)] bg-[var(--color-brand)]/10 text-[var(--color-brand-soft)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
              )}
            >
              {p.label}
            </button>
          ))}
          <span className="ml-auto normal-case tracking-normal text-[var(--color-text-muted)]">
            Showing {filtered.length} of {trades.length}
          </span>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className={clsx("w-full text-sm", compact ? "min-w-[560px]" : "min-w-[820px]")}>
          <thead className="text-left text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-dim)]">
            <tr className="border-b border-[var(--color-border)]">
              <th className="px-3 py-2 font-medium">Flow</th>
              {showPlayer ? <th className="px-3 py-2 font-medium">Player</th> : null}
              <th className="px-3 py-2 font-medium text-right">Price</th>
              <th className="px-3 py-2 font-medium text-right">Amount</th>
              <th className="px-3 py-2 font-medium text-right">Total</th>
              <th className="px-3 py-2 font-medium">Wallet</th>
              <th className="px-3 py-2 font-medium text-right">Time</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const player = PLAYERS_BY_ID.get(t.playerId);
              const snap = wallets?.[t.wallet.toLowerCase()];
              return (
                <tr key={t.id} className="border-b border-[var(--color-border)]/60 last:border-b-0 hover:bg-[var(--color-surface-2)]/60">
                  <td className="px-3 py-2.5">
                    <FlowBadge flow={t.flow} />
                  </td>
                  {showPlayer && player ? (
                    <td className="px-3 py-2.5">
                      <Link href={`/player/${t.playerId}`} className="flex items-center gap-2 hover:text-[var(--color-brand-soft)]">
                        <PlayerAvatar player={player} size="xs" />
                        <span className="truncate">
                          {player.firstName[0]}. {player.lastName}
                        </span>
                      </Link>
                    </td>
                  ) : null}
                  <td className="px-3 py-2.5 text-right tabular">{fmtPrice(t.priceUsd)}</td>
                  <td className="px-3 py-2.5 text-right tabular">{fmtNum(t.amount, { digits: 2 })}</td>
                  <td className="px-3 py-2.5 text-right tabular font-medium">{fmtUsd(t.totalUsd, { compact: true })}</td>
                  <td className="px-3 py-2.5">
                    {snap && snap.totalValueUsd > 0 ? (
                      <WalletBadge
                        address={snap.address}
                        tier={snap.tier}
                        totalValueUsd={snap.totalValueUsd}
                        isNew={snap.isNew}
                      />
                    ) : (
                      <Link
                        href={`/wallet/${t.wallet}`}
                        title={snap ? "Router or zero-balance wallet" : "Wallet"}
                        className="inline-flex items-center gap-1 font-mono text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                      >
                        {t.wallet.slice(0, 6)}…{t.wallet.slice(-4)}
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-[var(--color-text-muted)]">{fmtTimeAgo(t.timestamp)}</td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={showPlayer ? 7 : 6} className="px-4 py-10 text-center text-sm text-[var(--color-text-muted)]">
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

function FlowBadge({ flow }: { flow: TradeFlow }) {
  if (flow === "buy") {
    return (
      <span
        title="Buy · Gold/USDC → player share (3% fee)"
        className="inline-flex items-center gap-1 rounded-md border border-[var(--color-gain)]/40 bg-[var(--color-gain)]/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-gain)]"
      >
        <ArrowDownLeft className="h-3 w-3" /> Buy
      </span>
    );
  }
  if (flow === "sell") {
    return (
      <span
        title="Sell · player share → Gold/USDC (3% fee)"
        className="inline-flex items-center gap-1 rounded-md border border-[var(--color-loss)]/40 bg-[var(--color-loss)]/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-loss)]"
      >
        <ArrowUpRight className="h-3 w-3" /> Sell
      </span>
    );
  }
  if (flow === "swap-in") {
    return (
      <span
        title="Swap In · received this player in a player ↔ player swap (5% platform fee)"
        className="inline-flex items-center gap-1 rounded-md border border-[var(--color-brand)]/40 bg-[var(--color-brand)]/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand-soft)]"
      >
        <RefreshCw className="h-3 w-3" /> Swap In
      </span>
    );
  }
  return (
    <span
      title="Swap Out · gave up this player in a player ↔ player swap (5% platform fee)"
      className="inline-flex items-center gap-1 rounded-md border border-[var(--color-brand)]/40 bg-[var(--color-brand)]/5 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand)]"
    >
      <Repeat className="h-3 w-3" /> Swap Out
    </span>
  );
}
