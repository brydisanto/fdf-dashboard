import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, ExternalLink } from "lucide-react";
import {
  getHolders,
  getPlayer,
  getPoolStats,
  getPriceSeries,
  getTopHolders,
  getTrades,
  getWalletSnapshots,
  type WalletSnapshot,
} from "@/lib/data";
import { Card, CardHeader, Delta, Pill } from "@/components/ui";
import { PlayerPriceChart } from "@/components/PlayerPriceChart";
import { HoldersBreakdown } from "@/components/HoldersBreakdown";
import { LargestHoldersTable } from "@/components/LargestHoldersTable";
import { PlayerStatusBadge } from "@/components/PlayerStatusBadge";
import { RecentTrades } from "@/components/RecentTrades";
import { TEAM_COLORS, TEAM_NAMES } from "@/lib/data/players";
import { fmtNum, fmtPrice, fmtUsd } from "@/lib/format";

export const revalidate = 30;

export default async function PlayerPage(props: PageProps<"/player/[id]">) {
  const { id } = await props.params;

  // Only what the hero / chart / pool stats need on the critical path.
  // Recent Trades + Holders sections stream in below via Suspense so
  // their fetches don't gate the first paint.
  const [player, initialSeries] = await Promise.all([
    getPlayer(id),
    getPriceSeries(id, "7D"),
  ]);
  if (!player) notFound();
  const pool = await getPoolStats(id, player); // pure math from player, instant

  const supplyShare = player.circulatingSupply / player.maxSupply;
  const activeShare = player.activeSupply / Math.max(1, player.maxSupply);
  const teamColor = TEAM_COLORS[player.team] ?? "var(--accent)";
  const initials = `${player.firstName[0] ?? ""}${player.lastName[0] ?? ""}`;
  const fullTeam = TEAM_NAMES[player.team] ?? player.team;
  const teamColorVar = { ["--team-color" as string]: teamColor } as React.CSSProperties;

  return (
    <div className="mx-auto max-w-[var(--max-w)] px-5 sm:px-8 py-6 sm:py-8">
      <Breadcrumb
        items={[
          { label: "Market", href: "/" },
          { label: player.position, href: `/#players` },
          { label: `${player.firstName} ${player.lastName}` },
        ]}
      />

      {/* Hero */}
      <div className="detail-hero player-hero-stripe relative mt-3" style={teamColorVar}>
        <div className="detail-hero-grid" />
        <div className="player-hero-glow" aria-hidden />
        <div className="relative grid items-center gap-8 p-7 sm:grid-cols-[auto_1fr_auto] sm:p-10">
          {/* Avatar block */}
          <div className="relative">
            <div
              className="flex items-center justify-center rounded-full bg-[var(--color-press)]"
              style={{
                width: 132,
                height: 132,
                boxShadow: `inset 0 0 0 4px ${teamColor}`,
              }}
            >
              <span
                className="text-[var(--color-text)]"
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 900,
                  fontSize: 56,
                  letterSpacing: "0.04em",
                }}
              >
                {initials}
              </span>
            </div>
            {/* Jersey badge */}
            <div
              className="absolute -right-2 -top-2 flex items-center justify-center rounded-full text-white"
              style={{
                width: 44,
                height: 44,
                background: teamColor,
                boxShadow: "0 0 0 3px var(--color-bench)",
                fontFamily: "var(--font-display)",
                fontWeight: 900,
                fontSize: 20,
              }}
            >
              {player.jerseyNumber}
            </div>
          </div>

          {/* Meta column */}
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center justify-center rounded-[var(--r-4)]"
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 900,
                  fontSize: 11,
                  letterSpacing: "0.06em",
                  width: 38,
                  height: 22,
                  color: "#fff",
                  textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                  background: positionTone(player.position),
                }}
              >
                {player.position}
              </span>
              <Pill tone="muted">{fullTeam}</Pill>
              <Pill tone="info">{player.team}</Pill>
            </div>
            <h1
              className="m-0 flex flex-wrap items-center gap-3"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 900,
                fontSize: "clamp(40px, 5vw, 64px)",
                lineHeight: 0.95,
                letterSpacing: "-0.005em",
                textTransform: "uppercase",
              }}
            >
              <span>{player.firstName} {player.lastName}</span>
              {/* Hero size — bump the icon up so it doesn't disappear
                  next to a 64px display headline. */}
              <PlayerStatusBadge playerId={player.id} size={28} />
            </h1>
          </div>

          {/* Right column — price + 1h/24h/7d deltas */}
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <div className="mono-eyebrow" style={{ fontSize: 10.5 }}>
              Current Price
            </div>
            <div
              className="leading-none"
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                fontSize: "clamp(40px, 5vw, 56px)",
                letterSpacing: "-0.04em",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmtPrice(player.priceUsd)}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <DeltaWithLabel label="1h" value={player.change1h} />
              <DeltaWithLabel label="24h" value={player.change24h} />
              <DeltaWithLabel label="7d" value={player.change7d} />
            </div>
          </div>
        </div>
      </div>

      {/* Stat strip — 6-cell hairline grid */}
      <div className="stat-strip mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatCell label="Market Cap" value={fmtUsd(player.marketCap, { compact: true })} sub="Price × supply" />
        <StatCell
          label="24h Volume"
          value={fmtUsd(Math.round(player.volume24h), { compact: true })}
          sub={`${fmtNum(player.trades24h)} trades`}
        />
        <StatCell label="Pool TVL" value={fmtUsd(player.tvl, { compact: true })} sub="Sport.fun AMM" />
        <StatCell label="Holders" value={fmtNum(player.holders, { compact: true })} sub="Distinct wallets" />
        <StatCell
          label="Active Shares"
          value={fmtNum(player.activeSupply, { compact: true })}
          sub={`${(activeShare * 100).toFixed(1)}% of max`}
        />
        <StatCell
          label="Circulating"
          value={fmtNum(player.circulatingSupply, { compact: true })}
          sub={`${(supplyShare * 100).toFixed(1)}% of max`}
        />
      </div>

      {/* Chart + pool side panel */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card variant="feature">
          <CardHeader
            title="Price"
            hint={`Current ${fmtPrice(player.priceUsd)} · ATH ${fmtPrice(player.ath)} · ATL ${fmtPrice(player.atl)}`}
            right={
              <div className="flex items-baseline gap-3">
                <span
                  className="leading-none"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                    fontSize: 22,
                    letterSpacing: "-0.03em",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {fmtPrice(player.priceUsd)}
                </span>
                <Delta value={player.change24h} />
              </div>
            }
          />
          <PlayerPriceChart
            playerId={id}
            initialSeries={initialSeries}
          />
        </Card>

        <Card>
          <CardHeader title="Pool" hint="On-chain liquidity" />
          {pool ? (
            <ul className="flex flex-col">
              <PoolRow label="Total Value Locked" value={fmtUsd(pool.tvl, { compact: true })} />
              <PoolRow label="24h Volume" value={fmtUsd(pool.volume24h, { compact: true })} />
              <PoolRow label="24h Fees" value={fmtUsd(pool.fees24h, { compact: true })} />
              <PoolRow label="Fee Tier" value={`${pool.feeTier.toFixed(0)}%`} />
              <PoolRow label="Pool APR" value={`${pool.apr.toFixed(2)}%`} />
              <PoolRow label="Buy Depth" value={fmtUsd(pool.depthBuy, { compact: true })} />
              <PoolRow label="Sell Depth" value={fmtUsd(pool.depthSell, { compact: true })} />
            </ul>
          ) : null}
          <a
            href="https://sport.fun"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 rounded-[var(--r-4)] border border-[var(--accent-line)] bg-[var(--accent-tint)] px-3 py-2 text-[var(--accent-soft)] transition-colors hover:bg-[color-mix(in_oklab,var(--accent)_20%,transparent)]"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Trade on Sport.fun <ExternalLink className="h-3 w-3" />
          </a>
        </Card>
      </div>

      {/* Holder Distribution — streams in after fetchAllHolders resolves. */}
      <Suspense fallback={<HolderDistributionSkeleton totalHolders={player.holders} />}>
        <HolderDistributionSection playerId={id} totalHolders={player.holders} />
      </Suspense>

      {/* Recent Trades — streams in via Suspense so the trade index
          read + wallet badge lookups don't gate the chart render. */}
      <Suspense fallback={<RecentTradesSkeleton playerName={`${player.firstName} ${player.lastName}`} />}>
        <RecentTradesSection playerId={id} playerName={`${player.firstName} ${player.lastName}`} />
      </Suspense>

      {/* Largest Holders — streams in after fetchAllHolders resolves. */}
      <Suspense
        fallback={
          <LargestHoldersSkeleton totalHolders={player.holders} />
        }
      >
        <LargestHoldersSection
          playerId={id}
          totalHolders={player.holders}
          priceUsd={player.priceUsd}
        />
      </Suspense>
    </div>
  );
}

async function HolderDistributionSection({
  playerId,
  totalHolders,
}: {
  playerId: string;
  totalHolders: number;
}) {
  const holders = await getHolders(playerId);
  return (
    <Card className="mt-4">
      <CardHeader title="Holder Distribution" hint="By share of circulating supply" />
      <HoldersBreakdown buckets={holders} totalHolders={totalHolders} />
    </Card>
  );
}

function HolderDistributionSkeleton({ totalHolders }: { totalHolders: number }) {
  return (
    <Card className="mt-4">
      <CardHeader title="Holder Distribution" hint="By share of circulating supply" />
      <div className="flex items-center justify-between py-6 text-[12px] text-[var(--color-text-dim)]">
        <span>Loading holder breakdown…</span>
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
          {fmtNum(totalHolders)} TOTAL
        </span>
      </div>
    </Card>
  );
}

async function LargestHoldersSection({
  playerId,
  totalHolders,
  priceUsd,
}: {
  playerId: string;
  totalHolders: number;
  priceUsd: number;
}) {
  const topHolders = await getTopHolders(playerId, 25);
  const holderAddrs = topHolders.map((h) => h.address);
  const snapshotMap = await getWalletSnapshots(holderAddrs);
  const wallets: Record<string, WalletSnapshot> = {};
  for (const [k, v] of snapshotMap) wallets[k] = v;

  return (
    <div className="mt-4">
      <SectionHead
        title="Largest Holders"
        hint={`Top ${topHolders.length} wallets by share of circulating supply · AMM router excluded`}
        right={<Pill tone="muted">{fmtNum(totalHolders)} TOTAL</Pill>}
      />
      <Card variant="press" padded={false}>
        <LargestHoldersTable
          holders={topHolders}
          wallets={wallets}
          priceUsd={priceUsd}
        />
      </Card>
    </div>
  );
}

function LargestHoldersSkeleton({ totalHolders }: { totalHolders: number }) {
  return (
    <div className="mt-4">
      <SectionHead
        title="Largest Holders"
        hint="Loading holder list…"
        right={<Pill tone="muted">{fmtNum(totalHolders)} TOTAL</Pill>}
      />
      <Card variant="press" padded={false}>
        <div className="px-5 py-8 text-center text-[12px] text-[var(--color-text-dim)]">
          Loading holders…
        </div>
      </Card>
    </div>
  );
}

async function RecentTradesSection({
  playerId,
  playerName,
}: {
  playerId: string;
  playerName: string;
}) {
  const trades = await getTrades(playerId, 30);
  const tradeAddrs = Array.from(new Set(trades.map((t) => t.wallet))).slice(0, 50);
  const snapshotMap = await getWalletSnapshots(tradeAddrs);
  const wallets: Record<string, WalletSnapshot> = {};
  for (const [k, v] of snapshotMap) wallets[k] = v;

  return (
    <div className="mt-4">
      <SectionHead
        title="Recent Trades"
        hint={`Latest ${trades.length} trades for ${playerName}`}
        right={
          <span className="mono-eyebrow inline-flex items-center gap-2" style={{ fontSize: 10 }}>
            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-turf)]" />
            LIVE
          </span>
        }
      />
      <Card variant="press" padded={false}>
        <RecentTrades trades={trades} wallets={wallets} showPlayer={false} />
      </Card>
    </div>
  );
}

function RecentTradesSkeleton({ playerName }: { playerName: string }) {
  return (
    <div className="mt-4">
      <SectionHead
        title="Recent Trades"
        hint={`Loading trade history for ${playerName}…`}
        right={
          <span className="mono-eyebrow inline-flex items-center gap-2" style={{ fontSize: 10 }}>
            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-turf)]" />
            LIVE
          </span>
        }
      />
      <Card variant="press" padded={false}>
        <div className="px-5 py-8 text-center text-[12px] text-[var(--color-text-dim)]">
          Loading trades…
        </div>
      </Card>
    </div>
  );
}

function SectionHead({ title, hint, right }: { title: string; hint?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: 22,
            letterSpacing: "0.02em",
            textTransform: "uppercase",
            lineHeight: 1.1,
          }}
        >
          {title}
        </h2>
        {hint ? <p className="mt-1 text-[12px] text-[var(--color-text-dim)]">{hint}</p> : null}
      </div>
      {right}
    </div>
  );
}

function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav
      className="inline-flex items-center gap-1.5 rounded-[var(--r-4)] border border-[var(--color-line)] bg-[var(--color-bench)] px-3 py-1.5"
      aria-label="Breadcrumb"
    >
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 ? <ChevronRight className="h-3 w-3 text-[var(--color-text-dim)]" strokeWidth={1.5} /> : i === 0 ? <ArrowLeft className="h-3 w-3 text-[var(--color-text-dim)]" strokeWidth={1.5} /> : null}
          {it.href ? (
            <Link
              href={it.href}
              className="mono-eyebrow hover:text-[var(--color-text)]"
              style={{ fontSize: 10 }}
            >
              {it.label}
            </Link>
          ) : (
            <span className="mono-eyebrow text-[var(--color-text)]" style={{ fontSize: 10 }}>
              {it.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

// Position-pill background — distinct hue per position. Mirrors the
// home-page seg-tone the design system specs.
function positionTone(pos: string): string {
  switch (pos) {
    case "QB": return "oklch(0.55 0.18 282)";
    case "RB": return "oklch(0.55 0.18 156)";
    case "WR": return "oklch(0.55 0.18 56)";
    case "TE": return "oklch(0.55 0.18 22)";
    default:   return "var(--color-line-strong)";
  }
}

function DeltaWithLabel({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span
        className="text-[var(--color-text-dim)]"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <Delta value={value} />
    </span>
  );
}

function StatCell({
  label,
  value,
  sub,
  delta,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  delta?: number;
}) {
  return (
    <div className="stat-cell">
      <div className="flex items-center gap-2">
        <span className="block h-px w-4 bg-[var(--accent)]" />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
          }}
        >
          {label}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        {value !== null ? (
          <span
            className="leading-none"
            style={{
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              fontSize: 24,
              letterSpacing: "-0.03em",
              color: "var(--color-text)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {value}
          </span>
        ) : null}
        {delta !== undefined ? <Delta value={delta} className="text-base" /> : null}
      </div>
      {sub ? (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            letterSpacing: "0.06em",
            color: "var(--color-text-dim)",
            textTransform: "uppercase",
          }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function PoolRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <li
      className="flex items-center justify-between border-b border-dashed border-[color-mix(in_oklab,var(--color-line)_60%,transparent)] py-2 last:border-b-0"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11.5,
      }}
    >
      <span
        className="text-[var(--color-text-dim)]"
        style={{ letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600 }}
      >
        {label}
      </span>
      <span
        className="text-[var(--color-text)]"
        style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </span>
    </li>
  );
}

