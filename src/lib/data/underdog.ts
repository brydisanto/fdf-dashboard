import "server-only";

import data from "./underdog-rankings.json";

// Underdog Sports PPR positional rankings, sourced manually from
// app.underdogsports.com/rankings/nfl/<RANKER_ID> via Chrome MCP and
// committed to underdog-rankings.json. The Underdog app sits behind
// Cloudflare bot protection, so we can't scrape it from a serverless
// runtime — refresh by re-running the Chrome MCP scrape and updating
// the JSON file when rankings shift meaningfully.

export interface UdPlayer {
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

export function getUnderdogRankings(): UdPlayer[] {
  const json = data as unknown as RawJson;
  const out: UdPlayer[] = [];
  (["QB", "RB", "WR", "TE"] as const).forEach((pos) => {
    for (const [posRank, name] of json[pos] ?? []) {
      out.push({ name, position: pos, posRank });
    }
  });
  return out;
}

// Mirror the FantasyPros normalize so callers can join across sources.
export const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, "")
    .replace(/[.\s'’-]/g, "")
    .replace(/[^a-z0-9]/g, "");

export function indexUdByName(rows: UdPlayer[]): Map<string, UdPlayer> {
  const out = new Map<string, UdPlayer>();
  for (const p of rows) {
    const k = normalizeName(p.name);
    if (!out.has(k)) out.set(k, p);
  }
  return out;
}
