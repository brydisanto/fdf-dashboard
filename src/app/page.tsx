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
import { PoolsTable } from "@/components/PoolsTable";
import { RecentTrades } from "@/components/RecentTrades";
import { FreshnessIndicator } from "@/components/FreshnessIndicator";
import { UniqueHoldersCard, UniqueHoldersCardSkeleton } from "@/components/UniqueHoldersCard";
import { fmtUsd } from "@/lib/format";

// Render the home page on every request. Underlying fetches still
// share a short (10s) TTL cache so we don't hammer the upstream when
// multiple users hit the page in the same window — but the page itself
// is never prerendered or held stale.
export const dynamic = "force-dynamic";

export default async function Home() {
  // Trades + flow rollup come from a single deduplicated fetch pass.
  // Unique-holder dedupe is intentionally NOT awaited here — it runs
  // hundreds of upstream calls and would otherwise starve every other
  // request on cold cache. We render it inside <Suspense> so the rest
  // of the page paints instantly.
  const [overview, players, feedAndFlow, dailyVolume] = await Promise.all([
    getMarketOverview(),
    getPlayers(),
    getNflTradeFeedAndFlow(50, 50),
    getNflDailyVolume(30),
  ]);
  const recent = feedAndFlow.trades;
  const flow = feedAndFlow.flow;

  // Resolve wallet snapshots for the trade feed. Cap to top 25 unique
  // wallets to keep the upstream call count bounded; wallets beyond that
  // simply render as plain mono addresses (still clickable).
  const uniqueAddrs = Array.from(new Set(recent.map((t) => t.wallet))).slice(0, 25);
  const snapshotMap = await getWalletSnapshots(uniqueAddrs);
  const walletSnapshots: Record<string, WalletSnapshot> = {};
  for (const [k, v] of snapshotMap) walletSnapshots[k] = v;

  const activePoolsCount = players.filter((p) => p.volume24h > 0 || p.trades24h > 0).length;
  const topPools = players.slice().sort((a, b) => b.tvl - a.tvl).slice(0, 20);
  const generatedAt = Date.now();

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      <Hero overview={overview} listed={players.length} generatedAt={generatedAt} />

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
        <Card className="lg:p-5">
          <CardHeader
            title="NFL Player Token Market Cap"
            hint="Aggregate of every listed player · price × circulating supply"
            right={
              <div className="flex items-baseline gap-2">
                <div className="tabular text-lg font-semibold">
                  {fmtUsd(overview.totalMarketCap, { compact: true })}
                </div>
                <Delta value={overview.marketCapChange24h} className="text-xs" />
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

      <section id="players" className="mt-8 scroll-mt-20">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight">All NFL Players</h2>
            <p className="text-xs text-[var(--color-text-dim)]">
              Sortable, filterable table of every listed player token.
            </p>
          </div>
          <Pill tone="muted">{players.length} listed</Pill>
        </div>
        <PlayersTable players={players} />
      </section>

      <section id="trades" className="mt-8 scroll-mt-20">
        <Card>
          <CardHeader
            title="Live Trade Feed"
            hint="Most recent buys and sells across the full NFL market"
            right={
              <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
                <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-gain)]" />
                Live
              </span>
            }
          />
          <RecentTrades trades={recent} wallets={walletSnapshots} />
        </Card>
      </section>

      <section id="pools" className="mt-8 scroll-mt-20">
        <Card>
          <CardHeader
            title="Top Pools by TVL"
            hint="Sport.fun AMM pool depth · click any column to sort"
            right={<Pill tone="muted">3% buy/sell · 5% swap</Pill>}
          />
          <PoolsTable players={topPools} />
        </Card>
      </section>
    </div>
  );
}

function Hero({
  overview,
  listed,
  generatedAt,
}: {
  overview: Awaited<ReturnType<typeof getMarketOverview>>;
  listed: number;
  generatedAt: number;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] via-[var(--color-surface)] to-[var(--color-surface-2)]">
      <div className="absolute inset-0 field-grid opacity-60" />
      <div className="absolute -top-24 -right-20 h-64 w-64 rounded-full bg-[var(--color-brand)]/15 blur-3xl" />
      <div className="relative px-5 py-6 sm:px-8 sm:py-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Pill tone="brand">NFL · Base Chain</Pill>
            <Pill tone="muted">v0.1 preview</Pill>
            <FreshnessIndicator generatedAt={generatedAt} />
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
            The NFL player token market, in one screen.
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-text-muted)]">
            Real-time price action, pool liquidity, holders, and trades for every tokenized
            athlete on Sport.fun&apos;s NFL market. {listed} players listed.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:items-end">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-dim)]">Market Cap</div>
            <div className="tabular text-2xl font-bold leading-none">
              {fmtUsd(overview.totalMarketCap, { compact: true })}
            </div>
            <Delta value={overview.marketCapChange24h} className="text-xs" />
          </div>
          <div className="border-l border-[var(--color-border)] pl-3 sm:ml-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-dim)]">24h Volume</div>
            <div className="tabular text-2xl font-bold leading-none">
              {fmtUsd(overview.totalVolume24h, { compact: true })}
            </div>
            <Delta value={overview.volumeChange24h} className="text-xs" />
          </div>
        </div>
      </div>
    </div>
  );
}
