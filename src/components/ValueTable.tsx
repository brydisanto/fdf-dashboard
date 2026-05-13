"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PlayerAvatar } from "./PlayerAvatar";
import { TEAM_NAMES } from "@/lib/data/players";
import { deltaTone } from "@/lib/value-tone";
import type { PlayerSummary, Position } from "@/lib/types";

export interface ValueRow extends PlayerSummary {
  marketPosRank: number;             // 1-indexed market price rank within position
  posPlayers: number;                // total roster players at this position
  fpPosRank: number | null;          // FantasyPros consensus PPR positional rank
  udPosRank: number | null;          // Underdog Sports PPR positional rank
  espnAvgRank: number | null;        // ESPN preseason AVG (fractional)
  ringerPosRank: number | null;      // The Ringer's PPR positional rank (avg of 3 experts)
  industryAvgRank: number | null;    // mean(fp, ud, espn, ringer) over present sources
  posRankDelta: number | null;       // industryAvgRank − marketPosRank
  verdict: "undervalued" | "fair" | "overvalued" | "unranked";
}

type SortKey =
  | "name" | "marketPosRank" | "fpPosRank" | "udPosRank" | "espnAvgRank" | "ringerPosRank" | "industryAvgRank" | "posRankDelta";

const POSITIONS: (Position | "ALL")[] = ["ALL", "QB", "RB", "WR", "TE"];

export function ValueTable({
  rows,
  pos: posProp,
  onPosChange,
}: {
  rows: ValueRow[];
  // Optionally controlled — when provided, the parent owns the
  // position filter (used by /value to share state with the
  // companion scatter chart). Falls back to internal state.
  pos?: Position | "ALL";
  onPosChange?: (pos: Position | "ALL") => void;
}) {
  const [internalPos, setInternalPos] = useState<Position | "ALL">("QB");
  const pos = posProp ?? internalPos;
  const setPos = (next: Position | "ALL") => {
    if (onPosChange) onPosChange(next);
    else setInternalPos(next);
  };
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
      const ascKeys = new Set<SortKey>(["name", "marketPosRank", "fpPosRank", "udPosRank", "espnAvgRank", "ringerPosRank", "industryAvgRank"]);
      setSortDir(ascKeys.has(key) ? "asc" : "desc");
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
        <table className="w-full min-w-[940px]">
          <thead style={{ background: "color-mix(in oklab, var(--color-press) 60%, transparent)" }}>
            {/* Two-row header: top groups the three industry-rank columns */}
            <tr className="border-b border-[var(--color-line)]">
              <th rowSpan={2} className="px-3 py-3 select-none text-left" style={groupHeadStyle}>Player</th>
              <th rowSpan={2} className="px-3 py-3 select-none text-center" style={groupHeadStyle} title="Sport.fun market positional rank by price">
                <SortHeader sortKey="marketPosRank" current={sortKey} dir={sortDir} onSort={onSort} align="center">
                  FDF Ranking
                </SortHeader>
              </th>
              <th colSpan={5} className="px-3 py-2.5 text-center" style={{ ...groupHeadStyle, color: "var(--accent-soft)", borderBottom: "1px solid var(--color-line)" }}>
                Industry Rankings
              </th>
              <th rowSpan={2} className="px-3 py-3 select-none text-center" style={groupHeadStyle} title="Industry avg − market rank (negative = market may be undervaluing)">
                <SortHeader sortKey="posRankDelta" current={sortKey} dir={sortDir} onSort={onSort} align="center">
                  Difference
                </SortHeader>
              </th>
              <th rowSpan={2} className="px-3 py-3 select-none text-center pr-5" style={groupHeadStyle}>Verdict</th>
            </tr>
            <tr className="border-b border-[var(--color-line)]">
              <th className="px-3 py-2 text-center" style={groupHeadStyle} title="FantasyPros consensus PPR positional rank">
                <SortHeader sortKey="fpPosRank" current={sortKey} dir={sortDir} onSort={onSort} align="center">FP</SortHeader>
              </th>
              <th className="px-3 py-2 text-center" style={groupHeadStyle} title="Underdog Sports PPR positional rank">
                <SortHeader sortKey="udPosRank" current={sortKey} dir={sortDir} onSort={onSort} align="center">UD</SortHeader>
              </th>
              <th className="px-3 py-2 text-center" style={groupHeadStyle} title="ESPN AVG — mean of 8 ESPN expert rankers">
                <SortHeader sortKey="espnAvgRank" current={sortKey} dir={sortDir} onSort={onSort} align="center">ESPN</SortHeader>
              </th>
              <th className="px-3 py-2 text-center" style={groupHeadStyle} title="The Ringer — average of 3 experts (Heifetz, Kelly, Horlbeck)">
                <SortHeader sortKey="ringerPosRank" current={sortKey} dir={sortDir} onSort={onSort} align="center">Ringer</SortHeader>
              </th>
              <th className="px-3 py-2 text-center" style={groupHeadStyle} title="Average of FP + UD + ESPN + Ringer positional ranks">
                <SortHeader sortKey="industryAvgRank" current={sortKey} dir={sortDir} onSort={onSort} align="center">Avg</SortHeader>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              return (
                <tr
                  key={p.id}
                  className="transition-colors duration-[180ms] ease-out hover:bg-[color-mix(in_oklab,var(--color-press)_50%,transparent)]"
                  style={{
                    borderBottom: "1px solid var(--color-line)",
                  }}
                >
                  <Cell className="text-left">
                    <Link href={`/player/${p.id}`} className="flex w-full items-center gap-2.5 text-left group">
                      <PlayerAvatar player={p} size="sm" />
                      <div className="min-w-0 flex-1 text-left">
                        <div className="truncate text-[13px] font-semibold text-left group-hover:text-[var(--accent-soft)]">
                          {p.firstName} {p.lastName}
                        </div>
                        <div
                          className="text-left"
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
                    {p.udPosRank != null ? (
                      <span style={{ color: "var(--color-text)" }}>
                        {p.position}
                        {p.udPosRank}
                      </span>
                    ) : (
                      <span style={{ color: "var(--color-text-dim)" }}>—</span>
                    )}
                  </NumCell>
                  <NumCell>
                    {p.espnAvgRank != null ? (
                      <span style={{ color: "var(--color-text)" }}>
                        {p.position}
                        {Number.isInteger(p.espnAvgRank)
                          ? p.espnAvgRank
                          : p.espnAvgRank.toFixed(1)}
                      </span>
                    ) : (
                      <span style={{ color: "var(--color-text-dim)" }}>—</span>
                    )}
                  </NumCell>
                  <NumCell>
                    {p.ringerPosRank != null ? (
                      <span style={{ color: "var(--color-text)" }}>
                        {p.position}
                        {p.ringerPosRank}
                      </span>
                    ) : (
                      <span style={{ color: "var(--color-text-dim)" }}>—</span>
                    )}
                  </NumCell>
                  <NumCell>
                    {p.industryAvgRank != null ? (
                      <span style={{ color: "var(--accent-soft)", fontWeight: 700 }}>
                        {p.position}
                        {Number.isInteger(p.industryAvgRank)
                          ? p.industryAvgRank
                          : p.industryAvgRank.toFixed(1)}
                      </span>
                    ) : (
                      <span style={{ color: "var(--color-text-dim)" }}>—</span>
                    )}
                  </NumCell>
                  <NumCell>
                    <RankDelta value={p.posRankDelta} verdict={p.verdict} />
                  </NumCell>
                  <Cell className="pr-5 text-center">
                    <VerdictBadge verdict={p.verdict} delta={p.posRankDelta} />
                  </Cell>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-5 py-12 text-center text-sm text-[var(--color-text-muted)]">
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
      className="text-center"
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

// Δ — negative means industry avg ranks them higher than market does
// (potentially undervalued, green ramp). Positive means market ranks
// them higher (potentially overvalued, yellow→orange→red ramp).
function RankDelta({ value, verdict }: { value: number | null; verdict: ValueRow["verdict"] }) {
  if (value == null) return <span style={{ color: "var(--color-text-dim)" }}>—</span>;
  const display = Number.isInteger(value) ? `${value}` : value.toFixed(1);
  const signed = value > 0 ? `+${display}` : display;
  if (value === 0 || verdict === "fair")
    return <span style={{ color: "var(--color-text-muted)", fontWeight: 700 }}>{signed}</span>;
  const { fg } = deltaTone(value);
  return <span style={{ color: fg, fontWeight: 700 }}>{signed}</span>;
}

function VerdictBadge({ verdict, delta }: { verdict: ValueRow["verdict"]; delta: number | null }) {
  if (verdict === "unranked" || delta == null) {
    return (
      <span
        className="inline-flex items-center rounded-[var(--r-4)] border border-[var(--color-line)] bg-transparent px-2 py-1 text-[var(--color-text-dim)]"
        style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.14em" }}
      >
        —
      </span>
    );
  }
  if (verdict === "fair") {
    const display = delta === 0
      ? "0"
      : Number.isInteger(delta) ? `${delta > 0 ? "+" : ""}${delta}` : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;
    return (
      <span
        className="inline-flex items-center gap-1 rounded-[var(--r-4)] border border-[var(--color-line)] bg-[var(--color-press)] px-2 py-1 text-[var(--color-text-muted)]"
        style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.14em" }}
      >
        <span>FAIR</span>
        <span className="opacity-80">{display}</span>
      </span>
    );
  }
  // Magnitude-shaded pill: bg + border are color-mixed from the same
  // ramp foreground so mild Δs read soft and severe Δs read bold.
  const { fg, tier } = deltaTone(delta);
  const label = verdict === "undervalued" ? "UNDERVALUED" : "OVERVALUED";
  // Modifier prefix to communicate magnitude verbally too.
  const modifier =
    tier.endsWith("sev") ? "STRONGLY " :
    tier.endsWith("mod") ? "" :
    "MILDLY ";
  const display = Number.isInteger(delta) ? `${delta > 0 ? "+" : ""}${delta}` : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[var(--r-4)] border px-2 py-1"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "10px",
        fontWeight: 700,
        letterSpacing: "0.14em",
        color: fg,
        background: `color-mix(in oklab, ${fg} 12%, transparent)`,
        borderColor: `color-mix(in oklab, ${fg} 40%, transparent)`,
      }}
      title={`${modifier}${label} · Δ ${display}`}
    >
      <span>
        {modifier}
        {label}
      </span>
      <span className="opacity-80">{display}</span>
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

// Shared style for column headers (top + sub rows in the grouped header).
const groupHeadStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "10px",
  fontWeight: 600,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--color-text-dim)",
};

function SortHeader({
  children,
  sortKey,
  current,
  dir,
  onSort,
  align = "left",
}: {
  children: React.ReactNode;
  sortKey: SortKey;
  current: SortKey;
  dir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  align?: "left" | "center" | "right";
}) {
  const active = current === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={clsx(
        "inline-flex items-center gap-1 hover:text-[var(--color-text)]",
        align === "right" && "ml-auto",
        align === "center" && "mx-auto",
        active && "text-[var(--color-text)]",
      )}
      style={{ color: active ? "var(--color-text)" : "var(--color-text-dim)" }}
    >
      <span>{children}</span>
      {active ? (
        dir === "asc" ? (
          <ChevronUp className="h-3 w-3" strokeWidth={1.5} />
        ) : (
          <ChevronDown className="h-3 w-3" strokeWidth={1.5} />
        )
      ) : null}
    </button>
  );
}
