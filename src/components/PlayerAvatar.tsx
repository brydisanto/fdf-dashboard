import clsx from "clsx";
import { TEAM_COLORS } from "@/lib/data/players";
import type { Player } from "@/lib/types";

// Per design system v0.2: round avatar with team-color rim via inset
// box-shadow (so the press-surface bg fills edge-to-edge). Initials
// in display 900 with 0.04em letter-spacing.
const SIZES = {
  xs: { px: 22, fs: 9,    ringPx: 1.5 },
  sm: { px: 30, fs: 10.5, ringPx: 2 },
  md: { px: 44, fs: 14,   ringPx: 2 },
  lg: { px: 64, fs: 20,   ringPx: 2 },
  xl: { px: 80, fs: 24,   ringPx: 2.5 },
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
  const initials = `${player.firstName[0] ?? ""}${player.lastName[0] ?? ""}`;
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
        letterSpacing: "0.04em",
        boxShadow: `inset 0 0 0 ${cfg.ringPx}px ${teamColor}`,
      }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}
