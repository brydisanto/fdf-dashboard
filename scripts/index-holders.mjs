#!/usr/bin/env node
/*
 * Standalone NFL holder indexer.
 *
 * Run from a GitHub Actions cron — paginates every NFL pool to
 * convergence against the upstream API, dedupes wallet addresses,
 * outputs a snapshot JSON to stdout (or to data/unique-holders.json
 * if --write is passed). The action commits the result to a `data`
 * branch so the deployed app can fetch it from raw.githubusercontent.com.
 *
 * Zero infrastructure required — runs inside the free GitHub Actions
 * minutes, persists to the repo itself, served via GitHub's CDN.
 *
 * Local dry-run:
 *   node scripts/index-holders.mjs > /tmp/snapshot.json
 *
 * Write to data/ for the action:
 *   node scripts/index-holders.mjs --write
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FOOTBALLFUN_CONTRACT = "0x2EeF466e802Ab2835aB81BE63eEbc55167d35b56";
const SWAP_ROUTER_LC = FOOTBALLFUN_CONTRACT.toLowerCase();
const UPSTREAM = "https://api.tenero.io/v1/sportsfun";
const HOLDERS_PAGE_LIMIT = 50;
const HOLDERS_MAX_PAGES = 30;
const CONCURRENCY = 2;
const HISTORY_LIMIT = 720;

// Roster of NFL token IDs (must match src/lib/data/roster.ts).
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

const TOKEN_ADDRESSES = TOKEN_ID_SUFFIXES.map((s) => `${FOOTBALLFUN_CONTRACT}:${s}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function uget(p, attempt = 0) {
  const url = `${UPSTREAM}${p}`;
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 429 && attempt < 5) {
    await sleep(1000 * (attempt + 1) ** 2);
    return uget(p, attempt + 1);
  }
  if (!res.ok) return null;
  return res.json();
}

async function scanPool(tokenAddress) {
  const addrs = new Set();
  let cursor = null;
  let pages = 0;
  let truncated = false;
  while (pages < HOLDERS_MAX_PAGES) {
    const path =
      `/tokens/${encodeURIComponent(tokenAddress)}/holders?limit=${HOLDERS_PAGE_LIMIT}` +
      (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
    const data = await uget(path);
    const rows = data?.data?.rows ?? [];
    for (const r of rows) {
      const a = (r.wallet_address || "").toLowerCase();
      if (!a || a === SWAP_ROUTER_LC) continue;
      if (Number(r.balance ?? 0) <= 0) continue;
      addrs.add(a);
    }
    cursor = data?.data?.next ?? null;
    pages++;
    if (!cursor) break;
  }
  if (cursor) truncated = true;
  return { addrs, truncated };
}

async function chunked(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size);
    out.push(...(await Promise.all(slice.map((fn) => fn()))));
  }
  return out;
}

async function main() {
  const start = Date.now();
  const fns = TOKEN_ADDRESSES.map((addr) => () => scanPool(addr));
  const results = await chunked(fns, CONCURRENCY);

  const set = new Set();
  let largestPool = 0;
  let truncatedAny = false;
  for (const r of results) {
    if (r.truncated) truncatedAny = true;
    if (r.addrs.size > largestPool) largestPool = r.addrs.size;
    for (const a of r.addrs) set.add(a);
  }

  const snapshot = {
    ts: Date.now(),
    count: set.size,
    largestPoolHolderCount: largestPool,
    pools: TOKEN_ADDRESSES.length,
    durationMs: Date.now() - start,
    fullScan: !truncatedAny,
  };

  const args = process.argv.slice(2);
  const shouldWrite = args.includes("--write");
  if (!shouldWrite) {
    process.stdout.write(JSON.stringify({ current: snapshot, history: [] }, null, 2));
    return;
  }

  // --write mode: read existing data/unique-holders.json (if any),
  // append history entry, persist back.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "..");
  const dataDir = path.join(repoRoot, "data");
  const dest = path.join(dataDir, "unique-holders.json");
  await fs.mkdir(dataDir, { recursive: true });

  let store = { current: null, history: [] };
  try {
    const raw = await fs.readFile(dest, "utf8");
    store = JSON.parse(raw);
    if (!Array.isArray(store.history)) store.history = [];
  } catch {
    /* fresh */
  }
  store.current = snapshot;
  store.history.push({ ts: snapshot.ts, count: snapshot.count });
  if (store.history.length > HISTORY_LIMIT) {
    store.history = store.history.slice(-HISTORY_LIMIT);
  }
  await fs.writeFile(dest, JSON.stringify(store, null, 2) + "\n", "utf8");
  console.log(`Snapshot written: count=${snapshot.count} largestPool=${largestPool} durationMs=${snapshot.durationMs} fullScan=${snapshot.fullScan}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
