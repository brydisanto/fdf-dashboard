import Link from "next/link";
import { ArrowLeft, Flame } from "lucide-react";
import { getNflHotPlayers } from "@/lib/data";
import { Card, Pill } from "@/components/ui";
import { HotPlayersTable } from "@/components/HotPlayersTable";
import { fmtNum, fmtUsd } from "@/lib/format";

export const metadata = {
  title: "On Fire · FDF Box Score",
  description:
    "Top NFL player tokens ranked by trading volume across 6h, 24h, 7d, and 30d. Sort by any window to find what's heating up.",
};

// 60s revalidate matches the rest of the dashboard. Underlying OHLC
// fetches are cached for 5min by tget, so subsequent renders inside
// the same OHLC window are basically free.
export const revalidate = 60;

export default async function OnFirePage() {
  const players = await getNflHotPlayers();

  // Headline stats — derived once, server-side. Sum across the entire
  // roster (cold players have 0 volume so they don't move the totals).
  const total6h = players.reduce((a, p) => a + p.volume6h, 0);
  const total24h = players.reduce((a, p) => a + p.volume24h, 0);
  const total7d = players.reduce((a, p) => a + p.volume7d, 0);
  const total30d = players.reduce((a, p) => a + p.volume30d, 0);
  const onFireCount = players.filter((p) => p.heat >= 2).length;

  // Top mover by 24h volume — anchors the hero so the user lands on
  // the page already seeing the day's leader.
  const leader = players.slice().sort((a, b) => b.volume24h - a.volume24h)[0];

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
                "radial-gradient(circle, color-mix(in oklab, var(--color-penalty) 22%, transparent), transparent 70%)",
            }}
          />
        </div>
        <div className="relative flex flex-col gap-6" style={{ padding: "32px 32px 28px" }}>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="brand">
              <Flame className="h-3 w-3" strokeWidth={2} />
              On Fire
            </Pill>
            <Pill tone="info">
              {onFireCount} {onFireCount === 1 ? "Player" : "Players"} heating up
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
            What&rsquo;s Trading Hot
          </h1>
          <p className="m-0 max-w-[80ch] text-[var(--color-text-muted)]" style={{ fontSize: "15px" }}>
            Top NFL player tokens ranked by trading volume across 6h, 24h, 7d, and 30d windows.
            {leader ? (
              <>
                {" "}Today&rsquo;s leader: <Link href={`/player/${leader.id}`} className="text-[var(--color-text)] hover:text-[var(--accent-soft)]">
                  {leader.firstName} {leader.lastName}
                </Link> at {fmtUsd(leader.volume24h, { compact: true })} in 24h volume.
              </>
            ) : null}
          </p>
        </div>
      </div>

      {/* Stat strip */}
      <div
        className="stat-strip mt-4 grid"
        style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
      >
        <StatCell label="6h Volume" value={fmtUsd(total6h, { compact: true })} sub="Rolling, NFL-wide" />
        <StatCell label="24h Volume" value={fmtUsd(total24h, { compact: true })} sub="Rolling, NFL-wide" />
        <StatCell label="7d Volume" value={fmtUsd(total7d, { compact: true })} sub="Rolling, NFL-wide" />
        <StatCell label="30d Volume" value={fmtUsd(total30d, { compact: true })} sub={`${fmtNum(players.length)} players`} />
      </div>

      {/* Leaderboard */}
      <div className="mt-4">
        <SectionHead
          title="Volume Leaderboard"
          hint="Sort by any window · 6h/24h are real-time, 7d & 30d are rolling sums"
          right={<Pill tone="muted">{fmtNum(players.length)} players</Pill>}
        />
        <Card variant="press" padded={false}>
          <HotPlayersTable players={players} />
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
