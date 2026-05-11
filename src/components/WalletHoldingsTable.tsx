"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ROSTER_BY_TOKEN } from "@/lib/data/roster";
import { fmtNum, fmtPrice, fmtTimeAgo, fmtUsd } from "@/lib/format";
import { PlayerAvatar } from "./PlayerAvatar";
import type { WalletHolding } from "@/lib/types";

type SortKey = "name" | "balance" | "priceUsd" | "balanceValueUsd" | "startHoldingAt" | "lastActiveAt";

const PAGE_SIZE = 25;

export function WalletHoldingsTable({
  rows,
  variant,
}: {
  rows: WalletHolding[];
  variant: "nfl" | "other";
}) {
  const [sortKey, setSortKey] = useState<SortKey>("balanceValueUsd");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    return rows.slice().sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir]);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const slice = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const onSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
    setPage(0);
  };

  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-[var(--color-text-muted)]">
        {variant === "nfl"
          ? "No NFL player tokens in this wallet."
          : "No Soccer holdings."}
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className={clsx("w-full text-sm", variant === "nfl" ? "min-w-[680px]" : "min-w-[640px]")}>
          <thead className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-dim)]">
            <tr className="border-b border-[var(--color-border)]">
              <Th onClick={() => onSort("name")}              active={sortKey === "name"}              dir={sortDir}>
                {variant === "nfl" ? "Player" : "Token"}
              </Th>
              <Th onClick={() => onSort("balance")}           active={sortKey === "balance"}           dir={sortDir}>Balance</Th>
              <Th onClick={() => onSort("priceUsd")}          active={sortKey === "priceUsd"}          dir={sortDir}>Price</Th>
              <Th onClick={() => onSort("balanceValueUsd")}   active={sortKey === "balanceValueUsd"}   dir={sortDir}>Value</Th>
              <Th onClick={() => onSort("startHoldingAt")}    active={sortKey === "startHoldingAt"}    dir={sortDir}>First Held</Th>
              <Th onClick={() => onSort("lastActiveAt")}      active={sortKey === "lastActiveAt"}      dir={sortDir}>Last Active</Th>
            </tr>
          </thead>
          <tbody>
            {slice.map((h) => {
              const player = variant === "nfl" ? ROSTER_BY_TOKEN.get(h.tokenAddress) : null;
              return (
                <tr key={h.tokenAddress} className="border-b border-[var(--color-border)]/60 last:border-b-0 hover:bg-[var(--color-surface-2)]/60">
                  <td className="px-3 py-2.5">
                    {player ? (
                      <Link href={`/player/${player.id}`} className="flex items-center justify-center gap-2 hover:text-[var(--color-brand-soft)]">
                        <PlayerAvatar player={player} size="sm" />
                        <div className="text-left">
                          <div className="font-medium">{player.firstName} {player.lastName}</div>
                          <div className="text-[11px] text-[var(--color-text-dim)]">{player.position} · {player.team}</div>
                        </div>
                      </Link>
                    ) : (
                      <div>
                        <div className="font-medium truncate max-w-[260px]">{h.name}</div>
                        <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">{h.symbol}</div>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 tabular">{fmtNum(h.balance, { digits: 2 })}</td>
                  <td className="px-3 py-2.5 tabular">{fmtPrice(h.priceUsd)}</td>
                  <td className="px-3 py-2.5 tabular font-medium">{fmtUsd(h.balanceValueUsd, { compact: true })}</td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-text-muted)]">
                    {h.startHoldingAt ? fmtTimeAgo(h.startHoldingAt) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-text-muted)]">
                    {h.lastActiveAt ? fmtTimeAgo(h.lastActiveAt) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <div className="mt-3 flex items-center justify-between text-xs text-[var(--color-text-muted)]">
          <div>
            Showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider hover:text-[var(--color-text)] disabled:opacity-40"
            >
              Prev
            </button>
            <span className="tabular">{safePage + 1} / {pages}</span>
            <button
              onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
              disabled={safePage === pages - 1}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider hover:text-[var(--color-text)] disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Th({
  children, onClick, active, dir,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
}) {
  return (
    <th className="px-3 py-2 font-medium">
      <button
        onClick={onClick}
        className={clsx(
          "inline-flex items-center gap-1 hover:text-[var(--color-text)]",
          active && "text-[var(--color-text)]",
        )}
      >
        <span>{children}</span>
        {active ? (dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
      </button>
    </th>
  );
}
