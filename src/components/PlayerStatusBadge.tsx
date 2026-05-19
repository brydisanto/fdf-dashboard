import { Lock, Ban, UserMinus } from "lucide-react";
import { getPlayerStatus, type PlayerStatusKind } from "@/lib/data/player-status";

// Per-kind visual config. Color uses the existing penalty/flag tokens
// so the badge reads consistently with the rest of the dashboard.
const KIND_META: Record<
  PlayerStatusKind,
  { Icon: typeof Lock; color: string }
> = {
  jail:      { Icon: Lock,       color: "var(--color-penalty)" },
  suspended: { Icon: Ban,        color: "var(--color-flag)" },
  retired:   { Icon: UserMinus,  color: "var(--color-text-dim)" },
};

/**
 * Renders a small status icon next to a player's name. Returns null
 * for players without an entry in PLAYER_STATUS, so it's safe to drop
 * inline anywhere a player is rendered — no per-call lookup needed
 * upstream.
 *
 * Tooltip-only by default (native `title`). Keeping it a span (not a
 * button or link) so it doesn't interfere with click targets that
 * already wrap the player name.
 */
export function PlayerStatusBadge({
  playerId,
  size = 12,
}: {
  playerId: string;
  size?: number;
}) {
  const status = getPlayerStatus(playerId);
  if (!status) return null;
  const meta = KIND_META[status.kind];
  const Icon = meta.Icon;
  const title = status.detail
    ? `${status.label} — ${status.detail}`
    : status.label;
  return (
    <span
      title={title}
      aria-label={title}
      role="img"
      className="inline-flex shrink-0 items-center"
      style={{ color: meta.color, marginLeft: 4 }}
    >
      <Icon width={size} height={size} strokeWidth={2.4} aria-hidden />
    </span>
  );
}
