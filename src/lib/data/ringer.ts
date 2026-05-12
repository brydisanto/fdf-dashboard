import "server-only";

import data from "./ringer-rankings.json";

// The Ringer's preseason 2026 PPR positional rankings — sourced from
// https://theringer.com/fantasy-football/2026-preseason?draft=ppr via
// the scraper at scripts/scrape-ringer.mjs. The Ringer publishes a
// consensus rank derived from 3 of their experts (Danny Heifetz,
// Danny Kelly, Craig Horlbeck), exposed in the page as
// `positionalRankings.ppr`.
//
// Refresh by re-running the scraper when the Ringer updates their
// rankings (typically a few times across the off-season).

export interface RingerPlayer {
  name: string;
  position: "QB" | "RB" | "WR" | "TE";
  posRank: number;
}

type RawJson = {
  source: string;
  scrapedAt: string;
  players: Array<{
    name: string;
    firstName: string;
    lastName: string;
    team: string | null;
    position: string;
    positionalRank: number;
    overallRank: number | null;
  }>;
};

export function getRingerRankings(): RingerPlayer[] {
  const json = data as unknown as RawJson;
  const out: RingerPlayer[] = [];
  for (const p of json.players ?? []) {
    const pos = p.position as RingerPlayer["position"];
    if (!["QB", "RB", "WR", "TE"].includes(pos)) continue;
    out.push({ name: p.name, position: pos, posRank: p.positionalRank });
  }
  return out;
}

// Same normalization the FP/UD/ESPN adapters use, so the value page
// can join across all four sources by name.
export const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, "")
    .replace(/[.\s'’-]/g, "")
    .replace(/[^a-z0-9]/g, "");

export function indexRingerByName(rows: RingerPlayer[]): Map<string, RingerPlayer> {
  const out = new Map<string, RingerPlayer>();
  for (const p of rows) {
    const k = normalizeName(p.name);
    if (!out.has(k)) out.set(k, p);
  }
  return out;
}
