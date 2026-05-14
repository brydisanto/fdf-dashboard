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

  // Season leaders for the stat strip. Require at least 8 games
  // played for rate-based stats (TP rate, avg points) so a single
  // hot week from an injured player can't claim the title. Counting
  // stats (#1 finishes) have no minimum since they're already
  // accumulation-based and self-limiting.
  const MIN_GAMES_FOR_RATE = 8;
  const allPlayers = (["QB","RB","WR","TE"] as const).flatMap((p) => data.byPosition[p]);
  const topTpRate = allPlayers
    .filter((p) => p.stats.tpRate != null && p.stats.played >= MIN_GAMES_FOR_RATE)
    .sort((a, b) => (b.stats.tpRate ?? 0) - (a.stats.tpRate ?? 0))[0];
  const topFirsts = allPlayers
    .slice()
    .sort((a, b) => b.stats.firsts - a.stats.firsts)[0];
  const topAvgPoints = allPlayers
    .filter((p) => p.stats.avgPoints != null && p.stats.played >= MIN_GAMES_FOR_RATE)
    .sort((a, b) => (b.stats.avgPoints ?? 0) - (a.stats.avgPoints ?? 0))[0];

  // "Christian McCaffrey" -> "C. McCaffrey". Strips Jr/Sr/II/III
  // suffixes since they don't add information in this compact form.
  function abbreviateName(full: string): string {
    if (!full) return "";
    const cleaned = full.replace(/\s+(Jr|Sr|II|III|IV|V)\.?$/i, "").trim();
    const parts = cleaned.split(/\s+/);
    if (parts.length === 1) return parts[0];
    return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
  }

  const totalRoster =
    data.byPosition.QB.length +
    data.byPosition.RB.length +
    data.byPosition.WR.length +
    data.byPosition.TE.length;

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
            {data.season} FDF Rankings Matrix
          </h1>
          <p className="m-0 max-w-[80ch] text-[var(--color-text-muted)]" style={{ fontSize: "15px" }}>
            Contains weekly stats and tournament rankings from the {data.season} NFL regular season.
            Each cell shows the player&apos;s rank within their position that week, with fantasy points scored underneath.
            Switch positions or sort by season-long aggregates to compare consistency.
          </p>
        </div>
      </div>

      {/* Stat strip: roster size + 3 season-leader cells */}
      <div
        className="stat-strip mt-4 grid"
        style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
      >
        <StatCell
          label="Players Ranked"
          value={totalRoster.toString()}
          sub="QB · RB · WR · TE"
        />
        <LeaderCell
          label="Highest TP Rate"
          value={topTpRate ? `${Math.round((topTpRate.stats.tpRate ?? 0) * 100)}%` : "—"}
          leader={abbreviateName(topTpRate?.displayName ?? "")}
        />
        <LeaderCell
          label="Most #1 Finishes"
          value={topFirsts && topFirsts.stats.firsts > 0 ? topFirsts.stats.firsts.toString() : "—"}
          leader={topFirsts && topFirsts.stats.firsts > 0 ? abbreviateName(topFirsts.displayName) : ""}
        />
        <LeaderCell
          label="Highest Avg Points"
          value={topAvgPoints?.stats.avgPoints != null ? topAvgPoints.stats.avgPoints.toFixed(1) : "—"}
          leader={abbreviateName(topAvgPoints?.displayName ?? "")}
        />
      </div>

      {/* Matrix */}
      <div className="mt-4">
        <Card variant="press" padded={false}>
          <TournamentMatrix
            byPosition={data.byPosition}
            weeksOrdered={weeksOrdered}
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

// LeaderCell renders a label, then the metric value and the leader's
// name on the same row. Used for the season-leader stats where the
// player name carries as much information as the number — we don't
// want it hiding as tiny mono sub-text.
function LeaderCell({
  label,
  value,
  leader,
}: {
  label: string;
  value: React.ReactNode;
  leader: string;
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
        {leader ? (
          <>
            <span
              aria-hidden
              style={{
                display: "inline-block",
                width: 1,
                height: 22,
                background: "var(--color-line-strong)",
              }}
            />
            <span
              className="truncate leading-tight"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: 19,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "var(--color-text)",
                maxWidth: "100%",
              }}
              title={leader}
            >
              {leader}
            </span>
          </>
        ) : null}
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
