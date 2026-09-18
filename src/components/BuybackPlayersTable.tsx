"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PlayerAvatar } from "./PlayerAvatar";
import { fmtNum, fmtTimeAgo, fmtUsd } from "@/lib/format";
import type { BuybackPlayerRow } from "@/lib/data/buyback";
import type { Position } from "@/lib/types";

// Cumulative buybacks per player: dollars spent, shares bought back,
// the average price paid, and how often the player appeared in a
// basket. Filterable by position and sortable on every numeric column.

type PosFilter = "ALL" | Position;
type SortKey = "usd" | "shares" | "avgPrice" | "baskets" | "lastTs";

const POSITIONS: PosFilter[] = ["ALL", "QB", "RB", "WR", "TE"];
const PAGE = 25;

export function BuybackPlayersTable({ rows, now }: { rows: BuybackPlayerRow[]; now: number }) {
  const [pos, setPos] = useState<PosFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("usd");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const list = pos === "ALL" ? rows.slice() : rows.filter((r) => r.player?.position === pos);
    list.sort((a, b) => (dir === "asc" ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]));
    return list;
  }, [rows, pos, sortKey, dir]);

  const visible = showAll ? filtered : filtered.slice(0, PAGE);
  const filteredUsd = filtered.reduce((a, r) => a + r.usd, 0);

  const onSort = (k: SortKey) => {
    if (k === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setDir("desc");
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
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--color-text-dim)",
          }}
        >
          {filtered.length} players · {fmtUsd(filteredUsd, { compact: true })}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-[13px]">
          <thead style={{ background: "color-mix(in oklab, var(--color-press) 50%, transparent)" }}>
            <tr className="border-b border-[var(--color-line)]">
              <Th className="pl-5">#</Th>
              <Th>Player</Th>
              <Th sortKey="usd" current={sortKey} dir={dir} onSort={onSort}>Spent</Th>
              <Th sortKey="shares" current={sortKey} dir={dir} onSort={onSort}>Shares</Th>
              <Th sortKey="avgPrice" current={sortKey} dir={dir} onSort={onSort}>Avg Price</Th>
              <Th>% of Spend</Th>
              <Th sortKey="baskets" current={sortKey} dir={dir} onSort={onSort}>Baskets</Th>
              <Th sortKey="lastTs" current={sortKey} dir={dir} onSort={onSort} className="pr-5">Last Bought</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr
                key={r.tokenIdSuffix}
                className="transition-colors hover:bg-[var(--color-bench)]"
                style={{ borderBottom: "1px solid var(--color-line)" }}
              >
                <Td className="pl-5" dim>{i + 1}</Td>
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
                <Td mono strong>{fmtUsd(r.usd, { digits: 0 })}</Td>
                <Td mono>{fmtNum(r.shares, { compact: true })}</Td>
                <Td mono>${r.avgPrice.toFixed(5)}</Td>
                <Td mono>
                  <span className="inline-flex items-center justify-center gap-2">
                    <span
                      aria-hidden
                      className="hidden sm:block rounded-full"
                      style={{
                        width: Math.max(2, Math.min(56, r.pctOfSpend * 8)),
                        height: 4,
                        background: "var(--accent)",
                        opacity: 0.6,
                      }}
                    />
                    {r.pctOfSpend.toFixed(1)}%
                  </span>
                </Td>
                <Td mono>{fmtNum(r.baskets)}</Td>
                <Td mono dim className="pr-5">{fmtTimeAgo(r.lastTs, now)}</Td>
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

function Th({
  children,
  className,
  sortKey,
  current,
  dir,
  onSort,
}: {
  children: React.ReactNode;
  className?: string;
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
        textAlign: children === "Player" ? "left" : className?.includes("pl-5") ? "left" : "center",
        padding: "12px",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        color: active ? "var(--color-text-muted)" : "var(--color-text-dim)",
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
  mono,
  dim,
  strong,
}: {
  children: React.ReactNode;
  className?: string;
  mono?: boolean;
  dim?: boolean;
  strong?: boolean;
}) {
  return (
    <td
      className={className}
      style={{
        padding: "var(--row-pad-y) 12px",
        textAlign: className?.includes("pl-5") ? "left" : "center",
        whiteSpace: "nowrap",
        fontFamily: mono || dim ? "var(--font-mono)" : undefined,
        fontVariantNumeric: "tabular-nums",
        fontSize: 12.5,
        fontWeight: strong ? 700 : undefined,
        color: dim ? "var(--color-text-dim)" : strong ? "var(--color-text)" : undefined,
      }}
    >
      {children}
    </td>
  );
}
