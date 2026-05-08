import Link from "next/link";
import { ArrowLeft, ExternalLink, Fish, Sparkles } from "lucide-react";
import { getWalletPortfolio, getWalletFlow, getWalletFunPosition } from "@/lib/data";
import { ROSTER_BY_TOKEN } from "@/lib/data/roster";
import { Card, CardHeader, Pill } from "@/components/ui";
import { tierLabel } from "@/components/WalletBadge";
import { WalletFlowChart } from "@/components/WalletFlowChart";
import { WalletHoldingsTable } from "@/components/WalletHoldingsTable";
import { fmtNum, fmtTimeAgo, fmtUsd, shortAddr } from "@/lib/format";

export const revalidate = 60;

export default async function WalletPage(props: PageProps<"/wallet/[address]">) {
  const { address } = await props.params;
  const [profile, flow, fun] = await Promise.all([
    getWalletPortfolio(address),
    getWalletFlow(address, 7),
    getWalletFunPosition(address),
  ]);
  const nflHoldings = profile.holdings.filter((h) => ROSTER_BY_TOKEN.has(h.tokenAddress));
  const otherHoldings = profile.holdings.filter((h) => !ROSTER_BY_TOKEN.has(h.tokenAddress));
  const nflValue = nflHoldings.reduce((a, h) => a + h.balanceValueUsd, 0);
  const otherValue = otherHoldings.reduce((a, h) => a + h.balanceValueUsd, 0);
  const nflDominance = profile.totalValueUsd > 0 ? (nflValue / profile.totalValueUsd) * 100 : 0;

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
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-dim)]">Portfolio Value</div>
            <div className="tabular text-3xl font-bold leading-none sm:text-4xl">
              {fmtUsd(profile.totalValueUsd + fun.valueUsd, { compact: true })}
            </div>
            <div className="text-xs text-[var(--color-text-muted)]">
              {fmtUsd(nflValue, { compact: true })} NFL · {fmtUsd(otherValue, { compact: true })} other
              {fun.valueUsd > 0 ? ` · ${fmtUsd(fun.valueUsd, { compact: true })} $FUN` : ""}
            </div>
          </div>
        </div>

        {/* Composition + flow stats strip */}
        <div className="relative grid gap-3 border-t border-[var(--color-border)] p-5 sm:grid-cols-5 sm:p-7">
          <DominanceTile
            label="NFL Dominance"
            pct={nflDominance}
            sub={`${fmtUsd(nflValue, { compact: true })} of ${fmtUsd(profile.totalValueUsd, { compact: true })}`}
          />
          <FunTile fun={fun} />
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
                ? "Rotating Gold from other sports → NFL"
                : flow.rotationDirection === "out-of-nfl"
                  ? "Rotating Gold from NFL → other sports"
                  : "No clear rotation pattern"
            }
            tone={flow.nflNetUsd >= 0 ? "gain" : "loss"}
          />
        </div>
      </div>

      {/* 7d flow chart */}
      <Card className="mt-5">
        <CardHeader
          title="7-Day Holding Flow · NFL vs Other"
          hint="Daily net dollar shift between NFL and non-NFL player shares (buys − sells)"
          right={
            <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-sm bg-[var(--color-brand)]" /> NFL
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-sm bg-[var(--color-text-muted)]" /> Other
              </span>
            </div>
          }
        />
        <WalletFlowChart flow={flow} />
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <FootStat label="NFL bought" value={fmtUsd(flow.nflInUsd, { compact: true })} />
          <FootStat label="NFL sold" value={fmtUsd(flow.nflOutUsd, { compact: true })} />
          <FootStat label="Other bought" value={fmtUsd(flow.otherInUsd, { compact: true })} />
          <FootStat label="Other sold" value={fmtUsd(flow.otherOutUsd, { compact: true })} />
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

      {/* Other holdings */}
      <Card className="mt-5">
        <CardHeader
          title="Other Sport.fun Holdings"
          hint={`${otherHoldings.length} non-NFL positions (soccer / other)`}
          right={<Pill tone="muted">{fmtUsd(otherValue, { compact: true })}</Pill>}
        />
        <WalletHoldingsTable rows={otherHoldings} variant="other" />
      </Card>
    </div>
  );
}

function FunTile({ fun }: { fun: { balance: number; priceUsd: number; valueUsd: number; change24h: number } }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3.5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-dim)]">$FUN Balance</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="tabular text-lg font-semibold leading-tight">
          {fmtNum(fun.balance, { compact: true, digits: 2 })}
        </div>
        <span className="text-[11px] text-[var(--color-text-muted)]">{fmtUsd(fun.valueUsd, { compact: true })}</span>
      </div>
      <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
        @ {fmtUsd(fun.priceUsd, { digits: 4 })}
        <span className={fun.change24h >= 0 ? "ml-1 text-[var(--color-gain)]" : "ml-1 text-[var(--color-loss)]"}>
          {fun.change24h >= 0 ? "+" : ""}{fun.change24h.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function DominanceTile({ label, pct, sub }: { label: string; pct: number; sub: string }) {
  // Tone the bar: more NFL-skewed → brand orange; balanced → muted.
  const fill = Math.min(100, Math.max(0, pct));
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3.5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-dim)]">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="tabular text-lg font-semibold leading-tight">{pct.toFixed(1)}%</div>
        <div className="text-[11px] text-[var(--color-text-muted)]">{sub}</div>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-sm bg-[var(--color-border)]">
        <div
          className="h-full bg-[var(--color-brand)]"
          style={{ width: `${fill}%` }}
        />
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

void fmtNum; // re-exported by some helpers; suppress unused-import lint if any
