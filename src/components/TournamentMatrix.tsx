"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { PLAYERS_BY_ID } from "@/lib/data/players";
import { PlayerAvatar } from "./PlayerAvatar";
import { PlayerStatusBadge } from "./PlayerStatusBadge";
import type { Position, PlayerSeason } from "@/lib/data/tournament-matrix";
import { tpPer100 as tpPer100Of, fmtPer100 } from "@/lib/tp-value";

type SortKey =
  | "name" | "avg" | "best" | "tpRate" | "avgPoints" | "tpWon" | "tpPer100"
  | "firsts" | "seconds" | "thirds" | "fourths" | "fifths";

const POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

// FDF's tournament rules: top-3 finishers earn TP at QB/TE,
// top-5 at RB/WR. Cells color along that threshold (green tint
// inside TP, neutral/amber outside) AND escalate by magnitude
// inside it (1st brightest, 5th softest within the RB/WR band).
function tpThreshold(pos: Position): number {
  return pos === "QB" || pos === "TE" ? 3 : 5;
}

function rankTone(rank: number | null, pos: Position, earnedTP: boolean): { fg: string; bg: string; ring: string } {
  if (rank == null) return {
    fg: "var(--color-text-dim)",
    bg: "transparent",
    ring: "transparent",
  };

  // INSIDE TP — green ramp where 1st is brightest, then dimming
  // by rank. Trust the upstream `earnedTP` flag rather than
  // recomputing from rank so we exactly match FDF's rules even
  // if they change.
  if (earnedTP) {
    if (rank === 1) return {
      // Brightest — gold-leaning lime to set #1 visually apart.
      fg: "oklch(0.88 0.18 130)",
      bg: "color-mix(in oklab, oklch(0.80 0.20 130) 22%, transparent)",
      ring: "color-mix(in oklab, oklch(0.80 0.20 130) 55%, transparent)",
    };
    if (rank === 2) return {
      fg: "oklch(0.84 0.17 145)",
      bg: "color-mix(in oklab, oklch(0.74 0.18 145) 16%, transparent)",
      ring: "color-mix(in oklab, oklch(0.74 0.18 145) 42%, transparent)",
    };
    if (rank === 3) return {
      fg: "oklch(0.80 0.15 145)",
      bg: "color-mix(in oklab, oklch(0.74 0.18 145) 11%, transparent)",
      ring: "color-mix(in oklab, oklch(0.74 0.18 145) 32%, transparent)",
    };
    // 4th / 5th only reach here for RB/WR (TP threshold = 5).
    if (rank === 4) return {
      fg: "oklch(0.74 0.12 145)",
      bg: "color-mix(in oklab, oklch(0.74 0.18 145) 7%, transparent)",
      ring: "color-mix(in oklab, oklch(0.74 0.18 145) 22%, transparent)",
    };
    return {
      fg: "oklch(0.70 0.10 145)",
      bg: "color-mix(in oklab, oklch(0.74 0.18 145) 4%, transparent)",
      ring: "color-mix(in oklab, oklch(0.74 0.18 145) 16%, transparent)",
    };
  }

  // OUTSIDE TP — neutral / amber / dim red by distance from
  // the position's threshold.
  const threshold = tpThreshold(pos);
  const beyond = rank - threshold; // 1 = just-missed, larger = far off
  if (beyond <= 3) {
    // Just missed — soft amber, no fill.
    return {
      fg: "oklch(0.80 0.14 85)",
      bg: "transparent",
      ring: "color-mix(in oklab, oklch(0.74 0.16 85) 15%, transparent)",
    };
  }
  if (beyond <= 8) {
    // Mid-tail — muted text, faint outline.
    return {
      fg: "var(--color-text-muted)",
      bg: "transparent",
      ring: "color-mix(in oklab, var(--color-text) 8%, transparent)",
    };
  }
  // Deep tail — dim red, no fill.
  return {
    fg: "oklch(0.62 0.16 22)",
    bg: "transparent",
    ring: "color-mix(in oklab, oklch(0.62 0.16 22) 14%, transparent)",
  };
}

export function TournamentMatrix({
  byPosition,
  weeksOrdered,
  season,
  prices = {},
}: {
  byPosition: Record<Position, PlayerSeason[]>;
  weeksOrdered: number[];
  season: number;
  prices?: Record<string, number>;   // current share price by player id
}) {
  // TP won is only captured for seasons pulled from Sport.fun (2026);
  // hide the column rather than show a wall of dashes for 2025.
  const showTP = POSITIONS.some((p) => byPosition[p].some((x) => x.stats.tpWon != null));
  // TP per $100 spent (see lib/tp-value): split among active shares.
  const tpPer100 = (x: PlayerSeason): number | null =>
    tpPer100Of(x.stats.tpWon, prices[x.playerId], x.activeShares);
  const [pos, setPos] = useState<Position>("RB");
  // Gradient on TP/$100 is relative to the best value at this position,
  // so the shading reads the same whichever position is selected.
  const maxPer100 = Math.max(0, ...byPosition[pos].map((x) => tpPer100(x) ?? 0));
  const [sortKey, setSortKey] = useState<SortKey>("avg");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const rows = useMemo(() => {
    const list = byPosition[pos].slice();
    list.sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      if (sortKey === "name") {
        av = a.displayName;
        bv = b.displayName;
      } else if (sortKey === "tpRate") {
        av = a.stats.tpRate ?? -1;
        bv = b.stats.tpRate ?? -1;
      } else if (sortKey === "tpWon") {
        av = a.stats.tpWon ?? -1;
        bv = b.stats.tpWon ?? -1;
      } else if (sortKey === "tpPer100") {
        av = tpPer100(a) ?? -1;
        bv = tpPer100(b) ?? -1;
      } else if (sortKey === "avg" || sortKey === "best" || sortKey === "avgPoints") {
        av = a.stats[sortKey] ?? 9999;
        bv = b.stats[sortKey] ?? 9999;
      } else {
        av = a.stats[sortKey] ?? 0;
        bv = b.stats[sortKey] ?? 0;
      }
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
    // tpPer100 reads `prices`, which is fixed for the page's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byPosition, pos, sortKey, sortDir, prices]);

  const onSort = (key: SortKey, defaultDir: "asc" | "desc" = "asc") => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(defaultDir); }
  };

  return (
    <div>
      {/* Position tabs */}
      <div
        className="flex flex-wrap items-center gap-3 border-b border-[var(--color-line)] px-5 py-4"
        style={{ background: "color-mix(in oklab, var(--color-press) 60%, transparent)" }}
      >
        <SegLabel>POSITION</SegLabel>
        <Seg
          options={POSITIONS}
          value={pos}
          onChange={(v) => setPos(v as Position)}
        />
        <span className="mx-2 text-[var(--color-line-strong)]">·</span>
        <SegLabel>SORT</SegLabel>
        <Seg
          options={showTP ? ["AVG", "BEST", "POINTS", "TP%", "TP WON", "TP/$100", "1STS"] : ["AVG", "BEST", "POINTS", "TP%", "1STS"]}
          value={sortKey === "avg" ? "AVG"
            : sortKey === "best" ? "BEST"
            : sortKey === "tpRate" ? "TP%"
            : sortKey === "tpWon" ? "TP WON"
            : sortKey === "tpPer100" ? "TP/$100"
            : sortKey === "avgPoints" ? "POINTS"
            : sortKey === "firsts" ? "1STS"
            : "AVG"}
          onChange={(v) => {
            if (v === "AVG") onSort("avg", "asc");
            else if (v === "BEST") onSort("best", "asc");
            else if (v === "TP%") onSort("tpRate", "desc");
            else if (v === "TP WON") onSort("tpWon", "desc");
            else if (v === "TP/$100") onSort("tpPer100", "desc");
            else if (v === "POINTS") onSort("avgPoints", "desc");
            else if (v === "1STS") onSort("firsts", "desc");
          }}
        />
      </div>

      {/* Matrix */}
      <div className="overflow-x-auto">
        <table className="text-[13px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              {/* Single sticky-left column with player + team. Two
                  separate sticky columns previously misaligned at
                  certain scroll positions because the Player cell
                  auto-sized wider than its sticky left offset. */}
              <Th
                onClick={() => onSort("name", "asc")}
                active={sortKey === "name"}
                dir={sortDir}
                align="left"
                sticky="player"
                width={240}
              >
                Player
              </Th>
              {/* Week columns */}
              {weeksOrdered.map((w) => (
                <Th key={`w-${w}`} width={64}>W{w}</Th>
              ))}
              {/* Rollups */}
              <ThDivider />
              <Th onClick={() => onSort("avg", "asc")}       active={sortKey === "avg"}       dir={sortDir} width={64}>AVG</Th>
              <Th onClick={() => onSort("best", "asc")}      active={sortKey === "best"}      dir={sortDir} width={64}>BEST</Th>
              <Th onClick={() => onSort("avgPoints", "desc")} active={sortKey === "avgPoints"} dir={sortDir} width={80}>POINTS</Th>
              <Th onClick={() => onSort("tpRate", "desc")}   active={sortKey === "tpRate"}    dir={sortDir} width={70}>TP%</Th>
              {showTP ? (
                <Th onClick={() => onSort("tpWon", "desc")} active={sortKey === "tpWon"} dir={sortDir} width={84}>TP WON</Th>
              ) : null}
              {showTP ? (
                <Th onClick={() => onSort("tpPer100", "desc")} active={sortKey === "tpPer100"} dir={sortDir} width={56} className="!px-1.5">
                  {/* Tighter tracking than other headers: the label, not the values, set this column's width. */}
                  <span style={{ letterSpacing: "0.04em" }}>TP/$100</span>
                </Th>
              ) : null}
              <ThDivider />
              <Th onClick={() => onSort("firsts", "desc")}   active={sortKey === "firsts"}   dir={sortDir} width={48}>1ST</Th>
              <Th onClick={() => onSort("seconds", "desc")}  active={sortKey === "seconds"}  dir={sortDir} width={48}>2ND</Th>
              <Th onClick={() => onSort("thirds", "desc")}   active={sortKey === "thirds"}   dir={sortDir} width={48}>3RD</Th>
              <Th onClick={() => onSort("fourths", "desc")}  active={sortKey === "fourths"}  dir={sortDir} width={48}>4TH</Th>
              <Th onClick={() => onSort("fifths", "desc")}   active={sortKey === "fifths"}   dir={sortDir} width={48}>5TH</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const meta = PLAYERS_BY_ID.get(p.playerId);
              return (
                <tr
                  key={p.playerId}
                  className="group transition-colors duration-[180ms] ease-out hover:bg-[color-mix(in_oklab,var(--color-press)_50%,transparent)]"
                  style={{ borderBottom: "1px solid var(--color-line)" }}
                >
                  <StickyCell sticky="player" align="left">
                    <Link href={`/player/${p.playerId}`} className="flex items-center gap-2 hover:text-[var(--accent-soft)]">
                      {meta ? <PlayerAvatar player={meta} size="xs" /> : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center leading-tight">
                          <span className="truncate font-medium">{p.displayName}</span>
                          <PlayerStatusBadge playerId={p.playerId} size={11} />
                        </div>
                        <div
                          className="truncate leading-tight"
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "10px",
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: "var(--color-text-dim)",
                            marginTop: 2,
                          }}
                        >
                          {p.team}
                        </div>
                      </div>
                    </Link>
                  </StickyCell>

                  {/* Weekly cells */}
                  {p.weeks.map((w) => (
                    <WeekCell
                      key={w.week}
                      rank={w.rank}
                      points={w.points}
                      earnedTP={w.earnedTP}
                      tp={w.tp}
                      pos={pos}
                    />
                  ))}
                  <TdDivider />

                  {/* Rollups */}
                  <NumCell><strong>{fmtAvg(p.stats.avg)}</strong></NumCell>
                  <NumCell>{p.stats.best ?? "—"}</NumCell>
                  <NumCell>{fmtAvg(p.stats.avgPoints)}</NumCell>
                  <NumCell>{fmtPct(p.stats.tpRate)}</NumCell>
                  {showTP ? <NumCell>{fmtTP(p.stats.tpWon)}</NumCell> : null}
                  {showTP ? (() => {
                    const v = tpPer100(p);
                    const tone = valueTone(v, maxPer100);
                    return (
                      <td
                        className="text-center"
                        style={{
                          padding: "6px 8px",
                          fontFamily: "var(--font-mono)",
                          fontSize: "12px",
                          fontWeight: tone ? 700 : 400,
                          fontVariantNumeric: "tabular-nums",
                          color: tone?.fg ?? "var(--color-text-dim)",
                          background: tone?.bg ?? "transparent",
                          boxShadow: tone ? `inset 0 0 0 1px ${tone.ring}` : undefined,
                        }}
                        title={v != null
                          ? `$100 buys ${Math.round(100 / prices[p.playerId]).toLocaleString("en-US")} shares of ${Math.round(p.activeShares ?? 0).toLocaleString("en-US")} active, earning that slice of ${Math.round(p.stats.tpWon ?? 0).toLocaleString("en-US")} TP`
                          : "Needs TP won, a current price and active shares"}
                      >
                        {fmtPer100(v)}
                      </td>
                    );
                  })() : null}
                  <TdDivider />
                  <CountCell n={p.stats.firsts} tier="gold" />
                  <CountCell n={p.stats.seconds} tier="silver" />
                  <CountCell n={p.stats.thirds} tier="bronze" />
                  <CountCell n={p.stats.fourths} />
                  <CountCell n={p.stats.fifths} />
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={weeksOrdered.length + 11 + (showTP ? 2 : 0)} className="px-5 py-12 text-center text-sm text-[var(--color-text-muted)]">
                  No {pos} data for {season}.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Green ramp for TP/$100, matching the weekly TP cells: the best value
// at the position gets the lime #1 treatment, others fade with their
// share of it. Square root so mid-pack values still show some tint
// (the distribution is skewed by a few standouts).
function valueTone(v: number | null, max: number): { fg: string; bg: string; ring: string } | null {
  if (v == null || !(max > 0)) return null;
  const t = Math.sqrt(Math.min(1, v / max));
  const hue = 145 - 15 * t;                      // 145 green → 130 lime at the top
  const pct = (lo: number, hi: number) => (lo + (hi - lo) * t).toFixed(1);
  return {
    fg: `oklch(${pct(0.70, 0.88)} ${pct(0.10, 0.18)} ${hue.toFixed(0)})`,
    bg: `color-mix(in oklab, oklch(0.78 0.19 ${hue.toFixed(0)}) ${pct(3, 22)}%, transparent)`,
    ring: `color-mix(in oklab, oklch(0.78 0.19 ${hue.toFixed(0)}) ${pct(12, 55)}%, transparent)`,
  };
}

// ── Cell components ─────────────────────────────────────────────

function WeekCell({
  rank,
  points,
  earnedTP,
  tp,
  pos,
}: {
  rank: number | null;
  points: number | null;
  earnedTP: boolean;
  tp?: number;
  pos: Position;
}) {
  const tone = rankTone(rank, pos, earnedTP);
  if (rank == null) {
    return (
      <td
        className="text-center"
        style={{
          padding: "6px 8px",
          width: 64,
          background: "transparent",
          color: "var(--color-text-dim)",
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
        }}
        title="No game / inactive"
      >
        —
      </td>
    );
  }
  const tpLabel = earnedTP
    ? (tp ? ` · won ${Math.round(tp).toLocaleString("en-US")} TP` : " · earned TP")
    : "";
  return (
    <td
      className="text-center"
      style={{
        padding: "5px 6px",
        width: 64,
        background: tone.bg,
        boxShadow: `inset 0 0 0 1px ${tone.ring}`,
        verticalAlign: "middle",
      }}
      title={`Rank ${rank} · ${points?.toFixed(1) ?? "—"} pts${tpLabel}`}
    >
      <div className="flex flex-col items-center justify-center leading-tight">
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            fontSize: "14px",
            color: tone.fg,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.01em",
          }}
        >
          {rank}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "9.5px",
            color: "var(--color-text-muted)",
            fontVariantNumeric: "tabular-nums",
            marginTop: "1px",
          }}
        >
          ({points?.toFixed(1) ?? "—"})
        </span>
      </div>
    </td>
  );
}

function StickyCell({
  children,
  sticky,
  align = "left",
}: {
  children: React.ReactNode;
  sticky: "player";
  align?: "left" | "right" | "center";
}) {
  // Both background states must be FULLY OPAQUE — the sticky cell
  // sits above the horizontally-scrolling week cells, and any
  // transparency lets the scroll content bleed through. Stadium is
  // the resting bg; bench is the next step up the surface stack
  // for the hovered state.
  return (
    <td
      className="bg-[var(--color-stadium)] group-hover:bg-[var(--color-bench)]"
      style={{
        position: "sticky",
        left: 0,
        zIndex: 1,
        padding: "8px 12px",
        textAlign: align,
        width: 240,
        minWidth: 240,
        maxWidth: 240,
        borderRight: "1px solid var(--color-line)",
      }}
    >
      {children}
    </td>
  );
}

function NumCell({ children }: { children: React.ReactNode }) {
  return (
    <td
      className="text-center"
      style={{
        padding: "6px 8px",
        fontFamily: "var(--font-mono)",
        fontSize: "12px",
        fontVariantNumeric: "tabular-nums",
        color: "var(--color-text)",
      }}
    >
      {children}
    </td>
  );
}

function CountCell({ n, tier }: { n: number; tier?: "gold" | "silver" | "bronze" }) {
  const fg =
    n === 0 ? "var(--color-text-dim)"
    : tier === "gold" ? "oklch(0.84 0.16 85)"
    : tier === "silver" ? "oklch(0.82 0.04 240)"
    : tier === "bronze" ? "oklch(0.72 0.12 50)"
    : "var(--color-text)";
  return (
    <td
      className="text-center"
      style={{
        padding: "6px 8px",
        fontFamily: "var(--font-mono)",
        fontWeight: 700,
        fontSize: "13px",
        color: fg,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {n === 0 ? "·" : n}
    </td>
  );
}

function TdDivider() {
  return <td style={{ width: 1, padding: 0, background: "var(--color-line)" }} />;
}

function ThDivider() {
  return <th style={{ width: 1, padding: 0, background: "var(--color-line)" }} />;
}

function Th({
  children,
  align = "center",
  className,
  onClick,
  active,
  dir,
  sticky,
  width,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  onClick?: () => void;
  active?: boolean;
  dir?: "asc" | "desc";
  sticky?: "player";
  width?: number;
}) {
  const stickyLeft = sticky === "player" ? 0 : undefined;
  return (
    <th
      className={clsx(
        "px-3 py-3 select-none",
        onClick ? "cursor-pointer hover:text-[var(--accent-soft)]" : "",
        className,
      )}
      onClick={onClick}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "10px",
        fontWeight: 600,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: active ? "var(--accent-soft)" : "var(--color-text-dim)",
        textAlign: align,
        position: sticky ? "sticky" : undefined,
        left: stickyLeft,
        // Sticky headers must be opaque so the horizontally-scrolling
        // week cells underneath don't bleed through. Non-sticky
        // headers scroll with the body and can keep the lighter
        // press-tinted treatment.
        background: sticky
          ? "var(--color-press)"
          : "color-mix(in oklab, var(--color-press) 50%, transparent)",
        backdropFilter: sticky ? undefined : "blur(6px)",
        zIndex: sticky ? 2 : undefined,
        borderBottom: "1px solid var(--color-line)",
        borderRight: sticky === "player" ? "1px solid var(--color-line)" : undefined,
        width,
        whiteSpace: "nowrap",
      }}
    >
      {children}
      {active && dir ? <span className="ml-1">{dir === "asc" ? "↑" : "↓"}</span> : null}
    </th>
  );
}

function SegLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "10px",
        fontWeight: 600,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--color-text-dim)",
      }}
    >
      {children}
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
      style={{ height: 34 }}
    >
      {options.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={clsx(
              "inline-flex h-[26px] items-center justify-center rounded-[5px] px-3 transition-colors",
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

// ── Formatters ──────────────────────────────────────────────────

function fmtAvg(n: number | null): string {
  if (n == null) return "—";
  return n.toFixed(1);
}

function fmtPct(n: number | null): string {
  if (n == null) return "—";
  return `${Math.round(n * 100)}%`;
}

// TP won, compacted like Sport.fun's own display (614.5K, 1.34M).
function fmtTP(n: number | undefined): string {
  if (n == null || n <= 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return Math.round(n).toString();
}

