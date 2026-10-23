#!/usr/bin/env node
/*
 * Merges a capture produced by scripts/sportfun-capture.browser.js into
 * data/tournament-matrix-2026-capture.json, then rebuilds the matrix.
 *
 *   node scripts/merge-sportfun-capture.mjs <capture.txt>          # dry run
 *   node scripts/merge-sportfun-capture.mjs <capture.txt> --write
 *
 * What it changes:
 *   - appends completed weeks not already present (by tournament id),
 *     numbering them after the last captured week
 *   - replaces tpByWeek from the full TP histories (so any late
 *     corrections Sport.fun makes are picked up), mapping each reward to
 *     a week by its settlement date = the week's last kickoff date
 *   - replaces the active-shares snapshot
 *
 * It refuses to write if a week does not pay exactly 16 TP placements,
 * if a reward date matches no captured week, or if a player is missing,
 * so a bad capture fails loudly instead of publishing wrong numbers.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const capturePath = path.join(repoRoot, "data", "tournament-matrix-2026-capture.json");
const POSITIONS = ["QB", "RB", "WR", "TE"];

function fail(msg) {
  console.error(`REFUSING TO WRITE: ${msg}`);
  process.exit(1);
}

async function main() {
  const [inputFile] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!inputFile) fail("usage: merge-sportfun-capture.mjs <capture.txt> [--write]");
  const text = (await fs.readFile(inputFile, "utf8")).trim();
  const cap = JSON.parse(await fs.readFile(capturePath, "utf8"));

  // Compare on the 8-character prefix: weeks 2-5 were first recorded with
  // shortened ids, and an exact match would re-add them as new weeks.
  const known = new Set(cap.weeks.map((w) => w.tournamentId.slice(0, 8)));
  const newWeeks = [];
  let active = null;
  const rewards = {};
  let current = null;

  for (const line of text.split("\n")) {
    const [kind, ...rest] = line.split("|");
    if (kind === "A") {
      active = {};
      for (const e of rest[0].split(",").filter(Boolean)) {
        const [t, a] = e.split(".");
        active[parseInt(t, 36).toString()] = parseInt(a, 36);
      }
    } else if (kind === "W") {
      const [id, first, last] = rest;
      current = known.has(id.slice(0, 8)) ? null : { tournamentId: id, firstKickoff: first, lastKickoff: last, rows: {} };
      if (current) newWeeks.push(current);
    } else if (kind === "S" && current) {
      const [pos, body] = rest;
      current.rows[pos] = (body || "").split(",").filter(Boolean).map((r) => {
        const [t, rk, p, tp] = r.split(".");
        return [parseInt(t, 36).toString(), rk === "_" ? null : parseInt(rk, 36), +((parseInt(p, 36) / 100) - 20).toFixed(2), tp === "1" ? 1 : 0];
      });
    } else if (kind === "R") {
      const [t, body] = rest;
      rewards[parseInt(t, 36).toString()] = (body || "").split(",").filter(Boolean).map((e) => {
        const [mmdd, y] = e.split(".");
        return { mmdd, y: parseInt(y, 36) };
      });
    }
  }

  // Number new weeks after the last captured one, in kickoff order.
  newWeeks.sort((a, b) => (a.firstKickoff < b.firstKickoff ? -1 : 1));
  let next = Math.max(0, ...cap.weeks.map((w) => w.week)) + 1;
  for (const w of newWeeks) {
    w.week = next++;
    for (const pos of POSITIONS) if (!w.rows[pos]) fail(`week ${w.week} is missing ${pos} standings`);
    const tp = POSITIONS.reduce((a, pos) => a + w.rows[pos].filter((r) => r[3]).length, 0);
    if (tp !== 16) fail(`week ${w.week} has ${tp} TP placements, expected 16`);
  }
  const weeks = [...cap.weeks, ...newWeeks].sort((a, b) => a.week - b.week);

  // Map each reward to its week by settlement date (MMDD of last kickoff).
  const weekByMmdd = new Map(weeks.map((w) => [w.lastKickoff.slice(5, 7) + w.lastKickoff.slice(8, 10), w.week]));
  const tpByWeek = {};
  for (const [tid, list] of Object.entries(rewards)) {
    tpByWeek[tid] = {};
    for (const { mmdd, y } of list) {
      const w = weekByMmdd.get(mmdd);
      if (w == null) {
        // A completed tournament we have no standings for (e.g. one that
        // already fell off the API's ten-tournament window). Not fatal
        // for future weeks, but never silently drop TP.
        if (y > 0) fail(`player ${tid} has ${y} TP on ${mmdd}, which matches no captured week`);
        continue;
      }
      tpByWeek[tid][w] = y;
    }
  }
  if (Object.keys(tpByWeek).length < 70) fail(`only ${Object.keys(tpByWeek).length} TP histories captured`);
  if (!active || Object.keys(active).length < 70) fail("active shares missing from capture");

  cap.weeks = weeks;
  cap.tpByWeek = tpByWeek;
  cap.activeShares = active;
  cap.activeSharesAt = new Date().toISOString();
  cap.capturedAt = new Date().toISOString();

  console.log(`New weeks: ${newWeeks.map((w) => `W${w.week}`).join(", ") || "none"} | weeks now ${weeks.map((w) => w.week).join(",")}`);
  console.log(`TP histories: ${Object.keys(tpByWeek).length} | active shares: ${Object.keys(active).length}`);

  if (!process.argv.includes("--write")) {
    console.log("Dry run - nothing written. Re-run with --write.");
    return;
  }
  await fs.writeFile(capturePath, JSON.stringify(cap, null, 1) + "\n", "utf8");
  execFileSync("node", [path.join(repoRoot, "scripts", "build-tournament-matrix-2026.mjs"), "--write"], { stdio: "inherit" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
