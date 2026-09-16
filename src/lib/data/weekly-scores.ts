import raw from "./weekly-scores.json";
import { ROSTER_BY_TOKEN, FOOTBALLFUN_CONTRACT } from "./roster";
import type { Position } from "../types";

// Weekly fantasy scoring for one Sport.fun tournament (their unit of a
// scoring week). The JSON alongside this file is a static capture of
// last week's final scores — see its `_note` for the endpoints and how
// to re-capture. Nothing here hits the network, so the page renders
// instantly and keeps working if Sport.fun's API is down.
//
// Rows arrive as tuples to keep the JSON readable at 76 players; this
// module is the only place that knows the tuple order.

type ScoreTuple = [
  tokenIdSuffix: string,
  name: string,
  position: string,
  team: string,
  opponent: string,
  isHome: number,
  points: number,
  posRank: number,
  teamScore: number,
  oppScore: number,
  kickoff: string,
  ownership: string,
];

export type Ownership = "Favourite" | "Regular" | "Differential" | "Unpopular";

export interface WeeklyScore {
  tokenIdSuffix: string;
  playerId: string | null;      // our roster id, when the token is listed
  name: string;                 // Sport.fun's short name, e.g. "J.Allen"
  position: Position;
  team: string;                 // team played for THIS week
  opponent: string;
  isHome: boolean;
  points: number;
  posRank: number;              // rank within position for the week
  overallRank: number;          // rank across every listed player
  teamScore: number;
  oppScore: number;
  won: boolean;
  kickoff: string;
  ownership: Ownership;
}

export interface WeeklyFixture {
  away: string;
  awayScore: number;
  home: string;
  homeScore: number;
  kickoff: string;
}

export interface WeeklyScoreboard {
  label: string;
  seasonYear: number;
  windowStart: string;
  windowEnd: string;
  firstKickoff: string;
  lastKickoff: string;
  capturedAt: string;
  status: string;
  fixtures: WeeklyFixture[];
  scores: WeeklyScore[];        // highest points first
}

let memo: WeeklyScoreboard | null = null;

export function getWeeklyScores(): WeeklyScoreboard {
  if (memo) return memo;

  const tuples = raw.scores as unknown as ScoreTuple[];
  const scores: WeeklyScore[] = tuples
    .map((t) => {
      const tokenIdSuffix = t[0];
      const player = ROSTER_BY_TOKEN.get(`${FOOTBALLFUN_CONTRACT}:${tokenIdSuffix}`);
      return {
        tokenIdSuffix,
        playerId: player?.id ?? null,
        name: t[1],
        position: t[2] as Position,
        team: t[3],
        opponent: t[4],
        isHome: t[5] === 1,
        points: t[6],
        posRank: t[7],
        teamScore: t[8],
        oppScore: t[9],
        won: t[8] > t[9],
        kickoff: t[10],
        ownership: t[11] as Ownership,
        overallRank: 0,
      };
    })
    .sort((a, b) => b.points - a.points);

  // Ties share the better rank, so two players on 31.2 are both 9th and
  // the next man is 11th — matching how the source ranks within a
  // position.
  let lastPoints = Number.POSITIVE_INFINITY;
  let lastRank = 0;
  scores.forEach((s, i) => {
    if (s.points < lastPoints) {
      lastRank = i + 1;
      lastPoints = s.points;
    }
    s.overallRank = lastRank;
  });

  memo = {
    label: raw.label,
    seasonYear: raw.seasonYear,
    windowStart: raw.windowStart,
    windowEnd: raw.windowEnd,
    firstKickoff: raw.firstKickoff,
    lastKickoff: raw.lastKickoff,
    capturedAt: raw.capturedAt,
    status: raw.status,
    fixtures: raw.fixtures as WeeklyFixture[],
    scores,
  };
  return memo;
}

export const POSITION_ORDER: Position[] = ["QB", "RB", "WR", "TE"];

/** Per-position summary used for the header tiles. */
export function positionSummary(scores: WeeklyScore[]) {
  return POSITION_ORDER.map((pos) => {
    const rows = scores.filter((s) => s.position === pos);
    const total = rows.reduce((a, r) => a + r.points, 0);
    return {
      position: pos,
      count: rows.length,
      top: rows[0] ?? null,          // rows inherit the points sort
      average: rows.length ? total / rows.length : 0,
    };
  });
}
