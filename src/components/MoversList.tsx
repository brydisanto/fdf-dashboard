import Link from "next/link";
import { PlayerAvatar } from "./PlayerAvatar";
import { Delta } from "./ui";
import { fmtPrice, fmtUsd } from "@/lib/format";
import { TEAM_NAMES } from "@/lib/data/players";
import type { PlayerSummary } from "@/lib/types";

// Movers row anatomy:
//   18px rank · 30px avatar · 1fr name stack · 80px price · 76px right
//
// FIXED widths on the right two columns (not auto) so every row has
// the same right-edge column boundary. With auto, rows whose prices
// happen to be shorter (e.g. "$0.0144") would have a narrower price
// cell than rows with longer prices ("$0.00431"), and the values
// wouldn't line up vertically.
const GRID_COLS = "18px 30px minmax(0, 1fr) 80px 76px";

const HEADER_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "9.5px",
  fontWeight: 600,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--color-text-dim)",
};

export function MoversList({
  players,
  variant,
  limit = 5,
}: {
  players: PlayerSummary[];
  variant: "gainers" | "losers" | "trending";
  limit?: number;
}) {
  const sorted = players.slice();
  if (variant === "gainers") sorted.sort((a, b) => b.change24h - a.change24h);
  if (variant === "losers")  sorted.sort((a, b) => a.change24h - b.change24h);
  if (variant === "trending") sorted.sort((a, b) => b.volume24h - a.volume24h);

  const top = sorted.slice(0, limit);

  // Header label for the right-most column matches the metric we're
  // sorting on. Keeps the cards self-explanatory at a glance — without
  // headers, the rightmost number reads as a bare value with no unit.
  const rightLabel = variant === "trending" ? "24H Vol" : "24H %";

  return (
    <div>
      {/* Column headers — mono-eyebrow row aligned to the same 5-column
          grid as the data rows below. Rank + avatar slots are blank;
          the name column gets "Player", and the two right columns get
          their unit labels. */}
      {/* Header row. Right two columns use FIXED widths (not auto)
          so every row — header + data — has the same column right
          edges. Without fixed widths, each row's auto columns size
          independently to their own content, and prices of varying
          widths ("$0.00431" vs "$0.0144") shift the right edge
          row-to-row. */}
      <div
        className="grid items-center gap-2.5 border-b py-1.5"
        style={{
          gridTemplateColumns: GRID_COLS,
          borderColor: "color-mix(in oklab, var(--color-line) 50%, transparent)",
        }}
      >
        <span />
        <span />
        <span style={HEADER_STYLE}>Player</span>
        <span className="px-2 text-right" style={HEADER_STYLE}>Price</span>
        <span className="text-right" style={HEADER_STYLE}>{rightLabel}</span>
      </div>
      <ul className="m-0 flex flex-col p-0">
        {top.map((p, i) => (
        <li
          key={p.id}
          className="border-b last:border-b-0"
          style={{ borderColor: "color-mix(in oklab, var(--color-line) 50%, transparent)" }}
        >
          <Link
            href={`/player/${p.id}`}
            className="grid items-center gap-2.5 py-2.5 transition-colors hover:bg-[color-mix(in_oklab,var(--color-press)_50%,transparent)]"
            style={{ gridTemplateColumns: GRID_COLS }}
          >
            <span
              className="text-right"
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                fontSize: "11px",
                color: "var(--color-text-dim)",
              }}
            >
              {i + 1}
            </span>
            <PlayerAvatar player={p} size="sm" />
            <div className="min-w-0 flex flex-col">
              <span className="truncate text-[13px] font-semibold leading-tight">
                {p.firstName} {p.lastName}
              </span>
              <span
                className="truncate"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--color-text-dim)",
                }}
              >
                {p.position} · {TEAM_NAMES[p.team] ?? p.team}
              </span>
            </div>
            <span
              className="px-2 text-right"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--color-text-muted)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmtPrice(p.priceUsd)}
            </span>
            {variant === "trending" ? (
              <span
                className="text-right"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "var(--color-text)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtUsd(p.volume24h, { compact: true })}
              </span>
            ) : (
              <span className="flex justify-end">
                <Delta value={p.change24h} />
              </span>
            )}
          </Link>
        </li>
      ))}
      </ul>
    </div>
  );
}
