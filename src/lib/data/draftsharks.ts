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

// Parses one auction-values page. Each player is wrapped in a
// `<tbody data-player-row data-fantasy-position="QB" data-player-name="..." ...>`
// element (not <tr> — rows for tier separators use <tr>). Inside each
// tbody, the `<td data-attribute="dsAuctionValue" data-value="$31">`
// cell holds the auction value.
//
// Attribute order on the tbody and inside cells varies — we match
// either ordering. Tag-attributes can span multiple lines.
export function parseAuctionPage(html: string, pos: DsAuctionPlayer["position"]): DsAuctionPlayer[] {
  const players: DsAuctionPlayer[] = [];
  const seen = new Set<string>();

  // Walk the HTML by every `<tbody` opening. Match the full opening
  // tag including line breaks. Skip closing tags via the `\b` after
  // the literal `tbody`.
  const tbodyRegex = /<tbody\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = tbodyRegex.exec(html)) !== null) {
    const tag = m[0];
    if (!/\bdata-player-row\b/.test(tag)) continue;

    const nameMatch = tag.match(/\bdata-player-name="([^"]+)"/);
    const posMatch = tag.match(/\bdata-fantasy-position="([^"]+)"/);
    if (!nameMatch || !posMatch) continue;

    const playerName = nameMatch[1];
    const playerPos = posMatch[1].toUpperCase();
    if (playerPos !== pos) continue;
    if (seen.has(playerName)) continue;
    seen.add(playerName);

    // Slice forward to capture the row's cells. Each player tbody
    // closes with </tbody>.
    const rest = html.slice(m.index, m.index + 16000);
    const endIdx = rest.indexOf("</tbody>");
    const window = endIdx >= 0 ? rest.slice(0, endIdx) : rest;

    const valueMatch =
      window.match(/data-attribute="dsAuctionValue"[^>]*data-value="([^"]+)"/) ||
      window.match(/data-value="([^"]+)"[^>]*data-attribute="dsAuctionValue"/);
    if (!valueMatch) continue;

    const dollar = valueMatch[1].replace(/[^0-9.\-]/g, "");
    if (!dollar) continue;
    const dsAuctionValue = Number(dollar);
    if (!Number.isFinite(dsAuctionValue) || dsAuctionValue < 0) continue;

    const teamMatch = window.match(/team-position-logo-container[\s\S]{0,200}?<span>([A-Z]{2,4})<\/span>/);
    const team = teamMatch?.[1] ?? "";

    players.push({
      name: playerName,
      position: pos,
      team,
      dsAuctionValue,
      posRank: 0,
    });
  }

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
