#!/usr/bin/env node
// Scrape FantasyPros Best Ball ADP for QB/RB/WR/TE and write
// src/lib/data/best-ball-adp.json. This source is the 5th leg of the
// Value Plays consensus, alongside FantasyPros consensus ECR
// (cheatsheet), Underdog, ESPN, and The Ringer.
//
// Each positional page (best-ball-qb.php, best-ball-rb.php, etc.)
// embeds a server-rendered <table id="data"> with one row per player.
// Column 1 is the positional rank derived from the average ADP
// across BB10, RTSports, Underdog, Drafters, and DraftKings.
//
//   node scripts/scrape-best-ball-adp.mjs

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "src", "lib", "data", "best-ball-adp.json");

const POSITIONS = ["QB", "RB", "WR", "TE"];

// Pulled from a real browser — the FantasyPros site returns a stripped
// layout if the User-Agent looks like a bot, which would lose the
// table#data we parse below.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

async function scrapeOne(pos) {
  const url = `https://www.fantasypros.com/nfl/adp/best-ball-${pos.toLowerCase()}.php`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  const html = await res.text();

  // Isolate the table#data — the page has multiple tables, so we
  // anchor on the exact opening tag the FP template emits.
  const tableStart = html.indexOf('<table cellpadding="0" cellspacing="0" border="0" id="data"');
  if (tableStart < 0) throw new Error(`No table#data in ${url}`);
  const tableEnd = html.indexOf("</table>", tableStart);
  const tableHtml = html.slice(tableStart, tableEnd + 8);

  // tr rows — first is the header.
  const rowMatches = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  const out = [];
  for (let i = 1; i < rowMatches.length; i++) {
    const cells = [...rowMatches[i][1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) =>
      m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
    );
    if (cells.length < 3) continue;
    const posRank = parseInt(cells[0], 10);
    // Player cell looks like: "Josh Allen BUF (7)". Strip the trailing
    // team + bye. Defensive: the row may have a leading-space "name "
    // shape on some pages.
    const nameRaw = cells[2] ?? "";
    const name = nameRaw
      .replace(/\s+\([0-9]+\)\s*$/, "")           // strip "(7)" bye
      .replace(/\s+[A-Z]{2,3}\s*$/, "")           // strip trailing team abbr
      .trim();
    if (!Number.isFinite(posRank) || !name) continue;
    out.push([posRank, name]);
  }
  return out;
}

async function main() {
  const result = {
    _note:
      "FantasyPros Best Ball ADP positional rankings — column 1 of each /nfl/adp/best-ball-{pos}.php page. ADP is averaged across BB10, RTSports, Underdog, Drafters, and DraftKings. Each entry is [posRank, name].",
    updatedAt: new Date().toISOString().slice(0, 10),
  };
  for (const pos of POSITIONS) {
    const rows = await scrapeOne(pos);
    result[pos] = rows;
    console.log(`  ${pos}: ${rows.length} — top: ${rows[0]?.[1]} (${rows[0]?.[0]})`);
  }
  writeFileSync(OUT_PATH, JSON.stringify(result, null, 2) + "\n");
  console.log(`\nWrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
