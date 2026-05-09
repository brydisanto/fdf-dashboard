import "server-only";

// Pulls Draft Sharks PPR auction values for QB/RB/WR/TE by scraping
// the public auction-values pages. Each row is server-rendered HTML
// with `data-player-name="..." data-fantasy-position="QB"` on the
// <tr> and a `data-attribute="dsAuctionValue" data-value="$31"` cell
// inside it. No API key required.
//
// Refresh hourly — auction values are slow-moving but we want to
// pick up updates within a draft cycle.

export interface DsAuctionPlayer {
  name: string;
  position: "QB" | "RB" | "WR" | "TE";
  team: string;
  // Draft Sharks recommended auction value, in dollars (e.g. 31).
  // Their suggested bid based on a 12-team $200 budget format.
  dsAuctionValue: number;
  // Numeric positional rank derived from auction value within
  // position (1 = highest auction value at this position).
  posRank: number;
}

const POS_PATHS: { url: string; pos: DsAuctionPlayer["position"] }[] = [
  { url: "https://www.draftsharks.com/auction-values/qb/ppr", pos: "QB" },
  { url: "https://www.draftsharks.com/auction-values/rb/ppr", pos: "RB" },
  { url: "https://www.draftsharks.com/auction-values/wr/ppr", pos: "WR" },
  { url: "https://www.draftsharks.com/auction-values/te/ppr", pos: "TE" },
];

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export async function getDsAuctionValues(): Promise<DsAuctionPlayer[]> {
  const results = await Promise.all(POS_PATHS.map(scrapePosition));
  return results.flat();
}

async function scrapePosition(p: { url: string; pos: DsAuctionPlayer["position"] }): Promise<DsAuctionPlayer[]> {
  try {
    const res = await fetch(p.url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const html = await res.text();
    return parseAuctionPage(html, p.pos);
  } catch {
    return [];
  }
}

// Parses one auction-values page. Strategy: locate every <tr ...> that
// declares both `data-player-name` and `data-fantasy-position`, then
// for that row search forward (within ~10KB) for the
// `data-attribute="dsAuctionValue"` cell and lift `data-value`.
//
// Tolerant to attribute order and whitespace. Skips rows missing a
// recognizable `$N` value.
export function parseAuctionPage(html: string, pos: DsAuctionPlayer["position"]): DsAuctionPlayer[] {
  const players: DsAuctionPlayer[] = [];

  // Match player-row openings. `data-player-name` and
  // `data-fantasy-position` always appear on the same <tr>.
  const rowRegex = /<tr\b[^>]*\bdata-player-name="([^"]+)"[^>]*\bdata-fantasy-position="([^"]+)"[^>]*>/gi;

  let m: RegExpExecArray | null;
  while ((m = rowRegex.exec(html)) !== null) {
    const playerName = m[1];
    const playerPos = m[2].toUpperCase();
    if (playerPos !== pos) continue;

    // Slice forward so we capture the row's own cells but not the
    // next row's. End-of-row marker `</tr>` is the cleanest stop.
    const rest = html.slice(m.index, m.index + 12000);
    const endIdx = rest.indexOf("</tr>");
    const window = endIdx >= 0 ? rest.slice(0, endIdx) : rest;

    // Find dsAuctionValue cell in the window. The order of the two
    // attributes inside the <td> varies — try both.
    const valueMatch =
      window.match(/data-attribute="dsAuctionValue"[^>]*data-value="([^"]+)"/) ||
      window.match(/data-value="([^"]+)"[^>]*data-attribute="dsAuctionValue"/);
    if (!valueMatch) continue;

    const dollar = valueMatch[1].replace(/[^0-9.\-]/g, "");
    if (!dollar) continue;
    const dsAuctionValue = Number(dollar);
    if (!Number.isFinite(dsAuctionValue) || dsAuctionValue < 0) continue;

    // Extract team — there's a <span>BUF</span> right after a class
    // 'team-position-logo-container'. Best-effort; not load-bearing.
    const teamMatch = window.match(/team-position-logo-container[\s\S]{0,200}?<span>([A-Z]{2,4})<\/span>/);
    const team = teamMatch?.[1] ?? "";

    players.push({
      name: playerName,
      position: pos,
      team,
      dsAuctionValue,
      posRank: 0, // placeholder — assigned below after sort
    });
  }

  // Sort descending by auction value, assign 1-indexed posRank.
  players.sort((a, b) => b.dsAuctionValue - a.dsAuctionValue);
  players.forEach((p, i) => { p.posRank = i + 1; });
  return players;
}

// Same normalization as fantasypros so callers can reuse roster joins.
export const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, "")
    .replace(/[.\s'’-]/g, "")
    .replace(/[^a-z0-9]/g, "");

export function indexDsByName(rows: DsAuctionPlayer[]): Map<string, DsAuctionPlayer> {
  const out = new Map<string, DsAuctionPlayer>();
  for (const p of rows) {
    const k = normalizeName(p.name);
    if (!out.has(k)) out.set(k, p);
  }
  return out;
}
