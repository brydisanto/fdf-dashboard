// Reader for the per-season tournament matrices. Both files are bundled
// with the app (imported at build time) rather than fetched at runtime,
// since they change at most weekly.
//
//   2025 — data/tournament-matrix.json, built by
//          scripts/build-tournament-matrix.mjs from a community page that
//          stopped updating in April 2026.
//   2026 — data/tournament-matrix-2026.json, built by
//          scripts/build-tournament-matrix-2026.mjs from Sport.fun's own
//          weekly standings. Same schema, so the page renders either.

import matrix2025 from "../../../data/tournament-matrix.json";
import matrix2026 from "../../../data/tournament-matrix-2026.json";

export type Position = "QB" | "RB" | "WR" | "TE";

export interface WeekFinish {
  week: number;
  rank: number | null;
  points: number | null;
  // True when the player's weekly placement earned Tournament
  // Points under FDF's rules: top-3 for QB/TE, top-5 for RB/WR.
  // Sourced directly from the upstream `earnedTP` field — we
  // never recompute this from rank so we always match FDF.
  earnedTP: boolean;
  // TP won that week, from the same series as the TP chart on each
  // Sport.fun player page. Present for seasons captured with it (2026).
  tp?: number;
}

export interface PlayerSeason {
  playerId: string;
  displayName: string;
  team: string;
  // Shares currently active (entered) for this player. TP is split only
  // among these, so they set the TP-per-$100 denominator. Snapshot.
  activeShares?: number;
  weeks: WeekFinish[];
  stats: {
    played: number;
    avg: number | null;
    best: number | null;
    avgPoints: number | null;
    tpRate: number | null;   // % of played weeks that earned TP
    tpCount: number;          // # of TP-earning weeks
    firsts: number;
    seconds: number;
    thirds: number;
    fourths: number;
    fifths: number;
    tpWon?: number;           // TP won across the season's captured weeks
  };
}

export interface TournamentMatrix {
  season: number;
  weeks: number;
  weeksOrdered?: number[];
  // Present for a season captured while it is still being played.
  capturedAt?: string;
  activeSharesAt?: string | null;
  generatedAt: string;
  scoring: string;
  source: string;
  matched: number;
  unmatched: string[];
  byPosition: Record<Position, PlayerSeason[]>;
}

const MATRICES: Record<number, TournamentMatrix> = {
  2025: matrix2025 as TournamentMatrix,
  2026: matrix2026 as TournamentMatrix,
};

/** Seasons with a matrix, newest first. */
export const MATRIX_SEASONS = Object.keys(MATRICES).map(Number).sort((a, b) => b - a);

/** Most recent season, shown when none is requested. */
export const DEFAULT_MATRIX_SEASON = MATRIX_SEASONS[0];

export function getTournamentMatrix(season: number = DEFAULT_MATRIX_SEASON): TournamentMatrix {
  return MATRICES[season] ?? MATRICES[DEFAULT_MATRIX_SEASON];
}
