import { Suspense, cache } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getNewWallets } from "@/lib/data/new-wallets";
import { Card, Pill } from "@/components/ui";
import { NewWalletsTable } from "@/components/NewWalletsTable";
import { NewWalletsActivityChart, NewWalletsJoinsChart, NewWalletsNetFlowChart } from "@/components/LazyCharts";
import type { NewWalletCohort } from "@/lib/data/new-wallets";
import { Sk, SkBlock } from "@/components/PageSkeleton";
import { fmtNum, fmtUsd } from "@/lib/format";

export const metadata = {
  title: "New Wallets · FDF Box Score",
  description:
    "New wallets on Sport.fun's NFL market: daily joins and all-time growth, what new wallets trade and their share of volume, weekly cohort retention, and every first trade.",
};

// Reads the trade index plus the live on-chain tail, so it has to
// render per request like the homepage feed.
export const dynamic = "force-dynamic";

export default function NewWalletsPage() {
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

      <div
        className="mt-3 relative rounded-[var(--r-14)] border border-[var(--color-line)]"
        style={{ background: "linear-gradient(135deg, var(--color-bench) 0%, var(--color-press) 100%)" }}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[var(--r-14)]">
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                "linear-gradient(to right, color-mix(in oklab, var(--color-text) 4%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--color-text) 4%, transparent) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
          <div
            aria-hidden
            className="absolute"
            style={{
              right: -100,
              top: -100,
              width: 480,
              height: 480,
              background: "radial-gradient(circle, color-mix(in oklab, var(--accent) 15%, transparent), transparent 70%)",
            }}
          />
        </div>
        <div
          className="relative flex flex-col gap-5 sm:gap-6"
          style={{ padding: "clamp(20px, 4vw, 32px) clamp(18px, 4vw, 32px) clamp(18px, 4vw, 28px)" }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="brand">Wallet Growth</Pill>
            <Suspense fallback={<Sk w={150} h={22} className="rounded-full" />}>
              <HeadlinePill />
            </Suspense>
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
            New Wallets
          </h1>
          <p className="m-0 max-w-[80ch] text-[var(--color-text-muted)]" style={{ fontSize: "15px" }}>
            Joins, activity, and trends for wallets making their first-ever NFL trade.
            First-seen dates come from a full history of the player-share contract, so a
            wallet only counts as new once.
          </p>
        </div>
      </div>

      <Suspense fallback={<BodySkeleton />}>
        <Body />
      </Suspense>
    </div>
  );
}

const load = cache(() => getNewWallets());

async function HeadlinePill() {
  const r = await load();
  return (
    <Pill tone="info">
      {fmtNum(r.new7d)} new this week · {fmtNum(r.totalWalletsEver)} all time
    </Pill>
  );
}

function trend(cur: number, prior: number, label: string): string {
  if (prior <= 0) return cur > 0 ? `up from 0 ${label}` : `no change ${label}`;
  const pct = Math.round(((cur - prior) / prior) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}% ${label}`;
}

async function Body() {
  const r = await load();
  const retention = r.new7d > 0 ? Math.round((r.stillHolding7d / r.new7d) * 100) : 0;
  const share7d = r.marketVolume7d > 0 ? (r.cohortVolume7d / r.marketVolume7d) * 100 : 0;
  const avgFirst7d = r.new7d > 0 ? r.firstBuyUsd7d / r.new7d : 0;

  return (
    <>
      {/* Joins */}
      <div className="stat-strip mt-4 grid grid-cols-2 md:grid-cols-4">
        <StatCell label="Joined · 24h" value={fmtNum(r.new24h)} sub={trend(r.new24h, r.prior24h, "vs prior 24h")} />
        <StatCell label="Joined · 7d" value={fmtNum(r.new7d)} sub={trend(r.new7d, r.prior7d, "vs prior 7d")} />
        <StatCell label="Joined · 30d" value={fmtNum(r.new30d)} sub={trend(r.new30d, r.prior30d, "vs prior 30d")} />
        <StatCell label="All-Time Wallets" value={fmtNum(r.totalWalletsEver)} sub="Ever traded an NFL token" />
      </div>

      <div className="mt-4">
        <SectionHead
          title="Joins · New Wallets Per Day"
          hint="Bars: first-ever NFL trade by UTC day, accent for the current week · Line: all-time wallet count"
          right={!r.registrySeeded ? <Pill tone="warn">Registry not seeded yet</Pill> : <Pill tone="muted">Last 30 days</Pill>}
        />
        <Card variant="press" padded={false}>
          <div className="p-5">
            <NewWalletsJoinsChart daily={r.daily} />
          </div>
        </Card>
      </div>

      {/* Activity */}
      <div className="stat-strip mt-6 grid grid-cols-2 md:grid-cols-4">
        <StatCell label="Active New · 7d" value={fmtNum(r.activeNew7d)} sub={`of ${fmtNum(r.new30d)} joined in 30d`} />
        <StatCell label="New-Wallet Volume · 7d" value={fmtUsd(r.cohortVolume7d, { compact: true })} sub={`${share7d.toFixed(1)}% of all NFL volume`} />
        <StatCell label="Avg First Trade · 7d" value={fmtUsd(avgFirst7d, { digits: 0 })} sub={`${fmtUsd(r.firstBuyUsd7d, { compact: true })} committed on first buys`} />
        <StatCell label="Still Holding · 7d" value={`${retention}%`} sub={`${fmtNum(r.stillHolding7d)} of ${fmtNum(r.new7d)} keep a position`} />
      </div>

      <div className="mt-4">
        <SectionHead
          title="Activity · What New Wallets Are Doing"
          hint="Bars: daily volume from wallets that joined in the last 30 days · Line: their share of all NFL volume that day"
          right={<Pill tone="muted">30-day cohort</Pill>}
        />
        <Card variant="press" padded={false}>
          <div className="p-5">
            <NewWalletsActivityChart daily={r.daily} />
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <SectionHead
          title="Net Buy / Sell From New Wallets"
          hint="Bars: daily buys (up) and sells (down) by the 30-day cohort · Line: running net over the window, right axis"
          right={
            <Pill tone={r.cohortNet7d >= 0 ? "gain" : "loss"}>
              {r.cohortNet7d >= 0 ? "Net buying" : "Net selling"} · 7d
            </Pill>
          }
        />
        <Card variant="press" padded={false}>
          <div className="p-5">
            <div className="mb-4 grid grid-cols-3 gap-3">
              <FlowTile label="Buys · 7d" value={fmtUsd(r.cohortBuy7d, { compact: true })} tone="gain" />
              <FlowTile label="Sells · 7d" value={fmtUsd(r.cohortSell7d, { compact: true })} tone="loss" />
              <FlowTile
                label="Net · 7d"
                value={`${r.cohortNet7d >= 0 ? "+" : "−"}${fmtUsd(Math.abs(r.cohortNet7d), { compact: true })}`}
                sub={`prior 7d ${r.cohortNetPrior7d >= 0 ? "+" : "−"}${fmtUsd(Math.abs(r.cohortNetPrior7d), { compact: true })}`}
                tone={r.cohortNet7d >= 0 ? "gain" : "loss"}
              />
            </div>
            <NewWalletsNetFlowChart daily={r.daily} />
          </div>
        </Card>
      </div>

      {/* Trends */}
      <div className="mt-6">
        <SectionHead
          title="Trends · Weekly Cohorts"
          hint="Each wallet belongs to the week it joined · retention and flow measured as of now"
          right={<Pill tone="muted">4 weeks</Pill>}
        />
        <Card variant="press" padded={false}>
          <CohortTable cohorts={r.cohorts} />
        </Card>
      </div>

      <div className="mt-6">
        <SectionHead
          title="Newest Wallets"
          hint="What they bought first, how much they have moved since, and what they still hold · click a row to drill in"
          right={<Pill tone="muted">{fmtNum(r.new30d)} in 30d</Pill>}
        />
        <Card variant="press" padded={false}>
          <NewWalletsTable rows={r.rows} now={r.generatedAt} />
        </Card>
      </div>
    </>
  );
}

function FlowTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: "gain" | "loss" }) {
  const color = tone === "gain" ? "var(--color-turf)" : "var(--color-penalty)";
  return (
    <div
      className="rounded-[var(--r-8)] border border-[var(--color-line)] px-4 py-3"
      style={{ background: `color-mix(in oklab, ${color} 6%, transparent)` }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
        {label}
      </div>
      <div className="mt-1" style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {sub ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-text-dim)" }}>{sub}</div>
      ) : null}
    </div>
  );
}

const TH: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--color-text-dim)",
  padding: "12px 12px",
  whiteSpace: "nowrap",
};
const TD: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
  fontSize: 12.5,
  padding: "var(--row-pad-y) 12px",
  textAlign: "center",
  whiteSpace: "nowrap",
};

function CohortTable({ cohorts }: { cohorts: NewWalletCohort[] }) {
  const fmtRange = (from: number, to: number) => {
    const f = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${f(from)} – ${f(to - 1)}`;
  };
  const usd = (n: number) => (Math.abs(n) >= 1000 ? fmtUsd(n, { compact: true }) : fmtUsd(n, { digits: 0 }));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-[13px]">
        <thead style={{ background: "color-mix(in oklab, var(--color-press) 50%, transparent)" }}>
          <tr className="border-b border-[var(--color-line)]">
            <th style={{ ...TH, textAlign: "left", paddingLeft: 20 }}>Cohort</th>
            <th style={{ ...TH, textAlign: "center" }}>Joined</th>
            <th style={{ ...TH, textAlign: "center" }}>Still Holding</th>
            <th style={{ ...TH, textAlign: "center" }}>Avg First Trade</th>
            <th style={{ ...TH, textAlign: "center" }}>Trades / Wallet</th>
            <th style={{ ...TH, textAlign: "center" }}>Volume Since</th>
            <th style={{ ...TH, textAlign: "center", paddingRight: 20 }}>Net Flow</th>
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c, i) => {
            const pct = c.joined > 0 ? Math.round((c.stillHolding / c.joined) * 100) : 0;
            return (
              <tr key={c.label} style={{ borderBottom: "1px solid var(--color-line)" }}>
                <td style={{ ...TD, textAlign: "left", paddingLeft: 20 }}>
                  <span style={{ color: i === 0 ? "var(--accent-soft)" : "var(--color-text)", fontWeight: 700 }}>{c.label}</span>
                  <span style={{ color: "var(--color-text-dim)", fontSize: 10.5, marginLeft: 8 }}>{fmtRange(c.from, c.to)}</span>
                </td>
                <td style={{ ...TD, color: "var(--color-text)", fontWeight: 700 }}>{fmtNum(c.joined)}</td>
                <td style={TD}>
                  <span style={{ color: "var(--color-text)" }}>{pct}%</span>
                  <span style={{ color: "var(--color-text-dim)", fontSize: 10.5 }}> · {fmtNum(c.stillHolding)}</span>
                </td>
                <td style={TD}>{usd(c.avgFirstUsd)}</td>
                <td style={TD}>{c.tradesPerWallet.toFixed(1)}</td>
                <td style={TD}>{usd(c.volumeUsd)}</td>
                <td style={{ ...TD, paddingRight: 20, color: c.netUsd >= 0 ? "var(--color-turf)" : "var(--color-penalty)", fontWeight: 600 }}>
                  {c.netUsd >= 0 ? "+" : "−"}{usd(Math.abs(c.netUsd))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BodySkeleton() {
  return (
    <>
      <div
        className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-[1px] rounded-[var(--r-14)] overflow-hidden border border-[var(--color-line-strong)]"
        style={{ background: "var(--color-line-strong)" }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-2"
            style={{ padding: "16px 18px", background: "color-mix(in oklab, var(--color-text) 6%, transparent)" }}
          >
            <Sk w={90} h={10} />
            <Sk w={130} h={26} />
            <Sk w={70} h={10} />
          </div>
        ))}
      </div>
      <div className="mt-4">
        <Sk w={300} h={22} />
        <div className="mt-4"><SkBlock h={260} /></div>
      </div>
      <div className="mt-4">
        <Sk w={300} h={22} />
        <div className="mt-4"><SkBlock h={520} /></div>
      </div>
    </>
  );
}

function StatCell({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
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
      {sub ? (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.14em",
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
