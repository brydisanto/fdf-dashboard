"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { Sparkline } from "./Sparkline";
import { PlayerAvatar } from "./PlayerAvatar";
import { Delta } from "./ui";
import { fmtNum, fmtPrice, fmtUsd } from "@/lib/format";
import { TEAM_NAMES } from "@/lib/data/players";
import type { PlayerSummary, Position } from "@/lib/types";

type SortKey =
  | "rank" | "name" | "priceUsd" | "change1h" | "change24h" | "change7d"
  | "marketCap" | "volume24h" | "tvl" | "holders"
  | "circulatingSupply" | "activeSupply";

// Football.fun NFL market only lists offensive skill positions.
const POSITIONS: (Position | "ALL")[] = ["ALL", "QB", "RB", "WR", "TE"];

export function PlayersTable({ players }: { players: PlayerSummary[] }) {
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<Position | "ALL">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("marketCap");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = players.slice();
    if (pos !== "ALL") list = list.filter((p) => p.position === pos);
    if (q) {
      list = list.filter((p) => {
        const name = `${p.firstName} ${p.lastName}`.toLowerCase();
        return (
          name.includes(q) ||
          p.team.toLowerCase().includes(q) ||
          (TEAM_NAMES[p.team]?.toLowerCase().includes(q) ?? false) ||
          p.position.toLowerCase().includes(q)
        );
      });
    }
    list.sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      if (sortKey === "name") {
        av = `${a.lastName} ${a.firstName}`;
        bv = `${b.lastName} ${b.firstName}`;
      } else if (sortKey === "rank") {
        av = a.marketCap;
        bv = b.marketCap;
      } else {
        av = a[sortKey];
        bv = b[sortKey];
      }
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [players, query, pos, sortKey, sortDir]);

  const ranked = useMemo(() => {
    const byMc = players.slice().sort((a, b) => b.marketCap - a.marketCap);
    const map = new Map(byMc.map((p, i) => [p.id, i + 1]));
    return map;
  }, [players]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
  };

  return (
    <div>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-dim)]" />
          <input
            type="search"
            placeholder="Search player, team, position…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1.5 pl-8 pr-2.5 text-sm placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-brand)] focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {POSITIONS.map((p) => (
            <button
              key={p}
              onClick={() => setPos(p)}
              className={clsx(
                "rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors",
                pos === p
                  ? "border-[var(--color-brand)] bg-[var(--color-brand)]/10 text-[var(--color-brand-soft)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full min-w-[1280px] text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-dim)]">
              <Th onClick={() => onSort("rank")} active={sortKey === "rank"} dir={sortDir} className="w-12 pl-4">
                #
              </Th>
              <Th onClick={() => onSort("name")} active={sortKey === "name"} dir={sortDir}>
                Player
              </Th>
              <Th onClick={() => onSort("priceUsd")} active={sortKey === "priceUsd"} dir={sortDir} align="right">
                Price
              </Th>
              <Th onClick={() => onSort("change1h")} active={sortKey === "change1h"} dir={sortDir} align="right">
                1h
              </Th>
              <Th onClick={() => onSort("change24h")} active={sortKey === "change24h"} dir={sortDir} align="right">
                24h
              </Th>
              <Th onClick={() => onSort("change7d")} active={sortKey === "change7d"} dir={sortDir} align="right">
                7d
              </Th>
              <Th onClick={() => onSort("marketCap")} active={sortKey === "marketCap"} dir={sortDir} align="right">
                Market Cap
              </Th>
              <Th onClick={() => onSort("volume24h")} active={sortKey === "volume24h"} dir={sortDir} align="right">
                24h Vol
              </Th>
              <Th onClick={() => onSort("tvl")} active={sortKey === "tvl"} dir={sortDir} align="right">
                Pool TVL
              </Th>
              <Th onClick={() => onSort("holders")} active={sortKey === "holders"} dir={sortDir} align="right">
                Holders
              </Th>
              <Th onClick={() => onSort("activeSupply")} active={sortKey === "activeSupply"} dir={sortDir} align="right">
                Active
              </Th>
              <Th onClick={() => onSort("circulatingSupply")} active={sortKey === "circulatingSupply"} dir={sortDir} align="right">
                Circulating
              </Th>
              <th className="px-3 py-3 text-right pr-4">7d Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={p.id}
                className="group border-b border-[var(--color-border)]/60 last:border-b-0 hover:bg-[var(--color-surface-2)]/60"
              >
                <td className="pl-4 pr-2 py-3 text-[var(--color-text-dim)] tabular">{ranked.get(p.id)}</td>
                <td className="px-3 py-3">
                  <Link href={`/player/${p.id}`} className="flex items-center gap-2.5">
                    <PlayerAvatar player={p} size="sm" />
                    <div className="min-w-0">
                      <div className="truncate font-medium group-hover:text-[var(--color-brand-soft)]">
                        {p.firstName} {p.lastName}
                      </div>
                      <div className="text-[11px] text-[var(--color-text-dim)]">
                        {p.position} · {TEAM_NAMES[p.team]}
                      </div>
                    </div>
                  </Link>
                </td>
                <td className="px-3 py-3 text-right tabular">{fmtPrice(p.priceUsd)}</td>
                <td className="px-3 py-3 text-right"><Delta value={p.change1h} /></td>
                <td className="px-3 py-3 text-right"><Delta value={p.change24h} /></td>
                <td className="px-3 py-3 text-right"><Delta value={p.change7d} /></td>
                <td className="px-3 py-3 text-right tabular">{fmtUsd(p.marketCap, { compact: true })}</td>
                <td className="px-3 py-3 text-right tabular">{fmtUsd(p.volume24h, { compact: true })}</td>
                <td className="px-3 py-3 text-right tabular">{fmtUsd(p.tvl, { compact: true })}</td>
                <td className="px-3 py-3 text-right tabular">{fmtNum(p.holders, { compact: true })}</td>
                <td className="px-3 py-3 text-right tabular">{fmtNum(p.activeSupply, { compact: true })}</td>
                <td className="px-3 py-3 text-right tabular">
                  {fmtNum(p.circulatingSupply, { compact: true })}
                  <span className="ml-1 text-[10px] text-[var(--color-text-dim)]">
                    ({Math.round((p.circulatingSupply / Math.max(1, p.maxSupply)) * 100)}%)
                  </span>
                </td>
                <td className="px-3 py-3 pr-4 text-right">
                  <Sparkline data={p.sparkline7d} positive={p.change7d >= 0} className="ml-auto" />
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-4 py-12 text-center text-sm text-[var(--color-text-muted)]">
                  No players match your filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-[var(--color-text-dim)]">
        Showing {rows.length} of {players.length} players. Click any row to drill into that player.
      </div>
    </div>
  );
}

function Th({
  children, onClick, active, dir, align = "left", className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th className={clsx("px-3 py-3 font-medium", className)}>
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
