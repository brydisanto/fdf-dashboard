import "server-only";

import data from "./underdog-rankings.json";

// Underdog positional ranks, committed to underdog-rankings.json.
//
// Source changed 2026-07-17. This used to come from
// app.underdogsports.com/rankings/nfl/<RANKER_ID> — one Underdog
// ranker's editorial list — but that page now requires a login, so
// it can't be refreshed unattended. The ranks now come from the
// UNDERDOG column of FantasyPros' Best Ball ADP tables, i.e.
// Underdog's own best-ball ADP expressed as a positional rank. It's
// the same book, but it measures real draft behavior rather than a
// ranker's opinion — and it refreshes in the same Chrome pass that
// feeds best-ball-adp.json.
//
// Caveat worth remembering: Underdog is ALSO one of the five books
// averaged into best-ball-adp.json, so these two Value Plays sources
// now partially overlap. Underdog ends up carrying ~24% of the
// 5-source consensus (a full 1/5 slot, plus 1/5 of the BB ADP slot)
// against 20% for each fully independent source. Small enough to
// live with; large enough to not forget.

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
