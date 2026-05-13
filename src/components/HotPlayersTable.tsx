"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronDown, ChevronUp, Flame, Search } from "lucide-react";
import { PlayerAvatar } from "./PlayerAvatar";
import { Delta } from "./ui";
import { fmtPrice, fmtUsd } from "@/lib/format";
import { TEAM_NAMES } from "@/lib/data/players";
import type { HotPlayerRow } from "@/lib/data/footballfun";
import type { Position } from "@/lib/types";

type SortKey =
  | "rank" | "name" | "priceUsd" | "change24h"
  | "volume6h" | "volume24h" | "volume7d" | "heat";

const POSITIONS: (Position | "ALL")[] = ["ALL", "QB", "RB", "WR", "TE"];

export function HotPlayersTable({ players }: { players: HotPlayerRow[] }) {
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<Position | "ALL">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("volume24h");
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
        av = a.volume24h;
        bv = b.volume24h;
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

  // Rank by current sort column so the # cell reflects the visible order.
  const ranked = useMemo(() => new Map(rows.map((p, i) => [p.id, i + 1])), [rows]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
  };

  return (
    <div>
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
        <table className="w-full min-w-[960px] text-[13px]">
          <thead style={{ background: "color-mix(in oklab, var(--color-press) 50%, transparent)" }}>
            <tr className="border-b border-[var(--color-line)]">
              <Th onClick={() => onSort("rank")} active={sortKey === "rank"} dir={sortDir} align="left" className="w-12 pl-5">#</Th>
              <Th onClick={() => onSort("name")} active={sortKey === "name"} dir={sortDir} align="left">Player</Th>
              <Th onClick={() => onSort("priceUsd")} active={sortKey === "priceUsd"} dir={sortDir}>Price</Th>
              <Th onClick={() => onSort("change24h")} active={sortKey === "change24h"} dir={sortDir}>24h %</Th>
              <Th onClick={() => onSort("volume6h")} active={sortKey === "volume6h"} dir={sortDir}>6h Vol</Th>
              <Th onClick={() => onSort("volume24h")} active={sortKey === "volume24h"} dir={sortDir}>24h Vol</Th>
              <Th onClick={() => onSort("volume7d")} active={sortKey === "volume7d"} dir={sortDir}>7d Vol</Th>
              <Th onClick={() => onSort("heat")} active={sortKey === "heat"} dir={sortDir} className="pr-5">Heat</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={p.id}
                className="group transition-colors duration-[180ms] ease-out hover:bg-[color-mix(in_oklab,var(--color-press)_50%,transparent)]"
                style={{ borderBottom: "1px solid var(--color-line)" }}
              >
                <td
                  className="pl-5 pr-2"
                  style={{ padding: "var(--row-pad-y) 8px var(--row-pad-y) 20px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--color-text-dim)", fontSize: "11px", textAlign: "left" }}
                >
                  {ranked.get(p.id)}
                </td>
                <td className="px-3 text-left" style={{ padding: "var(--row-pad-y) 12px" }}>
                  <Link href={`/player/${p.id}`} className="flex w-full items-center gap-2.5 text-left">
                    <PlayerAvatar player={p} size="sm" />
                    <div className="min-w-0 flex-1 text-left">
                      <div className="truncate font-semibold text-[14px] text-left group-hover:text-[var(--accent-soft)]">
                        {p.firstName} {p.lastName}
                      </div>
                      <div
                        className="mt-0.5 truncate text-left"
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
                <td className="px-3" style={{ padding: "var(--row-pad-y) 12px" }}>
                  <div className="flex justify-center"><Delta value={p.change24h} /></div>
                </td>
                <NumCell>{p.volume6h > 0 ? fmtUsd(p.volume6h, { compact: true }) : <span className="text-[var(--color-text-dim)]">—</span>}</NumCell>
                <NumCell>{p.volume24h > 0 ? fmtUsd(p.volume24h, { compact: true }) : <span className="text-[var(--color-text-dim)]">—</span>}</NumCell>
                <NumCell>{p.volume7d > 0 ? fmtUsd(p.volume7d, { compact: true }) : <span className="text-[var(--color-text-dim)]">—</span>}</NumCell>
                <td className="pr-5" style={{ padding: "var(--row-pad-y) 12px" }}>
                  <div className="flex justify-center">
                    <HeatPill heat={p.heat} />
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-sm text-[var(--color-text-muted)]">
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
        Heat = (24h vol × 7) ÷ 7d vol · &gt;1× means today is hotter than the weekly average
      </div>
    </div>
  );
}

function HeatPill({ heat }: { heat: number }) {
  // Heat = ratio of 6h volume pace to 24h average. Three tiers:
  //   ≥2.0 → on fire (last 6h is 2×+ the daily average)
  //   ≥1.2 → warming
  //   else → cool
  const tier =
    heat >= 2 ? "fire" :
    heat >= 1.2 ? "warm" :
    "cool";

  const colors = {
    fire: {
      bg: "color-mix(in oklab, var(--color-penalty) 18%, transparent)",
      border: "color-mix(in oklab, var(--color-penalty) 50%, transparent)",
      text: "var(--color-penalty)",
    },
    warm: {
      bg: "color-mix(in oklab, var(--accent) 14%, transparent)",
      border: "color-mix(in oklab, var(--accent) 45%, transparent)",
      text: "var(--accent-soft)",
    },
    cool: {
      bg: "transparent",
      border: "var(--color-line)",
      text: "var(--color-text-dim)",
    },
  }[tier];

  const label = heat > 0 ? heat.toFixed(1) + "×" : "—";

  return (
    <span
      className="inline-flex items-center gap-1 rounded-[var(--r-pill)] border px-2"
      style={{
        height: 22,
        background: colors.bg,
        borderColor: colors.border,
        color: colors.text,
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.06em",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {tier === "fire" ? <Flame className="h-3 w-3" strokeWidth={2} /> : null}
      {label}
    </span>
  );
}

function NumCell({ children }: { children: React.ReactNode }) {
  return (
    <td
      className="mono px-3"
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
  children, onClick, active, dir, align, className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  dir?: "asc" | "desc";
  align?: "left" | "right" | "center";
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
        ...(align ? { textAlign: align } : null),
      }}
    >
      {onClick ? (
        <button
          onClick={onClick}
          className="inline-flex items-center gap-1 hover:text-[var(--color-text)]"
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
