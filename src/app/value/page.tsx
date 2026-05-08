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
import { fmtNum, fmtPrice } from "@/lib/format";
import type { Position } from "@/lib/types";

export const metadata = {
  title: "Value Score · Gridiron",
  description: "Compare market price against FantasyPros consensus PPR ranks to surface NFL player tokens that may be over- or undervalued.",
};

export const revalidate = 600;

const POS: Position[] = ["QB", "RB", "WR", "TE"];

// "Fair" band: actual price is within ±this percent of expected price.
const FAIR_BAND_PCT = 10;

export default async function ValuePage() {
  const [players, fp] = await Promise.all([getPlayers(), getFantasyProsRankings()]);
  const fpByName = indexFpByName(fp);

  // ---- Position-level setup ----------------------------------------
  // For each position we need:
  //  - market positional rank (by market cap)
  //  - the FP "#1 at position" — the player at this position with FP
  //    pos rank = 1 (or, if missing in our roster, the lowest pos rank
  //    we do have). Anchors the expected-price computation.
  const byPos = new Map<Position, typeof players>();
  for (const p of players) {
    if (!POS.includes(p.position as Position)) continue;
    const list = byPos.get(p.position as Position) ?? [];
    list.push(p);
    byPos.set(p.position as Position, list);
  }
  const marketPosRank = new Map<string, { rank: number; size: number }>();
  for (const [, list] of byPos) {
    list.sort((a, b) => b.marketCap - a.marketCap);
    list.forEach((p, i) => marketPosRank.set(p.id, { rank: i + 1, size: list.length }));
  }

  // For each position: find the FP-#1 player on our roster (lowest
  // posRankNum) and capture their FP overall rank + market price as the
  // anchor for expected-price math.
  type Anchor = { id: string; fpOverall: number; marketPrice: number };
  const fpAnchorByPos = new Map<Position, Anchor>();
  for (const [position, list] of byPos) {
    let best: { hit: ReturnType<typeof fpByName.get>; player: (typeof list)[number] } | null = null;
    for (const p of list) {
      const hit = fpByName.get(normalizeName(`${p.firstName} ${p.lastName}`));
      if (!hit?.posRankNum || !hit.rankEcr) continue;
      if (!best || hit.posRankNum < best.hit!.posRankNum!) best = { hit, player: p };
    }
    if (best && best.hit) {
      fpAnchorByPos.set(position, {
        id: best.player.id,
        fpOverall: best.hit.rankEcr,
        marketPrice: best.player.priceUsd,
      });
    }
  }

  // ---- Build rows --------------------------------------------------
  const rows: ValueRow[] = players
    .filter((p) => POS.includes(p.position as Position))
    .map((p) => {
      const fpHit = fpByName.get(normalizeName(`${p.firstName} ${p.lastName}`));
      const market = marketPosRank.get(p.id) ?? { rank: 0, size: 0 };
      const fpPos = fpHit?.posRankNum ?? null;
      const fpOverall = fpHit?.rankEcr ?? null;
      const anchor = fpAnchorByPos.get(p.position as Position) ?? null;

      // FP overall rank gap from the position's FP-#1, expressed as a
      // percentage of the anchor's overall rank. Positive % means the
      // player is ranked further down the overall board than the
      // position-#1, so we'd expect them priced lower.
      let fpOverallGapPct: number | null = null;
      let expectedPriceUsd: number | null = null;
      let priceVsExpectedUsd: number | null = null;
      let priceVsExpectedPct: number | null = null;
      if (anchor && fpOverall != null) {
        const rawGap = (fpOverall - anchor.fpOverall) / anchor.fpOverall;
        fpOverallGapPct = +(rawGap * 100).toFixed(2);
        // Expected price: scale the anchor's market price by (1 − gap%).
        // For the anchor itself this is just its own price; for players
        // ranked below #1, expected price drops linearly with the rank
        // gap. Floor at 0 so we never report negative expected price.
        expectedPriceUsd = Math.max(0, anchor.marketPrice * (1 - rawGap));
        priceVsExpectedUsd = +(p.priceUsd - expectedPriceUsd).toFixed(6);
        if (expectedPriceUsd > 0) {
          priceVsExpectedPct = +((priceVsExpectedUsd / expectedPriceUsd) * 100).toFixed(2);
        }
      }

      // Verdict driven by % delta from expected (price magnitude), not
      // just rank disparity. Negative delta = market priced below
      // expected = undervalued.
      let verdict: ValueRow["verdict"] = "unranked";
      if (priceVsExpectedPct != null) {
        if (Math.abs(priceVsExpectedPct) <= FAIR_BAND_PCT) verdict = "fair";
        else if (priceVsExpectedPct < 0) verdict = "undervalued";
        else verdict = "overvalued";
      }

      // Keep `rankDelta` populated for backwards-compat / sorting in
      // the table — it's still useful as a secondary signal.
      const rankDelta =
        fpPos != null && market.rank > 0 ? market.rank - fpPos : null;

      return {
        ...p,
        fpConsensusRank: fpOverall,
        fpPosRankNum: fpPos,
        marketPosRank: market.rank,
        posPlayers: market.size,
        rankDelta,
        fpOverallGapPct,
        expectedPriceUsd,
        priceVsExpectedUsd,
        priceVsExpectedPct,
        verdict,
      };
    });

  const matched = rows.filter((r) => r.priceVsExpectedPct != null).length;
  const undervalued = rows.filter((r) => r.verdict === "undervalued");
  const overvalued = rows.filter((r) => r.verdict === "overvalued");

  // Sort extremes by % gap from expected price (the magnitude metric
  // the user asked for).
  const topUndervalued = undervalued
    .slice()
    .sort((a, b) => (a.priceVsExpectedPct ?? 0) - (b.priceVsExpectedPct ?? 0))
    .slice(0, 3);
  const topOvervalued = overvalued
    .slice()
    .sort((a, b) => (b.priceVsExpectedPct ?? 0) - (a.priceVsExpectedPct ?? 0))
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to market
      </Link>

      <div className="mt-3 relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-surface-2)]">
        <div className="absolute inset-0 field-grid opacity-50" />
        <div className="absolute -top-20 -right-20 h-56 w-56 rounded-full bg-[var(--color-brand)]/15 blur-3xl" />
        <div className="relative px-5 py-6 sm:px-8 sm:py-7">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="brand">Expected Price</Pill>
            <Pill tone="muted">PPR · FantasyPros consensus</Pill>
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
            Where do market and consensus disagree?
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--color-text-muted)]">
            For each position we anchor on the FP-#1 player&apos;s market price,
            then scale it down by every other player&apos;s <strong>% FP overall rank gap</strong>{" "}
            from that anchor to derive an <strong>expected price</strong>. The{" "}
            <strong>Δ vs Expected</strong> column is the dollar gap between actual market price and that
            expected price — negative means the market is pricing them below where consensus says they
            belong (undervalued), positive means above (overvalued).
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
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
          title="Value Score Table"
          hint="Sort by Δ vs Expected to surface biggest mispricings · click any column to sort"
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
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">{title}</div>
        <Pill tone={tone}>{tone === "gain" ? "Buy candidates" : "Sell candidates"}</Pill>
      </div>
      {players.length === 0 ? (
        <div className="text-xs text-[var(--color-text-dim)]">{empty}</div>
      ) : (
        <ul className="space-y-2">
          {players.map((p) => (
            <li key={p.id} className="flex items-baseline justify-between text-sm">
              <Link href={`/player/${p.id}`} className="min-w-0 truncate hover:text-[var(--color-brand-soft)]">
                <span className="font-medium">{p.firstName[0]}. {p.lastName}</span>
                <span className="ml-1.5 text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
                  {p.position} · FP #{p.fpConsensusRank} · {fmtPrice(p.priceUsd)} vs {fmtPrice(p.expectedPriceUsd ?? 0)}
                </span>
              </Link>
              <span className={tone === "gain" ? "tabular text-[var(--color-gain)]" : "tabular text-[var(--color-loss)]"}>
                {p.priceVsExpectedPct! > 0 ? `+${p.priceVsExpectedPct!.toFixed(1)}` : p.priceVsExpectedPct!.toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SummaryCard({ matched, total, undervalued, overvalued }: {
  matched: number; total: number; undervalued: number; overvalued: number;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-4">
      <div className="text-sm font-semibold">Coverage</div>
      <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
        <Stat label="Matched to FP" value={`${fmtNum(matched)} / ${fmtNum(total)}`} />
        <Stat label="Undervalued" value={fmtNum(undervalued)} tone="gain" />
        <Stat label="Overvalued" value={fmtNum(overvalued)} tone="loss" />
        <Stat label={`Fair (±${FAIR_BAND_PCT}%)`} value={fmtNum(total - undervalued - overvalued)} />
      </div>
      <div className="mt-3 text-[11px] text-[var(--color-text-dim)]">
        Fair band: actual price within ±{FAIR_BAND_PCT}% of expected.
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "gain" | "loss" }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">{label}</div>
      <div
        className={
          tone === "gain"
            ? "tabular text-base font-semibold text-[var(--color-gain)]"
            : tone === "loss"
              ? "tabular text-base font-semibold text-[var(--color-loss)]"
              : "tabular text-base font-semibold"
        }
      >
        {value}
      </div>
    </div>
  );
}
