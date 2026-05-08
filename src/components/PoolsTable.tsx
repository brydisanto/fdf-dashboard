"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronDown, ChevronUp } from "lucide-react";
import { FEE_RATE_BUY, FEE_RATE_SWAP } from "@/lib/constants";
import { fmtNum, fmtUsd } from "@/lib/format";
import type { PlayerSummary } from "@/lib/types";

type SortKey = "tvl" | "volume24h" | "fees24h" | "trades24h" | "holders" | "name";

export function PoolsTable({ players }: { players: PlayerSummary[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("tvl");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => {
    return players
      .map((p) => ({
        ...p,
        // Buy/sell fees are 3% of pool volume. Without per-pool swap
        // breakdown we apply the buy/sell tier — total fees including
        // any 5% swap legs would be marginally higher.
        fees24h: Math.round(p.volume24h * FEE_RATE_BUY),
      }))
      .sort((a, b) => {
        const av = sortKey === "name" ? `${a.lastName} ${a.firstName}` : (a[sortKey] as number);
        const bv = sortKey === "name" ? `${b.lastName} ${b.firstName}` : (b[sortKey] as number);
        const cmp =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [players, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="text-left text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-dim)]">
          <tr className="border-b border-[var(--color-border)]">
            <Th onClick={() => onSort("name")}      active={sortKey === "name"}      dir={sortDir}>Pool</Th>
            <Th onClick={() => onSort("tvl")}       active={sortKey === "tvl"}       dir={sortDir} align="right">TVL</Th>
            <Th onClick={() => onSort("volume24h")} active={sortKey === "volume24h"} dir={sortDir} align="right">24h Volume</Th>
            <Th onClick={() => onSort("fees24h")}   active={sortKey === "fees24h"}   dir={sortDir} align="right">24h Fees</Th>
            <th className="px-3 py-2 font-medium text-right">Fee Tier</th>
            <Th onClick={() => onSort("trades24h")} active={sortKey === "trades24h"} dir={sortDir} align="right">Trades 24h</Th>
            <Th onClick={() => onSort("holders")}   active={sortKey === "holders"}   dir={sortDir} align="right">Holders</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr
              key={p.id}
              className="border-b border-[var(--color-border)]/60 last:border-b-0 hover:bg-[var(--color-surface-2)]/60"
            >
              <td className="px-3 py-2.5">
                <Link href={`/player/${p.id}`} className="flex items-center gap-2 hover:text-[var(--color-brand-soft)]">
                  <span className="font-medium">
                    {p.firstName[0]}. {p.lastName}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
                    {p.position} / {p.team}
                  </span>
                </Link>
              </td>
              <td className="px-3 py-2.5 text-right tabular">{fmtUsd(p.tvl, { compact: true })}</td>
              <td className="px-3 py-2.5 text-right tabular">{fmtUsd(p.volume24h, { compact: true })}</td>
              <td className="px-3 py-2.5 text-right tabular">{fmtUsd(p.fees24h, { compact: true })}</td>
              <td className="px-3 py-2.5 text-right tabular text-[var(--color-text-muted)]">
                {(FEE_RATE_BUY * 100).toFixed(0)}% / {(FEE_RATE_SWAP * 100).toFixed(0)}%
              </td>
              <td className="px-3 py-2.5 text-right tabular">{fmtNum(p.trades24h)}</td>
              <td className="px-3 py-2.5 text-right tabular">{fmtNum(p.holders, { compact: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children, onClick, active, dir, align = "left",
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
  align?: "left" | "right";
}) {
  return (
    <th className="px-3 py-2 font-medium">
      <button
        onClick={onClick}
        className={clsx(
          "inline-flex items-center gap-1 hover:text-[var(--color-text)]",
          align === "right" && "ml-auto float-right",
          active && "text-[var(--color-text)]",
        )}
      >
        <span>{children}</span>
        {active ? (dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
      </button>
    </th>
  );
}
