import "server-only";

import data from "./best-ball-adp.json";

// FantasyPros Best Ball ADP positional rankings, sourced via
// scripts/scrape-best-ball-adp.mjs from
// fantasypros.com/nfl/adp/best-ball-{pos}.php. The score is the
// positional rank within QB/RB/WR/TE derived from the average ADP
// across BB10, RTSports, Underdog, Drafters, and DraftKings.
//
// Best Ball ADP captures actual draft behavior — what experts and
// active drafters are doing right now — and complements the analyst-
// driven sources (FantasyPros consensus ECR, Underdog rankings,
// ESPN, Ringer) on the Value Plays consensus.

export interface BbAdpPlayer {
  name: string;
  position: "QB" | "RB" | "WR" | "TE";
  posRank: number;
}

type RawJson = {
  QB: [number, string][];
  RB: [number, string][];
  WR: [number, string][];
  TE: [number, string][];
};

export function getBestBallAdp(): BbAdpPlayer[] {
  const json = data as unknown as RawJson;
  const out: BbAdpPlayer[] = [];
  (["QB", "RB", "WR", "TE"] as const).forEach((pos) => {
    for (const [posRank, name] of json[pos] ?? []) {
      out.push({ name, position: pos, posRank });
    }
  });
  return out;
}

// Same normalization the other rankings loaders use so callers can
// reuse the roster join.
export const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, "")
    .replace(/[.\s'’-]/g, "")
    .replace(/[^a-z0-9]/g, "");

export function indexBbByName(rows: BbAdpPlayer[]): Map<string, BbAdpPlayer> {
  const out = new Map<string, BbAdpPlayer>();
  for (const p of rows) {
    const k = normalizeName(p.name);
    if (!out.has(k)) out.set(k, p);
  }
  return out;
}
