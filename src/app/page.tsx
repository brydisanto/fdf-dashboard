import { Suspense } from "react";
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
import { LiveTicker } from "@/components/LiveTicker";
import { FreshnessIndicator } from "@/components/FreshnessIndicator";
import { UniqueHoldersCard, UniqueHoldersCardSkeleton } from "@/components/UniqueHoldersCard";
import { fmtUsd } from "@/lib/format";

// 60s ISR — Next.js serves cached HTML and regenerates in the
// background. Navigations feel instant because the rendered page is
// served from the edge cache rather than a full server render. The
// underlying upstream fetches are already cached at their own
// revalidate intervals (REVALIDATE.list/trades/etc.), so any data
// that needs to be fresher than 60s still updates within its own
// cache window.
export const revalidate = 60;

export default async function Home() {
  const [overview, players, feedAndFlow, dailyVolume] = await Promise.all([
    getMarketOverview(),
    getPlayers(),
    getNflTradeFeedAndFlow(50, 50),
    getNflDailyVolume(30),
  ]);
  const recent = feedAndFlow.trades;
  const flow = feedAndFlow.flow;

  // Cover the full trade-feed length (50) so every visible trade
  // shows its wallet tier badge + NFL value, not a fallback mono
  // address.
  const uniqueAddrs = Array.from(new Set(recent.map((t) => t.wallet))).slice(0, 50);
  const snapshotMap = await getWalletSnapshots(uniqueAddrs);
  const walletSnapshots: Record<string, WalletSnapshot> = {};
  for (const [k, v] of snapshotMap) walletSnapshots[k] = v;

  const activePoolsCount = players.filter((p) => p.volume24h > 0 || p.trades24h > 0).length;
  const generatedAt = Date.now();
  const tickerMovers = players
    .slice()
    .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
    .slice(0, 8);

  return (
    <>
      {/* Live ticker — full-width, sits between header and hero */}
      <LiveTicker movers={tickerMovers} />

      <div className="mx-auto max-w-[var(--max-w)] px-5 sm:px-8 py-6 sm:py-8">
        <Hero />

        <section className="mt-6">
          <MarketStatBar
            data={overview}
            trailing={
              <Suspense fallback={<UniqueHoldersCardSkeleton />}>
                <UniqueHoldersCard />
              </Suspense>
            }
          />
        </section>

        <section className="mt-6">
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
                    {fmtUsd(overview.totalMarketCap, { compact: true })}
                  </span>
                  <Delta value={overview.marketCapChange24h} />
                </div>
              }
            />
            <MarketCapChart data={overview.marketCapSeries} />
          </Card>
        </section>

        <section className="mt-6">
          <MarketPulse
            dailyVolume={dailyVolume}
            flow={flow}
            totalVolume24h={overview.totalVolume24h}
            totalTrades24h={overview.totalTrades24h}
            activePoolsCount={activePoolsCount}
          />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader title="Top Gainers" hint="24h price change" right={<Pill tone="gain">24H</Pill>} />
            <MoversList players={players} variant="gainers" />
          </Card>
          <Card>
            <CardHeader title="Top Losers" hint="24h price change" right={<Pill tone="loss">24H</Pill>} />
            <MoversList players={players} variant="losers" />
          </Card>
          <Card>
            <CardHeader title="Most Traded" hint="24h volume leaders" right={<Pill tone="brand">Trending</Pill>} />
            <MoversList players={players} variant="trending" />
          </Card>
        </section>

        <section id="players" className="mt-10 scroll-mt-20">
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
        </section>

        <section id="trades" className="mt-10 scroll-mt-20">
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
        </section>

        <div className="mt-8 flex justify-end">
          <FreshnessIndicator generatedAt={generatedAt} />
        </div>
      </div>
    </>
  );
}

// Hero panel — full-width inside the page wrap. 1px line border, r14,
// 135° gradient bench → press, 48px field-grid decoration, 480x480
// amber radial glow anchored top-right.
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
      <div className="relative flex flex-col gap-6" style={{ padding: "40px 40px 36px" }}>
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
