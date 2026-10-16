#!/usr/bin/env node
/*
 * Builds data/tournament-matrix-2026.json from a capture of Sport.fun's
 * own weekly tournament standings.
 *
 * Why a different source from 2025: the 2025 matrix was scraped from a
 * community page (nfl-fun.vercel.app), which stopped updating in April
 * 2026 and never carried the 2026 season. Sport.fun's Live Scores API is
 * the upstream of record — each weekly tournament exposes per-position
 * standings with the player's rank, fantasy points, and the reward it
 * earned. A reward is paid exactly to the top 3 at QB/TE and the top 5 at
 * RB/WR, which is FDF's tournament-points rule, so `earnedTP` is taken
 * straight from it rather than recomputed from rank.
 *
 * The API needs a signed-in session, so the capture is taken in a
 * browser (see the snippet in data/tournament-matrix-2026-capture.json's
 * _note) and this script does the rest offline.
 *
 * Output matches the 2025 file's schema, so the page renders either.
 *
 *   node scripts/build-tournament-matrix-2026.mjs           # dry run
 *   node scripts/build-tournament-matrix-2026.mjs --write
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SEASON = 2026;
const POSITIONS = ["QB", "RB", "WR", "TE"];
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadRoster() {
  const src = await fs.readFile(path.join(repoRoot, "src/lib/data/roster.ts"), "utf8");
  const rows = [...src.matchAll(/\[\s*"([a-z0-9-]+)",\s*"([^"]+)",\s*"(QB|RB|WR|TE)",\s*"([A-Z]+)",[^\]]*?"(\d+)"\s*\]/g)];
  return new Map(rows.map((m) => [m[5], { id: m[1], displayName: m[2], position: m[3], team: m[4] }]));
}

function seasonStats(weeks) {
  const played = weeks.filter((w) => w.rank != null);
  const ranks = played.map((w) => w.rank);
  const points = played.map((w) => w.points);
  const counts = { firsts: 0, seconds: 0, thirds: 0, fourths: 0, fifths: 0 };
  let tpCount = 0;
  for (const w of played) {
    if (w.rank === 1) counts.firsts++;
    if (w.rank === 2) counts.seconds++;
    if (w.rank === 3) counts.thirds++;
    if (w.rank === 4) counts.fourths++;
    if (w.rank === 5) counts.fifths++;
    if (w.earnedTP) tpCount++;
  }
  const mean = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null);
  return {
    played: played.length,
    avg: mean(ranks),
    best: ranks.length ? Math.min(...ranks) : null,
    avgPoints: mean(points),
    tpRate: ranks.length ? +(tpCount / ranks.length).toFixed(3) : null,
    tpCount,
    ...counts,
  };
}

async function main() {
  const capture = JSON.parse(
    await fs.readFile(path.join(repoRoot, "data", "tournament-matrix-2026-capture.json"), "utf8"),
  );
  const roster = await loadRoster();
  const weeksOrdered = capture.weeks.map((w) => w.week);

  // tokenId → { pos, byWeek: Map(week → {rank, points, earnedTP}) }
  const players = new Map();
  const unmatched = new Set();
  for (const wk of capture.weeks) {
    for (const pos of POSITIONS) {
      for (const [tid, rank, points, tp] of wk.rows[pos] ?? []) {
        if (!roster.has(tid)) { unmatched.add(`${pos}: token ${tid}`); continue; }
        let p = players.get(tid);
        if (!p) players.set(tid, (p = { pos, byWeek: new Map() }));
        // A null rank means the player was listed but did not play (an
        // inactive or injured week). Treat it like a bye: no finish, no
        // points, so it can't drag an average down with a phantom zero.
        p.byWeek.set(wk.week, rank == null
          ? { rank: null, points: null, earnedTP: false }
          : { rank, points: +Number(points).toFixed(2), earnedTP: !!tp });
      }
    }
  }

  const byPosition = { QB: [], RB: [], WR: [], TE: [] };
  for (const [tid, p] of players) {
    const r = roster.get(tid);
    const weeks = weeksOrdered.map((w) => ({
      week: w,
      ...(p.byWeek.get(w) ?? { rank: null, points: null, earnedTP: false }),
    }));
    byPosition[p.pos].push({
      playerId: r.id,
      displayName: r.displayName,
      team: r.team,
      weeks,
      stats: seasonStats(weeks),
    });
  }
  for (const pos of POSITIONS) {
    byPosition[pos].sort((a, b) => (a.stats.avg ?? 999) - (b.stats.avg ?? 999));
  }

  const matched = POSITIONS.reduce((a, p) => a + byPosition[p].length, 0);
  const snapshot = {
    season: SEASON,
    weeks: weeksOrdered[weeksOrdered.length - 1] ?? 0,
    weeksOrdered,
    weekDates: Object.fromEntries(capture.weeks.map((w) => [w.week, { first: w.firstKickoff, last: w.lastKickoff }])),
    generatedAt: new Date().toISOString(),
    capturedAt: capture.capturedAt,
    source: "pro.football.fun Live Scores standings",
    scoring: "fdf",
    matched,
    unmatched: [...unmatched],
    byPosition,
  };

  // Sanity: every completed week pays exactly 3 + 5 + 5 + 3 placements.
  for (const w of weeksOrdered) {
    const tp = POSITIONS.reduce((a, pos) => a + byPosition[pos].filter((p) => p.weeks.find((x) => x.week === w)?.earnedTP).length, 0);
    if (tp !== 16) console.error(`  warning: week ${w} has ${tp} TP placements, expected 16`);
  }

  if (!process.argv.includes("--write")) {
    console.log(JSON.stringify({
      weeks: weeksOrdered,
      matched,
      unmatched: snapshot.unmatched,
      counts: Object.fromEntries(POSITIONS.map((p) => [p, byPosition[p].length])),
      topRB: byPosition.RB.slice(0, 2).map((p) => ({ name: p.displayName, ...p.stats })),
    }, null, 2));
    return;
  }
  const out = path.join(repoRoot, "data", "tournament-matrix-2026.json");
  await fs.writeFile(out, JSON.stringify(snapshot) + "\n", "utf8");
  console.log(`Wrote ${out}: ${matched} players across weeks ${weeksOrdered.join(",")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
