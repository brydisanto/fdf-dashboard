// Off-field status flags for individual players. Surfaces as a small
// icon next to the player's name across the dashboard (PlayersTable,
// MoversList, RecentTrades, player detail hero, etc.). Hover renders
// the label as a tooltip.
//
// Keep this list small and factual. Each entry should have a clear,
// verifiable off-field reason that meaningfully affects the player's
// availability — incarceration, multi-game suspension, retirement, etc.
// Game-by-game injuries belong in a separate (more dynamic) feed.

export type PlayerStatusKind = "jail" | "suspended" | "retired";

export interface PlayerStatusEntry {
  kind: PlayerStatusKind;
  label: string;       // tooltip headline (e.g. "In Jail")
  detail?: string;     // optional secondary line for tooltip
}

export const PLAYER_STATUS: Record<string, PlayerStatusEntry> = {
  "rashee-rice": {
    kind: "jail",
    label: "In Jail",
  },
};

export function getPlayerStatus(playerId: string): PlayerStatusEntry | null {
  return PLAYER_STATUS[playerId] ?? null;
}
