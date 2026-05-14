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
    tpRate: number | null;        // % of weeks finishing top-12
    firsts: number;
    seconds: number;
    thirds: number;
    fourths: number;
    fifths: number;
    top12: number;
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
