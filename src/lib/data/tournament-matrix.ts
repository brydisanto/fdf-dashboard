// Reader for data/tournament-matrix.json — built by
// scripts/build-tournament-matrix.mjs. The JSON is bundled with the
// app (imported at build time) rather than fetched at runtime since
// it only updates weekly during the season.

import matrixData from "../../../data/tournament-matrix.json";

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
}

export interface PlayerSeason {
  playerId: string;
  displayName: string;
  team: string;
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
  };
}

export interface TournamentMatrix {
  season: number;
  weeks: number;
  generatedAt: string;
  scoring: string;
  source: string;
  matched: number;
  unmatched: string[];
  byPosition: Record<Position, PlayerSeason[]>;
}

export function getTournamentMatrix(): TournamentMatrix {
  return matrixData as TournamentMatrix;
}
