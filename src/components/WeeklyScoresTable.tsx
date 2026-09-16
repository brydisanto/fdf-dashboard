"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PlayerAvatar } from "./PlayerAvatar";
import { ROSTER_BY_ID } from "@/lib/data/roster";
import { fmtNum } from "@/lib/format";
import type { Ownership, WeeklyScore } from "@/lib/data/weekly-scores";
import type { Position } from "@/lib/types";

type PosFilter = "ALL" | Position;
type SortKey = "points" | "posRank" | "name";

const POSITIONS: PosFilter[] = ["ALL", "QB", "RB", "WR", "TE"];

// Sport.fun's pick-popularity buckets. Kept in their order so the
// legend reads from most-picked to least.
const OWNERSHIP_META: Record<Ownership, { short: string; color: string }> = {
  Favourite:    { short: "FAV",  color: "var(--accent-soft)" },
  Regular:      { short: "REG",  color: "var(--color-text-muted)" },
  Differential: { short: "DIFF", color: "var(--color-broadcast)" },
  Unpopular:    { short: "UNPOP", color: "var(--color-text-dim)" },
};

export function WeeklyScoresTable({ scores }: { scores: WeeklyScore[] }) {
  const [pos, setPos] = useState<PosFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("points");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => {
    const list = pos === "ALL" ? scores.slice() : scores.filter((s) => s.position === pos);
    list.sort((a, b) => {
      if (sortKey === "name") {
        return sortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      const av = a[sortKey];
      const bv = b[sortKey];
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [scores, pos, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      // Rank and name read naturally ascending; points descending.
      setSortDir(key === "points" ? "desc" : "asc");
    }
  };

  const best = rows.length ? Math.max(...rows.map((r) => r.points)) : 0;

  return (
    <div>
      {/* Toolbar — position filter */}
      <div
        className="flex flex-wrap items-center gap-3 border-b border-[var(--color-line)] px-5 py-4"
        style={{ background: "color-mix(in oklab, var(--color-press) 60%, transparent)" }}
      >
        <Seg options={POSITIONS} value={pos} onChange={(v) => setPos(v)} />
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
          {rows.length} {pos === "ALL" ? "players" : `${pos}s`}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-[13px]">
          <thead style={{ background: "color-mix(in oklab, var(--color-press) 50%, transparent)" }}>
            <tr className="border-b border-[var(--color-line)]">
              <Th align="left" className="pl-5">#</Th>
              <Th align="left" sortKey="name" current={sortKey} dir={sortDir} onSort={onSort}>
                Player
              </Th>
              <Th align="center">Matchup</Th>
              <Th align="center">Result</Th>
              <Th align="center" sortKey="posRank" current={sortKey} dir={sortDir} onSort={onSort}>
                Pos Rank
              </Th>
              <Th align="center">Picked By</Th>
              <Th align="center" sortKey="points" current={sortKey} dir={sortDir} onSort={onSort} emphasized className="pr-5">
                Points
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => {
              const own = OWNERSHIP_META[s.ownership];
              const pct = best > 0 ? (s.points / best) * 100 : 0;
              const player = s.playerId ? ROSTER_BY_ID.get(s.playerId) : null;
              return (
                <tr
                  key={s.tokenIdSuffix}
                  className="transition-colors hover:bg-[var(--color-bench)]"
                  style={{ borderBottom: "1px solid var(--color-line)" }}
                >
                  <Td align="left" className="pl-5" dim>
                    {sortKey === "points" && sortDir === "desc" ? s.overallRank : i + 1}
                  </Td>

                  <td style={{ padding: "var(--row-pad-y) 12px" }}>
                    <div className="flex items-center gap-2.5">
                      {player ? (
                        <PlayerAvatar player={player} size="xs" />
                      ) : (
                        <span
                          className="inline-block rounded-full"
                          style={{ width: 22, height: 22, background: "var(--color-press)" }}
                        />
                      )}
                      <div className="min-w-0">
                        {s.playerId ? (
                          <Link
                            href={`/player/${s.playerId}`}
                            className="font-bold text-[var(--color-text)] hover:text-[var(--accent-soft)]"
                          >
                            {s.name}
                          </Link>
                        ) : (
                          <span className="font-bold text-[var(--color-text)]">{s.name}</span>
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
                          {s.position} · {s.team}
                        </div>
                      </div>
                    </div>
                  </td>

                  <Td align="center" mono>
                    <span style={{ color: "var(--color-text-dim)" }}>{s.isHome ? "vs" : "@"}</span>{" "}
                    <span style={{ color: "var(--color-text-muted)" }}>{s.opponent}</span>
                  </Td>

                  <Td align="center" mono>
                    <span style={{ color: s.won ? "var(--color-turf)" : "var(--color-penalty)", fontWeight: 700 }}>
                      {s.won ? "W" : "L"}
                    </span>{" "}
                    <span style={{ color: "var(--color-text-dim)" }}>
                      {s.teamScore}-{s.oppScore}
                    </span>
                  </Td>

                  <Td align="center" mono>
                    <span style={{ color: s.posRank <= 3 ? "var(--accent-soft)" : "var(--color-text-muted)" }}>
                      {s.position}{s.posRank}
                    </span>
                  </Td>

                  <Td align="center" mono>
                    <span style={{ color: own.color, fontSize: 10, letterSpacing: "0.1em" }}>{own.short}</span>
                  </Td>

                  <td
                    className="pr-5"
                    style={{ padding: "var(--row-pad-y) 12px", textAlign: "right", minWidth: 140 }}
                  >
                    <div className="flex items-center justify-end gap-2.5">
                      {/* Bar makes the spread readable at a glance without a chart. */}
                      <span
                        aria-hidden
                        className="hidden sm:block rounded-full"
                        style={{
                          width: `${Math.max(pct, 2)}%`,
                          maxWidth: 70,
                          height: 4,
                          background: s.points > 0 ? "var(--accent)" : "var(--color-line-strong)",
                          opacity: s.points > 0 ? 0.55 : 1,
                        }}
                      />
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 700,
                          fontSize: 14,
                          color: s.points > 0 ? "var(--color-text)" : "var(--color-text-dim)",
                        }}
                      >
                        {fmtNum(s.points, { digits: s.points % 1 === 0 ? 0 : 1 })}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--color-line)] px-5 py-3"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--color-text-dim)",
        }}
      >
        <span>Picked by</span>
        {(Object.keys(OWNERSHIP_META) as Ownership[]).map((o) => (
          <span key={o} style={{ color: OWNERSHIP_META[o].color }}>
            {OWNERSHIP_META[o].short} · {o}
          </span>
        ))}
      </div>
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
      className="inline-flex rounded-[var(--r-8)] border border-[var(--color-line)] p-[2px]"
      style={{ background: "var(--color-stadium)" }}
    >
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={clsx(
            "rounded-[6px] px-2.5 py-1 transition-colors",
            value === o ? "text-[var(--color-text)]" : "text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)]",
          )}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: "0.14em",
            background: value === o ? "var(--color-bench)" : "transparent",
          }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function Th({
  children,
  align,
  className,
  sortKey,
  current,
  dir,
  onSort,
  emphasized,
}: {
  children: React.ReactNode;
  align: "left" | "center" | "right";
  className?: string;
  sortKey?: SortKey;
  current?: SortKey;
  dir?: "asc" | "desc";
  onSort?: (k: SortKey) => void;
  emphasized?: boolean;
}) {
  const active = sortKey && current === sortKey;
  const content = (
    <span className="inline-flex items-center gap-1">
      {children}
      {active ? (dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
    </span>
  );
  return (
    <th
      className={className}
      style={{
        textAlign: align === "right" ? "right" : align,
        padding: "12px",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        color: active || emphasized ? "var(--color-text-muted)" : "var(--color-text-dim)",
      }}
    >
      {sortKey && onSort ? (
        <button type="button" onClick={() => onSort(sortKey)} className="hover:text-[var(--color-text)]">
          {content}
        </button>
      ) : (
        content
      )}
    </th>
  );
}

function Td({
  children,
  align,
  className,
  mono,
  dim,
}: {
  children: React.ReactNode;
  align: "left" | "center" | "right";
  className?: string;
  mono?: boolean;
  dim?: boolean;
}) {
  return (
    <td
      className={className}
      style={{
        padding: "var(--row-pad-y) 12px",
        textAlign: align,
        whiteSpace: "nowrap",
        fontFamily: mono || dim ? "var(--font-mono)" : undefined,
        fontVariantNumeric: mono || dim ? "tabular-nums" : undefined,
        fontSize: 12.5,
        color: dim ? "var(--color-text-dim)" : undefined,
      }}
    >
      {children}
    </td>
  );
}
