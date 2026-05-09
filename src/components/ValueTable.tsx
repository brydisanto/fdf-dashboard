"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PlayerAvatar } from "./PlayerAvatar";
import { fmtPrice } from "@/lib/format";
import { TEAM_NAMES, TEAM_COLORS } from "@/lib/data/players";
import type { PlayerSummary, Position } from "@/lib/types";

export interface ValueRow extends PlayerSummary {
  marketPosRank: number;             // 1-indexed market price rank within position
  posPlayers: number;                // total roster players at this position
  auctionValue: number | null;       // Draft Sharks PPR auction $
  fpPosRank: number | null;          // FantasyPros consensus PPR positional rank
  posRankDelta: number | null;       // fpPosRank − marketPosRank (positive = market ranks higher than FP)
  ratio: number | null;              // playerAuction / anchorAuction
  expectedPriceUsd: number | null;   // anchor.marketPrice × ratio
  priceVsExpectedUsd: number | null; // priceUsd − expected
  priceVsExpectedPct: number | null; // (priceUsd − expected) / expected × 100
  isAnchor: boolean;                 // anchor is highlighted (no Δ vs self)
  verdict: "undervalued" | "fair" | "overvalued" | "unranked";
}

type SortKey =
  | "priceVsExpectedPct" | "priceVsExpectedUsd" | "expectedPriceUsd"
  | "priceUsd" | "auctionValue" | "fpPosRank" | "marketPosRank"
  | "posRankDelta" | "name";

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
      setSortDir(key === "name" || key === "marketPosRank" || key === "fpPosRank" ? "asc" : "desc");
    }
  };

  return (
    <div>
      {/* Toolbar — position filter */}
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
        <table className="w-full min-w-[1080px]">
          <thead style={{ background: "color-mix(in oklab, var(--color-press) 60%, transparent)" }}>
            <tr className="border-b border-[var(--color-line)]">
              <Th onClick={() => onSort("name")}             active={sortKey === "name"}             dir={sortDir}>Player</Th>
              <Th onClick={() => onSort("marketPosRank")}    active={sortKey === "marketPosRank"}    dir={sortDir} align="right" tip="Market positional rank by price">MKT</Th>
              <Th onClick={() => onSort("fpPosRank")}        active={sortKey === "fpPosRank"}        dir={sortDir} align="right" tip="FantasyPros consensus PPR positional rank">FP</Th>
              <Th onClick={() => onSort("posRankDelta")}     active={sortKey === "posRankDelta"}     dir={sortDir} align="right" tip="FP rank − market rank (positive = market ranks higher than FP, potentially overvalued)">Δ</Th>
              <Th onClick={() => onSort("priceUsd")}         active={sortKey === "priceUsd"}         dir={sortDir} align="right">Price</Th>
              <Th onClick={() => onSort("auctionValue")}     active={sortKey === "auctionValue"}     dir={sortDir} align="right" tip="Draft Sharks PPR auction value">Auction Val</Th>
              <Th onClick={() => onSort("expectedPriceUsd")} active={sortKey === "expectedPriceUsd"} dir={sortDir} align="right" tip="Anchor price × auction-value ratio">Exp Price</Th>
              <Th onClick={() => onSort("priceVsExpectedUsd")} active={sortKey === "priceVsExpectedUsd"} dir={sortDir} align="right" tip="Actual − expected (negative = undervalued)">Δ $</Th>
              <Th onClick={() => onSort("priceVsExpectedPct")} active={sortKey === "priceVsExpectedPct"} dir={sortDir} align="right" tip="Actual − expected as % of expected">Δ %</Th>
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
                    borderBottom: "1px solid color-mix(in oklab, var(--color-line) 50%, transparent)",
                    background: p.isAnchor ? "color-mix(in oklab, var(--accent) 6%, transparent)" : undefined,
                  }}
                >
                  <Cell>
                    <Link href={`/player/${p.id}`} className="flex items-center gap-2.5 group">
                      <PlayerAvatar player={p} size="sm" />
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold group-hover:text-[var(--accent-soft)]">
                          {p.firstName} {p.lastName}
                          {p.isAnchor ? (
                            <span
                              className="ml-1.5 rounded border border-[var(--accent-line)] bg-[var(--accent-tint)] px-1 py-0.5 align-middle text-[var(--accent-soft)]"
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "8.5px",
                                fontWeight: 700,
                                letterSpacing: "0.16em",
                              }}
                            >
                              ANCHOR
                            </span>
                          ) : null}
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
                    <RankDelta value={p.posRankDelta} />
                  </NumCell>
                  <NumCell>{fmtPrice(p.priceUsd)}</NumCell>
                  <NumCell>
                    {p.auctionValue != null ? (
                      <span className="font-semibold text-[var(--color-text)]">${p.auctionValue}</span>
                    ) : (
                      <span style={{ color: "var(--color-text-dim)" }}>—</span>
                    )}
                  </NumCell>
                  <NumCell>
                    {p.expectedPriceUsd != null
                      ? p.isAnchor
                        ? <span style={{ color: "var(--color-text-dim)" }}>—</span>
                        : fmtPrice(p.expectedPriceUsd)
                      : <span style={{ color: "var(--color-text-dim)" }}>—</span>}
                  </NumCell>
                  <NumDiffCell deltaUsd={p.priceVsExpectedUsd} verdict={p.verdict} isAnchor={p.isAnchor} />
                  <NumCell>
                    <PctDelta value={p.priceVsExpectedPct} verdict={p.verdict} isAnchor={p.isAnchor} />
                  </NumCell>
                  <Cell className="pr-5 text-right">
                    <VerdictBadge verdict={p.verdict} isAnchor={p.isAnchor} />
                  </Cell>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-5 py-12 text-center text-sm text-[var(--color-text-muted)]">
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

function NumDiffCell({
  deltaUsd,
  verdict,
  isAnchor,
}: {
  deltaUsd: number | null;
  verdict: ValueRow["verdict"];
  isAnchor: boolean;
}) {
  if (isAnchor || deltaUsd == null) {
    return (
      <td
        className="text-right"
        style={{
          padding: "10px 12px",
          fontFamily: "var(--font-mono)",
          color: "var(--color-text-dim)",
        }}
      >
        —
      </td>
    );
  }
  // Color background by verdict — mirrors the user's spreadsheet
  // (red for overvalued, green for undervalued, neutral for fair).
  const bg =
    verdict === "overvalued"
      ? "color-mix(in oklab, var(--color-penalty) 18%, transparent)"
      : verdict === "undervalued"
        ? "color-mix(in oklab, var(--color-turf) 18%, transparent)"
        : "transparent";
  const fg =
    verdict === "overvalued"
      ? "var(--color-penalty)"
      : verdict === "undervalued"
        ? "var(--color-turf)"
        : "var(--color-text)";
  return (
    <td
      className="text-right"
      style={{
        padding: "10px 12px",
        fontFamily: "var(--font-mono)",
        fontVariantNumeric: "tabular-nums",
        fontSize: "13px",
        fontWeight: 700,
        background: bg,
        color: fg,
      }}
    >
      {deltaUsd > 0 ? "+" : ""}
      {fmtPrice(deltaUsd)}
    </td>
  );
}

function PctDelta({ value, verdict, isAnchor }: { value: number | null; verdict: ValueRow["verdict"]; isAnchor: boolean }) {
  if (isAnchor || value == null) return <span style={{ color: "var(--color-text-dim)" }}>—</span>;
  const fg =
    verdict === "overvalued"
      ? "var(--color-penalty)"
      : verdict === "undervalued"
        ? "var(--color-turf)"
        : "var(--color-text-muted)";
  return (
    <span style={{ color: fg, fontWeight: 700 }}>
      {value > 0 ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}

function RankDelta({ value }: { value: number | null }) {
  if (value == null) return <span style={{ color: "var(--color-text-dim)" }}>—</span>;
  if (value === 0) return <span style={{ color: "var(--color-text-muted)" }}>0</span>;
  // Positive = auction ranks lower (higher number) than market →
  // market ranks them higher. Penalty color. Negative = auction
  // ranks higher than market → market underrates them. Turf color.
  const fg = value > 0 ? "var(--color-penalty)" : "var(--color-turf)";
  return (
    <span style={{ color: fg, fontWeight: 700 }}>
      {value > 0 ? `+${value}` : value}
    </span>
  );
}

function VerdictBadge({ verdict, isAnchor }: { verdict: ValueRow["verdict"]; isAnchor: boolean }) {
  if (isAnchor) {
    return (
      <span
        className="inline-flex items-center rounded-[var(--r-4)] border border-[var(--accent-line)] bg-[var(--accent-tint)] px-2 py-1 text-[var(--accent-soft)]"
        style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.14em" }}
      >
        ANCHOR
      </span>
    );
  }
  const map = {
    undervalued: { cls: "border-[color-mix(in_oklab,var(--color-turf)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-turf)_12%,transparent)] text-[var(--color-turf)]", label: "BUY" },
    overvalued:  { cls: "border-[color-mix(in_oklab,var(--color-penalty)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-penalty)_12%,transparent)] text-[var(--color-penalty)]", label: "SELL" },
    fair:        { cls: "border-[var(--color-line)] bg-[var(--color-press)] text-[var(--color-text-muted)]", label: "FAIR" },
    unranked:    { cls: "border-[var(--color-line)] bg-transparent text-[var(--color-text-dim)]", label: "—" },
  };
  const m = map[verdict];
  return (
    <span
      className={clsx("inline-flex items-center rounded-[var(--r-4)] border px-2 py-1", m.cls)}
      style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.14em" }}
    >
      {m.label}
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
