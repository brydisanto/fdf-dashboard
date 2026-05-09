import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTopNflWallets } from "@/lib/data";
import { Card, Pill } from "@/components/ui";
import { TopWalletsTable } from "@/components/TopWalletsTable";
import { fmtNum, fmtUsd } from "@/lib/format";

export const metadata = {
  title: "Top Wallets · FDF Box Score",
  description:
    "Leaderboard of NFL token holders ranked by NFL portfolio value. See whales, sharks, and the most active wallets across Sport.fun's NFL market.",
};

// Top-K wallet aggregation reaches across every pool in the
// roster, so 60s revalidate keeps it fresh without hammering
// the upstream every render.
export const revalidate = 60;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export default async function WalletsPage() {
  const wallets = await getTopNflWallets(100, 100);

  // Headline stats — derived once, server-side.
  const total = wallets.length;
  const totalValue = wallets.reduce((a, w) => a + w.nflValueUsd, 0);
  const topValue = wallets[0]?.nflValueUsd ?? 0;
  const now = Date.now();
  const active24h = wallets.filter((w) => w.lastActiveAt > 0 && now - w.lastActiveAt < ONE_DAY_MS).length;
  const whales = wallets.filter((w) => w.tier === "whale").length;
  const sharks = wallets.filter((w) => w.tier === "shark").length;

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
              background:
                "radial-gradient(circle, color-mix(in oklab, var(--color-broadcast) 15%, transparent), transparent 70%)",
            }}
          />
        </div>
        <div className="relative flex flex-col gap-6" style={{ padding: "32px 32px 28px" }}>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="brand">Wallet Leaderboard</Pill>
            <Pill tone="info">
              {whales} {whales === 1 ? "Whale" : "Whales"} · {sharks} {sharks === 1 ? "Shark" : "Sharks"}
            </Pill>
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
            Who&apos;s holding the bag?
          </h1>
          <p className="m-0 max-w-[80ch] text-[var(--color-text-muted)]" style={{ fontSize: "15px" }}>
            Top {total} NFL token holders ranked by NFL portfolio value, aggregated from every
            player pool. Click any wallet to drill into their full portfolio.
          </p>
        </div>
      </div>

      {/* Stat strip */}
      <div
        className="stat-strip mt-4 grid"
        style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
      >
        <StatCell
          label="Wallets Ranked"
          value={fmtNum(total)}
          sub={`Top ${total}`}
        />
        <StatCell
          label="Total NFL Value"
          value={fmtUsd(totalValue, { compact: true })}
          sub="Across leaderboard"
        />
        <StatCell
          label="Top Wallet"
          value={fmtUsd(topValue, { compact: true })}
          sub="Highest NFL position"
        />
        <StatCell
          label="Active 24h"
          value={fmtNum(active24h)}
          sub={`${total ? Math.round((active24h / total) * 100) : 0}% of leaderboard`}
        />
      </div>

      {/* Leaderboard table */}
      <div className="mt-4">
        <SectionHead
          title="Top Wallets · NFL Portfolio Value"
          hint="Ranked by aggregated NFL value across every pool · click a row to drill in"
          right={<Pill tone="muted">{fmtNum(total)} ranked</Pill>}
        />
        <Card variant="press" padded={false}>
          <TopWalletsTable wallets={wallets} />
        </Card>
      </div>

    </div>
  );
}

function StatCell({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
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

function SectionHead({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
}) {
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
