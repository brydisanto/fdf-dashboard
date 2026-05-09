import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPlayers } from "@/lib/data";
import {
  getDsAuctionValues,
  indexDsByName,
  normalizeName,
} from "@/lib/data/draftsharks";
import { getFantasyProsRankings, indexFpByName } from "@/lib/data/fantasypros";
import { Card, CardHeader, Pill } from "@/components/ui";
import { ValueTable, type ValueRow } from "@/components/ValueTable";
import { fmtNum, fmtPrice } from "@/lib/format";
import type { Position } from "@/lib/types";

export const metadata = {
  title: "Value Score · Gridiron",
  description:
    "Compare market price against Draft Sharks PPR auction values to surface NFL player tokens that may be over- or undervalued.",
};

export const revalidate = 600;

const POS: Position[] = ["QB", "RB", "WR", "TE"];

// "Fair" band: actual price is within ±this percent of expected price.
const FAIR_BAND_PCT = 10;

export default async function ValuePage() {
  const [players, ds, fp] = await Promise.all([
    getPlayers(),
    getDsAuctionValues(),
    getFantasyProsRankings(),
  ]);
  const dsByName = indexDsByName(ds);
  const fpByName = indexFpByName(fp);

  // Group roster players by position so we can compute market positional
  // rank within each group.
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

  // For each position, find the "anchor" — the highest auction-value
  // player that ALSO appears in our roster. We require the anchor to be
  // on-roster so the price ratio is computed against a real Sport.fun
  // pool, not someone Sport.fun hasn't listed yet.
  type Anchor = { id: string; auctionVal: number; marketPrice: number; name: string };
  const anchorByPos = new Map<Position, Anchor>();
  for (const [position, list] of byPos) {
    let best: { ds: ReturnType<typeof dsByName.get>; player: (typeof list)[number] } | null = null;
    for (const p of list) {
      const hit = dsByName.get(normalizeName(`${p.firstName} ${p.lastName}`));
      if (!hit?.dsAuctionValue) continue;
      if (!best || hit.posRank < best.ds!.posRank) best = { ds: hit, player: p };
    }
    if (best && best.ds) {
      anchorByPos.set(position, {
        id: best.player.id,
        auctionVal: best.ds.dsAuctionValue,
        marketPrice: best.player.priceUsd,
        name: `${best.player.firstName} ${best.player.lastName}`,
      });
    }
  }

  // Build rows. Two-source model:
  //   - Draft Sharks PPR auction value drives the expected-price math
  //     (ratio = playerAuctionVal / anchorAuctionVal; expected =
  //     anchor.marketPrice × ratio).
  //   - FantasyPros consensus PPR positional rank drives the
  //     positional-disparity columns (FP, Δ).
  // Δ = fpPosRank − marketPosRank. Negative = market ranks them
  // lower than FP does (FP says they're better than the market) →
  // potentially undervalued. Positive = market ranks them higher
  // than FP → potentially overvalued.
  const rows: ValueRow[] = players
    .filter((p) => POS.includes(p.position as Position))
    .map((p) => {
      const market = marketPosRank.get(p.id) ?? { rank: 0, size: 0 };
      const nameKey = normalizeName(`${p.firstName} ${p.lastName}`);
      const ds = dsByName.get(nameKey);
      const fp = fpByName.get(nameKey);
      const anchor = anchorByPos.get(p.position as Position) ?? null;

      const auctionVal = ds?.dsAuctionValue ?? null;
      const fpPosRank = fp?.posRankNum && fp.posRankNum > 0 ? fp.posRankNum : null;
      const posRankDelta =
        fpPosRank != null && market.rank > 0 ? fpPosRank - market.rank : null;

      let expectedPriceUsd: number | null = null;
      let priceVsExpectedUsd: number | null = null;
      let priceVsExpectedPct: number | null = null;
      let ratio: number | null = null;
      if (anchor && auctionVal != null && anchor.auctionVal > 0) {
        ratio = auctionVal / anchor.auctionVal;
        expectedPriceUsd = anchor.marketPrice * ratio;
        priceVsExpectedUsd = +(p.priceUsd - expectedPriceUsd).toFixed(6);
        if (expectedPriceUsd > 0) {
          priceVsExpectedPct = +((priceVsExpectedUsd / expectedPriceUsd) * 100).toFixed(2);
        }
      }

      let verdict: ValueRow["verdict"] = "unranked";
      if (priceVsExpectedPct != null) {
        if (Math.abs(priceVsExpectedPct) <= FAIR_BAND_PCT) verdict = "fair";
        else if (priceVsExpectedPct < 0) verdict = "undervalued";
        else verdict = "overvalued";
      }

      return {
        ...p,
        marketPosRank: market.rank,
        posPlayers: market.size,
        auctionValue: auctionVal,
        fpPosRank,
        posRankDelta,
        ratio,
        expectedPriceUsd,
        priceVsExpectedUsd,
        priceVsExpectedPct,
        isAnchor: anchor?.id === p.id,
        verdict,
      };
    });

  const matched = rows.filter((r) => r.priceVsExpectedPct != null).length;
  const undervalued = rows.filter((r) => r.verdict === "undervalued");
  const overvalued = rows.filter((r) => r.verdict === "overvalued");

  // Sort extremes by % gap from expected price.
  const topUndervalued = undervalued
    .slice()
    .sort((a, b) => (a.priceVsExpectedPct ?? 0) - (b.priceVsExpectedPct ?? 0))
    .slice(0, 3);
  const topOvervalued = overvalued
    .slice()
    .sort((a, b) => (b.priceVsExpectedPct ?? 0) - (a.priceVsExpectedPct ?? 0))
    .slice(0, 3);

  const anchorStrip = Array.from(anchorByPos.entries()).map(([pos, a]) => ({
    pos,
    name: a.name,
    auctionVal: a.auctionVal,
    marketPrice: a.marketPrice,
  }));

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
            <Pill tone="brand">Expected Price</Pill>
            <Pill tone="muted">PPR · Draft Sharks Auction</Pill>
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
            For each position we anchor on the highest auction-value player on the
            Sport.fun roster. Every other player&apos;s expected price is the anchor&apos;s
            market price scaled by their <strong>auction-value ratio</strong> to that anchor.
            <strong> Δ vs Expected</strong> is the dollar gap — negative means the market
            is pricing them below where the auction sheet says they belong (undervalued).
          </p>

          {/* Per-position anchor strip */}
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {anchorStrip.map((a) => (
              <AnchorCard key={a.pos} {...a} />
            ))}
          </div>

          <div className="mt-2 grid gap-3 sm:grid-cols-3">
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
          hint="Sort by Δ vs Expected to surface biggest mispricings · click any column"
          right={<Pill tone="muted">{fmtNum(matched)} matched · {fmtNum(rows.length - matched)} unranked</Pill>}
        />
        <ValueTable rows={rows} />
      </Card>
    </div>
  );
}

function AnchorCard({ pos, name, auctionVal, marketPrice }: { pos: Position; name: string; auctionVal: number; marketPrice: number }) {
  return (
    <div className="rounded-[var(--r-8)] border border-[var(--accent-line)] bg-[var(--accent-tint)] px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="mono-eyebrow text-[var(--accent-soft)]" style={{ fontSize: "9.5px" }}>
          {pos} ANCHOR
        </span>
      </div>
      <div className="mt-1 truncate text-[14px] font-semibold">{name}</div>
      <div
        className="mt-0.5 flex items-baseline gap-2"
        style={{
          fontFamily: "var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
          fontSize: "11px",
          color: "var(--color-text-muted)",
        }}
      >
        <span className="text-[var(--accent-soft)] font-semibold">${auctionVal}</span>
        <span>·</span>
        <span>{fmtPrice(marketPrice)}</span>
      </div>
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
                  {p.position} · ${p.auctionValue ?? "?"} · {fmtPrice(p.priceUsd)} → {fmtPrice(p.expectedPriceUsd ?? 0)}
                </span>
              </Link>
              <span
                className={tone === "gain" ? "text-[var(--color-turf)]" : "text-[var(--color-penalty)]"}
                style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}
              >
                {p.priceVsExpectedPct! > 0 ? "+" : ""}
                {p.priceVsExpectedPct!.toFixed(1)}%
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
        <Stat label={`Fair (±${FAIR_BAND_PCT}%)`} value={fmtNum(matched - undervalued - overvalued)} />
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
        className={
          tone === "gain"
            ? "text-[var(--color-turf)]"
            : tone === "loss"
              ? "text-[var(--color-penalty)]"
              : ""
        }
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
