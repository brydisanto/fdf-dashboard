import "server-only";

import data from "./espn-rankings.json";

// ESPN Fantasy preseason 2026 PPR positional rankings — the AVG
// column from each position's draft-rankings article (mean of 8
// ESPN expert rankers). Sourced manually via Chrome MCP because
// ESPN's rankings tables are JS-rendered after page load. Refresh
// by re-running the scrape and overwriting espn-rankings.json.
//
// AVG is fractional (e.g. Allen 1.1, Jackson 2.9). We use it as
// ESPN's positional rank for the industry-average comparison.

export interface EspnPlayer {
  name: string;
  position: "QB" | "RB" | "WR" | "TE";
  // Fractional rank — ESPN's mean across their staff.
  avgRank: number;
}

type RawJson = {
  QB: [string, number][];
  RB: [string, number][];
  WR: [string, number][];
  TE: [string, number][];
};

export function getEspnRankings(): EspnPlayer[] {
  const json = data as unknown as RawJson;
  const out: EspnPlayer[] = [];
  (["QB", "RB", "WR", "TE"] as const).forEach((pos) => {
    for (const [name, avgRank] of json[pos] ?? []) {
      out.push({ name, position: pos, avgRank });
    }
  });
  return out;
}

// Same normalization the FP/UD adapters use, so the value page can
// join across all three sources by name.
export const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, "")
    .replace(/[.\s'’-]/g, "")
    .replace(/[^a-z0-9]/g, "");

export function indexEspnByName(rows: EspnPlayer[]): Map<string, EspnPlayer> {
  const out = new Map<string, EspnPlayer>();
  for (const p of rows) {
    const k = normalizeName(p.name);
    if (!out.has(k)) out.set(k, p);
  }
  return out;
}
