import { Suspense, cache } from "react";
import {
  getMarketOverview,
  getNflDailyVolume,
  getNflTradeFeedAndFlow,
  getPlayers,
  getWalletSnapshots,
  type WalletSnapshot,
} from "@/lib/data";
import { Card, CardHeader, Pill, Delta } from "@/components/ui";
import { MarketStatBar } from "@/components/MarketStatBar";
import { MarketCapChart } from "@/components/MarketCharts";
import { MarketPulse } from "@/components/MarketPulse";
import { MoversList } from "@/components/MoversList";
import { PlayersTable } from "@/components/PlayersTable";
import { RecentTrades } from "@/components/RecentTrades";
import { FreshnessIndicator } from "@/components/FreshnessIndicator";
import { UniqueHoldersCard, UniqueHoldersCardSkeleton } from "@/components/UniqueHoldersCard";
import { Sk, SkBlock } from "@/components/PageSkeleton";
import { fmtUsd } from "@/lib/format";

// Force dynamic rendering. ISR (the previous `revalidate = 60`
// setup) caused 7h+ stale Live Trade Feeds during low-traffic
// periods: with stale-while-revalidate, the first visit after a
// long gap renders the OLD cached HTML and only triggers a
// background regen.
export const dynamic = "force-dynamic";

// React.cache dedupes calls within a single request, so when two
// async sub-components ask for the same data they share ONE fetch.
// The cached getters also implicitly fire in parallel because each
// Suspense child awaits independently — there's no top-level
// `await Promise.all` blocking page render anymore.
const loadOverview = cache(() => getMarketOverview());
const loadPlayers = cache(() => getPlayers());
const loadFeedAndFlow = cache(() => getNflTradeFeedAndFlow(100, 200));
const loadDailyVolume = cache(() => getNflDailyVolume(30));

// Synchronous page shell. The hero paints on the very first frame.
// Every data-dependent section sits behind its own <Suspense>
// boundary so the page never looks frozen while the underlying
// fetches resolve.
export default function Home() {
  return (
    <div className="mx-auto max-w-[var(--max-w)] px-5 sm:px-8 py-6 sm:py-8">
      <Hero />

      <section className="mt-6">
        <Suspense fallback={<MarketStatBarSkeleton />}>
          <MarketStatBarSection />
        </Suspense>
      </section>

      <section className="mt-6">
        <Suspense fallback={<MarketCapCardSkeleton />}>
          <MarketCapSection />
        </Suspense>
      </section>

      <section className="mt-6">
        <Suspense fallback={<MarketPulseSkeleton />}>
          <MarketPulseSection />
        </Suspense>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <Suspense fallback={<MoversCardSkeleton title="Who's Hot" hint="24h volume leaders" tone="brand" toneLabel="Trending" />}>
          <MoversCard variant="trending" title="Who's Hot" hint="24h volume leaders" toneLabel="Trending" tone="brand" />
        </Suspense>
        <Suspense fallback={<MoversCardSkeleton title="Top Gainers" hint="24h price change" tone="gain" toneLabel="24H" />}>
          <MoversCard variant="gainers" title="Top Gainers" hint="24h price change" toneLabel="24H" tone="gain" />
        </Suspense>
        <Suspense fallback={<MoversCardSkeleton title="Top Losers" hint="24h price change" tone="loss" toneLabel="24H" />}>
          <MoversCard variant="losers" title="Top Losers" hint="24h price change" toneLabel="24H" tone="loss" />
        </Suspense>
      </section>

      <section id="players" className="mt-10 scroll-mt-20">
        <Suspense fallback={<PlayersTableSkeleton />}>
          <AllPlayersSection />
        </Suspense>
      </section>

      <section id="trades" className="mt-10 scroll-mt-20">
        <Suspense fallback={<TradesSkeleton />}>
          <LiveFeedSection />
        </Suspense>
      </section>

      <div className="mt-8 flex justify-end">
        <Suspense fallback={null}>
          <Freshness />
        </Suspense>
      </div>
    </div>
  );
}

// ── Data-dependent sections (each awaits only what it needs) ──────

async function MarketStatBarSection() {
  const overview = await loadOverview();
  return (
    <MarketStatBar
      data={overview}
      trailing={
        <Suspense fallback={<UniqueHoldersCardSkeleton />}>
          <UniqueHoldersCard />
        </Suspense>
      }
    />
  );
}

async function MarketCapSection() {
  const overview = await loadOverview();
  return (
    <Card variant="feature">
      <CardHeader
        title="NFL Player Token Market Cap"
        hint="Aggregate of every listed player · price × circulating supply"
        right={
          <div className="flex items-baseline gap-3">
            <span
              className="leading-none"
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                fontSize: "20px",
                letterSpacing: "-0.03em",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmtUsd(overview.totalMarketCap, { compact: true, digits: 2 })}
            </span>
            <Delta value={overview.marketCapChange24h} />
          </div>
        }
      />
      <MarketCapChart data={overview.marketCapSeries} />
    </Card>
  );
}

async function MarketPulseSection() {
  const [overview, feedAndFlow, dailyVolume, players] = await Promise.all([
    loadOverview(),
    loadFeedAndFlow(),
    loadDailyVolume(),
    loadPlayers(),
  ]);
  const activePoolsCount = players.filter((p) => p.volume24h > 0 || p.trades24h > 0).length;
  return (
    <MarketPulse
      dailyVolume={dailyVolume}
      flow={feedAndFlow.flow}
      totalVolume24h={overview.totalVolume24h}
      totalTrades24h={overview.totalTrades24h}
      activePoolsCount={activePoolsCount}
    />
  );
}

type MoversTone = "brand" | "gain" | "loss";
async function MoversCard({
  variant,
  title,
  hint,
  toneLabel,
  tone,
}: {
  variant: "trending" | "gainers" | "losers";
  title: string;
  hint: string;
  toneLabel: string;
  tone: MoversTone;
}) {
  const players = await loadPlayers();
  return (
    <Card>
      <CardHeader title={title} hint={hint} right={<Pill tone={tone}>{toneLabel}</Pill>} />
      <MoversList players={players} variant={variant} />
    </Card>
  );
}

async function AllPlayersSection() {
  const players = await loadPlayers();
  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: "26px",
              letterSpacing: "0.02em",
              textTransform: "uppercase",
              lineHeight: 1.1,
            }}
          >
            All NFL Players
          </h2>
          <p className="mt-1 text-[12px] text-[var(--color-text-dim)]">
            Sortable, filterable table of every listed player token.
          </p>
        </div>
        <Pill tone="muted">{players.length} listed</Pill>
      </div>
      <Card variant="press" padded={false}>
        <PlayersTable players={players} />
      </Card>
    </>
  );
}

async function LiveFeedSection() {
  const feedAndFlow = await loadFeedAndFlow();
  const recent = feedAndFlow.trades;
  const uniqueAddrs = Array.from(new Set(recent.map((t) => t.wallet))).slice(0, 50);
  const snapshotMap = await getWalletSnapshots(uniqueAddrs);
  const walletSnapshots: Record<string, WalletSnapshot> = {};
  for (const [k, v] of snapshotMap) walletSnapshots[k] = v;
  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: "26px",
              letterSpacing: "0.02em",
              textTransform: "uppercase",
              lineHeight: 1.1,
            }}
          >
            Live Trade Feed
          </h2>
          <p className="mt-1 text-[12px] text-[var(--color-text-dim)]">
            Most recent buys, sells, and swaps across every NFL pool.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 mono-eyebrow" style={{ fontSize: "10px" }}>
          <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-turf)]" />
          LIVE
        </span>
      </div>
      <Card variant="press" padded={false}>
        <RecentTrades trades={recent} wallets={walletSnapshots} />
      </Card>
    </>
  );
}

function Freshness() {
  // FreshnessIndicator just uses Date.now(), no async work — but
  // we keep it under a Suspense for placement consistency.
  return <FreshnessIndicator generatedAt={Date.now()} />;
}

// ── Inline skeletons ──────────────────────────────────────────────

function MarketStatBarSkeleton() {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-[1px] rounded-[var(--r-14)] overflow-hidden border border-[var(--color-line-strong)]"
      style={{ background: "var(--color-line-strong)" }}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-2"
          style={{
            padding: "16px 18px",
            background: "color-mix(in oklab, var(--color-text) 6%, transparent)",
          }}
        >
          <Sk w={90} h={10} />
          <Sk w={120} h={24} />
          <Sk w={60} h={10} />
        </div>
      ))}
    </div>
  );
}

function MarketCapCardSkeleton() {
  return (
    <Card variant="feature">
      <CardHeader title="NFL Player Token Market Cap" hint="Aggregate of every listed player · price × circulating supply" right={<Sk w={100} h={20} />} />
      <SkBlock h={280} />
    </Card>
  );
}

function MarketPulseSkeleton() {
  return <SkBlock h={460} />;
}

function MoversCardSkeleton({
  title,
  hint,
  tone,
  toneLabel,
}: {
  title: string;
  hint: string;
  tone: MoversTone;
  toneLabel: string;
}) {
  return (
    <Card>
      <CardHeader title={title} hint={hint} right={<Pill tone={tone}>{toneLabel}</Pill>} />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Sk key={i} w="100%" h={32} />
        ))}
      </div>
    </Card>
  );
}

function PlayersTableSkeleton() {
  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: "26px",
              letterSpacing: "0.02em",
              textTransform: "uppercase",
              lineHeight: 1.1,
            }}
          >
            All NFL Players
          </h2>
          <p className="mt-1 text-[12px] text-[var(--color-text-dim)]">
            Sortable, filterable table of every listed player token.
          </p>
        </div>
        <Sk w={80} h={22} className="rounded-full" />
      </div>
      <SkBlock h={520} />
    </>
  );
}

function TradesSkeleton() {
  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: "26px",
              letterSpacing: "0.02em",
              textTransform: "uppercase",
              lineHeight: 1.1,
            }}
          >
            Live Trade Feed
          </h2>
          <p className="mt-1 text-[12px] text-[var(--color-text-dim)]">
            Most recent buys, sells, and swaps across every NFL pool.
          </p>
        </div>
      </div>
      <SkBlock h={420} />
    </>
  );
}

// Hero panel — full-width inside the page wrap. 1px line border, r14,
// 135° gradient bench → press, 48px field-grid decoration, 480x480
// amber radial glow anchored top-right. Fully static so it paints on
// the very first frame regardless of upstream data.
function Hero() {
  return (
    <div
      className="relative overflow-hidden rounded-[var(--r-14)] border border-[var(--color-line)]"
      style={{
        background: "linear-gradient(135deg, var(--color-bench) 0%, var(--color-press) 100%)",
      }}
    >
      {/* Field-grid decoration */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in oklab, var(--color-text) 4%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--color-text) 4%, transparent) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      {/* Amber radial glow */}
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
      <div
        className="relative flex flex-col gap-5 sm:gap-6"
        style={{ padding: "clamp(24px, 5vw, 40px) clamp(20px, 5vw, 40px) clamp(20px, 4.5vw, 36px)" }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="brand">NFL · Base Chain</Pill>
          <Pill tone="muted">Real Football&trade;</Pill>
        </div>
        <h1
          className="m-0 text-[var(--color-text)]"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 900,
            fontSize: "clamp(36px, 4.5vw, 60px)",
            lineHeight: 0.95,
            letterSpacing: "-0.005em",
            textTransform: "uppercase",
          }}
        >
          FDF&apos;s NFL Player Token Market,
          <br />
          All In One Place.
        </h1>
        <p
          className="m-0 max-w-[80ch] text-[var(--color-text-muted)]"
          style={{ fontSize: "15px" }}
        >
          Real-time price action, pool liquidity, holders, trades, and value assessment for every
          tokenized athlete on Sport.fun&apos;s NFL market. 72 players listed. This is how Real
          Football&trade; is played.
        </p>
      </div>
    </div>
  );
}
