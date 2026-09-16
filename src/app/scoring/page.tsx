import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, Pill } from "@/components/ui";
import { WeeklyScoresTable } from "@/components/WeeklyScoresTable";
import { getWeeklyScores, positionSummary } from "@/lib/data/weekly-scores";
import { fmtNum } from "@/lib/format";

export const metadata = {
  title: "Weekly Scoring · FDF Box Score",
  description:
    "Final fantasy scoring for every listed NFL player token on Sport.fun: points by position, top performers, pick popularity, and the week's game results.",
};

// The scoreboard is a committed snapshot, so this page is fully static.
export const dynamic = "force-static";

const DATE_FMT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "America/New_York",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", DATE_FMT);
}

function fmtKick(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

export default function ScoringPage() {
  const week = getWeeklyScores();
  const { scores, fixtures } = week;

  const summary = positionSummary(scores);
  const top = scores[0];
  const totalPoints = scores.reduce((a, s) => a + s.points, 0);
  const average = scores.length ? totalPoints / scores.length : 0;
  const twentyPlus = scores.filter((s) => s.points >= 20).length;

  // Biggest gap between a pick-popularity bucket and its production —
  // the one stat here that ties scoring back to how the market behaved.
  const differentials = scores.filter((s) => s.ownership === "Differential" || s.ownership === "Unpopular");
  const bestOverlooked = differentials[0] ?? null;

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
                "radial-gradient(circle, color-mix(in oklab, var(--color-turf) 14%, transparent), transparent 70%)",
            }}
          />
        </div>
        <div
          className="relative flex flex-col gap-5 sm:gap-6"
          style={{ padding: "clamp(20px, 4vw, 32px) clamp(18px, 4vw, 32px) clamp(18px, 4vw, 28px)" }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="brand">Weekly Scoring</Pill>
            <Pill tone="gain">Final · {fixtures.length} games</Pill>
            <Pill tone="muted">
              {fmtDate(week.firstKickoff)} – {fmtDate(week.lastKickoff)}
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
            {week.label}
          </h1>
          <p className="m-0 max-w-[80ch] text-[var(--color-text-muted)]" style={{ fontSize: "15px" }}>
            Final fantasy points for all {scores.length} listed player tokens, with the matchup each
            one played and how widely it was picked. Scores come from Sport.fun&apos;s live scoring for
            the {week.seasonYear} season.
          </p>
        </div>
      </div>

      {/* Headline stats */}
      <div className="stat-strip mt-4 grid grid-cols-2 md:grid-cols-4">
        <StatCell
          label="Top Scorer"
          value={top ? top.name : "—"}
          sub={top ? `${fmtNum(top.points, { digits: 1 })} pts · ${top.position} · ${top.team}` : ""}
        />
        <StatCell
          label="Average Score"
          value={fmtNum(average, { digits: 1 })}
          sub={`Across ${scores.length} players`}
        />
        <StatCell
          label="20+ Point Games"
          value={fmtNum(twentyPlus)}
          sub={`${Math.round((twentyPlus / Math.max(scores.length, 1)) * 100)}% of the pool`}
        />
        <StatCell
          label="Best Overlooked"
          value={bestOverlooked ? bestOverlooked.name : "—"}
          sub={
            bestOverlooked
              ? `${fmtNum(bestOverlooked.points, { digits: 1 })} pts · rarely picked`
              : ""
          }
        />
      </div>

      {/* Per-position leaders */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summary.map((p) => (
          <Card key={p.position} variant="press" padded={false}>
            <div className="p-4">
              <div className="flex items-center justify-between">
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.18em",
                    color: "var(--color-text-muted)",
                  }}
                >
                  {p.position} LEADER
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    color: "var(--color-text-dim)",
                  }}
                >
                  AVG {fmtNum(p.average, { digits: 1 })}
                </span>
              </div>
              {p.top ? (
                <div className="mt-2 flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    {p.top.playerId ? (
                      <Link
                        href={`/player/${p.top.playerId}`}
                        className="block truncate font-bold text-[var(--color-text)] hover:text-[var(--accent-soft)]"
                        style={{ fontSize: 15 }}
                      >
                        {p.top.name}
                      </Link>
                    ) : (
                      <span className="block truncate font-bold text-[var(--color-text)]" style={{ fontSize: 15 }}>
                        {p.top.name}
                      </span>
                    )}
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        letterSpacing: "0.12em",
                        color: "var(--color-text-dim)",
                        textTransform: "uppercase",
                      }}
                    >
                      {p.top.team} {p.top.isHome ? "vs" : "@"} {p.top.opponent}
                    </span>
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      fontSize: 22,
                      letterSpacing: "-0.02em",
                      color: "var(--accent-soft)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {fmtNum(p.top.points, { digits: 1 })}
                  </span>
                </div>
              ) : null}
            </div>
          </Card>
        ))}
      </div>

      {/* Full scoring table */}
      <div className="mt-6">
        <SectionHead
          title="Every Player · Final Points"
          hint="Filter by position, sort by points or positional rank · click a player to open their token page"
          right={<Pill tone="muted">{scores.length} players</Pill>}
        />
        <Card variant="press" padded={false}>
          <WeeklyScoresTable scores={scores} />
        </Card>
      </div>

      {/* Game results */}
      <div className="mt-6">
        <SectionHead
          title="Game Results"
          hint="Every fixture in the scoring window, in kickoff order"
          right={<Pill tone="muted">{fixtures.length} games</Pill>}
        />
        <Card variant="press" padded={false}>
          <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-4" style={{ background: "var(--color-line)" }}>
            {fixtures.map((f) => {
              const awayWon = f.awayScore > f.homeScore;
              return (
                <div
                  key={`${f.away}-${f.home}-${f.kickoff}`}
                  className="flex flex-col gap-1.5 p-4"
                  style={{ background: "var(--color-press)" }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9.5,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--color-text-dim)",
                    }}
                  >
                    {fmtKick(f.kickoff)} ET
                  </span>
                  <TeamLine team={f.away} score={f.awayScore} won={awayWon} />
                  <TeamLine team={f.home} score={f.homeScore} won={!awayWon} />
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <p
        className="mt-4"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--color-text-dim)",
        }}
      >
        Snapshot of Sport.fun live scoring · captured {fmtDate(week.capturedAt)} · a player&apos;s team
        reflects the week they played
      </p>
    </div>
  );
}

function TeamLine({ team, score, won }: { team: string; score: number; won: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          fontWeight: won ? 700 : 500,
          letterSpacing: "0.06em",
          color: won ? "var(--color-text)" : "var(--color-text-muted)",
        }}
      >
        {team}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 14,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: won ? "var(--color-turf)" : "var(--color-text-dim)",
        }}
      >
        {score}
      </span>
    </div>
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
