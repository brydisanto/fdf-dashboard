"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PlayerAvatar } from "./PlayerAvatar";
import type { SellerWatchPlayer } from "@/lib/data/seller-watch";
import type { Position } from "@/lib/types";

// Every player with the seller-overhang breakdown. Filterable by
// position, sortable on every number; defaults to highest risk first.

type PosFilter = "ALL" | Position;
type SortKey = "risk" | "fastPct" | "largePct" | "sellerPct" | "netFlowPct" | "change7d" | "buybackPct";

const POSITIONS: PosFilter[] = ["ALL", "QB", "RB", "WR", "TE"];
const PAGE = 25;

export function SellerWatchPlayersTable({ rows }: { rows: SellerWatchPlayer[] }) {
  const [pos, setPos] = useState<PosFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("risk");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const list = pos === "ALL" ? rows.slice() : rows.filter((r) => r.player.position === pos);
    list.sort((a, b) => (dir === "asc" ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]));
    return list;
  }, [rows, pos, sortKey, dir]);
  const maxRisk = Math.max(1, ...rows.map((r) => r.risk));
  const visible = showAll ? filtered : filtered.slice(0, PAGE);

  const onSort = (k: SortKey) => {
    if (k === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      // Flow and price change read "worst first" when ascending.
      setDir(k === "netFlowPct" || k === "change7d" ? "asc" : "desc");
    }
  };

  return (
    <div>
      <div
        className="flex flex-wrap items-center gap-3 border-b border-[var(--color-line)] px-5 py-4"
        style={{ background: "color-mix(in oklab, var(--color-press) 60%, transparent)" }}
      >
        <div
          className="inline-flex rounded-[var(--r-8)] border border-[var(--color-line)] p-[2px]"
          style={{ background: "var(--color-stadium)" }}
          role="group"
          aria-label="Position"
        >
          {POSITIONS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={pos === p}
              onClick={() => {
                setPos(p);
                setShowAll(false);
              }}
              className={
                pos === p
                  ? "rounded-[6px] px-2.5 py-1 text-[var(--color-text)] transition-colors"
                  : "rounded-[6px] px-2.5 py-1 text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-text-muted)]"
              }
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "0.14em",
                background: pos === p ? "var(--color-bench)" : "transparent",
              }}
            >
              {p}
            </button>
          ))}
        </div>
        <span
          className="ml-auto"
          style={{ ...MONO, fontSize: 10.5, letterSpacing: "0.14em", color: "var(--color-text-dim)" }}
        >
          {filtered.length} players
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-[13px]">
          <thead style={{ background: "color-mix(in oklab, var(--color-press) 50%, transparent)" }}>
            <tr>
              <th colSpan={2} />
              <GroupTh span={3}>Held by heavy sellers · % of active shares</GroupTh>
              <GroupTh span={3}>This week</GroupTh>
              <th />
            </tr>
            <tr className="border-b border-[var(--color-line)]">
              <Th left className="pl-5">#</Th>
              <Th left>Player</Th>
              <Th sortKey="fastPct" current={sortKey} dir={dir} onSort={onSort} divider title="Wallets selling 8%+ of their position per week">Fast</Th>
              <Th sortKey="largePct" current={sortKey} dir={dir} onSort={onSort} title="Holders worth $50K+ that sell slowly but every week">Large</Th>
              <Th sortKey="sellerPct" current={sortKey} dir={dir} onSort={onSort} title="Every wallet that net sold $500+ this week">All</Th>
              <Th sortKey="netFlowPct" current={sortKey} dir={dir} onSort={onSort} divider title="All wallets: buys and swaps in minus sells and swaps out, % of active shares">Net flow</Th>
              <Th sortKey="change7d" current={sortKey} dir={dir} onSort={onSort}>Price</Th>
              <Th sortKey="buybackPct" current={sortKey} dir={dir} onSort={onSort} title="Shares the buyback wallet bought, % of active shares">Buyback</Th>
              <Th sortKey="risk" current={sortKey} dir={dir} onSort={onSort} divider className="pr-5">Risk</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr
                key={r.player.id}
                className="transition-colors hover:bg-[var(--color-bench)]"
                style={{ borderBottom: "1px solid var(--color-line)" }}
              >
                <Td left className="pl-5" dim>{i + 1}</Td>
                <td style={{ padding: "var(--row-pad-y) 12px" }}>
                  <div className="flex items-center gap-2.5">
                    <PlayerAvatar player={r.player} size="xs" />
                    <div className="min-w-0">
                      <Link
                        href={`/player/${r.player.id}`}
                        className="font-bold text-[var(--color-text)] hover:text-[var(--accent-soft)]"
                      >
                        {r.player.displayName}
                      </Link>
                      <div style={{ ...MONO, fontSize: 10, letterSpacing: "0.12em", color: "var(--color-text-dim)" }}>
                        {r.player.position} · {r.player.team}
                        {r.tier ? (
                          <span style={{ color: "var(--color-turf)" }}> · {r.tier === "safest" ? "Safest" : "Steady"}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </td>
                <Td divider><Share n={r.fastPct} warnAt={10} /></Td>
                <Td><Share n={r.largePct} warnAt={20} /></Td>
                <Td dim>{r.sellerPct > 0 ? `${r.sellerPct.toFixed(1)}%` : "—"}</Td>
                <Td divider><Signed n={r.netFlowPct} suffix="%" /></Td>
                <Td><Signed n={r.change7d} suffix="%" digits={0} /></Td>
                <Td dim>{r.buybackPct > 0 ? <span style={{ color: "var(--color-turf)" }}>{r.buybackPct.toFixed(1)}%</span> : "—"}</Td>
                <Td divider className="pr-5">
                  <RiskBar risk={r.risk} max={maxRisk} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > PAGE ? (
        <div className="border-t border-[var(--color-line)] px-5 py-3 text-center">
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            style={{ ...MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.14em" }}
          >
            {showAll ? "Show top 25" : `Show all ${filtered.length}`}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Share({ n, warnAt }: { n: number; warnAt: number }) {
  if (n <= 0) return <span style={{ color: "var(--color-text-dim)" }}>—</span>;
  return (
    <span style={{ color: n >= warnAt ? "var(--color-penalty)" : "var(--color-text)", fontWeight: n >= warnAt ? 700 : 400 }}>
      {n.toFixed(1)}%
    </span>
  );
}

function Signed({ n, suffix, digits = 1 }: { n: number; suffix: string; digits?: number }) {
  if (Math.abs(n) < 0.05) return <span style={{ color: "var(--color-text-dim)" }}>0{suffix}</span>;
  return (
    <span style={{ color: n > 0 ? "var(--color-turf)" : "var(--color-penalty)" }}>
      {n > 0 ? "+" : ""}
      {n.toFixed(digits)}
      {suffix}
    </span>
  );
}

function RiskBar({ risk, max }: { risk: number; max: number }) {
  const t = Math.min(1, risk / max);
  return (
    <div className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="block h-1.5 w-14 overflow-hidden rounded-full"
        style={{ background: "color-mix(in oklab, var(--color-text) 8%, transparent)" }}
      >
        <span
          className="block h-full rounded-full"
          style={{
            width: `${Math.max(4, t * 100)}%`,
            background: `color-mix(in oklab, var(--color-penalty) ${Math.round(35 + 65 * t)}%, var(--color-flag))`,
          }}
        />
      </span>
      <span style={{ fontWeight: 700, minWidth: 20, textAlign: "right" }}>{risk}</span>
    </div>
  );
}

const MONO: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

function GroupTh({ children, span }: { children: React.ReactNode; span: number }) {
  return (
    <th
      colSpan={span}
      style={{
        ...MONO,
        fontSize: 9.5,
        fontWeight: 700,
        padding: "10px 12px 2px",
        textAlign: "center",
        color: "var(--color-text-muted)",
        borderLeft: "1px solid var(--color-line)",
      }}
    >
      {children}
    </th>
  );
}

function Th({
  children,
  className,
  left,
  divider,
  title,
  sortKey,
  current,
  dir,
  onSort,
}: {
  children: React.ReactNode;
  className?: string;
  left?: boolean;
  divider?: boolean;
  title?: string;
  sortKey?: SortKey;
  current?: SortKey;
  dir?: "asc" | "desc";
  onSort?: (k: SortKey) => void;
}) {
  const active = sortKey !== undefined && sortKey === current;
  return (
    <th
      className={className}
      title={title}
      onClick={sortKey && onSort ? () => onSort(sortKey) : undefined}
      style={{
        ...MONO,
        fontSize: 10,
        fontWeight: 600,
        padding: "12px",
        textAlign: left ? "left" : "center",
        cursor: sortKey ? "pointer" : undefined,
        userSelect: "none",
        color: active ? "var(--accent-soft)" : "var(--color-text-dim)",
        borderLeft: divider ? "1px solid var(--color-line)" : undefined,
      }}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active ? (dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
      </span>
    </th>
  );
}

function Td({
  children,
  className,
  left,
  divider,
  dim,
}: {
  children: React.ReactNode;
  className?: string;
  left?: boolean;
  divider?: boolean;
  dim?: boolean;
}) {
  return (
    <td
      className={className}
      style={{
        padding: "var(--row-pad-y) 12px",
        textAlign: left ? "left" : "center",
        whiteSpace: "nowrap",
        fontFamily: "var(--font-mono)",
        fontVariantNumeric: "tabular-nums",
        fontSize: 12.5,
        color: dim ? "var(--color-text-dim)" : undefined,
        borderLeft: divider ? "1px solid var(--color-line)" : undefined,
      }}
    >
      {children}
    </td>
  );
}
