import { Suspense, cache } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getNewWallets } from "@/lib/data/new-wallets";
import { Card, Pill } from "@/components/ui";
import { NewWalletsTable } from "@/components/NewWalletsTable";
import { NewWalletsChart } from "@/components/LazyCharts";
import { Sk, SkBlock } from "@/components/PageSkeleton";
import { fmtNum, fmtUsd } from "@/lib/format";

export const metadata = {
  title: "New Wallets · FDF Box Score",
  description:
    "Wallets making their first-ever NFL trade on Sport.fun: daily signups, what they bought first, how much they committed, and whether they are still holding.",
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
            Every wallet making its first-ever NFL trade, tracked from the day it shows up.
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

async function Body() {
  const r = await load();
  const trendPct = r.prior7d > 0 ? Math.round(((r.new7d - r.prior7d) / r.prior7d) * 100) : null;
  const trendText = trendPct === null
    ? "vs prior 7d: n/a"
    : `${trendPct >= 0 ? "+" : ""}${trendPct}% vs prior 7d`;
  const retention = r.new7d > 0 ? Math.round((r.stillHolding7d / r.new7d) * 100) : 0;

  return (
    <>
      <div className="stat-strip mt-4 grid grid-cols-2 md:grid-cols-4">
        <StatCell label="New · 24h" value={fmtNum(r.new24h)} sub="First NFL trade in the last day" />
        <StatCell label="New · 7d" value={fmtNum(r.new7d)} sub={trendText} />
        <StatCell label="New · 30d" value={fmtNum(r.new30d)} sub={`${fmtNum(r.totalWalletsEver)} wallets all time`} />
        <StatCell
          label="Still Holding · 7d"
          value={`${retention}%`}
          sub={`${fmtNum(r.stillHolding7d)} of ${fmtNum(r.new7d)} · ${fmtUsd(r.firstBuyUsd7d, { compact: true })} first buys`}
        />
      </div>

      <div className="mt-4">
        <SectionHead
          title="New Wallets Per Day"
          hint="First-ever NFL trade, by UTC day · last 30 days · accent bars are the current week"
          right={!r.registrySeeded ? <Pill tone="warn">Registry not seeded yet</Pill> : null}
        />
        <Card variant="press" padded={false}>
          <div className="p-5">
            <NewWalletsChart daily={r.daily} />
          </div>
        </Card>
      </div>

      <div className="mt-4">
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
