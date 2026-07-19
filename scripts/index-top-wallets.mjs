#!/usr/bin/env node
/*
 * Standalone NFL top-wallets indexer.
 *
 * The wallet-leaderboard aggregation (Top-K across 72 pools + on-chain
 * Multicall refinement) is too heavy to run live on every request —
 * cold Vercel workers pay seconds of latency rebuilding it from
 * scratch. This indexer runs on a GitHub Actions cron, persists
 * results to `data/top-wallets.json` on the `data` branch, and the
 * deployed app fetches it via raw.githubusercontent.com. The app then
 * just multiplies stored balances by live spot prices — that math is
 * near-instant.
 *
 * Output schema:
 *   {
 *     ts: number,                          // unix ms snapshot time
 *     generatedAt: string,                 // ISO timestamp
 *     durationMs: number,                  // indexer wall time
 *     candidateCount: number,              // wallets considered before refinement
 *     wallets: Array<{
 *       address: string,                   // lowercased
 *       balances: Record<string, number>,  // tokenIdSuffix → balance (decimal-adjusted)
 *       funBalance: number,                // raw $FUN token count
 *       firstHeldAt: number,               // earliest start_holding_at across NFL pools (unix ms)
 *       lastActiveAt: number,              // latest last_active_at across NFL pools (unix ms)
 *       positions: number,                 // number of NFL tokens with >0 balance
 *     }>
 *   }
 *
 * Local dry-run:
 *   node scripts/index-top-wallets.mjs
 *
 * Write to data/:
 *   node scripts/index-top-wallets.mjs --write
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FOOTBALLFUN_CONTRACT = "0x2EeF466e802Ab2835aB81BE63eEbc55167d35b56";
const SWAP_ROUTER_LC = FOOTBALLFUN_CONTRACT.toLowerCase();
// Sport.fun $FUN ERC-20 on Base. Mirror of FUN_TOKEN_ADDRESS in
// src/lib/data/onchain-client.ts — keep in sync if it ever changes.
const FUN_TOKEN = "0x16ee7ecac70d1028e7712751e2ee6ba808a7dd92";
const UPSTREAM = "https://api.tenero.io/v1/sportsfun";
const HOLDERS_PAGE_LIMIT = 50;
// 12 pages × 50 = top 600 holders per pool. Wide enough to capture
// virtually every wallet that meaningfully holds NFL across pools.
// Tenero's 100 req/min limit with 700ms delay = ~85 req/min, so
// 72 pools × 12 pages ≈ 864 requests ≈ 10 min, comfortably under
// the 25-min workflow timeout.
const HOLDERS_MAX_PAGES = 12;
const REQUEST_DELAY_MS = 700;
const RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";

// On-chain refinement is now ON by default — the new flat
// balanceOfBatch reader does 25 wallets × 72 tokens per single
// eth_call, so refining 500 wallets is 20 RPC calls (vs the
// previous 1000-call per-wallet approach that timed out). Set
// ENABLE_ONCHAIN_REFINEMENT=0 to fall back to Tenero-only.
const ENABLE_ONCHAIN_REFINEMENT = process.env.ENABLE_ONCHAIN_REFINEMENT !== "0";
const REFINE_TOP_N = 500;

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
const TOKEN_ID_BIG = TOKEN_ID_SUFFIXES.map((s) => BigInt(s));

const SHARE_DECIMALS = 18;
const FUN_DECIMALS = 18;
const SHARE_SCALE = 10n ** BigInt(SHARE_DECIMALS);
const FUN_SCALE = 10n ** BigInt(FUN_DECIMALS);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Tenero holders fetch ----

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

async function scanPoolHolders(tokenAddress) {
  const rows = [];
  let cursor = null;
  let pages = 0;
  while (pages < HOLDERS_MAX_PAGES) {
    const p =
      `/tokens/${encodeURIComponent(tokenAddress)}/holders?limit=${HOLDERS_PAGE_LIMIT}` +
      (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
    const data = await uget(p);
    const batch = data?.data?.rows ?? [];
    for (const r of batch) {
      const a = (r.wallet_address || "").toLowerCase();
      if (!a || a === SWAP_ROUTER_LC) continue;
      const balance = Number(r.balance ?? 0);
      if (!Number.isFinite(balance) || balance <= 0) continue;
      rows.push({
        address: a,
        balance,
        startHoldingAt: Number(r.start_holding_at ?? 0),
        lastActiveAt: Number(r.last_active_at ?? 0),
      });
    }
    cursor = data?.data?.next ?? null;
    pages++;
    if (!cursor) break;
  }
  return rows;
}

// ---- On-chain helpers ----

// Retry on transient failures (rate limits, connection drops, occasional
// 5xx from public Base RPC). Exponential backoff with jitter. Without
// this, refinement concurrency would wipe out most wallets when the
// public RPC throttles us.
let rpcId = 0;
const RPC_MAX_ATTEMPTS = 6;
async function rpc(method, params, attempt = 0) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params });
  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      cache: "no-store",
    });
    if (res.status === 429 || res.status >= 500) {
      throw new Error(`RPC HTTP ${res.status}`);
    }
    if (!res.ok) throw new Error(`RPC ${method} HTTP ${res.status}`);
    const j = await res.json();
    if (j.error) {
      // -32005 "limit exceeded", -32603 "internal" sometimes mean retry.
      if (attempt < RPC_MAX_ATTEMPTS - 1 && (j.error.code === -32005 || j.error.code === -32603)) {
        throw new Error(j.error.message);
      }
      throw new Error(`RPC ${method} error: ${j.error.message}`);
    }
    return j.result;
  } catch (err) {
    if (attempt < RPC_MAX_ATTEMPTS - 1) {
      const baseMs = 300 * Math.pow(2, attempt);
      const jitter = Math.random() * baseMs;
      await sleep(baseMs + jitter);
      return rpc(method, params, attempt + 1);
    }
    throw err;
  }
}

const pad32 = (h) => h.replace(/^0x/, "").padStart(64, "0");

// ABI-encode balanceOfBatch(address[], uint256[]) where the two
// arrays have equal length N. Each (wallets[i], tokenIds[i]) pair is
// queried independently, so we can flat-pack 25 wallets × 72 tokens
// into a single eth_call (1800 entries, ~58KB response) — far more
// efficient than per-wallet calls.
function encodeBalanceOfBatchFlat(wallets, tokenIds) {
  if (wallets.length !== tokenIds.length) throw new Error("array length mismatch");
  const n = wallets.length;
  const selector = "4e1273f4"; // balanceOfBatch(address[],uint256[])
  const offsetA = 64;          // 0x40 — two 32-byte offset words
  const arrABytes = 32 + n * 32; // len + items
  const offsetB = offsetA + arrABytes;

  const enc = [];
  enc.push(pad32(offsetA.toString(16)));
  enc.push(pad32(offsetB.toString(16)));
  enc.push(pad32(n.toString(16)));
  for (const w of wallets) enc.push(pad32(w.toLowerCase().replace(/^0x/, "")));
  enc.push(pad32(n.toString(16)));
  for (const id of tokenIds) enc.push(pad32(id.toString(16)));

  return "0x" + selector + enc.join("");
}

function decodeUint256Array(hex) {
  // returns array of bigints
  const h = hex.replace(/^0x/, "");
  // skip first 32 bytes (offset to array data, always 0x20)
  // next 32 bytes = length
  const len = parseInt(h.slice(64, 128), 16);
  const out = [];
  for (let i = 0; i < len; i++) {
    const start = 128 + i * 64;
    out.push(BigInt("0x" + h.slice(start, start + 64)));
  }
  return out;
}

// Read balances for a chunk of wallets (each × every NFL token) in a
// single eth_call via the ERC1155 flat balanceOfBatch. Returns a Map
// addr (lowercase) -> array of per-token balances (decimal-adjusted),
// or null for that wallet if the chunk failed.
const ONCHAIN_CHUNK = 25;
async function readChunkBalances(walletChunk) {
  const tokenCount = TOKEN_ID_BIG.length;
  const flatWallets = [];
  const flatTokens = [];
  for (const w of walletChunk) {
    for (let k = 0; k < tokenCount; k++) {
      flatWallets.push(w);
      flatTokens.push(TOKEN_ID_BIG[k]);
    }
  }
  const out = new Map();
  try {
    const data = encodeBalanceOfBatchFlat(flatWallets, flatTokens);
    const raw = await rpc("eth_call", [{ to: FOOTBALLFUN_CONTRACT, data }, "latest"]);
    if (!raw || raw === "0x") {
      for (const w of walletChunk) out.set(w.toLowerCase(), null);
      return out;
    }
    const arr = decodeUint256Array(raw);
    // Slice the flat result back per wallet.
    for (let j = 0; j < walletChunk.length; j++) {
      const offset = j * tokenCount;
      const balances = [];
      for (let k = 0; k < tokenCount; k++) {
        const bal = arr[offset + k] ?? 0n;
        balances.push(Number(bal) / Number(SHARE_SCALE));
      }
      out.set(walletChunk[j].toLowerCase(), balances);
    }
  } catch {
    for (const w of walletChunk) out.set(w.toLowerCase(), null);
  }
  return out;
}

async function readFunBalance(wallet) {
  // ERC20 balanceOf(address): selector 0x70a08231 + 32-byte address
  const selector = "70a08231";
  const addrLow = wallet.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const data = "0x" + selector + addrLow;
  try {
    const raw = await rpc("eth_call", [{ to: FUN_TOKEN, data }, "latest"]);
    if (!raw || raw === "0x") return 0;
    return Number(BigInt(raw)) / Number(FUN_SCALE);
  } catch {
    return 0;
  }
}

// ---- Top-K aggregation (Tenero-side, by raw balance — proxy for value) ----

function aggregateCandidates(pools) {
  const byAddr = new Map();
  for (const { suffix, rows } of pools) {
    for (const r of rows) {
      const cur = byAddr.get(r.address) ?? {
        rawTotal: 0,
        firstHeldAt: 0,
        lastActiveAt: 0,
        teneroBalances: {}, // suffix -> balance (used as fallback if on-chain refinement fails)
      };
      cur.rawTotal += r.balance;
      if (r.startHoldingAt && (cur.firstHeldAt === 0 || r.startHoldingAt < cur.firstHeldAt)) {
        cur.firstHeldAt = r.startHoldingAt;
      }
      if (r.lastActiveAt > cur.lastActiveAt) cur.lastActiveAt = r.lastActiveAt;
      cur.teneroBalances[suffix] = (cur.teneroBalances[suffix] ?? 0) + r.balance;
      byAddr.set(r.address, cur);
    }
  }
  return Array.from(byAddr.entries())
    .map(([address, v]) => ({
      address,
      rawTotal: v.rawTotal,
      firstHeldAt: v.firstHeldAt,
      lastActiveAt: v.lastActiveAt,
      teneroBalances: v.teneroBalances,
    }))
    .sort((a, b) => b.rawTotal - a.rawTotal);
}

// ---- Concurrent refinement ----

async function chunked(fns, concurrency) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < fns.length) {
      const myIdx = i++;
      try {
        results[myIdx] = await fns[myIdx]();
      } catch {
        results[myIdx] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

// ---- Main ----

async function main() {
  const start = Date.now();
  const verbose = !!process.env.GRIDIRON_VERBOSE;

  // Phase 1: Tenero holders per pool.
  if (verbose) console.error(`[1/3] Scanning ${TOKEN_ADDRESSES.length} pools via Tenero…`);
  const pools = [];
  for (let i = 0; i < TOKEN_ADDRESSES.length; i++) {
    const addr = TOKEN_ADDRESSES[i];
    const suffix = TOKEN_ID_SUFFIXES[i];
    const rows = await scanPoolHolders(addr);
    pools.push({ suffix, rows });
    if (verbose) {
      console.error(`  [${i + 1}/${TOKEN_ADDRESSES.length}] ${suffix} holders=${rows.length}`);
    }
  }

  // Phase 2: aggregate Tenero data into per-wallet candidates.
  const allCandidates = aggregateCandidates(pools);
  const candidates = allCandidates.slice(0, REFINE_TOP_N);
  if (verbose) {
    console.error(`[2/${ENABLE_ONCHAIN_REFINEMENT ? 3 : 2}] Aggregated ${allCandidates.length} unique wallets · keeping top ${candidates.length}`);
  }

  // Phase 3 (optional): on-chain refinement — balanceOfBatch per
  // wallet to catch positions outside Tenero's top-N per pool. Only
  // runs when ENABLE_ONCHAIN_REFINEMENT=1 because the public Base
  // RPC's rate-limiting makes this leg unreliable inside the GitHub
  // Actions timeout. When disabled, we just project Tenero's per-pool
  // balances into the output — accurate for ~95% of wallets, the
  // remaining ~5% with deep tail positions get slightly understated.
  let refined;
  if (ENABLE_ONCHAIN_REFINEMENT) {
    if (verbose) console.error(`[3/3] On-chain refinement: chunks of ${ONCHAIN_CHUNK} wallets per eth_call…`);

    // Step 3a: chunked balanceOfBatch — each chunk is ONE eth_call
    // returning 25×72 = 1800 balances. ~20 RPC calls total for the
    // top-500 leaderboard.
    const onchainByAddr = new Map();
    for (let i = 0; i < candidates.length; i += ONCHAIN_CHUNK) {
      const slice = candidates.slice(i, i + ONCHAIN_CHUNK).map((c) => c.address);
      const chunkResult = await readChunkBalances(slice);
      for (const [addr, balances] of chunkResult) onchainByAddr.set(addr, balances);
      if (verbose) {
        const okCount = [...chunkResult.values()].filter(Boolean).length;
        console.error(`  chunk ${i}..${i + slice.length - 1}: ${okCount}/${slice.length} ok`);
      }
    }

    // Step 3b: $FUN balances — separate sequential walk, much smaller
    // payload per call (32 bytes). Concurrency=4 with retry inside
    // rpc() keeps us under the rate limit. If a wallet's $FUN read
    // fails we just record 0 — doesn't affect ranking.
    const funByAddr = new Map();
    const funFns = candidates.map((c) => async () => {
      const balance = await readFunBalance(c.address);
      funByAddr.set(c.address.toLowerCase(), balance);
    });
    await chunked(funFns, 4);

    refined = candidates.map((c) => {
      const addrLc = c.address.toLowerCase();
      const onchain = onchainByAddr.get(addrLc);
      const funBalance = funByAddr.get(addrLc) ?? 0;
      const balanceBySuffix = {};
      let positions = 0;
      if (onchain) {
        // Canonical on-chain balances.
        for (let i = 0; i < TOKEN_ID_SUFFIXES.length; i++) {
          const b = onchain[i];
          if (b > 0) {
            balanceBySuffix[TOKEN_ID_SUFFIXES[i]] = +b.toFixed(6);
            positions += 1;
          }
        }
      } else {
        // Chunk failed — fall back to Tenero's per-pool balances.
        for (const [suffix, b] of Object.entries(c.teneroBalances)) {
          if (b > 0) {
            balanceBySuffix[suffix] = +b.toFixed(6);
            positions += 1;
          }
        }
      }
      if (positions === 0) return null;
      return {
        address: c.address,
        balances: balanceBySuffix,
        funBalance: +funBalance.toFixed(6),
        firstHeldAt: c.firstHeldAt,
        lastActiveAt: c.lastActiveAt,
        positions,
      };
    }).filter(Boolean);
  } else {
    refined = candidates.map((c) => {
      const balanceBySuffix = {};
      let positions = 0;
      for (const [suffix, b] of Object.entries(c.teneroBalances)) {
        if (b > 0) {
          balanceBySuffix[suffix] = +b.toFixed(6);
          positions += 1;
        }
      }
      if (positions === 0) return null;
      return {
        address: c.address,
        balances: balanceBySuffix,
        funBalance: 0, // $FUN reads disabled in fast path
        firstHeldAt: c.firstHeldAt,
        lastActiveAt: c.lastActiveAt,
        positions,
      };
    }).filter(Boolean);
  }

  // Drop platform-side custodians (FDF Marketplace, bonding-curve
  // contract). They appear as huge holders but aren't real traders.
  const NON_ACTIVE = new Set([
    "0x4fdce033b9f30019337ddc5cc028dc023580585e", // FDF Marketplace
    FOOTBALLFUN_CONTRACT.toLowerCase(),
  ]);
  const wallets = refined
    .filter((w) => w && !NON_ACTIVE.has(w.address) && w.positions > 0)
    .sort((a, b) => {
      // Pre-USD sort: total raw balance is a reasonable proxy ordering.
      const aTotal = Object.values(a.balances).reduce((s, x) => s + x, 0);
      const bTotal = Object.values(b.balances).reduce((s, x) => s + x, 0);
      return bTotal - aTotal;
    });

  // Sanity check: never overwrite a good snapshot with degenerate
  // output. Two failure modes:
  //   (a) Total outage — Tenero 500s everything, candidates≈0. Caught
  //       by the absolute floor below.
  //   (b) PARTIAL outage — Tenero returns HTTP 200 for some pools and
  //       fails the rest, yielding a fraction of the real holder set.
  //       This sails past a fixed floor: on 2026-07-19 a 138-wallet
  //       partial overwrote the healthy 499-wallet snapshot, and the
  //       live Top Wallets page lost ~360 wallets until it was
  //       restored. Guard against it by comparing to the previous
  //       snapshot — a run that produces materially fewer wallets than
  //       what's already committed is treating a degraded upstream as
  //       truth, so bail and keep the good snapshot.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "..");
  const dataDir = path.join(repoRoot, "data");
  const dest = path.join(dataDir, "top-wallets.json");

  let prevCount = 0;
  try {
    const existing = JSON.parse(await fs.readFile(dest, "utf8"));
    if (Array.isArray(existing?.wallets)) prevCount = existing.wallets.length;
  } catch {
    // No prior snapshot (cold start) — only the absolute floor applies.
  }

  const ABS_FLOOR = 50;            // cold-start / total-outage backstop
  const REGRESSION_RATIO = 0.7;    // tolerate ~30% churn vs last good run
  const floor = Math.max(ABS_FLOOR, Math.floor(prevCount * REGRESSION_RATIO));
  if (wallets.length < floor) {
    throw new Error(
      `Refusing to write snapshot: ${wallets.length} wallets is below the floor of ${floor} ` +
      `(previous snapshot had ${prevCount}; Tenero candidates=${allCandidates.length}). ` +
      `The upstream is likely degraded or rate-limited — keeping the existing snapshot.`,
    );
  }

  const snapshot = {
    ts: Date.now(),
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    candidateCount: allCandidates.length,
    wallets,
  };

  const args = process.argv.slice(2);
  if (!args.includes("--write")) {
    process.stdout.write(JSON.stringify({
      ts: snapshot.ts,
      generatedAt: snapshot.generatedAt,
      durationMs: snapshot.durationMs,
      candidateCount: snapshot.candidateCount,
      walletCount: snapshot.wallets.length,
      sample: snapshot.wallets.slice(0, 3),
    }, null, 2));
    return;
  }

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(dest, JSON.stringify(snapshot) + "\n", "utf8");
  console.log(
    `Snapshot written: wallets=${wallets.length} candidates=${allCandidates.length} durationMs=${snapshot.durationMs}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
