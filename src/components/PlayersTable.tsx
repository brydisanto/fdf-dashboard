"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { Sparkline } from "./Sparkline";
import { PlayerAvatar } from "./PlayerAvatar";
import { Delta } from "./ui";
import { fmtNum, fmtPrice, fmtUsd } from "@/lib/format";
import { TEAM_COLORS, TEAM_NAMES } from "@/lib/data/players";
import type { PlayerSummary, Position } from "@/lib/types";

type SortKey =
  | "rank" | "name" | "priceUsd" | "change1h" | "change24h" | "change7d"
  | "marketCap" | "volume24h" | "tvl" | "holders"
  | "circulatingSupply" | "activeSupply";

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
    return new Map(byMc.map((p, i) => [p.id, i + 1]));
  }, [players]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
  };

  return (
    <div>
      {/* Toolbar — sits in a 16/20 padded row above the table; lives
          inside the press card so the search field reads like an
          input, not a separate card. */}
      <div
        className="flex flex-wrap items-center gap-3 border-b border-[var(--color-line)] px-5 py-4"
        style={{ background: "color-mix(in oklab, var(--color-press) 60%, transparent)" }}
      >
        <SearchField value={query} onChange={setQuery} />
        <Seg
          options={POSITIONS}
          value={pos}
          onChange={(v) => setPos(v as Position | "ALL")}
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
          {rows.length} / {players.length}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1280px] text-[13px]">
          <thead style={{ background: "color-mix(in oklab, var(--color-press) 50%, transparent)" }}>
            <tr className="border-b border-[var(--color-line)]">
              <Th onClick={() => onSort("rank")}    active={sortKey === "rank"}    dir={sortDir} className="w-12 pl-5">#</Th>
              <Th onClick={() => onSort("name")}    active={sortKey === "name"}    dir={sortDir}>Player</Th>
              <Th onClick={() => onSort("priceUsd")} active={sortKey === "priceUsd"} dir={sortDir} align="right">Price</Th>
              <Th onClick={() => onSort("change1h")} active={sortKey === "change1h"} dir={sortDir} align="right">1h</Th>
              <Th onClick={() => onSort("change24h")} active={sortKey === "change24h"} dir={sortDir} align="right">24h</Th>
              <Th onClick={() => onSort("change7d")} active={sortKey === "change7d"} dir={sortDir} align="right">7d</Th>
              <Th onClick={() => onSort("marketCap")} active={sortKey === "marketCap"} dir={sortDir} align="right">Market Cap</Th>
              <Th onClick={() => onSort("volume24h")} active={sortKey === "volume24h"} dir={sortDir} align="right">24h Vol</Th>
              <Th onClick={() => onSort("tvl")} active={sortKey === "tvl"} dir={sortDir} align="right">Pool TVL</Th>
              <Th onClick={() => onSort("holders")} active={sortKey === "holders"} dir={sortDir} align="right">Holders</Th>
              <Th onClick={() => onSort("activeSupply")} active={sortKey === "activeSupply"} dir={sortDir} align="right">Active</Th>
              <Th onClick={() => onSort("circulatingSupply")} active={sortKey === "circulatingSupply"} dir={sortDir} align="right">Circulating</Th>
              <Th align="right" className="pr-5">7d Trend</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const teamColor = TEAM_COLORS[p.team] ?? "var(--accent)";
              return (
                <tr
                  key={p.id}
                  className="group transition-colors duration-[180ms] ease-out hover:bg-[color-mix(in_oklab,var(--color-press)_50%,transparent)]"
                  style={{
                    boxShadow: `inset 4px 0 0 0 ${teamColor}`,
                    borderBottom: "1px solid color-mix(in oklab, var(--color-line) 50%, transparent)",
                  }}
                >
                  <td
                    className="pl-5 pr-2"
                    style={{ padding: "var(--row-pad-y) 8px var(--row-pad-y) 20px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--color-text-dim)", fontSize: "11px" }}
                  >
                    {ranked.get(p.id)}
                  </td>
                  <td className="px-3" style={{ padding: "var(--row-pad-y) 12px" }}>
                    <Link href={`/player/${p.id}`} className="flex items-center gap-2.5">
                      <PlayerAvatar player={p} size="sm" />
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-[14px] group-hover:text-[var(--accent-soft)]">
                          {p.firstName} {p.lastName}
                        </div>
                        <div
                          className="mt-0.5 truncate"
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "10.5px",
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: "var(--color-text-dim)",
                          }}
                        >
                          {p.position} · {TEAM_NAMES[p.team] ?? p.team}
                        </div>
                      </div>
                    </Link>
                  </td>
                  <NumCell>{fmtPrice(p.priceUsd)}</NumCell>
                  <Cell><div className="text-right"><Delta value={p.change1h} /></div></Cell>
                  <Cell><div className="text-right"><Delta value={p.change24h} /></div></Cell>
                  <Cell><div className="text-right"><Delta value={p.change7d} /></div></Cell>
                  <NumCell>{fmtUsd(p.marketCap, { compact: true })}</NumCell>
                  <NumCell>{fmtUsd(p.volume24h, { compact: true })}</NumCell>
                  <NumCell>{fmtUsd(p.tvl, { compact: true })}</NumCell>
                  <NumCell>{fmtNum(p.holders, { compact: true })}</NumCell>
                  <NumCell>{fmtNum(p.activeSupply, { compact: true })}</NumCell>
                  <NumCell>
                    {fmtNum(p.circulatingSupply, { compact: true })}
                    <span className="ml-1 text-[10px] text-[var(--color-text-dim)]">
                      ({Math.round((p.circulatingSupply / Math.max(1, p.maxSupply)) * 100)}%)
                    </span>
                  </NumCell>
                  <Cell className="pr-5">
                    <Sparkline data={p.sparkline7d} positive={p.change7d >= 0} className="ml-auto" />
                  </Cell>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-5 py-12 text-center text-sm text-[var(--color-text-muted)]">
                  No players match your filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div
        className="border-t border-[var(--color-line)] px-5 py-3"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10.5px",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--color-text-dim)",
        }}
      >
        Click any row to drill into that player.
      </div>
    </div>
  );
}

function Cell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={clsx("px-3", className)} style={{ padding: "var(--row-pad-y) 12px" }}>
      {children}
    </td>
  );
}

function NumCell({ children }: { children: React.ReactNode }) {
  return (
    <td
      className="mono px-3 text-right"
      style={{ padding: "var(--row-pad-y) 12px", fontVariantNumeric: "tabular-nums" }}
    >
      {children}
    </td>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative flex-1 max-w-[360px] min-w-[260px]">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-dim)]" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search player, team, position…"
        className="h-[38px] w-full rounded-[var(--r-8)] border border-[var(--color-line)] bg-[var(--color-press)] pl-9 pr-3 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--accent)] focus:outline-none transition-colors"
      />
    </div>
  );
}

function Seg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
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

function Th({
  children, onClick, active, dir, align = "left", className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  dir?: "asc" | "desc";
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      className={clsx("px-3 py-3 select-none", className)}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "10px",
        fontWeight: 600,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: active ? "var(--color-text)" : "var(--color-text-dim)",
        textAlign: align,
      }}
    >
      {onClick ? (
        <button
          onClick={onClick}
          className={clsx(
            "inline-flex items-center gap-1 hover:text-[var(--color-text)]",
            align === "right" && "ml-auto",
          )}
        >
          <span>{children}</span>
          {active && dir ? (
            dir === "asc" ? <ChevronUp className="h-3 w-3" strokeWidth={1.5} /> : <ChevronDown className="h-3 w-3" strokeWidth={1.5} />
          ) : null}
        </button>
      ) : (
        children
      )}
    </th>
  );
}
