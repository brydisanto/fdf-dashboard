import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, Pill } from "@/components/ui";
import { TournamentMatrix } from "@/components/TournamentMatrix";
import { getTournamentMatrix } from "@/lib/data/tournament-matrix";

export const metadata = {
  title: "Tournament Matrix · FDF Box Score",
  description:
    "Week-by-week position finishes across the 2025 NFL season for every player on the FDF roster. Avg finish, best, top-12 rate, weekly points, and bracket counts.",
};

// Static — the JSON is bundled and only changes when the build
// script refreshes data/tournament-matrix.json.
export const dynamic = "force-static";

export default function TournamentMatrixPage() {
  const data = getTournamentMatrix();
  const weeksOrdered = (data as { weeksOrdered?: number[] }).weeksOrdered
    ?? Array.from({ length: data.weeks }, (_, i) => i + 1);

  // Totals for the hero stat strip.
  const totalRoster =
    data.byPosition.QB.length +
    data.byPosition.RB.length +
    data.byPosition.WR.length +
    data.byPosition.TE.length;
  let totalFirsts = 0;
  let totalTop12 = 0;
  let totalPlayed = 0;
  for (const pos of ["QB","RB","WR","TE"] as const) {
    for (const p of data.byPosition[pos]) {
      totalFirsts += p.stats.firsts;
      totalTop12 += p.stats.top12;
      totalPlayed += p.stats.played;
    }
  }
  const aggregateTpRate = totalPlayed ? (totalTop12 / totalPlayed) : 0;

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
                "radial-gradient(circle, color-mix(in oklab, var(--color-turf) 18%, transparent), transparent 70%)",
            }}
          />
        </div>
        <div className="relative flex flex-col gap-6" style={{ padding: "32px 32px 28px" }}>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="brand">{data.season} Season</Pill>
            <Pill tone="info">{totalRoster} Players · {data.weeks} Weeks</Pill>
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
            Tournament Matrix
          </h1>
          <p className="m-0 max-w-[80ch] text-[var(--color-text-muted)]" style={{ fontSize: "15px" }}>
            Weekly position finishes for every FDF roster player across the {data.season} NFL regular season.
            Each cell shows the player&apos;s rank within their position that week, with fantasy points in parens.
            Switch positions or sort by season-long aggregates to compare consistency.
          </p>
        </div>
      </div>

      {/* Stat strip */}
      <div
        className="stat-strip mt-4 grid"
        style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
      >
        <StatCell label="Players Tracked" value={totalRoster.toString()} sub="QB · RB · WR · TE" />
        <StatCell label="Weeks Indexed"  value={data.weeks.toString()} sub={`Regular season ${data.season}`} />
        <StatCell label="Aggregate Top-12 Rate" value={`${Math.round(aggregateTpRate * 100)}%`} sub="Across roster" />
        <StatCell label="#1 Finishes"  value={totalFirsts.toString()} sub="Across roster" />
      </div>

      {/* Matrix */}
      <div className="mt-4">
        <Card variant="press" padded={false}>
          <TournamentMatrix
            byPosition={data.byPosition}
            weeksOrdered={weeksOrdered}
            source={data.source}
            season={data.season}
          />
        </Card>
      </div>

      <p className="mt-4 text-[11px] text-[var(--color-text-dim)]" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.08em" }}>
        Snapshot generated {data.generatedAt}. Scoring: {data.scoring.toUpperCase()}. Source: {data.source}.
      </p>
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
