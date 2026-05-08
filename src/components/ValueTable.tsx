"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronUp, Minus } from "lucide-react";
import { PlayerAvatar } from "./PlayerAvatar";
import { fmtPrice } from "@/lib/format";
import { TEAM_NAMES } from "@/lib/data/players";
import type { PlayerSummary, Position } from "@/lib/types";

export interface ValueRow extends PlayerSummary {
  fpConsensusRank: number | null;
  fpPosRankNum: number | null;
  marketPosRank: number;
  posPlayers: number;
  rankDelta: number | null;          // market_pos − fp_pos (legacy disparity)
  fpOverallGapPct: number | null;    // (player.fpOverall − pos#1.fpOverall) / pos#1.fpOverall × 100
  expectedPriceUsd: number | null;   // pos#1 price × (1 − gap%)
  priceVsExpectedUsd: number | null; // actual − expected
  priceVsExpectedPct: number | null; // (actual − expected) / expected × 100
  verdict: "undervalued" | "fair" | "overvalued" | "unranked";
}

type SortKey =
  | "priceVsExpectedPct" | "priceVsExpectedUsd" | "expectedPriceUsd"
  | "priceUsd" | "fpOverallGapPct" | "fpPosRankNum" | "fpConsensusRank"
  | "marketPosRank" | "name";

const POSITIONS: (Position | "ALL")[] = ["ALL", "QB", "RB", "WR", "TE"];

const FAIR_BAND_PCT = 10;

export function ValueTable({ rows }: { rows: ValueRow[] }) {
  const [pos, setPos] = useState<Position | "ALL">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("priceVsExpectedPct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc"); // most undervalued first

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
      setSortDir(
        key === "name" || key === "priceVsExpectedPct" || key === "priceVsExpectedUsd"
          ? "asc"
          : "desc",
      );
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-dim)]">
          <span className="inline-flex items-center gap-1.5">
            <ArrowUpRight className="h-3 w-3 text-[var(--color-gain)]" /> undervalued
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Minus className="h-3 w-3" /> fair (±{FAIR_BAND_PCT}%)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ArrowDownRight className="h-3 w-3 text-[var(--color-loss)]" /> overvalued
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full min-w-[1200px] text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-dim)]">
              <Th onClick={() => onSort("name")}              active={sortKey === "name"}              dir={sortDir} className="w-[24%] pl-4">
                Player
              </Th>
              <Th onClick={() => onSort("priceUsd")}          active={sortKey === "priceUsd"}          dir={sortDir} align="right">
                Market Price
              </Th>
              <Th onClick={() => onSort("fpPosRankNum")}      active={sortKey === "fpPosRankNum"}      dir={sortDir} align="right">
                FP Pos
              </Th>
              <Th onClick={() => onSort("fpConsensusRank")}   active={sortKey === "fpConsensusRank"}   dir={sortDir} align="right">
                FP Overall
              </Th>
              <Th onClick={() => onSort("fpOverallGapPct")}   active={sortKey === "fpOverallGapPct"}   dir={sortDir} align="right">
                Gap from #1
              </Th>
              <Th onClick={() => onSort("expectedPriceUsd")}  active={sortKey === "expectedPriceUsd"}  dir={sortDir} align="right">
                Expected $
              </Th>
              <Th onClick={() => onSort("priceVsExpectedUsd")} active={sortKey === "priceVsExpectedUsd"} dir={sortDir} align="right">
                Δ
              </Th>
              <Th onClick={() => onSort("priceVsExpectedPct")} active={sortKey === "priceVsExpectedPct"} dir={sortDir} align="right" className="pr-4">
                Δ %
              </Th>
              <th className="px-3 py-3 text-right pr-4">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr
                key={p.id}
                className="group border-b border-[var(--color-border)]/60 last:border-b-0 hover:bg-[var(--color-surface-2)]/60"
              >
                <td className="pl-4 pr-3 py-3">
                  <Link href={`/player/${p.id}`} className="flex items-center gap-2.5">
                    <PlayerAvatar player={p} size="sm" />
                    <div className="min-w-0">
                      <div className="truncate font-medium group-hover:text-[var(--color-brand-soft)]">
                        {p.firstName} {p.lastName}
                      </div>
                      <div className="text-[11px] text-[var(--color-text-dim)]">
                        {p.position} · {TEAM_NAMES[p.team]} · market {p.position}{p.marketPosRank}
                      </div>
                    </div>
                  </Link>
                </td>
                <td className="px-3 py-3 text-right tabular">{fmtPrice(p.priceUsd)}</td>
                <td className="px-3 py-3 text-right tabular">
                  {p.fpPosRankNum != null ? `${p.position}${p.fpPosRankNum}` : <span className="text-[var(--color-text-dim)]">—</span>}
                </td>
                <td className="px-3 py-3 text-right tabular">
                  {p.fpConsensusRank ? `#${p.fpConsensusRank}` : <span className="text-[var(--color-text-dim)]">—</span>}
                </td>
                <td className="px-3 py-3 text-right tabular text-[var(--color-text-muted)]">
                  {p.fpOverallGapPct == null
                    ? <span className="text-[var(--color-text-dim)]">—</span>
                    : p.fpOverallGapPct === 0
                      ? "anchor"
                      : `+${p.fpOverallGapPct.toFixed(1)}%`}
                </td>
                <td className="px-3 py-3 text-right tabular text-[var(--color-text-muted)]">
                  {p.expectedPriceUsd != null ? fmtPrice(p.expectedPriceUsd) : <span className="text-[var(--color-text-dim)]">—</span>}
                </td>
                <td className="px-3 py-3 text-right tabular">
                  <DeltaUsd value={p.priceVsExpectedUsd} />
                </td>
                <td className="px-3 py-3 pr-4 text-right tabular font-medium">
                  <DeltaPct value={p.priceVsExpectedPct} />
                </td>
                <td className="px-3 py-3 text-right pr-4">
                  <VerdictPill verdict={p.verdict} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-[var(--color-text-muted)]">
                  No players match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-[var(--color-text-dim)]">
        Expected price for each player is anchored on the FP-#1 player at their position and scaled
        down by the % gap in FP overall ranks. Δ = actual market price − expected price; Δ % expresses
        that gap as a percentage of expected.
      </div>
    </div>
  );
}

function DeltaUsd({ value }: { value: number | null }) {
  if (value == null) return <span className="text-[var(--color-text-dim)]">—</span>;
  if (Math.abs(value) < 0.0005) return <span className="text-[var(--color-text-muted)]">≈ $0</span>;
  const positive = value >= 0;
  return (
    <span className={positive ? "text-[var(--color-loss)]" : "text-[var(--color-gain)]"}>
      {positive ? "+" : ""}{fmtPrice(value)}
    </span>
  );
}

function DeltaPct({ value }: { value: number | null }) {
  if (value == null) return <span className="text-[var(--color-text-dim)]">—</span>;
  const fair = Math.abs(value) <= FAIR_BAND_PCT;
  const positive = value > 0;
  const capped = Math.abs(value) >= 500;
  const display = capped
    ? `${positive ? "≥+" : "≤−"}500%`
    : `${positive ? "+" : ""}${value.toFixed(1)}%`;
  return (
    <span
      className={clsx(
        fair && "text-[var(--color-text-muted)]",
        !fair && positive && "text-[var(--color-loss)]",
        !fair && !positive && "text-[var(--color-gain)]",
      )}
    >
      {display}
    </span>
  );
}

function VerdictPill({ verdict }: { verdict: ValueRow["verdict"] }) {
  if (verdict === "undervalued") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-[var(--color-gain)]/40 bg-[var(--color-gain)]/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-gain)]">
        <ArrowUpRight className="h-3 w-3" /> Undervalued
      </span>
    );
  }
  if (verdict === "overvalued") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-[var(--color-loss)]/40 bg-[var(--color-loss)]/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-loss)]">
        <ArrowDownRight className="h-3 w-3" /> Overvalued
      </span>
    );
  }
  if (verdict === "fair") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
        <Minus className="h-3 w-3" /> Fair
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-dim)]">
      Unranked
    </span>
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
