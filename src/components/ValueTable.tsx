"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PlayerAvatar } from "./PlayerAvatar";
import { TEAM_NAMES, TEAM_COLORS } from "@/lib/data/players";
import type { PlayerSummary, Position } from "@/lib/types";

export interface ValueRow extends PlayerSummary {
  marketPosRank: number;             // 1-indexed market price rank within position
  posPlayers: number;                // total roster players at this position
  fpPosRank: number | null;          // FantasyPros consensus PPR positional rank
  posRankDelta: number | null;       // fpPosRank − marketPosRank
  verdict: "undervalued" | "fair" | "overvalued" | "unranked";
}

type SortKey =
  | "name" | "marketPosRank" | "fpPosRank" | "posRankDelta";

const POSITIONS: (Position | "ALL")[] = ["ALL", "QB", "RB", "WR", "TE"];

export function ValueTable({ rows }: { rows: ValueRow[] }) {
  const [pos, setPos] = useState<Position | "ALL">("QB");
  const [sortKey, setSortKey] = useState<SortKey>("marketPosRank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    let list = rows.slice();
    if (pos !== "ALL") list = list.filter((r) => r.position === pos);
    list.sort((a, b) => {
      let av: number | string | null;
      let bv: number | string | null;
      if (sortKey === "name") {
        av = `${a.lastName} ${a.firstName}`;
        bv = `${b.lastName} ${b.firstName}`;
      } else {
        av = a[sortKey];
        bv = b[sortKey];
      }
      const aNull = av == null;
      const bNull = bv == null;
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [rows, pos, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      // Default to asc for ranks (1 first), desc for everything else.
      setSortDir(key === "marketPosRank" || key === "fpPosRank" || key === "name" ? "asc" : "desc");
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
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
          {filtered.length} {pos === "ALL" ? "players" : `${pos}s`}
        </span>
      </div>

      <div className="overflow-x-auto rounded-[var(--r-14)] border border-[var(--color-line)] bg-[var(--color-bench)]">
        <table className="w-full min-w-[640px]">
          <thead style={{ background: "color-mix(in oklab, var(--color-press) 60%, transparent)" }}>
            <tr className="border-b border-[var(--color-line)]">
              <Th onClick={() => onSort("name")}          active={sortKey === "name"}          dir={sortDir}>Player</Th>
              <Th onClick={() => onSort("marketPosRank")} active={sortKey === "marketPosRank"} dir={sortDir} align="right" tip="Sport.fun market positional rank by price">FDF Ranking</Th>
              <Th onClick={() => onSort("fpPosRank")}     active={sortKey === "fpPosRank"}     dir={sortDir} align="right" tip="FantasyPros consensus PPR positional rank">FP Ranking</Th>
              <Th onClick={() => onSort("posRankDelta")}  active={sortKey === "posRankDelta"}  dir={sortDir} align="right" tip="FP rank − market rank (negative = market may be undervaluing)">Difference</Th>
              <Th align="right" className="pr-5">Verdict</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const teamColor = TEAM_COLORS[p.team] ?? "var(--accent)";
              return (
                <tr
                  key={p.id}
                  className="transition-colors duration-[180ms] ease-out hover:bg-[color-mix(in_oklab,var(--color-press)_50%,transparent)]"
                  style={{
                    boxShadow: `inset 4px 0 0 0 ${teamColor}`,
                    borderBottom: "1px solid var(--color-line)",
                  }}
                >
                  <Cell>
                    <Link href={`/player/${p.id}`} className="flex items-center gap-2.5 group">
                      <PlayerAvatar player={p} size="sm" />
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold group-hover:text-[var(--accent-soft)]">
                          {p.firstName} {p.lastName}
                        </div>
                        <div
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "10px",
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: "var(--color-text-dim)",
                          }}
                        >
                          {p.position} · {TEAM_NAMES[p.team] ?? p.team}
                        </div>
                      </div>
                    </Link>
                  </Cell>
                  <NumCell>
                    {p.marketPosRank > 0 ? (
                      <span style={{ color: "var(--color-text)" }}>
                        {p.position}
                        {p.marketPosRank}
                      </span>
                    ) : (
                      "—"
                    )}
                  </NumCell>
                  <NumCell>
                    {p.fpPosRank != null ? (
                      <span style={{ color: "var(--color-text)" }}>
                        {p.position}
                        {p.fpPosRank}
                      </span>
                    ) : (
                      <span style={{ color: "var(--color-text-dim)" }}>—</span>
                    )}
                  </NumCell>
                  <NumCell>
                    <RankDelta value={p.posRankDelta} verdict={p.verdict} />
                  </NumCell>
                  <Cell className="pr-5 text-right">
                    <VerdictBadge verdict={p.verdict} delta={p.posRankDelta} />
                  </Cell>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-sm text-[var(--color-text-muted)]">
                  No matching players.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={clsx("px-3", className)} style={{ padding: "10px 12px" }}>
      {children}
    </td>
  );
}

function NumCell({ children }: { children: React.ReactNode }) {
  return (
    <td
      className="text-right"
      style={{
        padding: "10px 12px",
        fontFamily: "var(--font-mono)",
        fontVariantNumeric: "tabular-nums",
        fontSize: "13px",
      }}
    >
      {children}
    </td>
  );
}

// Δ — negative means FP ranks them higher than market does
// (potentially undervalued, turf-green). Positive means market ranks
// them higher (potentially overvalued, penalty-red).
function RankDelta({ value, verdict }: { value: number | null; verdict: ValueRow["verdict"] }) {
  if (value == null) return <span style={{ color: "var(--color-text-dim)" }}>—</span>;
  if (value === 0 || verdict === "fair")
    return <span style={{ color: "var(--color-text-muted)", fontWeight: 700 }}>{value > 0 ? "+" : ""}{value}</span>;
  const fg = value < 0 ? "var(--color-turf)" : "var(--color-penalty)";
  return (
    <span style={{ color: fg, fontWeight: 700 }}>
      {value > 0 ? `+${value}` : value}
    </span>
  );
}

function VerdictBadge({ verdict, delta }: { verdict: ValueRow["verdict"]; delta: number | null }) {
  const map = {
    undervalued: { cls: "border-[color-mix(in_oklab,var(--color-turf)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-turf)_12%,transparent)] text-[var(--color-turf)]", label: "UNDERVALUED" },
    overvalued:  { cls: "border-[color-mix(in_oklab,var(--color-penalty)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-penalty)_12%,transparent)] text-[var(--color-penalty)]", label: "OVERVALUED" },
    fair:        { cls: "border-[var(--color-line)] bg-[var(--color-press)] text-[var(--color-text-muted)]", label: "FAIR" },
    unranked:    { cls: "border-[var(--color-line)] bg-transparent text-[var(--color-text-dim)]", label: "—" },
  };
  const m = map[verdict];
  const showDelta = verdict !== "unranked" && delta != null;
  return (
    <span
      className={clsx("inline-flex items-center gap-1 rounded-[var(--r-4)] border px-2 py-1", m.cls)}
      style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.14em" }}
    >
      <span>{m.label}</span>
      {showDelta ? (
        <span className="opacity-80">
          {delta > 0 ? `+${delta}` : delta}
        </span>
      ) : null}
    </span>
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
  children,
  onClick,
  active,
  dir,
  align = "left",
  className,
  tip,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  dir?: "asc" | "desc";
  align?: "left" | "right";
  className?: string;
  tip?: string;
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
      title={tip}
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
            dir === "asc" ? (
              <ChevronUp className="h-3 w-3" strokeWidth={1.5} />
            ) : (
              <ChevronDown className="h-3 w-3" strokeWidth={1.5} />
            )
          ) : null}
        </button>
      ) : (
        children
      )}
    </th>
  );
}
