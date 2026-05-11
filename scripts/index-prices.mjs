#!/usr/bin/env node
/*
 * Standalone NFL price snapshot indexer.
 *
 * Runs from a GitHub Actions cron every 15 minutes. Fetches the
 * current spot price for every NFL token from Tenero's /tokens
 * endpoint, appends a timestamped snapshot to data/price-history.json,
 * and the workflow commits the result to the `data` branch. The
 * deployed app reads the snapshot via raw.githubusercontent.com to
 * compute accurate 1h/24h/7d % changes — independent of the upstream's
 * unreliable price_*_ago fields and the sparse OHLC bars.
 *
 * Zero infrastructure: free GitHub Actions minutes, persists in the
 * repo's git history, served via GitHub's CDN.
 *
 * Local dry-run (prints snapshot to stdout, doesn't write):
 *   node scripts/index-prices.mjs
 *
 * Local write (updates data/price-history.json):
 *   node scripts/index-prices.mjs --write
 *
 * Schema:
 *   {
 *     tokenIds: ["67997479", "769476837", ...],  // index → token suffix
 *     snapshots: [
 *       { ts: 1700000000000, prices: [0.005678, 0.012345, ...] },
 *       ...
 *     ]
 *   }
 *
 * Compact array-by-index format keeps the JSON small enough that the
 * deployed app can fetch the full history (7 days × 96 samples/day ≈
 * 670 snapshots × 72 prices ≈ 500KB) on each render.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FOOTBALLFUN_CONTRACT = "0x2EeF466e802Ab2835aB81BE63eEbc55167d35b56";
const UPSTREAM = "https://api.tenero.io/v1/sportsfun";
// Tenero's IP rate limit is 100 req/min. Sequential with 700ms delay
// keeps us safely under it.
const REQUEST_DELAY_MS = 700;
// 7 days × 96 snapshots/day (every 15 min) = 672. Keep ~7 days of
// 15-min granularity — enough to compute 1h / 24h / 7d windows.
const HISTORY_LIMIT = 672;

// Must match src/lib/data/roster.ts. Updating this list is the only
// per-roster maintenance the indexer needs.
const TOKEN_ID_SUFFIXES = [
  "67997479","769476837","401615555","79420307","1886297532","833812969",
  "608240281","1627881947","1733678391","646914359","88065636","403250563",
  "2050898691","1877680294","298000720","1045355498","656282335","1613245508",
  "1511237082","532139037","1229893067","1704342915","1708223670","33526712",
  "1072658622","1207389650","1561296583","1591779333","626101435","184212668",
  "1029815641","1634868202","509502421","637063064","1835372287","1096457743",
  "344873876","1694187555","1987964071","439100286","850942466","1955323065",
  "1737560144","350071857","1339944146","942484606","1809188809","1924940894",
  "2018186111","1094525731","679992678","2111895848","1957905857","892204822",
  "363339787","1631265816","1965487160","1892649533","280776288","1986714215",
  "972599423","1597935612","1257875488","268596935","202647757","708089183",
  "1049357910","543182829","1953241833","946323199","2078797761","1378093404",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function uget(p, attempt = 0) {
  const url = `${UPSTREAM}${p}`;
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 429 && attempt < 5) {
    await sleep(1000 * (attempt + 1) ** 2);
    return uget(p, attempt + 1);
  }
  if (!res.ok) return null;
  await sleep(REQUEST_DELAY_MS);
  return res.json();
}

async function fetchSpot(tokenAddress) {
  const path = `/tokens/${encodeURIComponent(tokenAddress)}`;
  const data = await uget(path);
  const spot = Number(data?.data?.price?.current_price ?? 0);
  return Number.isFinite(spot) && spot > 0 ? spot : 0;
}

async function main() {
  const start = Date.now();
  const prices = [];
  for (let i = 0; i < TOKEN_ID_SUFFIXES.length; i++) {
    const tokenAddress = `${FOOTBALLFUN_CONTRACT}:${TOKEN_ID_SUFFIXES[i]}`;
    const spot = await fetchSpot(tokenAddress);
    prices.push(spot);
    if (process.env.GRIDIRON_VERBOSE) {
      console.log(`[${i + 1}/${TOKEN_ID_SUFFIXES.length}] ${TOKEN_ID_SUFFIXES[i]} spot=$${spot.toFixed(6)}`);
    }
  }

  const snapshot = {
    ts: Date.now(),
    prices,
  };

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, "..");
  const outPath = path.join(repoRoot, "data", "price-history.json");

  let store = { tokenIds: TOKEN_ID_SUFFIXES, snapshots: [] };
  try {
    const raw = await fs.readFile(outPath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.snapshots)) {
      store = {
        tokenIds: Array.isArray(parsed.tokenIds) ? parsed.tokenIds : TOKEN_ID_SUFFIXES,
        snapshots: parsed.snapshots,
      };
    }
  } catch {
    // No existing file — start fresh.
  }

  // If the roster expanded since the last snapshot, prepend zeros to
  // the new entries so the array shape is consistent. Conversely, if
  // a token was removed from the roster, the existing snapshots'
  // extra entries are harmless (the reader looks up by index).
  if (store.tokenIds.length !== TOKEN_ID_SUFFIXES.length ||
      store.tokenIds.some((id, i) => id !== TOKEN_ID_SUFFIXES[i])) {
    console.error("Roster changed since last snapshot — resetting tokenIds. Old snapshots may have misaligned indices and should be considered stale.");
    store = { tokenIds: TOKEN_ID_SUFFIXES, snapshots: [] };
  }

  store.snapshots.push(snapshot);
  if (store.snapshots.length > HISTORY_LIMIT) {
    store.snapshots = store.snapshots.slice(-HISTORY_LIMIT);
  }

  const json = JSON.stringify(store, null, 2) + "\n";
  const durationMs = Date.now() - start;

  const write = process.argv.includes("--write");
  if (write) {
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, json, "utf8");
    console.error(`Wrote snapshot to ${outPath} (${store.snapshots.length} snapshots, ${durationMs}ms)`);
  } else {
    // Print snapshot summary to stdout for dry-run inspection.
    console.log(JSON.stringify({
      ts: snapshot.ts,
      tokenCount: snapshot.prices.length,
      nonZeroCount: snapshot.prices.filter((p) => p > 0).length,
      durationMs,
      preview: TOKEN_ID_SUFFIXES.slice(0, 5).map((id, i) => ({ id, spot: snapshot.prices[i] })),
    }, null, 2));
  }
}

main().catch((err) => {
  console.error("Indexer failed:", err);
  process.exit(1);
});
