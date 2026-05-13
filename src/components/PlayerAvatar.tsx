import clsx from "clsx";
import { TEAM_COLORS } from "@/lib/data/players";
import type { Player } from "@/lib/types";

// Per design system v0.2: round avatar with team-color rim via inset
// box-shadow (so the press-surface bg fills edge-to-edge). Jersey
// number in display 900 with 0.02em letter-spacing — disambiguates
// duplicate-initial pairs (e.g. JH = Herbert and Hurts) and ties
// the visual into the team's actual roster identity.
const SIZES = {
  // Slightly larger font sizes than the old initials build because
  // jersey numbers are 1–2 digits with no descenders, so we can push
  // them visually.
  xs: { px: 22, fs: 10,   ringPx: 1.5 },
  sm: { px: 30, fs: 12,   ringPx: 2 },
  md: { px: 44, fs: 16,   ringPx: 2 },
  lg: { px: 64, fs: 24,   ringPx: 2 },
  xl: { px: 80, fs: 30,   ringPx: 2.5 },
} as const;

export function PlayerAvatar({
  player,
  size = "sm",
  className,
}: {
  player: Pick<Player, "firstName" | "lastName" | "team" | "jerseyNumber">;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  // Fall back to initials only when the jersey is truly missing
  // (non-finite). 0 is a valid jersey since the NFL began allowing
  // it in 2023 — Jahmyr Gibbs (DET) and a handful of others wear it.
  const jersey =
    typeof player.jerseyNumber === "number" && Number.isFinite(player.jerseyNumber) && player.jerseyNumber >= 0
      ? String(player.jerseyNumber)
      : `${player.firstName[0] ?? ""}${player.lastName[0] ?? ""}`;
  const teamColor = TEAM_COLORS[player.team] ?? "var(--color-line)";
  const cfg = SIZES[size];
  return (
    <div
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--color-press)] text-[var(--color-text)]",
        className,
      )}
      style={{
        width: cfg.px,
        height: cfg.px,
        fontSize: `${cfg.fs}px`,
        fontFamily: "var(--font-display)",
        fontWeight: 900,
        // Numbers want tighter tracking than letters (otherwise "11"
        // looks like "1 1"); also tabular-nums so 10, 11, 13 all
        // sit on the same metrics.
        letterSpacing: "0.01em",
        fontVariantNumeric: "tabular-nums",
        boxShadow: `inset 0 0 0 ${cfg.ringPx}px ${teamColor}`,
      }}
      aria-hidden="true"
    >
      {jersey}
    </div>
  );
}
