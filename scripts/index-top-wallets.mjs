#!/usr/bin/env node
/*
 * Standalone NFL top-wallets indexer.
 *
 * Candidates are every wallet in data/wallet-registry.json (every wallet
 * that has ever held NFL shares, kept by index-trades.mjs). Their
 * balances are read on-chain in flat balanceOfBatch calls, ranked by
 * value at the latest price snapshot, and the top REFINE_TOP_N kept.
 * This used to start from Tenero's per-pool holder lists, which went
 * dark in Oct 2026 (0 candidates on every run) and froze the page.
 *
 * The aggregation is too heavy to run live on every request —
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
 *       firstHeldAt: number,               // first NFL acquisition, from the wallet registry (unix ms)
 *       lastActiveAt: number,              // newest NFL trade in the trade index (unix ms)
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
// Public Base RPCs, rotated per attempt (same set as index-trades.mjs).
const RPC_URLS = (process.env.BASE_RPC_URLS || process.env.BASE_RPC_URL ||
  "https://mainnet.base.org,https://base.gateway.tenderly.co,https://base-rpc.publicnode.com")
  .split(",").map((u) => u.trim()).filter(Boolean);
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
  // Listed 2026-09 (block 50972993).
  "1675627806","1356730929","1708756815","383785792",
];
const TOKEN_ADDRESSES = TOKEN_ID_SUFFIXES.map((s) => `${FOOTBALLFUN_CONTRACT}:${s}`);
const TOKEN_ID_BIG = TOKEN_ID_SUFFIXES.map((s) => BigInt(s));

const SHARE_DECIMALS = 18;
const FUN_DECIMALS = 18;
const SHARE_SCALE = 10n ** BigInt(SHARE_DECIMALS);
const FUN_SCALE = 10n ** BigInt(FUN_DECIMALS);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    const res = await fetch(RPC_URLS[(rpcId + attempt) % RPC_URLS.length], {
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

  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "..");
  const dataDir = path.join(repoRoot, "data");
  const readJson = async (f) => JSON.parse(await fs.readFile(path.join(dataDir, f), "utf8"));

  // Phase 1: candidates = every wallet that has ever held NFL shares
  // (the registry), plus anyone on the previous snapshot or in the trade
  // index. The registry misses a few holders whose first shares arrived
  // by a path it doesn't record; carrying the previous snapshot forward
  // keeps them on the board for as long as they hold.
  const registry = await readJson("wallet-registry.json");
  const candidateSet = new Set(Object.keys(registry.wallets ?? {}).map((a) => a.toLowerCase()));
  try {
    for (const w of (await readJson("top-wallets.json")).wallets ?? []) candidateSet.add(w.address.toLowerCase());
  } catch {
    // Cold start: no previous snapshot.
  }

  // Latest spot price per token, to rank by value rather than raw share
  // count (cheap players have far more shares per dollar).
  const prices = await readJson("price-history.json");
  const latest = prices.snapshots.at(-1)?.prices ?? [];
  const priceOf = new Map(prices.tokenIds.map((t, i) => [t, latest[i] ?? 0]));

  // Newest trade per wallet, for lastActiveAt; traders are candidates too.
  const lastTrade = new Map();
  try {
    for (const t of (await readJson("trade-history.json")).trades ?? []) {
      candidateSet.add(t.wallet);
      if ((lastTrade.get(t.wallet) ?? 0) < t.blockTime) lastTrade.set(t.wallet, t.blockTime);
    }
  } catch {
    // Missing trade index only blanks lastActiveAt.
  }
  const allCandidates = [...candidateSet];
  if (verbose) console.error(`[1/3] ${allCandidates.length} candidate wallets`);

  // Phase 2: on-chain balances for every candidate, 25 wallets per call.
  const onchainByAddr = new Map();
  let failedChunks = 0;
  for (let i = 0; i < allCandidates.length; i += ONCHAIN_CHUNK) {
    const slice = allCandidates.slice(i, i + ONCHAIN_CHUNK);
    const chunkResult = await readChunkBalances(slice);
    if ([...chunkResult.values()].some((b) => b == null)) failedChunks++;
    for (const [addr, balances] of chunkResult) if (balances) onchainByAddr.set(addr, balances);
  }
  const totalChunks = Math.ceil(allCandidates.length / ONCHAIN_CHUNK);
  if (verbose) console.error(`[2/3] Balances read: ${totalChunks - failedChunks}/${totalChunks} chunks ok`);
  // A wallet in a failed chunk would silently drop off the leaderboard;
  // past a few failures the RPCs are degraded, so keep the last snapshot.
  if (failedChunks > Math.max(2, totalChunks * 0.05)) {
    throw new Error(`Refusing to write snapshot: ${failedChunks}/${totalChunks} balance chunks failed (RPC degraded).`);
  }

  const ranked = [];
  for (const [address, onchain] of onchainByAddr) {
    const balances = {};
    let positions = 0;
    let valueUsd = 0;
    for (let k = 0; k < TOKEN_ID_SUFFIXES.length; k++) {
      const b = onchain[k];
      if (b > 0) {
        balances[TOKEN_ID_SUFFIXES[k]] = +b.toFixed(6);
        positions += 1;
        valueUsd += b * (priceOf.get(TOKEN_ID_SUFFIXES[k]) ?? 0);
      }
    }
    if (positions > 0) ranked.push({ address, balances, positions, valueUsd });
  }
  ranked.sort((a, b) => b.valueUsd - a.valueUsd);

  // Phase 3: $FUN balances for the kept wallets. Concurrency 4 with
  // retry inside rpc(); a failed read records 0 and doesn't affect rank.
  // Drop platform-side custodians (FDF Marketplace, bonding-curve
  // contract) before cutting to the top N. They appear as huge holders
  // but aren't real traders.
  const NON_ACTIVE = new Set([
    "0x4fdce033b9f30019337ddc5cc028dc023580585e", // FDF Marketplace
    FOOTBALLFUN_CONTRACT.toLowerCase(),
  ]);
  const kept = ranked.filter((w) => !NON_ACTIVE.has(w.address)).slice(0, REFINE_TOP_N);
  if (verbose) console.error(`[3/3] $FUN balances for top ${kept.length}`);
  const funByAddr = new Map();
  await chunked(kept.map((w) => async () => funByAddr.set(w.address, await readFunBalance(w.address))), 4);

  const refined = kept.map((w) => ({
    address: w.address,
    balances: w.balances,
    funBalance: +(funByAddr.get(w.address) ?? 0).toFixed(6),
    firstHeldAt: registry.wallets[w.address]?.firstSeenAt ?? 0,
    lastActiveAt: lastTrade.get(w.address) ?? 0,
    positions: w.positions,
  }));

  const wallets = refined;   // already ranked by value, custodians removed

  // Sanity check: never overwrite a good snapshot with degenerate
  // output. Two failure modes:
  //   (a) Total outage — every balance read fails, wallets≈0. Caught
  //       by the absolute floor below.
  //   (b) PARTIAL outage — some reads succeed and the rest fail,
  //       yielding a fraction of the real holder set.
  //       This sails past a fixed floor: on 2026-07-19 a 138-wallet
  //       partial overwrote the healthy 499-wallet snapshot, and the
  //       live Top Wallets page lost ~360 wallets until it was
  //       restored. Guard against it by comparing to the previous
  //       snapshot — a run that produces materially fewer wallets than
  //       what's already committed is treating a degraded upstream as
  //       truth, so bail and keep the good snapshot.
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
      `(previous snapshot had ${prevCount}; candidates=${allCandidates.length}). ` +
      `Balance reads are likely degraded or rate-limited — keeping the existing snapshot.`,
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
