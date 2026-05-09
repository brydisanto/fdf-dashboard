import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPlayers } from "@/lib/data";
import {
  getFantasyProsRankings,
  indexFpByName,
  normalizeName,
} from "@/lib/data/fantasypros";
import { Card, CardHeader, Pill } from "@/components/ui";
import { ValueTable, type ValueRow } from "@/components/ValueTable";
import { fmtNum } from "@/lib/format";
import type { Position } from "@/lib/types";

export const metadata = {
  title: "Value Score · Gridiron",
  description:
    "FantasyPros consensus positional rank vs Sport.fun market rank — surfaces NFL player tokens the market ranks above or below the consensus.",
};

export const revalidate = 600;

const POS: Position[] = ["QB", "RB", "WR", "TE"];

// Δ band tolerated as "fair". |Δ| ≤ this → no over/undervalued
// verdict. 1 spot of disparity is noise; 2+ starts to matter.
const FAIR_BAND = 1;

export default async function ValuePage() {
  const [players, fp] = await Promise.all([getPlayers(), getFantasyProsRankings()]);
  const fpByName = indexFpByName(fp);

  // Group roster by position; market positional rank within each.
  const byPos = new Map<Position, typeof players>();
  for (const p of players) {
    if (!POS.includes(p.position as Position)) continue;
    const list = byPos.get(p.position as Position) ?? [];
    list.push(p);
    byPos.set(p.position as Position, list);
  }
  const marketPosRank = new Map<string, { rank: number; size: number }>();
  for (const [, list] of byPos) {
    list.sort((a, b) => b.priceUsd - a.priceUsd);
    list.forEach((p, i) => marketPosRank.set(p.id, { rank: i + 1, size: list.length }));
  }

  // Build rows. Single-source rank disparity model:
  //   posRankDelta = fpPosRank − marketPosRank
  // Negative Δ → FP ranks them higher than market does (FP says
  // they're better) → market may be UNDERVALUING them.
  // Positive Δ → market ranks them higher than FP → market may be
  // OVERVALUING them.
  const rows: ValueRow[] = players
    .filter((p) => POS.includes(p.position as Position))
    .map((p) => {
      const market = marketPosRank.get(p.id) ?? { rank: 0, size: 0 };
      const fpHit = fpByName.get(normalizeName(`${p.firstName} ${p.lastName}`));
      const fpPosRank = fpHit?.posRankNum && fpHit.posRankNum > 0 ? fpHit.posRankNum : null;
      const posRankDelta =
        fpPosRank != null && market.rank > 0 ? fpPosRank - market.rank : null;

      let verdict: ValueRow["verdict"] = "unranked";
      if (posRankDelta != null) {
        if (Math.abs(posRankDelta) <= FAIR_BAND) verdict = "fair";
        else if (posRankDelta < 0) verdict = "undervalued";
        else verdict = "overvalued";
      }

      return {
        ...p,
        marketPosRank: market.rank,
        posPlayers: market.size,
        fpPosRank,
        posRankDelta,
        verdict,
      };
    });

  const matched = rows.filter((r) => r.posRankDelta != null).length;
  const undervalued = rows.filter((r) => r.verdict === "undervalued");
  const overvalued = rows.filter((r) => r.verdict === "overvalued");

  // Extremes by absolute rank disparity (largest gap first).
  const topUndervalued = undervalued
    .slice()
    .sort((a, b) => (a.posRankDelta ?? 0) - (b.posRankDelta ?? 0))
    .slice(0, 3);
  const topOvervalued = overvalued
    .slice()
    .sort((a, b) => (b.posRankDelta ?? 0) - (a.posRankDelta ?? 0))
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-[var(--max-w)] px-5 sm:px-8 py-6 sm:py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 mono-eyebrow hover:text-[var(--color-text)]"
        style={{ fontSize: "10px" }}
      >
        <ArrowLeft className="h-3 w-3" />
        Back to market
      </Link>

      {/* Hero */}
      <div
        className="mt-3 relative overflow-hidden rounded-[var(--r-14)] border border-[var(--color-line)]"
        style={{ background: "linear-gradient(135deg, var(--color-bench) 0%, var(--color-press) 100%)" }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "linear-gradient(to right, color-mix(in oklab, var(--color-text) 4%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--color-text) 4%, transparent) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            right: -100,
            top: -100,
            width: 480,
            height: 480,
            background: "radial-gradient(circle, var(--accent-tint), transparent 70%)",
          }}
        />
        <div className="relative flex flex-col gap-6" style={{ padding: "32px 32px 28px" }}>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="brand">Rank Disparity</Pill>
            <Pill tone="muted">PPR · FantasyPros consensus</Pill>
          </div>
          <h1
            className="m-0 text-[var(--color-text)]"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 900,
              fontSize: "clamp(30px, 3.5vw, 48px)",
              lineHeight: 1,
              letterSpacing: "-0.005em",
              textTransform: "uppercase",
            }}
          >
            Where do market and consensus disagree?
          </h1>
          <p className="m-0 max-w-[64ch] text-[var(--color-text-muted)]" style={{ fontSize: "15px" }}>
            Comparing each player&apos;s <strong>Sport.fun market positional rank</strong> against
            their <strong>FantasyPros consensus PPR positional rank</strong>. A negative <strong>Δ</strong>
            means FP ranks them higher than the market does — a candidate the market may be
            undervaluing. Positive Δ — the inverse.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <ExtremeCard
              title="Most Undervalued"
              tone="gain"
              players={topUndervalued}
              empty="No clear undervalued picks right now."
            />
            <ExtremeCard
              title="Most Overvalued"
              tone="loss"
              players={topOvervalued}
              empty="No clear overvalued picks right now."
            />
            <SummaryCard
              matched={matched}
              total={rows.length}
              undervalued={undervalued.length}
              overvalued={overvalued.length}
            />
          </div>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Rank Disparity Table"
          hint="Sort by Δ to surface biggest market-vs-consensus disagreements"
          right={<Pill tone="muted">{fmtNum(matched)} matched · {fmtNum(rows.length - matched)} unranked</Pill>}
        />
        <ValueTable rows={rows} />
      </Card>
    </div>
  );
}

function ExtremeCard({
  title,
  tone,
  players,
  empty,
}: {
  title: string;
  tone: "gain" | "loss";
  players: ValueRow[];
  empty: string;
}) {
  return (
    <div className="rounded-[var(--r-8)] border border-[var(--color-line)] bg-[var(--color-press)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "14px",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {title}
        </div>
        <Pill tone={tone}>{tone === "gain" ? "Buy" : "Sell"}</Pill>
      </div>
      {players.length === 0 ? (
        <div className="text-[12px] text-[var(--color-text-dim)]">{empty}</div>
      ) : (
        <ul className="space-y-2">
          {players.map((p) => (
            <li key={p.id} className="flex items-baseline justify-between text-sm">
              <Link href={`/player/${p.id}`} className="min-w-0 truncate hover:text-[var(--accent-soft)]">
                <span className="font-medium">
                  {p.firstName[0]}. {p.lastName}
                </span>
                <span
                  className="ml-1.5"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--color-text-dim)",
                  }}
                >
                  {p.position} · MKT {p.position}
                  {p.marketPosRank} · FP {p.position}
                  {p.fpPosRank}
                </span>
              </Link>
              <span
                className={tone === "gain" ? "text-[var(--color-turf)]" : "text-[var(--color-penalty)]"}
                style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}
              >
                {p.posRankDelta! > 0 ? "+" : ""}
                {p.posRankDelta}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SummaryCard({
  matched,
  total,
  undervalued,
  overvalued,
}: {
  matched: number;
  total: number;
  undervalued: number;
  overvalued: number;
}) {
  return (
    <div className="rounded-[var(--r-8)] border border-[var(--color-line)] bg-[var(--color-press)] p-4">
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: "14px",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        Coverage
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <Stat label="Matched" value={`${fmtNum(matched)} / ${fmtNum(total)}`} />
        <Stat label="Undervalued" value={fmtNum(undervalued)} tone="gain" />
        <Stat label="Overvalued" value={fmtNum(overvalued)} tone="loss" />
        <Stat label={`Fair (|Δ| ≤ ${FAIR_BAND})`} value={fmtNum(matched - undervalued - overvalued)} />
      </div>
      <div className="mt-3 text-[11px] text-[var(--color-text-dim)]">
        Within ±{FAIR_BAND} positional rank counts as fair.
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "gain" | "loss" }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--color-text-dim)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "16px",
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color:
            tone === "gain"
              ? "var(--color-turf)"
              : tone === "loss"
                ? "var(--color-penalty)"
                : "var(--color-text)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
