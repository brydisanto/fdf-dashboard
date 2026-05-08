import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import {
  getHolders,
  getPlayer,
  getPoolStats,
  getPriceSeries,
  getTrades,
} from "@/lib/data";
import type { Timeframe, PricePoint } from "@/lib/types";
import { Card, CardHeader, Delta, Pill } from "@/components/ui";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PlayerPriceChart } from "@/components/PlayerPriceChart";
import { HoldersBreakdown } from "@/components/HoldersBreakdown";
import { RecentTrades } from "@/components/RecentTrades";
import { TEAM_NAMES } from "@/lib/data/players";
import { fmtNum, fmtPrice, fmtUsd } from "@/lib/format";

const TFS: Timeframe[] = ["1H", "24H", "7D", "30D", "ALL"];

// Render player pages on demand and revalidate every 30s so we don't
// fan out 70+ API calls at build time, but still serve cached HTML.
export const revalidate = 30;

export default async function PlayerPage(props: PageProps<"/player/[id]">) {
  const { id } = await props.params;

  const player = await getPlayer(id);
  if (!player) notFound();

  const [holders, pool, trades, ...seriesArr] = await Promise.all([
    getHolders(id),
    getPoolStats(id),
    getTrades(id, 30),
    ...TFS.map((tf) => getPriceSeries(id, tf)),
  ]);

  const series = TFS.reduce<Record<Timeframe, PricePoint[]>>((acc, tf, i) => {
    acc[tf] = seriesArr[i];
    return acc;
  }, {} as Record<Timeframe, PricePoint[]>);

  const supplyShare = player.circulatingSupply / player.maxSupply;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to market
      </Link>

      {/* Hero */}
      <div className="mt-3 relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-surface-2)]">
        <div className="absolute inset-0 field-grid opacity-50" />
        <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-7">
          <PlayerAvatar player={player} size="xl" />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <Pill tone="brand">#{player.jerseyNumber} · {player.position}</Pill>
              <Pill tone="muted">{TEAM_NAMES[player.team]} ({player.team})</Pill>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              {player.firstName} {player.lastName}
            </h1>
            <div className="mt-1 text-xs text-[var(--color-text-muted)]">
              Sport.fun NFL player share · 3% buy/sell · 5% swap
            </div>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <div className="tabular text-3xl font-bold leading-none sm:text-4xl">
              {fmtPrice(player.priceUsd)}
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-[var(--color-text-dim)] uppercase tracking-wider">1h</span>
              <Delta value={player.change1h} />
              <span className="text-[var(--color-text-dim)] uppercase tracking-wider">24h</span>
              <Delta value={player.change24h} />
              <span className="text-[var(--color-text-dim)] uppercase tracking-wider">7d</span>
              <Delta value={player.change7d} />
            </div>
          </div>
        </div>
      </div>

      {/* Stat grid */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <StatCell label="Market Cap" value={fmtUsd(player.marketCap, { compact: true })} />
        <StatCell label="24h Volume" value={fmtUsd(player.volume24h, { compact: true })} />
        <StatCell label="Pool TVL"   value={fmtUsd(player.tvl, { compact: true })} />
        <StatCell label="Holders"    value={fmtNum(player.holders)} />
        <StatCell label="Trades 24h" value={fmtNum(player.trades24h)} />
        <StatCell label="Circulating" value={`${fmtNum(player.circulatingSupply, { compact: true })} / ${fmtNum(player.maxSupply, { compact: true })}`}
                  sub={`${(supplyShare * 100).toFixed(1)}% of max`} />
      </div>

      {/* Chart + side panel */}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Price"
            hint={`Current ${fmtPrice(player.priceUsd)} · ATH ${fmtPrice(player.ath)} · ATL ${fmtPrice(player.atl)}`}
          />
          <PlayerPriceChart series={series} defaultTf="24H" />
        </Card>

        <Card>
          <CardHeader title="Pool" hint="On-chain liquidity" />
          {pool ? (
            <ul className="space-y-3 text-sm">
              <PoolRow label="Total Value Locked" value={fmtUsd(pool.tvl, { compact: true })} />
              <PoolRow label="24h Volume"        value={fmtUsd(pool.volume24h, { compact: true })} />
              <PoolRow label="24h Fees"          value={fmtUsd(pool.fees24h, { compact: true })} />
              <PoolRow label="Fee Tier"          value={`${pool.feeTier.toFixed(0)}%`} />
              <PoolRow label="Pool APR"          value={`${pool.apr.toFixed(2)}%`} />
              <PoolRow label="Buy Depth"         value={fmtUsd(pool.depthBuy, { compact: true })} />
              <PoolRow label="Sell Depth"        value={fmtUsd(pool.depthSell, { compact: true })} />
            </ul>
          ) : null}
          <a
            href="https://sport.fun"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-[var(--color-brand)]/40 bg-[var(--color-brand)]/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-brand-soft)] hover:bg-[var(--color-brand)]/20"
          >
            Trade on Sport.fun
            <ExternalLink className="h-3 w-3" />
          </a>
        </Card>
      </div>

      {/* Holders + ATH */}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Holder Distribution" hint="By share of circulating supply" />
          <HoldersBreakdown buckets={holders} totalHolders={player.holders} />
        </Card>
        <Card>
          <CardHeader title="All-Time" hint="Historical extremes for this token" />
          <div className="grid gap-4 sm:grid-cols-2">
            <ExtremeBlock
              label="All-Time High"
              value={fmtPrice(player.ath)}
              date={player.athDate}
              tone="gain"
              delta={((player.priceUsd - player.ath) / player.ath) * 100}
            />
            <ExtremeBlock
              label="All-Time Low"
              value={fmtPrice(player.atl)}
              date={player.atlDate}
              tone="loss"
              delta={((player.priceUsd - player.atl) / player.atl) * 100}
            />
          </div>
        </Card>
      </div>

      {/* Trades */}
      <Card className="mt-5">
        <CardHeader
          title="Recent Trades"
          hint={`Latest ${trades.length} trades for ${player.firstName} ${player.lastName}`}
          right={
            <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
              <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-gain)]" />
              Live
            </span>
          }
        />
        <RecentTrades trades={trades} showPlayer={false} />
      </Card>
    </div>
  );
}

function StatCell({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card className="px-4 py-3.5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-dim)]">{label}</div>
      <div className="mt-1 tabular text-lg font-semibold leading-tight">{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{sub}</div> : null}
    </Card>
  );
}

function PoolRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className="tabular font-medium">{value}</span>
    </li>
  );
}

function ExtremeBlock({
  label, value, date, tone, delta,
}: {
  label: string;
  value: string;
  date: string;
  tone: "gain" | "loss";
  delta: number;
}) {
  const d = new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-dim)]">{label}</div>
      <div className="mt-1 tabular text-2xl font-bold">{value}</div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        <Delta value={delta} />
        <span className="text-[var(--color-text-dim)]">from current</span>
      </div>
      <div className="mt-2 text-xs text-[var(--color-text-muted)]">{d}</div>
      <Pill tone={tone} className="mt-2">{tone === "gain" ? "ATH" : "ATL"}</Pill>
    </div>
  );
}
