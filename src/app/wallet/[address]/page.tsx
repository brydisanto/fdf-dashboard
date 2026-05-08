import Link from "next/link";
import { ArrowLeft, ExternalLink, Fish, Sparkles } from "lucide-react";
import { getWalletPortfolio, getWalletFlow, getWalletFunPosition } from "@/lib/data";
import { ROSTER_BY_TOKEN } from "@/lib/data/roster";
import { Card, CardHeader, Pill } from "@/components/ui";
import { tierLabel } from "@/components/WalletBadge";
import { CompositionPie, type CompositionSlice } from "@/components/CompositionPie";
import { WalletFlowChart } from "@/components/WalletFlowChart";
import { WalletHoldingsTable } from "@/components/WalletHoldingsTable";
import { fmtNum, fmtTimeAgo, fmtUsd, shortAddr } from "@/lib/format";

export const revalidate = 60;

// Soccer slice color — distinct from the NFL brand orange and the
// $FUN green. Picked from the wallet-tier palette so it feels native.
const COLOR_SOCCER = "#7aa6ff";

export default async function WalletPage(props: PageProps<"/wallet/[address]">) {
  const { address } = await props.params;
  const [profile, flow, fun] = await Promise.all([
    getWalletPortfolio(address),
    getWalletFlow(address, 7),
    getWalletFunPosition(address),
  ]);
  const nflHoldings = profile.holdings.filter((h) => ROSTER_BY_TOKEN.has(h.tokenAddress));
  const soccerHoldings = profile.holdings.filter((h) => !ROSTER_BY_TOKEN.has(h.tokenAddress));
  const nflValue = nflHoldings.reduce((a, h) => a + h.balanceValueUsd, 0);
  const soccerValue = soccerHoldings.reduce((a, h) => a + h.balanceValueUsd, 0);
  const totalPortfolioValue = profile.totalValueUsd + fun.valueUsd;
  const nflDominance = totalPortfolioValue > 0 ? (nflValue / totalPortfolioValue) * 100 : 0;

  const slices: CompositionSlice[] = [
    { key: "nfl",    label: "NFL",    value: nflValue,    color: "var(--color-brand)" },
    { key: "soccer", label: "Soccer", value: soccerValue, color: COLOR_SOCCER },
    { key: "fun",    label: "$FUN",   value: fun.valueUsd, color: "var(--color-gain)" },
  ];

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
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--color-surface-2)] ring-1 ring-[var(--color-border)]">
            <Fish className="h-10 w-10 text-[var(--color-brand-soft)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <Pill tone="brand">{tierLabel(profile.tier)}</Pill>
              {profile.isNew ? (
                <Pill tone="gain">
                  <Sparkles className="mr-1 inline h-3 w-3" />
                  New wallet
                </Pill>
              ) : null}
              <Pill tone="muted">{profile.holdingsCount} holdings</Pill>
              {flow.rotationDirection === "into-nfl" ? <Pill tone="gain">Rotating into NFL</Pill> : null}
              {flow.rotationDirection === "out-of-nfl" ? <Pill tone="loss">Rotating out of NFL</Pill> : null}
            </div>
            <h1 className="mt-2 font-mono text-xl font-semibold tracking-tight sm:text-2xl">
              {shortAddr(address, 6, 6)}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-text-muted)]">
              <span>First seen {profile.firstSeenAt ? fmtTimeAgo(profile.firstSeenAt) : "—"}</span>
              <span>·</span>
              <span>Last active {profile.lastActiveAt ? fmtTimeAgo(profile.lastActiveAt) : "—"}</span>
              <a
                href={`https://basescan.org/address/${address}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-[var(--color-text)]"
              >
                Basescan <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          {/* Twin headline values: NFL Portfolio + Total Portfolio. */}
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
            <div className="rounded-lg border border-[var(--color-brand)]/40 bg-[var(--color-brand)]/10 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-brand-soft)]">
                NFL Portfolio Value
              </div>
              <div className="tabular text-3xl font-bold leading-none text-[var(--color-brand-soft)] sm:text-[34px]">
                {fmtUsd(nflValue, { compact: true })}
              </div>
              <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                {nflDominance.toFixed(1)}% of total · {nflHoldings.length} positions
              </div>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-dim)]">
                Total Portfolio
              </div>
              <div className="tabular text-3xl font-bold leading-none sm:text-[34px]">
                {fmtUsd(totalPortfolioValue, { compact: true })}
              </div>
              <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                NFL + Soccer + $FUN
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Portfolio Composition */}
      <Card className="mt-5">
        <CardHeader
          title="Portfolio Composition"
          hint="Where this wallet's value sits across NFL player shares, Soccer shares, and $FUN"
        />
        <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
          <div className="flex justify-center">
            <CompositionPie slices={slices} total={totalPortfolioValue} size={220} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <SliceTile
              label="NFL"
              value={fmtUsd(nflValue, { compact: true })}
              pct={pct(nflValue, totalPortfolioValue)}
              sub={`${nflHoldings.length} player position${nflHoldings.length === 1 ? "" : "s"}`}
              color="var(--color-brand)"
            />
            <SliceTile
              label="Soccer"
              value={fmtUsd(soccerValue, { compact: true })}
              pct={pct(soccerValue, totalPortfolioValue)}
              sub={`${soccerHoldings.length} non-NFL position${soccerHoldings.length === 1 ? "" : "s"}`}
              color={COLOR_SOCCER}
            />
            <SliceTile
              label="$FUN"
              value={fmtUsd(fun.valueUsd, { compact: true })}
              pct={pct(fun.valueUsd, totalPortfolioValue)}
              sub={`${fmtNum(fun.balance, { compact: true, digits: 2 })} @ ${fmtUsd(fun.priceUsd, { digits: 4 })}`}
              color="var(--color-gain)"
              extra={
                <span className={fun.change24h >= 0 ? "text-[var(--color-gain)]" : "text-[var(--color-loss)]"}>
                  {fun.change24h >= 0 ? "+" : ""}{fun.change24h.toFixed(1)}% 24h
                </span>
              }
            />
          </div>
        </div>
      </Card>

      {/* 7d flow stats */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <FlowStat
          label="7d into NFL"
          value={fmtUsd(flow.nflInUsd, { compact: true })}
          sub={`${flow.totalTrades} trades total · 7d`}
          tone="gain"
        />
        <FlowStat
          label="7d out of NFL"
          value={fmtUsd(flow.nflOutUsd, { compact: true })}
          sub="Sells from NFL holdings"
          tone="loss"
        />
        <FlowStat
          label="7d Net NFL Shift"
          value={`${flow.nflNetUsd >= 0 ? "+" : ""}${fmtUsd(flow.nflNetUsd, { compact: true })}`}
          sub={
            flow.rotationDirection === "into-nfl"
              ? "Rotating Gold from Soccer → NFL"
              : flow.rotationDirection === "out-of-nfl"
                ? "Rotating Gold from NFL → Soccer"
                : "No clear rotation pattern"
          }
          tone={flow.nflNetUsd >= 0 ? "gain" : "loss"}
        />
      </div>

      {/* 7d flow chart */}
      <Card className="mt-5">
        <CardHeader
          title="7-Day Holding Flow · NFL vs Soccer"
          hint="Daily net dollar shift between NFL and Soccer player shares (buys − sells)"
          right={
            <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-sm bg-[var(--color-brand)]" /> NFL
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ background: COLOR_SOCCER }}
                /> Soccer
              </span>
            </div>
          }
        />
        <WalletFlowChart flow={flow} soccerColor={COLOR_SOCCER} />
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <FootStat label="NFL bought" value={fmtUsd(flow.nflInUsd, { compact: true })} />
          <FootStat label="NFL sold" value={fmtUsd(flow.nflOutUsd, { compact: true })} />
          <FootStat label="Soccer bought" value={fmtUsd(flow.otherInUsd, { compact: true })} />
          <FootStat label="Soccer sold" value={fmtUsd(flow.otherOutUsd, { compact: true })} />
        </div>
      </Card>

      {/* NFL holdings */}
      <Card className="mt-5">
        <CardHeader
          title="NFL Holdings"
          hint={`${nflHoldings.length} of ${profile.holdingsCount} positions · sortable & paginated`}
          right={<Pill tone="brand">{fmtUsd(nflValue, { compact: true })}</Pill>}
        />
        <WalletHoldingsTable rows={nflHoldings} variant="nfl" />
      </Card>

      {/* Soccer holdings */}
      <Card className="mt-5">
        <CardHeader
          title="Soccer Holdings"
          hint={`${soccerHoldings.length} non-NFL positions on Sport.fun`}
          right={<Pill tone="muted">{fmtUsd(soccerValue, { compact: true })}</Pill>}
        />
        <WalletHoldingsTable rows={soccerHoldings} variant="other" />
      </Card>
    </div>
  );
}

function pct(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

function SliceTile({
  label, value, pct, sub, color, extra,
}: {
  label: string;
  value: string;
  pct: number;
  sub: string;
  color: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3.5">
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} />
        <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-dim)]">{label}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="tabular text-lg font-semibold leading-tight">{value}</div>
        <div className="text-[11px] text-[var(--color-text-muted)]">{pct.toFixed(1)}%</div>
      </div>
      <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">
        {sub}
        {extra ? <> · {extra}</> : null}
      </div>
    </div>
  );
}

function FlowStat({
  label, value, sub, tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "gain" | "loss";
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3.5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-dim)]">{label}</div>
      <div
        className={
          tone === "gain"
            ? "mt-1 tabular text-lg font-semibold text-[var(--color-gain)]"
            : "mt-1 tabular text-lg font-semibold text-[var(--color-loss)]"
        }
      >
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{sub}</div>
    </div>
  );
}

function FootStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-dim)]">{label}</div>
      <div className="mt-0.5 tabular text-sm font-semibold">{value}</div>
    </div>
  );
}
