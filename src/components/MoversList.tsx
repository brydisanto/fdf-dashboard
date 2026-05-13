import Link from "next/link";
import { PlayerAvatar } from "./PlayerAvatar";
import { Delta } from "./ui";
import { fmtPrice, fmtUsd } from "@/lib/format";
import { TEAM_NAMES } from "@/lib/data/players";
import type { PlayerSummary } from "@/lib/types";

// Movers row anatomy (per design system):
//   18px rank · 30px avatar · 1fr name stack · auto price · auto delta
// Hairline divider at 50% line opacity between rows. Hover lifts the
// row to a press-tinted bg.
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

  return (
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
            style={{ gridTemplateColumns: "18px 30px 1fr auto auto" }}
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
              className="px-2"
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
              <Delta value={p.change24h} />
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
