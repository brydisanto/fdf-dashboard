#!/usr/bin/env node
/*
 * Scrape The Ringer's preseason PPR rankings into
 * src/lib/data/ringer-rankings.json. Matches the Underdog/ESPN
 * snapshot pattern — manual refresh by re-running this script when
 * the source updates (typically a few times per off-season).
 *
 * Source: https://theringer.com/fantasy-football/2026-preseason?draft=ppr
 * Format: each player's record is embedded as JSON-in-JSON in a
 * Next.js RSC payload. We extract via regex over the raw HTML.
 *
 * The Ringer reports a "consensus" ranking that's the average of three
 * experts (Danny Heifetz, Danny Kelly, Craig Horlbeck). The
 * `positionalRankings.ppr` field is the Ringer's published positional
 * rank — what we want for the Value Machine comparison.
 *
 * Run:
 *   node scripts/scrape-ringer.mjs
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL = "https://theringer.com/fantasy-football/2026-preseason?draft=ppr";

async function fetchHtml() {
  const res = await fetch(URL, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`Ringer fetch ${res.status}`);
  return res.text();
}

// Each player record looks like (after escape-unmangling):
//   {"id":8,"playerImageId":"...","name":"Bijan Robinson","firstName":"...","lastName":"...",
//    ...,"team":"Falcons","playerMeta":{...,"teamAbbreviation":"ATL",...},
//    ...,"position":"rb","rankings":{...,"ppr":2},
//    "positionalRankings":{...,"ppr":2},...
//
// The keys are double-escaped (\\\"name\\\") because the JSON is
// embedded inside another JSON string in the RSC payload. We work
// on the raw escaped form via regex.
function extractPlayers(html) {
  const out = [];
  // Anchor on the start of each record so we don't conflate fields
  // from adjacent players. The `playerImageId` field is a reliable
  // per-record anchor that doesn't appear elsewhere.
  const recordRe = /\\"playerImageId\\":\\"([^\\"]+)\\",\\"name\\":\\"([^\\"]+)\\",\\"firstName\\":\\"([^\\"]*)\\",\\"lastName\\":\\"([^\\"]*)\\"/g;
  let m;
  while ((m = recordRe.exec(html))) {
    const [matchStr, playerImageId, name, firstName, lastName] = m;
    const recStart = m.index;
    // Look for the closing record marker — next record's playerImageId
    // or end of array. Use a 4000-char window (each record is ~2500
    // chars).
    const window = html.slice(recStart, recStart + 4000);

    const teamAbbrM = window.match(/\\"teamAbbreviation\\":\\"([A-Z]+)\\"/);
    const positionM = window.match(/\\"position\\":\\"([a-z]+)\\"/);
    const positionalRankM = window.match(/\\"positionalRankings\\":\{[^}]*\\"ppr\\":(\d+)/);
    const overallRankM = window.match(/\\"rankings\\":\{[^}]*\\"ppr\\":(\d+)/);

    if (!positionM) continue;
    const position = positionM[1].toUpperCase();
    if (!["QB", "RB", "WR", "TE"].includes(position)) continue;

    const positionalRank = positionalRankM ? Number(positionalRankM[1]) : null;
    const overallRank = overallRankM ? Number(overallRankM[1]) : null;

    if (positionalRank === null || positionalRank >= 9999) continue;

    out.push({
      name,
      firstName,
      lastName,
      team: teamAbbrM ? teamAbbrM[1] : null,
      position,
      positionalRank,
      overallRank: overallRank && overallRank < 9999 ? overallRank : null,
    });
  }
  return out;
}

async function main() {
  const html = await fetchHtml();
  const players = extractPlayers(html);
  // Dedupe by name — RSC payloads sometimes repeat records in
  // different list contexts. Keep the first occurrence.
  const seen = new Set();
  const deduped = players.filter((p) => {
    const key = p.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Sort within each position by positionalRank ASC.
  deduped.sort((a, b) => {
    if (a.position !== b.position) return a.position.localeCompare(b.position);
    return a.positionalRank - b.positionalRank;
  });

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const outPath = path.resolve(__dirname, "..", "src/lib/data/ringer-rankings.json");
  await fs.writeFile(
    outPath,
    JSON.stringify(
      {
        source: URL,
        scrapedAt: new Date().toISOString(),
        players: deduped,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  console.log(`Wrote ${deduped.length} player rankings to ${outPath}`);
  console.log("Position counts:");
  for (const pos of ["QB", "RB", "WR", "TE"]) {
    const count = deduped.filter((p) => p.position === pos).length;
    console.log(`  ${pos}: ${count}`);
  }
  console.log("\nTop 5:");
  for (const p of deduped.slice(0, 5)) {
    console.log(`  ${p.position}${p.positionalRank} ${p.name} (${p.team}) — overall #${p.overallRank ?? "—"}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
