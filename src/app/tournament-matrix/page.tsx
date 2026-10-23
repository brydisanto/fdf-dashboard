import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, Pill } from "@/components/ui";
import { TournamentMatrix } from "@/components/TournamentMatrix";
import { getPlayers } from "@/lib/data";
import {
  DEFAULT_MATRIX_SEASON,
  MATRIX_SEASONS,
  getTournamentMatrix,
} from "@/lib/data/tournament-matrix";

export const metadata = {
  title: "Tournament Matrix · FDF Box Score",
  description:
    "Week-by-week position finishes for every player on the FDF roster, by NFL season. Avg finish, best, TP rate, weekly points, and bracket counts.",
};

// Renders per request because the season comes from the query string.
// Both seasons are bundled JSON, so this is cheap.

export default async function TournamentMatrixPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const requested = Number((await searchParams).season);
  const season = MATRIX_SEASONS.includes(requested) ? requested : DEFAULT_MATRIX_SEASON;
  const data = getTournamentMatrix(season);
  // Current market caps (price × circulating shares) for the TP per $100
  // column. Only needed for a season with TP captured; skip the fetch
  // otherwise. If they can't be read, the column shows dashes rather
  // than failing the page.
  const hasTP = (["QB", "RB", "WR", "TE"] as const).some((pos) =>
    data.byPosition[pos].some((x) => x.stats.tpWon != null));
  const marketCaps: Record<string, number> = hasTP
    ? Object.fromEntries(
        (await getPlayers().catch(() => [])).map((pl) => [pl.id, pl.priceUsd * pl.circulatingSupply]),
      )
    : {};
  const weeksOrdered = data.weeksOrdered
    ?? Array.from({ length: data.weeks }, (_, i) => i + 1);
  // A season still being played is captured partway through; say so.
  const inProgress = !!data.capturedAt;

  // Season leaders for the stat strip. Rate-based stats (TP rate, avg
  // points) need a minimum number of games so one hot week from an
  // injured player can't claim the title: 8 across a full season,
  // scaled down early in a season so leaders still appear after a few
  // weeks. Counting stats (#1 finishes) need no minimum.
  const MIN_GAMES_FOR_RATE = Math.max(1, Math.min(8, Math.ceil(weeksOrdered.length * 0.6)));
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
        <div
          className="relative flex flex-col gap-5 sm:gap-6"
          style={{ padding: "clamp(20px, 4vw, 32px) clamp(18px, 4vw, 32px) clamp(18px, 4vw, 28px)" }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <SeasonSwitch current={season} />
            <Pill tone="info">
              {totalRoster} Players · {weeksOrdered.length} {weeksOrdered.length === 1 ? "Week" : "Weeks"}
            </Pill>
            {inProgress ? (
              <Pill tone="gain">
                In progress · through Week {weeksOrdered[weeksOrdered.length - 1]}
              </Pill>
            ) : null}
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
            Contains weekly stats and tournament rankings from the {data.season} NFL regular season
            {inProgress ? ", updated as each week's tournament completes" : ""}.
            Each cell shows the player&apos;s rank within their position that week, with fantasy points scored underneath.
            Switch positions or sort by season-long aggregates to compare consistency.
          </p>
        </div>
      </div>

      {/* Stat strip: roster size + 3 season-leader cells.
          Collapses to 1 col on mobile (cells are content-rich, so
          even 2-col gets crowded), 2 on sm, 4 on lg+. */}
      <div className="stat-strip mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCell
          label="Players Ranked"
          value={totalRoster.toString()}
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
          value={topAvgPoints?.stats.avgPoints != null ? `${topAvgPoints.stats.avgPoints.toFixed(1)}pts` : "—"}
          leader={abbreviateName(topAvgPoints?.displayName ?? "")}
        />
      </div>

      {/* Matrix */}
      <div className="mt-4">
        <Card variant="press" padded={false}>
          <TournamentMatrix
            byPosition={data.byPosition}
            key={data.season}
            weeksOrdered={weeksOrdered}
            season={data.season}
            marketCaps={marketCaps}
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
    <div className="stat-cell items-center text-center">
      <div className="flex items-center justify-center gap-2">
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
      <div className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1">
        {leader ? (
          <>
            <span
              className="truncate leading-tight"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: 24,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "var(--color-text)",
                maxWidth: "100%",
              }}
              title={leader}
            >
              {leader}
            </span>
            <span
              className="leading-none"
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                fontSize: 16,
                letterSpacing: "-0.01em",
                color: "var(--color-text-muted)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              ({value})
            </span>
          </>
        ) : (
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
        )}
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
    <div className="stat-cell items-center text-center">
      <div className="flex items-center justify-center gap-2">
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

// Season tabs. Links rather than client state so each season has a URL
// that can be shared and bookmarked.
function SeasonSwitch({ current }: { current: number }) {
  return (
    <div
      className="inline-flex rounded-[var(--r-8)] border border-[var(--color-line)] p-[2px]"
      style={{ background: "var(--color-stadium)" }}
      role="tablist"
      aria-label="Season"
    >
      {MATRIX_SEASONS.map((y) => {
        const active = y === current;
        return (
          <Link
            key={y}
            href={y === DEFAULT_MATRIX_SEASON ? "/tournament-matrix" : `/tournament-matrix?season=${y}`}
            role="tab"
            aria-selected={active}
            className={
              active
                ? "rounded-[6px] px-3 py-1 text-[var(--color-text)] transition-colors"
                : "rounded-[6px] px-3 py-1 text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-text-muted)]"
            }
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.14em",
              background: active ? "var(--accent-tint)" : "transparent",
              border: active ? "1px solid var(--accent-line)" : "1px solid transparent",
            }}
          >
            {y} SEASON
          </Link>
        );
      })}
    </div>
  );
}
