#!/usr/bin/env node
/*
 * Builds data/tournament-matrix.json from the upstream tournament-matrix
 * page at nfl-fun.vercel.app. That page embeds the full per-position,
 * per-week placement data (rank + fantasy points) as React Server
 * Component payloads in its initial HTML — we extract those and
 * persist the resulting facts to JSON.
 *
 * Why scrape rather than recompute from raw stats:
 *   FDF's tournament platform uses its own weekly-finish bracket
 *   tiers (the "earnedTP" / top-placement designation) and a
 *   scoring formula that doesn't map cleanly to standard PPR.
 *   Pulling the values they actually computed keeps our matrix
 *   numerically consistent with the upstream of record.
 *
 * Output schema (data/tournament-matrix.json):
 *   {
 *     season, weeks, generatedAt, source,
 *     byPosition: {
 *       QB|RB|WR|TE: [
 *         { playerId, displayName, team, weeks:[{week,rank,points}],
 *           stats:{ avg, best, avgPoints, tpRate, firsts..fifths, top12 } }
 *       ]
 *     }
 *   }
 *
 * Run with: node scripts/build-tournament-matrix.mjs --write
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const UPSTREAM_URL = "https://nfl-fun.vercel.app/nfl/tournament-matrix";
const SEASON = 2025;
const POSITIONS = ["QB", "RB", "WR", "TE"];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

// ── 1. Load FDF roster (display-name / position / team map) ─────
async function loadRoster() {
  const src = await fs.readFile(path.join(repoRoot, "src/lib/data/roster.ts"), "utf8");
  const out = [];
  const rowRe = /\[\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,/g;
  let m;
  while ((m = rowRe.exec(src)) !== null) {
    const [, id, displayName, position, team] = m;
    out.push({ id, displayName, position, team });
  }
  return out;
}

const stripSuffix = (s) => String(s).replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, "");
const normName = (s) =>
  stripSuffix(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");

// ── 2. Fetch + extract embedded position payloads ───────────────
//
// The upstream page is Next.js streaming SSR. Each position's data
// is serialized as a React Server Component slot of the form:
//
//   ["$","$L11","RB",{"position":"RB","playerData":[{...},{...}]}]
//
// We walk the HTML for the `"position":"<POS>","playerData":[`
// anchor, then bracket-balance forward to find the end of the
// playerData array. That gives us a clean JSON array of player
// records per position.
async function fetchUpstreamHtml() {
  const res = await fetch(UPSTREAM_URL, {
    headers: { "user-agent": "Mozilla/5.0 (gridiron-indexer)" },
  });
  if (!res.ok) throw new Error(`upstream HTTP ${res.status}`);
  return res.text();
}

function extractPlayerArray(html, position) {
  // The HTML escapes inside Next streaming payloads use `\"` —
  // strip the escapes first so we can scan a clean JSON view.
  const decoded = html.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  const anchor = `"position":"${position}","playerData":[`;
  const start = decoded.indexOf(anchor);
  if (start < 0) return null;
  const arrStart = start + anchor.length - 1; // points at the opening [
  // Bracket-balance walk through the array.
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = arrStart; i < decoded.length; i++) {
    const c = decoded[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) {
        const slice = decoded.slice(arrStart, i + 1);
        try { return JSON.parse(slice); }
        catch (err) {
          throw new Error(`Failed to parse ${position} playerData JSON: ${err.message}`);
        }
      }
    }
  }
  return null;
}

// ── 3. Normalize one upstream record into our schema ────────────
function normalizePlayer(raw, weeksOrdered) {
  const weeklyPlacements = raw.weeklyPlacements ?? {};
  const weeks = weeksOrdered.map((w) => {
    const entry = weeklyPlacements[String(w)] ?? weeklyPlacements[w];
    if (!entry) return { week: w, rank: null, points: null };
    return {
      week: w,
      rank: Number.isFinite(entry.rank) ? entry.rank : null,
      points: Number.isFinite(entry.fantasyPoints) ? +Number(entry.fantasyPoints).toFixed(2) : null,
    };
  });

  // Season rollups computed over weeks the player actually played.
  const played = weeks.filter((w) => w.rank != null);
  const ranks = played.map((w) => w.rank);
  const points = played.map((w) => w.points);
  const counts = { firsts: 0, seconds: 0, thirds: 0, fourths: 0, fifths: 0, top12: 0 };
  for (const r of ranks) {
    if (r === 1) counts.firsts++;
    if (r === 2) counts.seconds++;
    if (r === 3) counts.thirds++;
    if (r === 4) counts.fourths++;
    if (r === 5) counts.fifths++;
    if (r <= 12) counts.top12++;
  }
  const avg = ranks.length ? +(ranks.reduce((a, x) => a + x, 0) / ranks.length).toFixed(2) : null;
  const best = ranks.length ? Math.min(...ranks) : null;
  const avgPoints = points.length ? +(points.reduce((a, x) => a + x, 0) / points.length).toFixed(2) : null;
  const tpRate = ranks.length ? +(counts.top12 / ranks.length).toFixed(3) : null;

  return {
    displayName: raw.playerName,
    team: raw.team,
    weeks,
    stats: { played: played.length, avg, best, avgPoints, tpRate, ...counts },
  };
}

// ── 4. Build the matrix ─────────────────────────────────────────
async function main() {
  const verbose = !!process.env.GRIDIRON_VERBOSE;
  const args = process.argv.slice(2);
  const shouldWrite = args.includes("--write");

  if (verbose) console.error("[1/3] Loading FDF roster…");
  const roster = await loadRoster();
  const rosterByName = new Map();
  for (const r of roster) rosterByName.set(normName(r.displayName), r);

  if (verbose) console.error("[2/3] Fetching upstream tournament-matrix HTML…");
  const html = await fetchUpstreamHtml();

  // Figure out the season's week range. The upstream embeds a
  // "weeks":[1,2,...,18] array — we sniff that first so the output
  // matches whatever the upstream currently spans.
  let weeksOrdered;
  {
    const decoded = html.replace(/\\"/g, '"');
    const m = decoded.match(/"weeks":\[([0-9,\s]+)\]/);
    if (m) {
      weeksOrdered = m[1].split(",").map((x) => parseInt(x.trim(), 10)).filter(Number.isFinite);
    } else {
      weeksOrdered = Array.from({ length: 18 }, (_, i) => i + 1);
    }
  }

  if (verbose) console.error(`[3/3] Parsing position payloads (weeks 1..${weeksOrdered[weeksOrdered.length - 1]})…`);
  const byPosition = { QB: [], RB: [], WR: [], TE: [] };
  let totalUpstream = 0;
  let totalMatched = 0;
  const unmatched = [];
  for (const pos of POSITIONS) {
    const rows = extractPlayerArray(html, pos);
    if (!rows) {
      if (verbose) console.error(`  ${pos}: no playerData section found`);
      continue;
    }
    totalUpstream += rows.length;
    for (const raw of rows) {
      const normalized = normalizePlayer(raw, weeksOrdered);
      const rosterMatch = rosterByName.get(normName(raw.playerName));
      if (!rosterMatch) {
        unmatched.push(`${pos}: ${raw.playerName}`);
        continue;
      }
      byPosition[pos].push({
        playerId: rosterMatch.id,   // canonical FDF roster id
        ...normalized,
        team: rosterMatch.team,     // prefer roster's team in case upstream differs
      });
      totalMatched++;
    }
    // Sort each position by avg finish ascending (best avg first).
    byPosition[pos].sort((a, b) => {
      const aAvg = a.stats.avg ?? 999;
      const bAvg = b.stats.avg ?? 999;
      return aAvg - bAvg;
    });
    if (verbose) console.error(`  ${pos}: ${byPosition[pos].length} on FDF roster (${rows.length} total in upstream)`);
  }

  const snapshot = {
    season: SEASON,
    weeks: weeksOrdered[weeksOrdered.length - 1] ?? 18,
    weeksOrdered,
    generatedAt: new Date().toISOString(),
    source: "nfl-fun.vercel.app/nfl/tournament-matrix",
    scoring: "fdf",
    matched: totalMatched,
    upstreamCount: totalUpstream,
    unmatched,
    byPosition,
  };

  if (!shouldWrite) {
    process.stdout.write(JSON.stringify({
      season: snapshot.season,
      weeks: snapshot.weeks,
      matched: snapshot.matched,
      unmatched: snapshot.unmatched,
      counts: Object.fromEntries(POSITIONS.map((p) => [p, byPosition[p].length])),
      sampleRB: byPosition.RB.slice(0, 2),
    }, null, 2));
    return;
  }

  const dataDir = path.join(repoRoot, "data");
  await fs.mkdir(dataDir, { recursive: true });
  const outPath = path.join(dataDir, "tournament-matrix.json");
  await fs.writeFile(outPath, JSON.stringify(snapshot) + "\n", "utf8");
  console.log(
    `Wrote ${outPath}: ${totalMatched}/${roster.length} roster players matched · ` +
    POSITIONS.map((p) => `${p}=${byPosition[p].length}`).join(" "),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
