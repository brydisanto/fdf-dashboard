import clsx from "clsx";
import { TEAM_COLORS } from "@/lib/data/players";
import type { Player } from "@/lib/types";

const SIZES = {
  xs: "h-6 w-6 text-[9px]",
  sm: "h-8 w-8 text-[10px]",
  md: "h-10 w-10 text-xs",
  lg: "h-14 w-14 text-base",
  xl: "h-20 w-20 text-xl",
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
  const color = TEAM_COLORS[player.team] ?? "#222a36";
  return (
    <div
      className={clsx(
        "relative flex shrink-0 items-center justify-center rounded-full font-bold text-white shadow-inner",
        SIZES[size],
        className,
      )}
      style={{
        background: `linear-gradient(135deg, ${color} 0%, ${shade(color, -22)} 100%)`,
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.08)`,
      }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}

function shade(hex: string, amt: number) {
  const m = hex.replace("#", "").match(/.{1,2}/g);
  if (!m) return hex;
  const [r, g, b] = m.map((h) => clamp(parseInt(h, 16) + amt));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
function clamp(n: number) {
  return Math.max(0, Math.min(255, n));
}
