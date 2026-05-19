import { Lock, Ban, UserMinus } from "lucide-react";
import { getPlayerStatus, type PlayerStatusKind } from "@/lib/data/player-status";

// Per-kind visual config. Color uses the existing penalty/flag tokens
// so the badge reads consistently with the rest of the dashboard. The
// `tint` channel feeds the tooltip background — same hue as the icon
// so the chip + tooltip read as a single unit on hover.
const KIND_META: Record<
  PlayerStatusKind,
  { Icon: typeof Lock; color: string; tint: string; border: string }
> = {
  jail: {
    Icon: Lock,
    color: "var(--color-penalty)",
    tint:   "color-mix(in oklab, var(--color-penalty) 16%, var(--color-press))",
    border: "color-mix(in oklab, var(--color-penalty) 45%, transparent)",
  },
  suspended: {
    Icon: Ban,
    color: "var(--color-flag)",
    tint:   "color-mix(in oklab, var(--color-flag) 16%, var(--color-press))",
    border: "color-mix(in oklab, var(--color-flag) 45%, transparent)",
  },
  retired: {
    Icon: UserMinus,
    color: "var(--color-text-dim)",
    tint:   "var(--color-press)",
    border: "var(--color-line-strong)",
  },
};

/**
 * Renders a small status icon next to a player's name. Returns null
 * for players without an entry in PLAYER_STATUS, so it's safe to drop
 * inline anywhere a player is rendered — no per-call lookup needed
 * upstream.
 *
 * Hover surfaces a styled tooltip (not the native `title` attribute)
 * that matches the dashboard's design tokens — opaque card background,
 * 1px hairline border, mono caption, and a downward-pointing arrow
 * notch. Implemented in pure CSS via the `peer` pattern in
 * globals.css so this stays a server component.
 *
 * Keyboard accessibility: the wrapper is focusable so tab users can
 * surface the tooltip too. Screen readers read `aria-label` instead
 * of the tooltip content.
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
  const a11yLabel = status.detail
    ? `${status.label} — ${status.detail}`
    : status.label;
  return (
    <span
      className="player-status-badge"
      aria-label={a11yLabel}
      role="img"
      tabIndex={0}
      style={{
        // CSS custom props consumed by the .player-status-badge rules
        // in globals.css. Keeps the per-kind theming colocated with
        // the component without duplicating selectors per kind.
        ["--psb-color" as string]: meta.color,
        ["--psb-tint" as string]: meta.tint,
        ["--psb-border" as string]: meta.border,
      }}
    >
      <Icon width={size} height={size} strokeWidth={2.4} aria-hidden />
      <span className="player-status-badge__tip" role="tooltip">
        <span className="player-status-badge__tip-label">{status.label}</span>
        {status.detail ? (
          <span className="player-status-badge__tip-detail">{status.detail}</span>
        ) : null}
      </span>
    </span>
  );
}
