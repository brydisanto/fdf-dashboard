import "server-only";

// Pulls FantasyPros' consensus PPR rankings by scraping the public
// cheatsheet page, which embeds the data as `ecrData = {...}` in inline
// JS. No API key required.

export interface FpPlayer {
  playerId: number;
  playerName: string;
  shortName: string;
  team: string;
  position: string;       // QB / RB / WR / TE
  rankEcr: number;        // overall consensus rank
  posRank: string;        // e.g. "RB1", "WR3"
  posRankNum: number;     // numeric portion of posRank
  rankMin: number;
  rankMax: number;
  rankAve: number;
  rankStd: number;
  tier: number;
  rankAdp?: number;
  ecrVsAdp?: number;
  ownedPerc?: number;
  byeWeek?: number;
}

const FP_URL = "https://www.fantasypros.com/nfl/rankings/ppr-cheatsheets.php";

export async function getFantasyProsRankings(): Promise<FpPlayer[]> {
  try {
    const res = await fetch(FP_URL, {
      headers: {
        // The page returns a stripped layout to non-browser UAs.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      next: { revalidate: 3600 }, // hourly refresh
    });
    if (!res.ok) return [];
    const html = await res.text();

    // Extract `ecrData = { ... };`
    const match = html.match(/ecrData\s*=\s*(\{[\s\S]*?\});\s*\n/);
    if (!match) return [];

    const ecr = JSON.parse(match[1]) as {
      players?: Array<Record<string, unknown>>;
    };
    if (!Array.isArray(ecr.players)) return [];

    return ecr.players
      .map((p): FpPlayer | null => {
        const posRank = String(p.pos_rank ?? "");
        const m = posRank.match(/(\d+)/);
        const posRankNum = m ? Number(m[1]) : 0;
        const position = String(p.player_position_id ?? "").toUpperCase();
        if (!position) return null;
        return {
          playerId: Number(p.player_id ?? 0),
          playerName: String(p.player_name ?? ""),
          shortName: String(p.player_short_name ?? p.player_name ?? ""),
          team: String(p.player_team_id ?? ""),
          position,
          rankEcr: Number(p.rank_ecr ?? 0),
          posRank,
          posRankNum,
          rankMin: Number(p.rank_min ?? 0),
          rankMax: Number(p.rank_max ?? 0),
          rankAve: Number(p.rank_ave ?? 0),
          rankStd: Number(p.rank_std ?? 0),
          tier: Number(p.tier ?? 0),
          rankAdp: p.rank_adp != null ? Number(p.rank_adp) : undefined,
          ecrVsAdp: p.ecr_vs_adp != null ? Number(p.ecr_vs_adp) : undefined,
          ownedPerc: p.owned_perc != null ? Number(p.owned_perc) : undefined,
          byeWeek: p.player_bye_week != null ? Number(p.player_bye_week) : undefined,
        };
      })
      .filter((p): p is FpPlayer => p != null);
  } catch {
    return [];
  }
}

// Match an FP player to one of our 72 NFL roster IDs by normalized name.
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, "")
    .replace(/[.\s'’-]/g, "")
    .replace(/[^a-z0-9]/g, "");

export function indexFpByName(rows: FpPlayer[]): Map<string, FpPlayer> {
  const out = new Map<string, FpPlayer>();
  for (const p of rows) {
    const k = norm(p.playerName);
    if (!out.has(k)) out.set(k, p);
  }
  return out;
}

export { norm as normalizeName };
