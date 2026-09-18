"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PlayerAvatar } from "./PlayerAvatar";
import { fmtNum, fmtUsd } from "@/lib/format";
import type { BuybackPlayerRow } from "@/lib/data/buyback";
import type { Position } from "@/lib/types";

// One row per player: shares and dollars bought back since the tracking
// start date, next to what the wallet holds right now before returning
// it to the treasury. Filterable by position, sortable on every number.

type PosFilter = "ALL" | Position;
type SortKey = "shares" | "usd" | "heldShares" | "heldUsd";

const POSITIONS: PosFilter[] = ["ALL", "QB", "RB", "WR", "TE"];
const PAGE = 25;

export function BuybackPlayersTable({
  rows,
  cumulativeReady,
  sinceLabel,
}: {
  rows: BuybackPlayerRow[];
  cumulativeReady: boolean;   // false until per-player totals are built
  sinceLabel: string;         // e.g. "Sep 1"
}) {
  const [pos, setPos] = useState<PosFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>(cumulativeReady ? "usd" : "heldUsd");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const list = pos === "ALL" ? rows.slice() : rows.filter((r) => r.player?.position === pos);
    list.sort((a, b) => (dir === "asc" ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]));
    return list;
  }, [rows, pos, sortKey, dir]);

  const visible = showAll ? filtered : filtered.slice(0, PAGE);
  const totals = filtered.reduce(
    (a, r) => ({ usd: a.usd + r.usd, heldUsd: a.heldUsd + r.heldUsd }),
    { usd: 0, heldUsd: 0 },
  );

  const onSort = (k: SortKey) => {
    if (k === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setDir("desc");
    }
  };

  const pending = <span style={{ color: "var(--color-text-dim)" }}>—</span>;

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
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--color-text-dim)",
          }}
        >
          {filtered.length} players
          {cumulativeReady ? ` · ${fmtUsd(totals.usd, { compact: true })} bought back` : ""}
          {` · ${fmtUsd(totals.heldUsd, { compact: true })} held`}
        </span>
      </div>

      {!cumulativeReady ? (
        <p
          className="m-0 border-b border-[var(--color-line)] px-5 py-3"
          style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}
        >
          Bought-back totals since {sinceLabel} fill in once the buyback index finishes rebuilding.
          Holdings are live now.
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead style={{ background: "color-mix(in oklab, var(--color-press) 50%, transparent)" }}>
            <tr>
              <th colSpan={2} />
              <GroupTh span={2}>Bought back since {sinceLabel}</GroupTh>
              <GroupTh span={2}>Held now</GroupTh>
            </tr>
            <tr className="border-b border-[var(--color-line)]">
              <Th left className="pl-5">#</Th>
              <Th left>Player</Th>
              <Th sortKey="shares" current={sortKey} dir={dir} onSort={onSort} divider>Shares</Th>
              <Th sortKey="usd" current={sortKey} dir={dir} onSort={onSort}>Spent</Th>
              <Th sortKey="heldShares" current={sortKey} dir={dir} onSort={onSort} divider>Shares</Th>
              <Th sortKey="heldUsd" current={sortKey} dir={dir} onSort={onSort} className="pr-5">Value</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr
                key={r.tokenIdSuffix}
                className="transition-colors hover:bg-[var(--color-bench)]"
                style={{ borderBottom: "1px solid var(--color-line)" }}
              >
                <Td left className="pl-5" dim>{i + 1}</Td>
                <td style={{ padding: "var(--row-pad-y) 12px" }}>
                  <div className="flex items-center gap-2.5">
                    {r.player ? <PlayerAvatar player={r.player} size="xs" /> : null}
                    <div className="min-w-0">
                      {r.player ? (
                        <Link
                          href={`/player/${r.player.id}`}
                          className="font-bold text-[var(--color-text)] hover:text-[var(--accent-soft)]"
                        >
                          {r.player.displayName}
                        </Link>
                      ) : (
                        <span className="font-bold text-[var(--color-text-muted)]">
                          Token {r.tokenIdSuffix}
                        </span>
                      )}
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          letterSpacing: "0.12em",
                          color: "var(--color-text-dim)",
                          textTransform: "uppercase",
                        }}
                      >
                        {r.player ? `${r.player.position} · ${r.player.team}` : "Not on current roster"}
                      </div>
                    </div>
                  </div>
                </td>
                <Td divider>{cumulativeReady ? fmtNum(r.shares, { compact: true }) : pending}</Td>
                <Td strong>{cumulativeReady ? fmtUsd(r.usd, { digits: 0 }) : pending}</Td>
                <Td divider>{r.heldShares > 0 ? fmtNum(r.heldShares, { compact: true }) : pending}</Td>
                <Td strong className="pr-5">{r.heldUsd > 0 ? fmtUsd(r.heldUsd, { digits: 0 }) : pending}</Td>
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
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            {showAll ? "Show top 25" : `Show all ${filtered.length}`}
          </button>
        </div>
      ) : null}
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
  sortKey,
  current,
  dir,
  onSort,
}: {
  children: React.ReactNode;
  className?: string;
  left?: boolean;
  divider?: boolean;
  sortKey?: SortKey;
  current?: SortKey;
  dir?: "asc" | "desc";
  onSort?: (k: SortKey) => void;
}) {
  const active = sortKey !== undefined && sortKey === current;
  const label = (
    <span className="inline-flex items-center gap-1">
      {children}
      {active ? (dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
    </span>
  );
  return (
    <th
      className={className}
      style={{
        ...MONO,
        fontSize: 10,
        fontWeight: 600,
        padding: "8px 12px 12px",
        textAlign: left ? "left" : "center",
        color: active ? "var(--color-text-muted)" : "var(--color-text-dim)",
        borderLeft: divider ? "1px solid var(--color-line)" : undefined,
      }}
    >
      {sortKey && onSort ? (
        <button type="button" onClick={() => onSort(sortKey)} className="hover:text-[var(--color-text)]">
          {label}
        </button>
      ) : (
        label
      )}
    </th>
  );
}

function Td({
  children,
  className,
  left,
  dim,
  strong,
  divider,
}: {
  children: React.ReactNode;
  className?: string;
  left?: boolean;
  dim?: boolean;
  strong?: boolean;
  divider?: boolean;
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
        fontWeight: strong ? 700 : undefined,
        color: dim ? "var(--color-text-dim)" : strong ? "var(--color-text)" : undefined,
        borderLeft: divider ? "1px solid var(--color-line)" : undefined,
      }}
    >
      {children}
    </td>
  );
}
